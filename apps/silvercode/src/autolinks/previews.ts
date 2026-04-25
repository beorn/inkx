/**
 * Autolink preview renderers.
 *
 * Three pluggable preview kinds shipped in v1:
 *
 *   - "readme"          → fetch the file at `resolvesTo`, render markdown.
 *                         If `resolvesTo` is a directory, look for README.md.
 *   - "first-paragraph" → fetch the file, return the first non-blank paragraph
 *                         as plain text.
 *   - "bd-active"       → shell out to `bd list --parent <resolvesTo>
 *                         --status open --limit 5` and return its output.
 *
 * Skipped for v1 (see follow-up beads):
 *   - "shell" / "mcp"   → km-silvercode.autolinks-preview-extensions
 *   - "mcp" resolver    → km-silvercode.autolinks-mcp-resolver
 *
 * Caching: per-cache-key in-memory with a 30-second TTL. File-watcher
 * driven invalidation is deferred — see `km-silvercode.autolinks-cache-invalidation`.
 */

import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import createDebug from "debug"
import type { AutolinkPreviewKind } from "./config.ts"

const log = createDebug("silvercode:autolinks:previews")

/** TTL for the per-target preview cache. */
export const PREVIEW_CACHE_TTL_MS = 30_000

export type PreviewSuccess = {
  readonly kind: "ok"
  /** Preview body text. Markdown for `readme`, plain for the others. */
  readonly body: string
  /** When the preview was resolved. */
  readonly resolvedAt: number
  /** Hint for the renderer about how to format `body`. */
  readonly format: "markdown" | "text"
}

export type PreviewError = {
  readonly kind: "error"
  readonly message: string
  readonly resolvedAt: number
}

export type PreviewResult = PreviewSuccess | PreviewError

/**
 * Module-scoped cache. Keyed by `${preview}::${cache_key}` so the same
 * resolves_to under different preview kinds doesn't collide.
 *
 * Exposed via `clearPreviewCache()` for tests. Production code never
 * resets it manually — entries expire on TTL.
 */
const cache = new Map<string, PreviewResult>()

/** Test-only: drop every cached preview so the next call goes through fresh. */
export function clearPreviewCache(): void {
  cache.clear()
}

/**
 * Resolve a preview for the given autolink. Synchronous on cache hits
 * inside the TTL; otherwise runs the underlying loader (filesystem or
 * `bd` subprocess) and caches the result.
 *
 * Errors never throw — they're returned as `PreviewError` so the popover
 * can show a useful diagnostic instead of crashing the render tree.
 */
export function resolvePreview(args: {
  preview: AutolinkPreviewKind
  resolvesTo: string
  cacheKey: string
  /**
   * Override `now()` for tests. Production callers omit it.
   */
  now?: () => number
}): PreviewResult {
  const now = args.now ?? Date.now
  const key = `${args.preview}::${args.cacheKey}`
  const t = now()

  const hit = cache.get(key)
  if (hit && t - hit.resolvedAt < PREVIEW_CACHE_TTL_MS) return hit

  let result: PreviewResult
  try {
    switch (args.preview) {
      case "readme":
        result = renderReadme(args.resolvesTo, t)
        break
      case "first-paragraph":
        result = renderFirstParagraph(args.resolvesTo, t)
        break
      case "bd-active":
        result = renderBdActive(args.resolvesTo, t)
        break
      default: {
        // Defensive — config validation should have caught this.
        const _exhaustive: never = args.preview
        result = { kind: "error", message: `unknown preview kind: ${String(_exhaustive)}`, resolvedAt: t }
      }
    }
  } catch (err) {
    log(`preview %s for %s threw: %s`, args.preview, args.resolvesTo, String(err))
    result = { kind: "error", message: `preview failed: ${String(err)}`, resolvedAt: t }
  }
  cache.set(key, result)
  return result
}

/**
 * Resolve `resolvesTo` to an actual README path. If it's a directory,
 * append README.md (case-sensitive — we assume canonical lowercase
 * spelling on disk is unusual; we try `README.md` first, then `readme.md`).
 */
