/**
 * useSearchDialog — React bridge for the withSearchDialog plugin.
 *
 * Reads plugin state via `useSyncExternalStore`, matching the Phase B pattern
 * from the tea-lifecycle-spike that verified zustand-shape stores cohabitate
 * with silvery's React reconciler without double-commits.
 *
 * Only used when `isTeaSearchEnabled()` returns true. The legacy path reads
 * `ui.showSearchDialog` / `ui.searchDialogInitialInput` / `ui.searchScope` /
 * `ui.searchScopeNodeIds` directly from the board-app-store.
 */
import { useSyncExternalStore } from "react"
import { getSearchStore, type SearchState } from "./with-search-dialog.ts"

/**
 * Hook that exposes the current search-dialog state from the plugin store.
 * Auto-re-renders when state changes. Returns a stable snapshot — the reducer
 * returns the same object ref on no-op dispatches so useSyncExternalStore
 * doesn't force a spurious commit.
 */
export function useSearchDialog(): SearchState {
  const store = getSearchStore()
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
