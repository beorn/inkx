/**
 * CursorStore React Context + Hooks
 *
 * Provides cursor state via React context. Components subscribe to only
 * the cursor data they need via useSyncExternalStore, so only the 2 Cards
 * whose selection status changed will re-render on j/k.
 */

import React, { createContext, useContext, useRef, useSyncExternalStore } from "react"
import type { CursorStore } from "./cursor-store.ts"

// =============================================================================
// Context
// =============================================================================

const CursorStoreContext = createContext<CursorStore | null>(null)

export function CursorStoreProvider({
  store,
  children,
}: {
  store: CursorStore
  children: React.ReactNode
}): React.ReactElement {
  return (
    <CursorStoreContext.Provider value={store}>
      {children}
    </CursorStoreContext.Provider>
  )
}

/**
 * Get the CursorStore instance from context.
 * Returns null if not in a CursorStoreProvider (graceful fallback).
 */
export function useCursorStore(): CursorStore | null {
  return useContext(CursorStoreContext)
}

// =============================================================================
// Subscription Hooks
//
// These use useSyncExternalStore with cached snapshots to avoid the
// "getSnapshot should be cached" infinite loop error.
// =============================================================================

/**
 * Subscribe to whether a specific card is the cursor target.
 * Only re-renders when this card's selection status changes.
 */
export function useIsCursorAtCard(
  colIndex: number,
  cardIndex: number,
): boolean {
  const store = useContext(CursorStoreContext)
  const cacheRef = useRef(false)

  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => {
      if (!store) return false
      const s = store.getState()
      const isSelected =
        s.colIndex === colIndex &&
        s.cardIndex === cardIndex &&
        s.selectionLevel === "card"
      // Return cached value to avoid infinite loop — only update when value changes
      if (isSelected === cacheRef.current) return cacheRef.current
      cacheRef.current = isSelected
      return isSelected
    },
  )
}

/**
 * Subscribe to whether a specific column is the active column.
 * Returns cached result object to satisfy useSyncExternalStore's caching requirement.
 */
export function useIsCursorInColumn(colIndex: number): {
  isSelected: boolean
  cardIndex: number
  selectionLevel: "board" | "column" | "card"
} {
  const store = useContext(CursorStoreContext)
  const cacheRef = useRef(falseColumnResult)

  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => {
      if (!store) return falseColumnResult
      const s = store.getState()
      if (s.colIndex !== colIndex) {
        if (!cacheRef.current.isSelected) return cacheRef.current
        cacheRef.current = falseColumnResult
        return falseColumnResult
      }
      // Column is selected — check if result changed
      const prev = cacheRef.current
      if (
        prev.isSelected &&
        prev.cardIndex === s.cardIndex &&
        prev.selectionLevel === s.selectionLevel
      ) {
        return prev
      }
      const next = {
        isSelected: true as const,
        cardIndex: s.cardIndex,
        selectionLevel: s.selectionLevel,
      }
      cacheRef.current = next
      return next
    },
  )
}

/**
 * Subscribe to full cursor position.
 * Re-renders on every cursor change (colIndex, cardIndex, selectionLevel).
 * Used by components that need the complete cursor state (BottomBar, top bar path).
 */
export function useCursorPosition(): {
  colIndex: number
  cardIndex: number
  selectionLevel: "board" | "column" | "card"
} {
  const store = useContext(CursorStoreContext)
  const cacheRef = useRef(defaultCursorPosition)

  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => {
      if (!store) return defaultCursorPosition
      const s = store.getState()
      const prev = cacheRef.current
      if (
        prev.colIndex === s.colIndex &&
        prev.cardIndex === s.cardIndex &&
        prev.selectionLevel === s.selectionLevel
      ) {
        return prev
      }
      const next = {
        colIndex: s.colIndex,
        cardIndex: s.cardIndex,
        selectionLevel: s.selectionLevel,
      }
      cacheRef.current = next
      return next
    },
  )
}

/**
 * Subscribe to cursor colIndex only.
 * Re-renders only when cursor moves to a different column (h/l).
 * Does NOT re-render on j/k within the same column.
 */
export function useCursorColIndex(): number {
  const store = useContext(CursorStoreContext)
  const cacheRef = useRef(0)

  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => {
      if (!store) return 0
      const colIndex = store.getState().colIndex
      if (colIndex === cacheRef.current) return cacheRef.current
      cacheRef.current = colIndex
      return colIndex
    },
  )
}

// Stable references
const defaultCursorPosition = {
  colIndex: 0,
  cardIndex: 0,
  selectionLevel: "board" as const,
}
const falseColumnResult = {
  isSelected: false as const,
  cardIndex: -1,
  selectionLevel: "board" as const,
}
function noopSubscribe() {
  return () => {}
}