function resolveReadmePath(resolvesTo: string): string | null {
  if (!existsSync(resolvesTo)) return null
  const st = statSync(resolvesTo)
  if (st.isDirectory()) {
    const candidates = ["README.md", "readme.md", "Readme.md"]
    for (const c of candidates) {
      const p = join(resolvesTo, c)
      if (existsSync(p)) return p
    }
    return null
  }
  return resolvesTo
}

function renderReadme(resolvesTo: string, t: number): PreviewResult {
  const path = resolveReadmePath(resolvesTo)
  if (!path) {
    return { kind: "error", message: `no README found at ${resolvesTo}`, resolvedAt: t }
  }
  const body = readFileSync(path, "utf-8")
  // Trim the body so the popover doesn't get crushed under a 500-line
  // README. We hand the markdown rendering off to MarkdownView; the
  // truncation here is a cheap defense against pathological inputs.
  const trimmed = truncateForPopover(body, 60)
  return { kind: "ok", body: trimmed, format: "markdown", resolvedAt: t }
}

function renderFirstParagraph(resolvesTo: string, t: number): PreviewResult {
  const path = resolveReadmePath(resolvesTo) ?? resolvesTo
  if (!existsSync(path)) {
    return { kind: "error", message: `file not found: ${resolvesTo}`, resolvedAt: t }
  }
  const raw = readFileSync(path, "utf-8")
  const para = firstNonBlankParagraph(raw)
  return { kind: "ok", body: para, format: "text", resolvedAt: t }
}

function renderBdActive(parentId: string, t: number): PreviewResult {
  // `bd list --parent <id> --status open --limit 5`. We invoke synchronously
  // so the popover's render path stays single-shot — the 30s cache amortizes
  // the subprocess cost across hovers.
  const proc = spawnSync("bd", ["list", "--parent", parentId, "--status", "open", "--limit", "5"], {
    encoding: "utf-8",
    timeout: 5_000,
  })
  if (proc.error) {
    return { kind: "error", message: `bd: ${String(proc.error)}`, resolvedAt: t }
  }
  if (proc.status !== 0) {
    const stderr = (proc.stderr ?? "").trim()
    return {
      kind: "error",
      message: `bd exited ${proc.status}${stderr ? `: ${stderr}` : ""}`,
      resolvedAt: t,
    }
  }
  const stdout = (proc.stdout ?? "").trim()
  const body = stdout.length > 0 ? stdout : `No open beads under ${parentId}.`
  return { kind: "ok", body, format: "text", resolvedAt: t }
}

/**
 * Take the first non-blank paragraph from a text/markdown buffer. A
 * paragraph is a run of non-blank lines separated by blank lines. We skip
 * leading H1 / front-matter / blank lines so the preview isn't just
 * "# Title".
 */
function firstNonBlankParagraph(raw: string): string {
  const lines = raw.split("\n")
  let i = 0
  // Skip front-matter (--- ... ---).
  if (lines[0]?.trim() === "---") {
    i = 1
    while (i < lines.length && lines[i]?.trim() !== "---") i++
    i++ // skip closing ---
  }
  // Walk until we hit a non-blank, non-heading line.
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (line.trim().length === 0) {
      i++
      continue
    }
    if (line.startsWith("#")) {
      i++
      continue
    }
    break
  }
  // Collect the paragraph.
  const collected: string[] = []
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (line.trim().length === 0) break
    collected.push(line)
    i++
  }
  if (collected.length === 0) return raw.trim().slice(0, 200)
  return collected.join("\n").trim()
}

/**
 * Cap a string to roughly `maxLines` lines so the popover stays readable.
 * Preserves trailing newline structure so markdown still renders cleanly.
 */
function truncateForPopover(raw: string, maxLines: number): string {
  const lines = raw.split("\n")
  if (lines.length <= maxLines) return raw
  return [...lines.slice(0, maxLines), "", "…"].join("\n")
}
