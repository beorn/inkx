/**
 * CursorStore React Context + Hooks
 *
 * Provides cursor state via React context. Components subscribe to only
 * the cursor data they need via useSyncExternalStore, so only the 2 Cards
 * whose selection status changed will re-render on j/k.
 *
 * Position (colIndex, cardIndex, selectionLevel) is derived from
 * cursorNodeId + columns layout, NOT stored in CursorStore.
 */

import React, { createContext, useContext, useRef, useSyncExternalStore } from "react"
import type { CursorStore } from "./cursor-store.ts"
import type { ColumnsLayout } from "./types.ts"
import { deriveCursorPosition } from "./hooks/use-cursor-position.ts"

// =============================================================================
// Context
// =============================================================================

const CursorStoreContext = createContext<CursorStore | null>(null)

/**
 * ColumnsLayout context — Board pushes derived layout here so cursor hooks
 * can derive position (colIndex, cardIndex, selectionLevel) on demand.
 */
const ColumnsLayoutContext = createContext<ColumnsLayout | null>(null)

export function CursorStoreProvider({
  store,
  layout,
  children,
}: {
  store: CursorStore
  layout?: ColumnsLayout
  children: React.ReactNode
}): React.ReactElement {
  const inner = <CursorStoreContext.Provider value={store}>{children}</CursorStoreContext.Provider>
  if (layout) {
    return <ColumnsLayoutContext.Provider value={layout}>{inner}</ColumnsLayoutContext.Provider>
  }
  return inner
}

/**
 * Get the CursorStore instance from context.
 * Returns null if not in a CursorStoreProvider (graceful fallback).
 */
export function useCursorStore(): CursorStore | null {
  return useContext(CursorStoreContext)
}

// =============================================================================
// Internal: derive position from cursorNodeId + columns
// =============================================================================

function useDerivedPosition(store: CursorStore | null): {
  colIndex: number
  cardIndex: number
  selectionLevel: "board" | "column" | "card"
  cursorNodeId: string | null
  cursorCardNodeId: string | null
  cursorColumnNodeId: string | null
} {
  const layout = useContext(ColumnsLayoutContext)
  const cacheRef = useRef(defaultDerivedPosition)

  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, () => {
    if (!store || !layout) return defaultDerivedPosition
    const cursorNodeId = store.getState().cursorNodeId
    const cursor = deriveCursorPosition(layout.columns, cursorNodeId, layout.nodeIndex)
    const selectedCol = layout.columns[cursor.colIndex]
    const selectedCard = selectedCol?.cards[cursor.cardIndex]
    const prev = cacheRef.current
    if (
      prev.colIndex === cursor.colIndex &&
      prev.cardIndex === cursor.cardIndex &&
      prev.selectionLevel === cursor.selectionLevel &&
      prev.cursorNodeId === cursorNodeId
    ) {
      return prev
    }
    const next = {
      colIndex: cursor.colIndex,
      cardIndex: cursor.cardIndex,
      selectionLevel: cursor.selectionLevel,
      cursorNodeId,
      cursorCardNodeId: selectedCard?.node.id ?? null,
      cursorColumnNodeId: selectedCol?.node.id ?? null,
    }
    cacheRef.current = next
    return next
  })
}

