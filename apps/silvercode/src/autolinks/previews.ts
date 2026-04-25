/**
 * Autolink preview renderers.
 *
 * Five preview kinds:
 *
 *   - "readme"          → fetch the file at `resolvesTo`, render markdown.
 *                         If `resolvesTo` is a directory, look for README.md.
 *                         `format: "markdown"` — popover renders via MarkdownView.
 *   - "first-paragraph" → fetch the file, return the first non-blank paragraph.
 *                         `format: "markdown"` — popover renders via MarkdownView
 *                         (the source IS markdown — emphasis carries over).
 *   - "bd-active"       → spawn `bd list --parent <resolvesTo> --status open
 *                         --limit 5` and return its stdout. `format: "text"`.
 *   - "shell"           → spawn the rule's `command` (with ${resolves_to}
 *                         substitution); 5s timeout, output capped at 4KB.
 *                         `format: "text"`.
 *   - "mcp"             → stub. `resolvePreview` returns an error pointing at
 *                         the follow-up bead; mcp rules are normally dropped
 *                         at config-load time, this branch is a defensive
 *                         fallback only.
 *
 * Caching: per-cache-key in-memory. File-backed previews (`readme`,
 * `first-paragraph`) invalidate on `fs.watch` `change` events with a
 * 200ms debounce, so the next `resolvePreview()` reads fresh content.
 * Shell-out previews (`bd-active`, `shell`) have no file backing and fall
 * back to a 30-second TTL.
 */

import { existsSync, readFileSync, statSync, watch, type FSWatcher } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import createDebug from "debug"
import type { AutolinkPreviewKind } from "./config.ts"

const log = createDebug("silvercode:autolinks:previews")

/** TTL fallback for previews without a file backing (e.g., `bd-active`, `shell`). */
export const PREVIEW_CACHE_TTL_MS = 30_000

/** Debounce window for fs.watch change events. fsync can fire many times in a tight loop; we wait this long after the last event before evicting. */
export const PREVIEW_WATCH_DEBOUNCE_MS = 200

/** Wall-clock timeout for `shell` previews. Process is killed if it overruns. */
export const SHELL_PREVIEW_TIMEOUT_MS = 5_000

/** Hard cap on captured stdout from a `shell` preview, in bytes. Anything past this is truncated with a "[truncated]" marker. Prevents a runaway command (e.g. `find /`) from filling the popover with megabytes of text. */
export const SHELL_PREVIEW_OUTPUT_CAP_BYTES = 4_096

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
 * resets it manually — file-backed entries evict on fs.watch change
 * events, shell-out entries expire on TTL.
 */
const cache = new Map<string, PreviewResult>()

/**
 * Per-cache-key fs.watch handles. When a file-backed preview is cached,
 * we register a watcher that evicts the entry on `change`. Watchers are
 * torn down on cache eviction (manual or change-driven) and on
 * `disposeAllWatchers()`.
 */
type WatcherEntry = {
  readonly watcher: FSWatcher
  /** Active debounce timer; cleared on eviction. */
  debounce: ReturnType<typeof setTimeout> | null
}
const watchers = new Map<string, WatcherEntry>()

/** Test-only: drop every cached preview so the next call goes through fresh. Also tears down all watchers. */
export function clearPreviewCache(): void {
  cache.clear()
  disposeAllWatchers()
}

/** Tear down every active fs.watch handle. Used by `clearPreviewCache()` and exposed for callers (e.g., `AutolinksProvider`) that want to dispose on unmount. */
export function disposeAllWatchers(): void {
  for (const [, entry] of watchers) {
    if (entry.debounce !== null) clearTimeout(entry.debounce)
    try {
      entry.watcher.close()
    } catch (err) {
      log("watcher close failed: %s", String(err))
    }
  }
  watchers.clear()
}

/** Tear down the watcher for a single cache key, if any. Idempotent. */
function disposeWatcher(key: string): void {
  const entry = watchers.get(key)
  if (!entry) return
  if (entry.debounce !== null) clearTimeout(entry.debounce)
  try {
    entry.watcher.close()
  } catch (err) {
    log("watcher close failed for %s: %s", key, String(err))
  }
  watchers.delete(key)
}

