/**
 * useHelpOverlay — React bridge for the withHelpOverlay plugin.
 *
 * Reads plugin state via `useSyncExternalStore`, matching the Phase B
 * pattern from the tea-lifecycle-spike that verified zustand-shape stores
 * cohabitate with silvery's `useInput` without double-commits.
 *
 * Only used when `isTeaHelpEnabled()` returns true. The legacy path reads
 * `ui.showHelp` directly from the board-app-store.
 */
import { useSyncExternalStore } from "react"
import { getHelpStore, type HelpState } from "./with-help-overlay.ts"

/**
 * Hook that exposes the current help-overlay state from the plugin
 * store. Auto-re-renders when state changes. Returns a stable snapshot
 * — the reducer returns the same object ref on no-op dispatches so
 * useSyncExternalStore doesn't force a spurious commit.
 */
export function useHelpOverlay(): HelpState {
  const store = getHelpStore()
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
