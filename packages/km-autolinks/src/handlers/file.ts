/**
 * `file:` handler — resolves a filesystem URI into a markdown preview.
 *
 * Supports two modes, selected by `ctx.preview`:
 *
 *   - `readme` (default for `file:`-scheme URIs without an explicit preview):
 *     If the path is a directory, look for README.md (case-insensitive in a
 *     fixed candidate list); otherwise treat the path as the README.
 *     Body is rendered through MarkdownView in the popover.
 *   - `first-paragraph`: Read the file and return the first non-blank
 *     paragraph (skipping front-matter and headings). Body still flows
 *     through MarkdownView so inline emphasis carries through.
 *
 * File-backed previews register an `fs.watch` handle upstream by returning
 * `watchPath` in the outcome. The cache layer (in `previews.ts`) sets up
 * the watcher and tears it down on eviction.
 */

import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import type { Handler, HandlerOutcome, ResolveCtx } from "./index.ts"
import { filePathFromURL } from "../uri.ts"

/**
 * Cap a markdown body so the popover doesn't get crushed under a 500-line
 * README. Truncation is a cheap defense against pathological inputs.
 */
const README_LINE_CAP = 60

export const fileHandler: Handler = {
  scheme: "file",
  resolve(uri: URL, ctx: ResolveCtx): HandlerOutcome {
    const t = (ctx.now ?? Date.now)()
    const path = filePathFromURL(uri)
    const mode = ctx.preview === "first-paragraph" ? "first-paragraph" : "readme"

    if (mode === "first-paragraph") {
      const target = existsSync(path) ? path : null
      if (!target) {
        return {
          result: { kind: "error", message: `file not found: ${path}`, resolvedAt: t },
        }
      }
      const raw = readFileSync(target, "utf-8")
      const para = firstNonBlankParagraph(raw)
      return {
        result: { kind: "ok", body: para, format: "markdown", resolvedAt: t },
        watchPath: target,
      }
    }

    // readme mode (default).
    const resolved = resolveReadmePath(path)
    if (!resolved) {
      return {
        result: { kind: "error", message: `no README found at ${path}`, resolvedAt: t },
      }
    }
    const body = readFileSync(resolved, "utf-8")
    const trimmed = truncateForPopover(body, README_LINE_CAP)
    return {
      result: { kind: "ok", body: trimmed, format: "markdown", resolvedAt: t },
      watchPath: resolved,
    }
  },
}

/**
 * Resolve a path to an actual README. If the path is a directory, look for
 * README.md / readme.md / Readme.md in that order. If it's a file, return
 * the file. If nothing exists, return null.
 */
function resolveReadmePath(path: string): string | null {
  if (!existsSync(path)) return null
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(path)
  } catch {
    return null
  }
  if (st.isDirectory()) {
    const candidates = ["README.md", "readme.md", "Readme.md"]
    for (const c of candidates) {
      const p = join(path, c)
      if (existsSync(p)) return p
    }
    return null
  }
  return path
}

/**
 * Take the first non-blank paragraph from a text/markdown buffer. Skips
 * front-matter (`---` blocks) and leading headings so the preview isn't
 * just "# Title".
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