/**
 * Register an fs.watch handle for a cache key. On `change`, debounce
 * for `PREVIEW_WATCH_DEBOUNCE_MS`, then evict the cache entry and tear
 * down the watcher (the next resolve will register a fresh one).
 */
function registerWatcher(key: string, path: string): void {
  // Replace any existing watcher for this key — the file we're tracking
  // may have changed (e.g., README.md vs Readme.md resolution).
  disposeWatcher(key)
  let watcher: FSWatcher
  try {
    watcher = watch(path, () => {
      const entry = watchers.get(key)
      if (!entry) return
      if (entry.debounce !== null) clearTimeout(entry.debounce)
      entry.debounce = setTimeout(() => {
        log("evicting %s after fs.watch change on %s", key, path)
        cache.delete(key)
        disposeWatcher(key)
      }, PREVIEW_WATCH_DEBOUNCE_MS)
    })
  } catch (err) {
    // fs.watch can fail (e.g., file deleted between stat and watch);
    // we degrade silently — the entry just stays cached until the
    // next manual clear or process restart.
    log("fs.watch failed for %s: %s", path, String(err))
    return
  }
  // If the watcher itself errors after creation, tear it down so we
  // don't leak.
  watcher.on("error", (err) => {
    log("fs.watch errored for %s: %s", path, String(err))
    disposeWatcher(key)
  })
  watchers.set(key, { watcher, debounce: null })
}

/**
 * Resolve a preview for the given autolink. Synchronous on cache hits;
 * otherwise runs the underlying loader (filesystem or `bd` subprocess)
 * and caches the result.
 *
 * File-backed previews (`readme`, `first-paragraph`) register an
 * fs.watch handle on cache insert so subsequent file modifications
 * evict the entry. Shell-out previews (`bd-active`) have no file to
 * watch and fall back to the 30s TTL.
 *
 * Errors never throw — they're returned as `PreviewError` so the popover
 * can show a useful diagnostic instead of crashing the render tree.
 */
