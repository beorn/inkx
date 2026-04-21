/**
 * withHelpOverlay — TEA apply-chain mini-cutover plugin for the help overlay.
 *
 * This is a **Phase 0 mini-cutover** (per K2.6 § 6 in pro review 2). It
 * migrates ONE real km dialog (the help overlay — the simplest one) to
 * the TEA apply-chain pattern validated by the tea-nav-spike (signature
 * flip) and tea-lifecycle-spike (React/Ink + zustand cohabitation).
 *
 * ## Why the help overlay?
 *
 * - **No text input** — no coupling to `useEditContext`/`dialogTargetRef`.
 * - **No domain state** — no coupling to repo/selection/tree ops.
 * - **4 ops total** — SHOW, HIDE, SCROLL_UP, SCROLL_DOWN. All pure UI.
 * - **No dialog-guard usage** — help lives outside the focus-scope stack.
 *
 * This makes it the safest single-dialog target to validate the TEA plugin
 * pattern against km's real zustand store + commands + keybindings before
 * Phase 1 (`withDialogs()`) commits to the pattern for every dialog at once.
 *
 * ## Shape
 *
 * The plugin owns its own state in a closure-scoped external store (matching
 * the Phase B shape of the lifecycle spike — `{ getState, setState,
 * subscribe }`). React components read via `useSyncExternalStore()` through
 * the `useHelpOverlay()` hook.
 *
 * Ops are serializable — no closures, no refs, no class instances. This is
 * what lets AI automation and replay drive the plugin identically to a
 * human user. The `apply()` function is pure: `(op, state) → [newState,
 * effects]`. No side effects. No I/O. No mutation.
 *
 * ## Feature flag
 *
 * The plugin is activated only when `KM_TEA_HELP=1` is set in the
 * environment (or when `isTeaHelpEnabled()` returns true in tests). When
 * inactive, all help overlay state continues to flow through the legacy
 * `ui.showHelp` / `ui.helpScrollOffset` zustand fields. Parity tests
 * exercise both paths against identical expectations.
 *
 * ## Not yet
 *
 * - No connection to silvery's `pipe()`/`createApp()` substrate. This is
 *   a parallel store for a single dialog — composing into the full
 *   plugin chain is Phase 1 work.
 * - No undo integration. Undo for UI-only ops isn't needed yet; withUndo
 *   (Phase 6) will wrap domain plugins, not help.
 * - No effects lane. Help has no async behavior — future plugins that do
 *   (e.g. withStorage, withSearch) will return effects from apply();
 *   this one always returns an empty effects array.
 */

// =============================================================================
// Types — ops, state, effects
// =============================================================================

/** All ops the help-overlay plugin accepts. Serializable — plain data only. */
export type HelpOp =
  | { type: "help.show" }
  | { type: "help.hide" }
  | { type: "help.scrollUp" }
  | { type: "help.scrollDown" }
  | { type: "help.toggle" }

/** Plugin-owned state. Read by views via `useHelpOverlay()`. */
export interface HelpState {
  visible: boolean
  scrollOffset: number
}

/**
 * Effect returned from `apply()`. Currently always empty for help — kept
 * as a named alias so future plugins can use the same `[state, effects]`
 * tuple signature. Effects are the lane for I/O / dispatches into other
 * plugins.
 */
export type HelpEffect = { type: never }

const INITIAL_HELP_STATE: HelpState = {
  visible: false,
  scrollOffset: 0,
}

/**
 * Feature flag: KM_TEA_HELP=1 routes help-overlay operations through the
 * plugin. Anything else uses the legacy `ui.showHelp` path. The flag is
 * read per-call (not cached at module load) so tests can flip it without
 * process restart.
 */
export function isTeaHelpEnabled(): boolean {
  // Env var wins. When set, tests can also override via window flag for
  // the rare case of running in a mixed process.
  if (process.env.KM_TEA_HELP === "1") return true
  return false
}

// =============================================================================
// Pure reducer — apply(op, state) → [newState, effects]
// =============================================================================