const defaultDerivedPosition = {
  colIndex: 0,
  cardIndex: 0,
  selectionLevel: "board" as const,
  cursorNodeId: null as string | null,
  cursorCardNodeId: null as string | null,
  cursorColumnNodeId: null as string | null,
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
export function useIsCursorAtCard(colIndex: number, cardIndex: number): boolean {
  const store = useContext(CursorStoreContext)
  const derived = useDerivedPosition(store)
  const cacheRef = useRef(false)

  const isSelected = derived.colIndex === colIndex && derived.cardIndex === cardIndex && derived.selectionLevel === "card"
  if (isSelected === cacheRef.current) return cacheRef.current
  cacheRef.current = isSelected
  return isSelected
}

/**
 * Subscribe to whether a specific card node is the cursor target (by nodeId).
 * NODE MODEL V2: Self-selecting cards — no positional indices needed.
 * Only re-renders when this card's selection status changes.
 */
export function useIsCursorAtNode(nodeId: string): boolean {
  const store = useContext(CursorStoreContext)
  const derived = useDerivedPosition(store)
  const cacheRef = useRef(false)

  const isSelected = derived.cursorCardNodeId === nodeId && derived.selectionLevel === "card"
  if (isSelected === cacheRef.current) return cacheRef.current
  cacheRef.current = isSelected
  return isSelected
}

/**
 * Subscribe to whether a specific column node is the cursor's active column (by nodeId).
 * NODE MODEL V2: Self-selecting columns — no positional indices needed.
 * Returns selection state and level. Does NOT include cardIndex.
 */
export function useIsColumnSelectedByNode(nodeId: string): {
  isSelected: boolean
  selectionLevel: "board" | "column" | "card"
} {
  const store = useContext(CursorStoreContext)
  const derived = useDerivedPosition(store)
  const cacheRef = useRef(falseColumnSelectedResult)

  if (derived.cursorColumnNodeId !== nodeId) {
    if (!cacheRef.current.isSelected) return cacheRef.current
    cacheRef.current = falseColumnSelectedResult
    return falseColumnSelectedResult
  }
  const prev = cacheRef.current
  if (prev.isSelected && prev.selectionLevel === derived.selectionLevel) {
    return prev
  }
  const next = {
    isSelected: true as const,
    selectionLevel: derived.selectionLevel,
  }
  cacheRef.current = next
  return next
}

/**
 * Subscribe to whether a column is selected + its selection level.
 * DOES NOT include cardIndex — stable on j/k within the same column.
 * Use this when you need to know IF a column is selected but don't
 * need to know WHICH card is selected (prevents Column re-renders on j/k).
 */
export function useIsColumnSelected(colIndex: number): {
  isSelected: boolean
  selectionLevel: "board" | "column" | "card"
} {
  const store = useContext(CursorStoreContext)
  const derived = useDerivedPosition(store)
  const cacheRef = useRef(falseColumnSelectedResult)

  if (derived.colIndex !== colIndex) {
    if (!cacheRef.current.isSelected) return cacheRef.current
    cacheRef.current = falseColumnSelectedResult
    return falseColumnSelectedResult
  }
  const prev = cacheRef.current
  if (prev.isSelected && prev.selectionLevel === derived.selectionLevel) {
    return prev
  }
  const next = {
    isSelected: true as const,
    selectionLevel: derived.selectionLevel,
  }
  cacheRef.current = next
  return next
}

/**
 * Subscribe to the cursor's card index within a specific column.
 * Returns -1 when the column is not selected.
 * Changes on every j/k within the column — use for scroll tracking only.
 */
export function useCursorCardIndex(colIndex: number): number {
  const store = useContext(CursorStoreContext)
  const derived = useDerivedPosition(store)

  return derived.colIndex === colIndex ? derived.cardIndex : -1
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
  const derived = useDerivedPosition(store)
  const cacheRef = useRef(defaultCursorPosition)

  const prev = cacheRef.current
  if (prev.colIndex === derived.colIndex && prev.cardIndex === derived.cardIndex && prev.selectionLevel === derived.selectionLevel) {
    return prev
  }
  const next = {
    colIndex: derived.colIndex,
    cardIndex: derived.cardIndex,
    selectionLevel: derived.selectionLevel,
  }
  cacheRef.current = next
  return next
}

/**
 * Subscribe to cursor colIndex only.
 * Re-renders only when cursor moves to a different column (h/l).
 * Does NOT re-render on j/k within the same column.
 */
export function useCursorColIndex(): number {
  const store = useContext(CursorStoreContext)
  const derived = useDerivedPosition(store)
  return derived.colIndex
}

// Stable references
const defaultCursorPosition = {
  colIndex: 0,
  cardIndex: 0,
  selectionLevel: "board" as const,
}
const falseColumnSelectedResult = {
  isSelected: false as const,
  selectionLevel: "board" as const,
}
function noopSubscribe() {
  return () => {}
}