export function resolvePreview(args: {
  preview: AutolinkPreviewKind
  resolvesTo: string
  cacheKey: string
  /**
   * Required for `preview === "shell"` — the structured command spec.
   * Each `args[i]` has `${resolves_to}` substituted at token level (never
   * concatenated into a shell string). Ignored for other kinds.
   */
  command?: { readonly exec: string; readonly args: readonly string[] }
  /**
   * Override `now()` for tests. Production callers omit it.
   */
  now?: () => number
}): PreviewResult {
  const now = args.now ?? Date.now
  const key = `${args.preview}::${args.cacheKey}`
  const t = now()

  const hit = cache.get(key)
  if (hit) {
    // File-backed entries stay valid until the watcher evicts them.
    // Shell-out entries expire on TTL.
    const isFileBacked = watchers.has(key)
    if (isFileBacked) return hit
    if (t - hit.resolvedAt < PREVIEW_CACHE_TTL_MS) return hit
  }

  let result: PreviewResult
  /** Path of the file actually read (for watcher registration). null = no file backing. */
  let watchedPath: string | null = null
  try {
    switch (args.preview) {
      case "readme": {
        const path = resolveReadmePath(args.resolvesTo)
        result = renderReadme(args.resolvesTo, path, t)
        if (result.kind === "ok" && path !== null) watchedPath = path
        break
      }
      case "first-paragraph": {
        const path = resolveReadmePath(args.resolvesTo) ?? args.resolvesTo
        result = renderFirstParagraph(args.resolvesTo, path, t)
        if (result.kind === "ok" && existsSync(path)) watchedPath = path
        break
      }
      case "bd-active":
        result = renderBdActive(args.resolvesTo, t)
        break
      case "shell":
        result = args.command
          ? renderShell(args.command, args.resolvesTo, t)
          : { kind: "error", message: "shell preview missing command spec", resolvedAt: t }
        break
      case "mcp":
        // Defensive — `mcp` rules are dropped by `validateRule`. If we get
        // here, the caller bypassed config validation. Surface a useful
        // pointer instead of crashing.
        result = {
          kind: "error",
          message: "mcp preview not yet implemented — see km-silvercode.autolinks-mcp-resolver",
          resolvedAt: t,
        }
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
  if (watchedPath !== null) {
    registerWatcher(key, watchedPath)
  } else {
    // No file backing — make sure any stale watcher (e.g., from a
    // previous file-backed result that's now an error) is disposed.
    disposeWatcher(key)
  }
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

function renderReadme(resolvesTo: string, path: string | null, t: number): PreviewResult {
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

function renderFirstParagraph(resolvesTo: string, path: string, t: number): PreviewResult {
  if (!existsSync(path)) {
    return { kind: "error", message: `file not found: ${resolvesTo}`, resolvedAt: t }
  }
  const raw = readFileSync(path, "utf-8")
  const para = firstNonBlankParagraph(raw)
  // The source IS markdown, so we keep the inline emphasis tokens
  // (`**bold**`, `*italic*`, `[link](url)`, backtick code spans) intact.
  // The popover renders this body through MarkdownView, which consumes
  // those tokens into styled cells.
  return { kind: "ok", body: para, format: "markdown", resolvedAt: t }
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
 * Run a user-defined shell command and return its sanitized stdout.
 *
 * Security model (the schema removes the injection surface; this function
 * keeps the runtime narrow):
 *   - `command.exec` is the program (bare name resolved via PATH, or absolute).
 *   - Each `command.args[i]` has the literal `${resolves_to}` substituted with
 *     `resolvesTo` AT TOKEN LEVEL — never concatenated into a shell string.
 *     No injection surface: a `resolvesTo` of `"; rm -rf /"` becomes a single
 *     argv token, not a new command.
 *   - We spawn directly via `spawnSync(exec, args)` — no `sh -c`, no shell
 *     interpretation of the user's input.
 *   - Stdin is closed (`input: ""`).
 *   - 5-second wall-clock timeout. Process is killed if it overruns.
 *     `killSignal: "SIGKILL"` ensures the child can't ignore the timeout.
 *   - Env is minimized: only `PATH`, `HOME`, `LANG` are inherited; `TERM`
 *     is forced to `dumb` so commands don't emit ANSI by default.
 *   - Stdout is capped at SHELL_PREVIEW_OUTPUT_CAP_BYTES — anything past
 *     that is truncated.
 *   - Output passes through `sanitizeShellOutput` which strips ANSI escape
 *     sequences (CSI, OSC, DCS), C0 control characters, and DEL — defense
 *     against terminal-injection in popover render.
 *   - stderr is ignored (we already log to debug).
 */
function renderShell(
  command: { readonly exec: string; readonly args: readonly string[] },
  resolvesTo: string,
  t: number,
): PreviewResult {
  if (!command.exec || command.exec.length === 0) {
    return { kind: "error", message: "shell preview missing exec", resolvedAt: t }
  }

  // Per-arg literal substitution — single template variable, no
  // String.prototype.replace surprises ($&, $1, etc.).
  const argv = command.args.map((arg) => arg.split("${resolves_to}").join(resolvesTo))

  // Minimal env. TERM=dumb tells well-behaved tools to skip color codes.
  // Output sanitizer is the safety net for tools that ignore TERM.
  const env: Record<string, string> = {
    PATH: process.env["PATH"] ?? "/usr/bin:/bin",
    HOME: process.env["HOME"] ?? "/",
    LANG: process.env["LANG"] ?? "C",
    TERM: "dumb",
  }

  const proc = spawnSync(command.exec, argv, {
    encoding: "utf-8",
    timeout: SHELL_PREVIEW_TIMEOUT_MS,
    killSignal: "SIGKILL",
    input: "",
    env,
    // Cap captured output up-front so a runaway command doesn't allocate
    // gigabytes before timing out. We then trim further to the byte cap.
    maxBuffer: SHELL_PREVIEW_OUTPUT_CAP_BYTES * 4,
  })

  if (proc.error) {
    // ETIMEDOUT shows up here when the timeout fires.
    const msg = String(proc.error)
    if (proc.signal === "SIGTERM" || proc.signal === "SIGKILL" || /ETIMEDOUT/i.test(msg)) {
      return {
        kind: "error",
        message: `shell preview timed out after ${SHELL_PREVIEW_TIMEOUT_MS}ms`,
        resolvedAt: t,
      }
    }
    return { kind: "error", message: `shell: ${msg}`, resolvedAt: t }
  }
  if (proc.signal === "SIGTERM" || proc.signal === "SIGKILL") {
    return {
      kind: "error",
      message: `shell preview timed out after ${SHELL_PREVIEW_TIMEOUT_MS}ms`,
      resolvedAt: t,
    }
  }
  if (proc.status !== 0) {
    return {
      kind: "error",
      message: `shell exited ${proc.status ?? "?"}`,
      resolvedAt: t,
    }
  }

  const stdout = proc.stdout ?? ""
  const sanitized = sanitizeShellOutput(stdout)
  const body = capOutput(sanitized)
  return { kind: "ok", body, format: "text", resolvedAt: t }
}

/**
 * Strip ANSI escape sequences and C0 control characters from shell output.
 *
 * We render this output in a TUI buffer where ANSI/OSC/DCS sequences would
 * be interpreted by the host terminal (color, cursor moves, OSC 52 paste,
 * window-title set, etc). That's terminal-injection — a real class of bug
 * — so we strip the escape surface even though TERM=dumb is also set.
 *
 * What we strip:
 *   - CSI sequences:    ESC [ ... <final-byte 0x40-0x7E>
 *   - OSC sequences:    ESC ] ... (ST | BEL)
 *   - DCS sequences:    ESC P ... ST
 *   - PM / APC / SOS:   ESC ^ | ESC _ | ESC X ... ST
 *   - 7-bit single-char escapes:  ESC <char>
 *   - C0 controls except TAB (0x09), LF (0x0A), CR (0x0D)
 *   - DEL (0x7F)
 *
 * UTF-8 graphemes pass through unchanged.
 */
export function sanitizeShellOutput(raw: string): string {
  // Strip multi-char escape sequences first (ESC followed by ...).
  // Order matters: OSC/DCS/PM/APC/SOS use String Terminator (ESC \) or BEL
  // and may contain CSI-like bytes inside.
  let s = raw
    // OSC: ESC ] ... (ST = ESC \  | BEL = 0x07)
    .replace(/\x1b\][\s\S]*?(?:\x1b\\|\x07)/g, "")
    // DCS / PM / APC / SOS: ESC P|^|_|X ... ST
    .replace(/\x1b[P^_X][\s\S]*?\x1b\\/g, "")
    // CSI: ESC [ <params> <final>  (final byte 0x40-0x7E)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    // Two-byte 7-bit escapes (ESC <intermediate-or-final>) — anything not
    // already consumed above. Strip the escape and the byte that follows.
    .replace(/\x1b./g, "")
    // Lone ESC at the very end of buffer (incomplete sequence).
    .replace(/\x1b/g, "")

  // C0 controls: 0x00-0x1F except TAB / LF / CR. Plus DEL (0x7F).
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")

  return s
}

/**
 * Truncate stdout to the configured byte cap, appending a marker if the
 * output was longer. Operates on bytes via Buffer to avoid splitting a
 * multi-byte UTF-8 codepoint visibly inside the popover.
 */
function capOutput(raw: string): string {
  const buf = Buffer.from(raw, "utf-8")
  if (buf.length <= SHELL_PREVIEW_OUTPUT_CAP_BYTES) return raw.trimEnd()
  const truncated = buf.subarray(0, SHELL_PREVIEW_OUTPUT_CAP_BYTES).toString("utf-8")
  return `${truncated.trimEnd()}\n[truncated — output exceeded ${SHELL_PREVIEW_OUTPUT_CAP_BYTES}B]`
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

/** Test-only: introspect active watcher count. */
export function _activeWatcherCount(): number {
  return watchers.size
}
