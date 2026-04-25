/**
 * Autolink preview resolver — cache + watcher orchestration.
 *
 * This module owns:
 *   - The in-memory `PreviewResult` cache (keyed by `${preview}::${cache_key}`).
 *   - `fs.watch` lifecycle for file-backed previews (debounced eviction).
 *   - The 30s TTL fallback for shell-out / subprocess / network previews.
 *   - `resolvePreview` — the public entry point used by `DetectionText` and
 *     by tests. It builds a URI from the rule's `resolves_to`, dispatches
 *     into the handler registry (`./handlers/index.ts`), then folds the
 *     result through the cache + watcher layer.
 *
 * The actual per-scheme resolution lives in `./handlers/<scheme>.ts`. The
 * user-facing `preview` kind from a rule is forwarded as a hint
 * (`ctx.preview`) so multi-mode handlers (currently `file`) can choose
 * between e.g. `readme` and `first-paragraph`.
 *
 * Mapping from `preview` kind → URI scheme used at dispatch:
 *
 *   - `readme` / `first-paragraph` → `file:` (built from `resolves_to`)
 *   - `bd-active`                  → `bd:`
 *   - `shell`                      → `shell:` (the `command` spec rides on
 *                                              `ctx`, the URI carries the
 *                                              `resolves_to` value verbatim)
 *   - `mcp`                        → `mcp:`
 *
 * If `resolves_to` already carries an explicit scheme (e.g. `https://...`),
 * that scheme is used verbatim and the preview kind is ignored. This is the
 * path plain URLs in messages take — see `match.ts` for virtual detections.
 *
 * Caching: per-cache-key in-memory. File-backed previews invalidate on
 * `fs.watch` `change` events with a 200ms debounce, so the next
 * `resolvePreview()` reads fresh content. Shell-out / subprocess previews
 * have no file backing and fall back to a 30-second TTL.
 */

import { watch, type FSWatcher } from "node:fs"
import createDebug from "debug"
import type { AutolinkPreviewKind } from "./config.ts"
import { parseResolvesTo } from "./uri.ts"
import { resolveURI } from "./handlers/index.ts"
import { sanitizeShellOutput, SHELL_PREVIEW_OUTPUT_CAP_BYTES, SHELL_PREVIEW_TIMEOUT_MS } from "./shell-utils.ts"

const log = createDebug("silvercode:autolinks:previews")

/** TTL fallback for previews without a file backing (e.g., `bd-active`, `shell`). */
export const PREVIEW_CACHE_TTL_MS = 30_000

/** Debounce window for fs.watch change events. fsync can fire many times in a tight loop; we wait this long after the last event before evicting. */
export const PREVIEW_WATCH_DEBOUNCE_MS = 200

// Re-export shell-related primitives so existing import sites
// (`from "../../src/autolinks/previews.ts"`) don't break.
export { sanitizeShellOutput, SHELL_PREVIEW_OUTPUT_CAP_BYTES, SHELL_PREVIEW_TIMEOUT_MS }

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
 * otherwise dispatches into the URI handler registry and caches the result.
 *
 * File-backed previews register an `fs.watch` handle on cache insert so
 * subsequent file modifications evict the entry. Shell-out / subprocess
 * previews have no file to watch and fall back to the 30s TTL.
 *
 * Errors never throw — they're returned as `PreviewError` so the popover
 * can show a useful diagnostic instead of crashing the render tree.
 */
