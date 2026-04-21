/**
 * useDeleteConfirm — React bridge for the withDeleteConfirm plugin.
 *
 * Reads plugin state via `useSyncExternalStore`. Matches the HelpOverlay +
 * SearchDialog hook pattern exactly — ~24 LOC, one purpose.
 *
 * Only used when `isTeaDeleteConfirmEnabled()` returns true. The legacy path
 * reads `ui.deleteConfirm` directly from the board-app-store.
 */
import { useSyncExternalStore } from "react"
import { getDeleteConfirmStore, type DeleteConfirmState } from "./with-delete-confirm.ts"

/**
 * Hook that exposes the current delete-confirm state from the plugin store.
 * Auto-re-renders when state changes. Returns a stable snapshot — the reducer
 * returns the same object ref on no-op dispatches so useSyncExternalStore
 * doesn't force a spurious commit.
 */
export function useDeleteConfirm(): DeleteConfirmState {
  const store = getDeleteConfirmStore()
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
