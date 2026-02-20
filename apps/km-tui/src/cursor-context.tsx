/**
 * CursorStore React Context + Hooks
 *
 * Provides cursor state via React context. Components subscribe to only
 * the cursor data they need via useSyncExternalStore, so only the 2 Cards
 * whose selection status changed will re-render on j/k.
 *
 * Node-based hooks (useIsCursorAtNode, useIsColumnSelectedByNode) read
 * cursorCardNodeId/cursorColumnNodeId directly from CursorStore — no
 * ColumnsLayout dependency. These were added to CursorStore as part of
 * the visual navigation migration.
 *
 * Index-based hooks (useIsCursorAtCard, useCursorPosition, etc.) still
 * derive from ColumnsLayout via useDerivedPosition. These will be removed
 * in later migration phases.
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
 * ColumnsLayout context — Board pushes derived layout here so index-based
 * cursor hooks can derive position (colIndex, cardIndex) on demand.
 * Node-based hooks do NOT use this — they read from CursorStore directly.
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
// Node-based hooks — read cursorCardNodeId/cursorColumnNodeId from CursorStore
//
// These hooks subscribe to CursorStore version changes and read the
// pre-computed ancestor IDs that were set in dispatchBoard.
// =============================================================================

/**
 * Internal helper: subscribe to CursorStore and read pre-computed node state.
 * Uses the same useSyncExternalStore pattern as useDerivedPosition for
 * consistent rendering behavior (both subscribe to the same store).
 */
function useCursorNodeState(store: CursorStore | null): {
  cursorCardNodeId: string | null
  cursorColumnNodeId: string | null
  selectionLevel: "board" | "column" | "card"
} {
  // Also subscribe to ColumnsLayout to ensure re-render when Board updates layout.
  // This ensures node-based hooks re-render after structural mutations (outdent, zoom)
  // that change the column set — matching useDerivedPosition's double-subscription.
  const layout = useContext(ColumnsLayoutContext)
  const cacheRef = useRef(defaultNodeState)

  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, () => {
    if (!store) return defaultNodeState
    const state = store.getState()
    const prev = cacheRef.current
    // Include layout reference in change detection — forces update when Board re-renders
    if (
      prev.cursorCardNodeId === state.cursorCardNodeId &&
      prev.cursorColumnNodeId === state.cursorColumnNodeId &&
      prev.selectionLevel === state.selectionLevel &&
      prev._layout === layout
    ) {
      return prev
    }
    const next = {
      cursorCardNodeId: state.cursorCardNodeId,
      cursorColumnNodeId: state.cursorColumnNodeId,
      selectionLevel: state.selectionLevel,
      _layout: layout,
    }
    cacheRef.current = next
    return next
  })
}

const defaultNodeState = {
  cursorCardNodeId: null as string | null,
  cursorColumnNodeId: null as string | null,
  selectionLevel: "board" as const,
  _layout: null as ColumnsLayout | null,
}

/**
 * Subscribe to whether a specific card node is the cursor target (by nodeId).
 * NODE MODEL V2: Self-selecting cards — no positional indices needed.
 * Only re-renders when this card's selection status changes.
 */
export function useIsCursorAtNode(nodeId: string): boolean {
  const store = useContext(CursorStoreContext)
  const state = useCursorNodeState(store)
  const cacheRef = useRef(false)

  const isSelected = state.cursorCardNodeId === nodeId && state.selectionLevel === "card"
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
  const state = useCursorNodeState(store)
  const cacheRef = useRef(falseColumnSelectedResult)

  if (state.cursorColumnNodeId !== nodeId) {
    if (!cacheRef.current.isSelected) return cacheRef.current
    cacheRef.current = falseColumnSelectedResult
    return falseColumnSelectedResult
  }
  const prev = cacheRef.current
  if (prev.isSelected && prev.selectionLevel === state.selectionLevel) {
    return prev
  }
  const next = {
    isSelected: true as const,
    selectionLevel: state.selectionLevel,
  }
  cacheRef.current = next
  return next
}

// =============================================================================
// Index-based hooks — still derive from ColumnsLayout (MIGRATION TARGET)
//
// These will be removed as views migrate to node-based selection.
// =============================================================================

/**
 * Internal: derive position from cursorNodeId + columns layout.
 * Used only by index-based hooks below.
 */
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

/**
 * Subscribe to whether a specific card is the cursor target.
 * Only re-renders when this card's selection status changes.
 *
 * @deprecated Use useIsCursorAtNode(nodeId) instead — avoids index dependency.
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
 * Subscribe to whether a column is selected + its selection level.
 * DOES NOT include cardIndex — stable on j/k within the same column.
 *
 * @deprecated Use useIsColumnSelectedByNode(nodeId) instead — avoids index dependency.
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