export function resolvePreview(args: {
  /**
   * The user-facing preview kind from the source rule, OR a synthetic kind
   * used for virtual detections (e.g. `"https"` for plain URLs in messages).
   * Synthetic kinds are routed by URI scheme alone; the value is NOT parsed
   * back into an `AutolinkPreviewKind` enum.
   */
  preview: AutolinkPreviewKind | string
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

  let outcomeResult: PreviewResult
  let watchedPath: string | null = null
  try {
    // Build a URI for the rule's resolves_to and dispatch through the
    // handler registry. The `preview` kind rides along on the context
    // so multi-mode handlers (e.g. file: → readme vs first-paragraph)
    // can pick the right behavior.
    const uri = uriForPreview(args.preview, args.resolvesTo)
    const outcome = resolveURI(uri, {
      cacheKey: args.cacheKey,
      // Only forward the preview kind to the handler if it's a known
      // user-facing kind — synthetic kinds (e.g. "https" for virtual
      // plain-URL detections) carry no useful semantic for handlers.
      preview: isAutolinkPreviewKind(args.preview) ? args.preview : undefined,
      command: args.command,
      now,
    })
    outcomeResult = outcome.result
    if (outcome.result.kind === "ok" && outcome.watchPath !== undefined) {
      watchedPath = outcome.watchPath
    }
  } catch (err) {
    log(`preview %s for %s threw: %s`, args.preview, args.resolvesTo, String(err))
    outcomeResult = { kind: "error", message: `preview failed: ${String(err)}`, resolvedAt: t }
  }
  cache.set(key, outcomeResult)
  if (watchedPath !== null) {
    registerWatcher(key, watchedPath)
  } else {
    // No file backing — make sure any stale watcher (e.g., from a
    // previous file-backed result that's now an error) is disposed.
    disposeWatcher(key)
  }
  return outcomeResult
}

/**
 * Build the URI used for handler dispatch from a rule's preview kind +
 * resolves_to value.
 *
 * The `resolves_to` field is parsed via `parseResolvesTo` (scheme inference
 * from path-shape, with explicit-scheme passthrough). The `preview` kind
 * acts as a hint when the inferred scheme has multiple modes (file: → readme
 * vs first-paragraph) and as a scheme override when the user said `shell:` /
 * `bd-active` / `mcp` and the resolves_to value didn't carry one.
 *
 * Examples:
 *   - preview=readme, resolves_to=/x/y           → file:///x/y
 *   - preview=first-paragraph, resolves_to=~/x   → file:///<home>/x
 *   - preview=bd-active, resolves_to=km-foo      → bd:km-foo (parsed from BD_LIKE_RE)
 *   - preview=shell, resolves_to=/x              → shell:///x (file-shape forced into shell:)
 *   - preview=mcp, resolves_to=foo.lookup        → mcp:foo.lookup
 */
function uriForPreview(preview: AutolinkPreviewKind | string, resolvesTo: string): URL {
  const parsed = parseResolvesTo(resolvesTo)
  const inferredScheme = parsed.protocol.replace(/:$/, "")

  // If the user supplied an explicit scheme via resolves_to, honour it.
  // Otherwise, the preview kind dictates the dispatch scheme.
  if (hasExplicitScheme(resolvesTo)) {
    return parsed
  }

  // Synthetic preview kinds (e.g. virtual "https") fall through to the
  // inferred scheme — they reach this branch only when resolves_to didn't
  // carry an explicit scheme, which shouldn't happen for plain URLs but
  // we handle it defensively.
  if (!isAutolinkPreviewKind(preview)) {
    return parsed
  }

  switch (preview) {
    case "readme":
    case "first-paragraph":
      // parseResolvesTo already resolved /, ~, or bare paths into file:.
      // bd-shaped values (km-foo, foo.bar) might have inferred bd:; in that
      // case we still trust the user's preview kind and force file:. This
      // is a pathological edge — a user wrote `preview: readme` with a
      // bd-shaped path. We give the file handler a chance to surface a
      // clearer "file not found" error.
      if (inferredScheme === "file") return parsed
      // Fallback: encode the value into a file: URI literally.
      return forceFileURI(resolvesTo)
    case "bd-active":
      if (inferredScheme === "bd") return parsed
      // User said preview=bd-active but resolves_to didn't look like a bd id.
      // Construct bd:<verbatim> so the handler can surface a useful error.
      return new URL(`bd:${encodeURIComponent(resolvesTo)}`)
    case "shell":
      // shell handler reads `command` from ctx — the URI just carries the
      // resolves_to value for ${resolves_to} substitution.
      return new URL(`shell://${encodeShellHost(resolvesTo)}`)
    case "mcp":
      return new URL(`mcp:${encodeURIComponent(resolvesTo)}`)
  }
}

/** Type guard for the user-facing preview kind enum. */
function isAutolinkPreviewKind(value: unknown): value is AutolinkPreviewKind {
  return (
    value === "readme" || value === "first-paragraph" || value === "bd-active" || value === "shell" || value === "mcp"
  )
}

/**
 * Lightweight check for "the user wrote an explicit scheme". Mirrors the
 * logic in `parseResolvesTo` without re-running the URL constructor.
 */
function hasExplicitScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value.trim())
}

/**
 * Force a value into a `file:` URI even if it didn't match the inference
 * rules. Used when the user's `preview` kind insists on file semantics but
 * `parseResolvesTo` chose another scheme.
 */
function forceFileURI(value: string): URL {
  const path = value.startsWith("/") ? value : `/${value}`
  const encoded = path
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")
  return new URL(`file://${encoded}`)
}

/**
 * URI host segment encoder for shell:. We prefer `host` over `pathname`
 * because the URL constructor treats `shell:foo` differently from
 * `shell://foo` — using the `://` form keeps the value retrievable via
 * `uri.host`.
 */
function encodeShellHost(value: string): string {
  // URL host can't contain certain characters; percent-encode anything
  // problematic. The shell handler decodes via `decodeURIComponent`.
  return encodeURIComponent(value)
}

/** Test-only: introspect active watcher count. */
export function _activeWatcherCount(): number {
  return watchers.size
}