/**
 * Pure reducer. Given the current state and an op, returns the next state
 * and a list of effects to run. No side effects. No mutation. Not even
 * logging — logging is a cross-cutting plugin concern.
 *
 * This is the heart of the TEA pattern: everything interactive decomposes
 * into this signature, and the signature is what makes the plugin
 * testable, replayable, composable, and serializable.
 */
export function apply(op: HelpOp, state: HelpState): [HelpState, HelpEffect[]] {
  switch (op.type) {
    case "help.show":
      // Re-opening while visible is a no-op; the scroll offset persists in
      // that case (pressing ? a second time shouldn't reset scroll). When
      // transitioning from hidden, offset resets to 0 — matches legacy
      // behaviour (SHOW_HELP does helpScrollOffset: 0).
      if (state.visible) return [state, []]
      return [{ visible: true, scrollOffset: 0 }, []]
    case "help.hide":
      if (!state.visible) return [state, []]
      return [{ visible: false, scrollOffset: 0 }, []]
    case "help.toggle":
      // Toggle is the shape Phase 1's generic withDialogs will use for most
      // dialogs — legacy has separate show/hide but toggle is the natural
      // idiom for a single-key binding.
      if (state.visible) return [{ visible: false, scrollOffset: 0 }, []]
      return [{ visible: true, scrollOffset: 0 }, []]
    case "help.scrollUp":
      if (!state.visible) return [state, []]
      return [{ ...state, scrollOffset: Math.max(0, state.scrollOffset - 1) }, []]
    case "help.scrollDown":
      if (!state.visible) return [state, []]
      return [{ ...state, scrollOffset: state.scrollOffset + 1 }, []]
  }
}

// =============================================================================
// External store (zustand-shape: { getState, setState, subscribe })
// =============================================================================

type Listener = () => void

/**
 * Minimal external store for plugin state. Matches zustand/vanilla's API
 * exactly (the lifecycle spike confirmed this shape cohabitates with
 * React via `useSyncExternalStore` without double-committing). We don't
 * take on zustand as a dep for this one dialog — the API is 25 lines.
 */
export interface HelpStore {
  getState(): HelpState
  dispatch(op: HelpOp): void
  /** Subscribe to state changes. Returns unsubscribe fn. */
  subscribe(listener: Listener): () => void
  /** Reset to initial state. Used by tests between runs. */
  reset(): void
}

export function createHelpStore(initial: HelpState = INITIAL_HELP_STATE): HelpStore {
  let state = initial
  const listeners = new Set<Listener>()

  return {
    getState: () => state,
    dispatch(op) {
      const [next, _effects] = apply(op, state)
      if (next === state) return // no-op short-circuit; useSyncExternalStore skips
      state = next
      for (const l of listeners) l()
      // Future plugins return non-empty effects — drain them here. The
      // shape is [{ type: "dispatch", op }, { type: "effect", payload }, ...].
      // Help never produces effects so the drain is a no-op today.
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    reset() {
      state = initial
      for (const l of listeners) l()
    },
  }
}

// =============================================================================
// Singleton — the process-wide plugin store
// =============================================================================

/**
 * Process-wide plugin store. When the feature flag is on, commands
 * dispatch ops to THIS store; when off, commands flow through the
 * legacy `ui.showHelp` path. Tests that exercise the plugin path can
 * call `.reset()` between cases.
 *
 * Keeping it as a singleton (rather than per-app) is deliberate for
 * this mini-cutover: km-tui today has exactly one app instance per
 * process, and the Phase 1 plugin system will formalize per-app
 * ownership. Don't generalize this without walking the full Phase 1
 * composition path — the spike demonstrated per-component lifetime
 * via `useRef`, which is the right model for multi-app contexts.
 */
let singleton: HelpStore | null = null

export function getHelpStore(): HelpStore {
  if (!singleton) singleton = createHelpStore()
  return singleton
}

/** Test-only: reset the singleton between cases. */
export function resetHelpStore(): void {
  if (singleton) singleton.reset()
  else singleton = createHelpStore()
}
