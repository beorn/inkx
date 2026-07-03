/**
 * ESM-graph-coherent loader for the OPTIONAL @termless/* emulator backends used
 * by SILVERY_STRICT_TERMINAL (output-verify.ts) and cursor verification
 * (cursor-diagnostics.ts).
 *
 * ── Why this module exists ────────────────────────────────────────────────
 *
 * NOT `createRequire`: `createRequire(import.meta.url)("@termless/ghostty")`
 * re-introduces the CommonJS loader inside ESM. Under vitest's module runner the
 * loaded module ESCAPES the ESM graph and gets its OWN instance. @termless/ghostty
 * holds a module-level `sharedGhostty` WASM singleton (set by `initGhostty()`); a
 * second instance splits it, so the verifier's `createGhosttyBackend()` observes
 * `sharedGhostty = null` even after the ESM instance was initialized — it then
 * diverges from (or errors against) the ghostty terminal every other consumer
 * shares. That is the 2026-07-02 Ghostty-WASM incident: the contract-test culprit
 * was fixed in silvery 4641f71b; output-verify.ts + cursor-diagnostics.ts were the
 * remaining production-side createRequire instances. Routing every load through
 * this module puts the verifier on the SAME instance as createTermless /
 * createGhosttyBackend / the tests' own `import … from "@termless/ghostty"`.
 *
 * NOT a static `import`: @termless/* are OPTIONAL peers of the published silvery
 * umbrella. A static import evaluates them at module load for every consumer and
 * breaks installs that don't have the peers. `await import()` inside a preload
 * only resolves when strict verification is actually requested.
 *
 * ── The sync/async bridge ─────────────────────────────────────────────────
 *
 * The load is async (`await import()`); the consumers (the output phase, cursor
 * diagnostics) run in the SYNCHRONOUS render pipeline and cannot await a dynamic
 * import mid-frame. We bridge with an async PRELOAD into a module cache plus a
 * sync GET that throws LOUD on a cache miss (no silent fallback — a missing
 * backend must be diagnosable, not swallowed). Preload is awaited at the two
 * async boundaries that precede any strict frame:
 *   - `@silvery/test`'s top-level await (test path — the backends are already
 *     statically imported there, so the preload is a free re-resolve).
 *   - the live `run()` setup (the SILVERY_STRICT_TERMINAL / cursor debugging path).
 *
 * Bead: createrequire-ban (wave 3 — the incident siblings).
 */

interface BackendCache {
  core: typeof import("@termless/core") | null
  xterm: typeof import("@termless/xtermjs") | null
  ghostty: typeof import("@termless/ghostty") | null
}

// The cache lives on globalThis under a Symbol.for key, NOT in a module-level
// `let`. Under vitest's module runner this file can be instantiated more than
// once — @silvery/test imports it by package specifier
// (`@silvery/ag-term/strict-terminal-backends`) while output-verify.ts /
// cursor-diagnostics.ts import it by relative path (`../strict-terminal-backends`),
// and those two specifiers resolve to DISTINCT module instances. A module-level
// cache would then split: @silvery/test's top-level preload populates one
// instance, the synchronous verifier reads the other (empty) instance and
// fail-louds. `Symbol.for` is a cross-instance/cross-realm global registry, so
// every instance shares ONE cache object — the same singleton-coherence property
// this module exists to guarantee for @termless itself.
const CACHE_KEY = Symbol.for("@silvery/ag-term:strict-terminal-backends")

function backendCache(): BackendCache {
  const store = globalThis as typeof globalThis & { [CACHE_KEY]?: BackendCache }
  return (store[CACHE_KEY] ??= { core: null, xterm: null, ghostty: null })
}

export interface StrictTerminalPreloadOptions {
  /**
   * Also load the `@termless/ghostty` module (required before any
   * SILVERY_STRICT_TERMINAL=ghostty frame). Defaults to false so callers that
   * only need the xterm/core verifier don't pull the ghostty module.
   */
  ghostty?: boolean
  /**
   * Also `await initGhostty()` so the WASM singleton is ready for the
   * SYNCHRONOUS `createGhosttyBackend()` the verifier calls mid-frame. The
   * `@silvery/test` top-level preload passes `false` — the ghostty MODULE is
   * loaded (so the sync accessor resolves) but WASM init stays deferred to the
   * ghostty test's own `await initGhostty()` (or the live run() path), which
   * keeps non-ghostty test suites from paying the WASM load. Defaults to
   * whatever `ghostty` is.
   */
  initGhosttyWasm?: boolean
}

/**
 * Load the requested @termless backends into the module cache via the ESM
 * graph. Idempotent — safe to call from every async setup path. Awaiting this
 * is what makes the subsequent synchronous `getTermless*()` reads succeed.
 */
export async function preloadStrictTerminalBackends(
  opts: StrictTerminalPreloadOptions = {},
): Promise<void> {
  const wantGhostty = opts.ghostty ?? false
  const wantWasm = opts.initGhosttyWasm ?? wantGhostty
  const cache = backendCache()

  // core + xtermjs are always needed by both verifiers (the fresh-render
  // comparison terminal is xterm even in ghostty mode).
  cache.core ??= await import("@termless/core")
  cache.xterm ??= await import("@termless/xtermjs")

  if (wantGhostty) {
    cache.ghostty ??= await import("@termless/ghostty")
    if (wantWasm) await cache.ghostty.initGhostty()
  }
}

function missing(specifier: string, extra = ""): never {
  throw new Error(
    `[silvery] @termless backend "${specifier}" was consumed before it was preloaded. ` +
      `The SILVERY_STRICT terminal/cursor verifier runs in the synchronous output phase ` +
      `and cannot await a dynamic import mid-frame, so the backend must be loaded first via ` +
      `\`await preloadStrictTerminalBackends()\`. Tests get this for free through @silvery/test's ` +
      `top-level preload; a live \`run()\` under SILVERY_STRICT_TERMINAL/cursor awaits it during ` +
      `setup. This is loaded via the ESM graph (never the CommonJS require shim) so the verifier ` +
      `shares the single @termless module instance — the 2026-07-02 Ghostty-WASM singleton-split fix.${extra}`,
  )
}

/** Sync accessor for `@termless/core`. Throws loud if not preloaded. */
export function getTermlessCore(): typeof import("@termless/core") {
  return backendCache().core ?? missing("@termless/core")
}

/** Sync accessor for `@termless/xtermjs`. Throws loud if not preloaded. */
export function getTermlessXterm(): typeof import("@termless/xtermjs") {
  return backendCache().xterm ?? missing("@termless/xtermjs")
}

/** Sync accessor for `@termless/ghostty`. Throws loud if not preloaded. */
export function getTermlessGhostty(): typeof import("@termless/ghostty") {
  return (
    backendCache().ghostty ??
    missing(
      "@termless/ghostty",
      " Pass `{ ghostty: true }` to preloadStrictTerminalBackends() (SILVERY_STRICT_TERMINAL=ghostty).",
    )
  )
}

/**
 * Test-only reset of the backend cache. Lets a test assert the fail-loud path
 * and re-exercise the preload. NOT for production use.
 * @internal
 */
export function _resetStrictTerminalBackendsForTesting(): void {
  const cache = backendCache()
  cache.core = null
  cache.xterm = null
  cache.ghostty = null
}
