/**
 * CursorStore React Context + Hooks
 *
 * Provides cursor state via React context. Components subscribe to only
 * the cursor data they need via useSyncExternalStore, so only the 2 Cards
 * whose selection status changed will re-render on j/k.
 *
 * All hooks read cursorCardNodeId/cursorColumnNodeId directly from CursorStore.
 * No layout dependency — cursor state is derived from nodeId ancestors.
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
  return <CursorStoreContext.Provider value={store}>{children}</CursorStoreContext.Provider>
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
 * Components that need cursor node IDs use this instead of reading the store directly,
 * getting memoized snapshots that prevent unnecessary re-renders.
 */
function useCursorNodeState(store: CursorStore | null): {
  cursorCardNodeId: string | null
  cursorColumnNodeId: string | null
  selectionLevel: "board" | "column" | "card"
} {
  const cacheRef = useRef(defaultNodeState)

  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, () => {
    if (!store) return defaultNodeState
    const state = store.getState()
    const prev = cacheRef.current
    if (
      prev.cursorCardNodeId === state.cursorCardNodeId &&
      prev.cursorColumnNodeId === state.cursorColumnNodeId &&
      prev.selectionLevel === state.selectionLevel
    ) {
      return prev
    }
    const next = {
      cursorCardNodeId: state.cursorCardNodeId,
      cursorColumnNodeId: state.cursorColumnNodeId,
      selectionLevel: state.selectionLevel,
    }
    cacheRef.current = next
    return next
  })
}

const defaultNodeState: {
  cursorCardNodeId: string | null
  cursorColumnNodeId: string | null
  selectionLevel: "board" | "column" | "card"
} = {
  cursorCardNodeId: null,
  cursorColumnNodeId: null,
  selectionLevel: "board",
}

/**
 * Subscribe to whether a specific card node is the cursor target (by nodeId).
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

/**
 * Subscribe to the cursor's card nodeId.
 * Components can look up position in their own items array.
 * Only re-renders when the card nodeId changes (same as j/k within same column).
 */
export function useCursorCardNodeId(): string | null {
  const store = useContext(CursorStoreContext)
  const state = useCursorNodeState(store)
  return state.selectionLevel === "card" ? state.cursorCardNodeId : null
}

/**
 * Subscribe to the cursor's column nodeId.
 * Only re-renders when the column nodeId changes (h/l movement).
 */
export function useCursorColumnNodeId(): string | null {
  const store = useContext(CursorStoreContext)
  const state = useCursorNodeState(store)
  return state.cursorColumnNodeId
}

/**
 * Subscribe to the full node-based cursor position.
 * Re-renders on every cursor change (cursorNodeId, cursorCardNodeId, cursorColumnNodeId, selectionLevel).
 */
export function useCursorNodePosition(): {
  cursorNodeId: string | null
  cursorCardNodeId: string | null
  cursorColumnNodeId: string | null
  selectionLevel: "board" | "column" | "card"
} {
  const store = useContext(CursorStoreContext)
  const cacheRef = useRef(defaultCursorNodePosition)

  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, () => {
    if (!store) return defaultCursorNodePosition
    const state = store.getState()
    const prev = cacheRef.current
    if (
      prev.cursorNodeId === state.cursorNodeId &&
      prev.cursorCardNodeId === state.cursorCardNodeId &&
      prev.cursorColumnNodeId === state.cursorColumnNodeId &&
      prev.selectionLevel === state.selectionLevel
    ) {
      return prev
    }
    const next = {
      cursorNodeId: state.cursorNodeId,
      cursorCardNodeId: state.cursorCardNodeId,
      cursorColumnNodeId: state.cursorColumnNodeId,
      selectionLevel: state.selectionLevel,
    }
    cacheRef.current = next
    return next
  })
}

const defaultCursorNodePosition: {
  cursorNodeId: string | null
  cursorCardNodeId: string | null
  cursorColumnNodeId: string | null
  selectionLevel: "board" | "column" | "card"
} = {
  cursorNodeId: null,
  cursorCardNodeId: null,
  cursorColumnNodeId: null,
  selectionLevel: "board",
}

// Stable references
const falseColumnSelectedResult: {
  isSelected: boolean
  selectionLevel: "board" | "column" | "card"
} = {
  isSelected: false,
  selectionLevel: "board",
}
function noopSubscribe() {
  return () => {}
}
