/**
 * withDeleteConfirm — TEA apply-chain plugin for the delete-confirmation overlay.
 *
 * Part of Phase 1's `withDialogs()` migration (per `hub/km/tea-phase1-withDialogs-scope.md`).
 * Follows the HelpOverlay + SearchDialog template.
 *
 * ## Why deleteConfirm is a clean target
 *
 * Of the four in-scope Phase 1 dialogs, deleteConfirm is the simplest remaining:
 *
 * - **No text input** — pure confirm/cancel UI. No coupling to
 *   `useDialogInput`/`useEditContext`/`dialogTargetRef`.
 * - **No focus scope complexity** — the legacy path never called
 *   `pushDialogMode`/`popDialogMode` for this dialog (keybinding gating uses
 *   `deleteConfirmOpen` via `command-bridge.ts`, not focus-scope lookups).
 * - **No handler callbacks** — both `DELETE_CONFIRM_EXECUTE` and
 *   `DELETE_CONFIRM_CANCEL` are pure reducer cases in `board-actions.ts`.
 *   Co-location discipline from SearchDialog § F1 holds vacuously: both
 *   open and close paths transition in a single reducer call, no imperative
 *   refs to race with `useSyncExternalStore`'s synchronous commit.
 *
 * ## Scope — what the plugin OWNS vs what it DOESN'T
 *
 * **Owns** (single source of truth when `KM_TEA_DELETE_CONFIRM=1`):
 * - visibility + the full payload as one `visible: DeleteConfirmPayload | null` slice
 *
 * **Does NOT own** (stays where it is):
 * - The actual deletion (`executeBatchDelete` in `board-actions-edit.ts`)
 * - Keybinding gating (`deleteConfirmOpen` reads legacy `ui.deleteConfirm`
 *   for now — dual-write keeps both in sync; a future consumer migration can
 *   switch to the plugin store)
 * - `ConfirmDialog` component itself (kept unchanged in `shared-components.tsx`)
 *
 * ## Feature flag — KM_TEA_DELETE_CONFIRM=1
 *
 * When the flag is on, the plugin store is dispatched to alongside the legacy
 * `setUI({deleteConfirm})` calls (dual-write). The bridge (`DeleteConfirmDialogBridge`)
 * reads from the plugin store when on, from the legacy ui field when off.
 *
 * Parity tests (`delete-confirm-mini-cutover.spec.ts`) assert identical
 * behavior on both paths.
 */

// =============================================================================
// Types — ops, state, effects
// =============================================================================

/** Payload describing the deletion the user is confirming. */
export interface DeleteConfirmPayload {
  nodeIds: string[]
  title: string
  childCount: number
  backlinkCount: number
  hasMetadata?: boolean
}

/** All ops the delete-confirm plugin accepts. Serializable — plain data only. */
export type DeleteConfirmOp =
  | { type: "deleteConfirm.show"; payload: DeleteConfirmPayload }
  | { type: "deleteConfirm.hide" }

/** Plugin-owned state. Read by views via `useDeleteConfirm()`. */
export interface DeleteConfirmState {
  /** Non-null when a confirmation is pending; null when hidden. */
  payload: DeleteConfirmPayload | null
}

/**
 * Effect returned from `apply()`. Currently always empty — confirmation
 * execution (the actual delete) is driven by `DELETE_CONFIRM_EXECUTE` in
 * `board-actions.ts`, not by plugin effects. Kept as a named alias so future
 * plugins share the `[state, effects]` shape.
 */
export type DeleteConfirmEffect = { type: never }

const INITIAL_DELETE_CONFIRM_STATE: DeleteConfirmState = {
  payload: null,
}

/**
 * Feature flag: KM_TEA_DELETE_CONFIRM=1 routes delete-confirm state through
 * the plugin. Anything else uses the legacy `ui.deleteConfirm` path. The flag
 * is read per-call (not cached at module load) so tests can flip it without
 * process restart.
 */
export function isTeaDeleteConfirmEnabled(): boolean {
  if (process.env.KM_TEA_DELETE_CONFIRM === "1") return true
  return false
}

// =============================================================================
// Pure reducer — apply(op, state) → [newState, effects]
// =============================================================================

/**
 * Pure reducer. Given the current state and an op, returns the next state
 * and a list of effects to run. No side effects. No mutation. No logging.
 *
 * Invariants:
 * - Opening overwrites any prior payload (rare but possible if a delete is
 *   re-requested without an intervening cancel — matches legacy `setUI({deleteConfirm: ...})`
 *   overwrite semantics).
 * - Hiding while hidden is a ref-equal no-op.
 */
export function apply(op: DeleteConfirmOp, state: DeleteConfirmState): [DeleteConfirmState, DeleteConfirmEffect[]] {
  switch (op.type) {
    case "deleteConfirm.show":
      return [{ payload: op.payload }, []]
    case "deleteConfirm.hide":
      if (state.payload === null) return [state, []]
      return [{ payload: null }, []]
  }
}

// =============================================================================
// External store (zustand-shape: { getState, dispatch, subscribe, reset })
// =============================================================================

type Listener = () => void

/** Minimal external store for plugin state. Matches zustand/vanilla's API. */
export interface DeleteConfirmStore {
  getState(): DeleteConfirmState
  dispatch(op: DeleteConfirmOp): void
  /** Subscribe to state changes. Returns unsubscribe fn. */
  subscribe(listener: Listener): () => void
  /** Reset to initial state. Used by tests between runs. */
  reset(): void
}

export function createDeleteConfirmStore(
  initial: DeleteConfirmState = INITIAL_DELETE_CONFIRM_STATE,
): DeleteConfirmStore {
  let state = initial
  const listeners = new Set<Listener>()

  return {
    getState: () => state,
    dispatch(op) {
      const [next, _effects] = apply(op, state)
      if (next === state) return // no-op short-circuit; useSyncExternalStore skips
      state = next
      for (const l of listeners) l()
      // DeleteConfirm produces no effects today — actual delete execution is
      // driven by the board reducer's DELETE_CONFIRM_EXECUTE case.
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
 * `ui.deleteConfirm` path. Tests that exercise the plugin path can call
 * `.reset()` between cases.
 */
let singleton: DeleteConfirmStore | null = null

export function getDeleteConfirmStore(): DeleteConfirmStore {
  if (!singleton) singleton = createDeleteConfirmStore()
  return singleton
}

/** Test-only: reset the singleton between cases. */
export function resetDeleteConfirmStore(): void {
  if (singleton) singleton.reset()
  else singleton = createDeleteConfirmStore()
}
