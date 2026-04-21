/**
 * withSearchDialog — TEA apply-chain plugin for the SearchDialog overlay.
 *
 * This is the **real Phase 1 validator** (per dual-pro review 3 § 4, § 8).
 * HelpOverlay validated the reducer + external-store + bridge pattern on the
 * easiest dialog (no text input, no focus scope, no grace period). SearchDialog
 * is the first dialog that exercises the hard interactions TEA Phase 1 must
 * carry:
 *
 * - text input (printable keys via TextInput/useEditContext)
 * - focus scope (pushDialogMode("dialog:search"))
 * - Enter-key grace period (markDialogConfirmed)
 * - initial-input buffering (pre-dialog keystrokes)
 * - multi-slice close on confirm (dialog close + board zoom + selection)
 *
 * ## Scope discipline — what the plugin OWNS vs what it DOESN'T
 *
 * **Owns** (single source of truth when KM_TEA_SEARCH=1):
 * - visibility (`visible`)
 * - initial-input buffer (`initialInput`)
 * - scope toggle (`scope`: "all" | "selected")
 * - scope anchor ids (`scopeNodeIds`)
 *
 * **Does NOT own** (stays where it is):
 * - The text query (lives in `useEditContext`/`TextInput` in SearchDialog.tsx)
 * - The result-list cursor (`selectedIndex`, local `useState` in SearchDialog.tsx)
 * - The focus scope stack (stays in `dialog-guard.ts` via `FocusManager.scopeStack`)
 * - The grace period timestamp (stays in `dialog-guard.ts`)
 * - `dialogTargetRef` (stays as the imperative command→component bridge)
 * - Navigation on confirm (handled by `use-board-dialogs.ts#handleSearchSelect`)
 *
 * The plugin is an additive mirror of `ui.showSearchDialog` / `ui.searchScope`
 * / `ui.searchDialogInitialInput` / `ui.searchScopeNodeIds`. It is NOT trying
 * to abolish dialog-guard, dialogTargetRef, or the text-editor hooks — those
 * are Phase 1+ concerns that need their own design. The elegance proof this
 * cutover aims for is that a 4-field plugin with 5 ops can mirror four ui
 * slices cleanly, through every close path, with no new imperative escape
 * hatches.
 *
 * ## Feature flag — KM_TEA_SEARCH=1
 *
 * When the flag is on, the plugin store is dispatched to alongside the legacy
 * setUI calls (dual-write). The bridge component (`SearchDialogBridge.tsx`)
 * reads from the plugin store instead of the legacy ui fields. When off,
 * the legacy path is untouched.
 *
 * Parity tests (`search-mini-cutover.spec.ts`) exercise every behavior on
 * both paths under identical assertions.
 */

// =============================================================================
// Types — ops, state, effects
// =============================================================================

/** All ops the search-dialog plugin accepts. Serializable — plain data only. */
export type SearchOp =
  | { type: "search.show"; scopeNodeIds: string[]; initialInput?: string }
  | { type: "search.hide" }
  | { type: "search.toggleScope" }
  | { type: "search.setScope"; scope: "all" | "selected" }
  | { type: "search.consumeInitialInput" }

/** Plugin-owned state. Read by views via `useSearchDialog()`. */
export interface SearchState {
  visible: boolean
  /** Buffer for keypresses typed in the same frame as the `/` open-trigger. */
  initialInput: string
  /** Scope toggle: "all" = entire repo, "selected" = cursor subtree. */
  scope: "all" | "selected"
  /** Node IDs defining scope when scope === "selected". */
  scopeNodeIds: string[]
}

/**
 * Effect returned from `apply()`. Currently always empty for search —
 * visibility/scope mutations are pure. Nav-on-confirm is driven by
 * `handleSearchSelect` in `use-board-dialogs.ts`, not by plugin effects.
 * Kept as a named alias so future plugins share the [state, effects] shape.
 */
export type SearchEffect = { type: never }

