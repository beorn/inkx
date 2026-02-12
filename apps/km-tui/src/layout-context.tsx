/**
 * Layout Hook
 *
 * Provides card position registry via the Zustand store.
 * Components register their positions during useLayoutEffect,
 * which are then available for h/l navigation to find cards by Y position.
 */

import { useApp as useAppStore } from "inkx/runtime"
import type { BoardAppStore } from "./board-app-store.ts"
import type { LayoutRegistry } from "./card-positions.ts"

/**
 * Get the layout registry from the store, returning null if no store context.
 * Use this for optional position tracking (e.g., in tests).
 */
export function useLayoutRegistryOptional(): LayoutRegistry | null {
  try {
    return useAppStore<BoardAppStore, LayoutRegistry | null>((s) => s.layoutRegistry ?? null)
  } catch {
    // No StoreContext available (e.g., static rendering tests)
    return null
  }
}
