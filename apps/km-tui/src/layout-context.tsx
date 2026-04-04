/**
 * Layout Hook
 *
 * Provides grid navigator via the signal store.
 * Components register their positions during useLayoutEffect,
 * which are then available for h/l navigation to find cards by Y position.
 */

import { useApp as useAppStore } from "@silvery/create/create-app"
import type { BoardAppStore } from "./state/board-app-store.ts"
import type { GridNavigator } from "@km/board"

/**
 * Get the grid navigator from the store, returning null if no store context.
 * Use this for optional position tracking (e.g., in tests).
 */
export function useNavigator(): GridNavigator | null {
  try {
    return useAppStore<BoardAppStore, GridNavigator | null>((s) => s.navigator ?? null)
  } catch {
    // No StoreContext available (e.g., static rendering tests)
    return null
  }
}