const INITIAL_SEARCH_STATE: SearchState = {
  visible: false,
  initialInput: "",
  scope: "all",
  scopeNodeIds: [],
}

/**
 * Feature flag: KM_TEA_SEARCH=1 routes search-dialog visibility/scope through
 * the plugin. Anything else uses the legacy `ui.showSearchDialog` path. The
 * flag is read per-call (not cached at module load) so tests can flip it
 * without process restart.
 */
export function isTeaSearchEnabled(): boolean {
  if (process.env.KM_TEA_SEARCH === "1") return true
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
 * Invariants:
 * - Opening while visible is a no-op (reuses current state; e.g., a stray
 *   second `search.show` should not reset buffered initialInput).
 * - Hiding while hidden is a no-op (reference-equal return — triggers
 *   useSyncExternalStore skip).
 * - Hide always clears initialInput + resets scope to "all" + clears
 *   scopeNodeIds — matches legacy close sites' setUI shape.
 * - toggleScope / setScope while hidden is a no-op (can't scope a closed
 *   dialog; legacy reducer only runs while dialog is open).
 */
export function apply(op: SearchOp, state: SearchState): [SearchState, SearchEffect[]] {
  switch (op.type) {
    case "search.show":
      if (state.visible) return [state, []]
      return [
        {
          visible: true,
          initialInput: op.initialInput ?? "",
          scope: "all",
          scopeNodeIds: op.scopeNodeIds,
        },
        [],
      ]
    case "search.hide":
      if (!state.visible) return [state, []]
      return [
        { visible: false, initialInput: "", scope: "all", scopeNodeIds: [] },
        [],
      ]
    case "search.toggleScope":
      if (!state.visible) return [state, []]
      return [{ ...state, scope: state.scope === "all" ? "selected" : "all" }, []]
    case "search.setScope":
      if (!state.visible) return [state, []]
      if (state.scope === op.scope) return [state, []]
      return [{ ...state, scope: op.scope }, []]
    case "search.consumeInitialInput":
      if (state.initialInput === "") return [state, []]
      return [{ ...state, initialInput: "" }, []]
  }
}

// =============================================================================
// External store (zustand-shape: { getState, dispatch, subscribe, reset })
// =============================================================================

type Listener = () => void

/**
 * Minimal external store for plugin state. Matches zustand/vanilla's API
 * exactly (the lifecycle spike confirmed this shape cohabitates with React
 * via `useSyncExternalStore` without double-committing).
 */
export interface SearchStore {
  getState(): SearchState
  dispatch(op: SearchOp): void
  /** Subscribe to state changes. Returns unsubscribe fn. */
  subscribe(listener: Listener): () => void
  /** Reset to initial state. Used by tests between runs. */
  reset(): void
}

export function createSearchStore(initial: SearchState = INITIAL_SEARCH_STATE): SearchStore {
  let state = initial
  const listeners = new Set<Listener>()

  return {
    getState: () => state,
    dispatch(op) {
      const [next, _effects] = apply(op, state)
      if (next === state) return // no-op short-circuit; useSyncExternalStore skips
      state = next
      for (const l of listeners) l()
      // Future plugins return non-empty effects — drain them here.
      // SearchDialog produces no effects today (nav-on-confirm is driven by
      // use-board-dialogs, not by plugin effects).
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
 * Process-wide plugin store. When the feature flag is on, reducer sites
 * dispatch ops to THIS store; when off, they flow through the legacy
 * `ui.showSearchDialog` path. Tests that exercise the plugin path can call
 * `.reset()` between cases.
 *
 * Singleton pattern is deliberate for this cutover (same as HelpOverlay):
 * km-tui today has exactly one app instance per process, and the Phase 1
 * plugin system will formalize per-app ownership.
 */
let singleton: SearchStore | null = null

export function getSearchStore(): SearchStore {
  if (!singleton) singleton = createSearchStore()
  return singleton
}

/** Test-only: reset the singleton between cases. */
export function resetSearchStore(): void {
  if (singleton) singleton.reset()
  else singleton = createSearchStore()
}
