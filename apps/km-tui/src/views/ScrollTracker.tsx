/**
 * ScrollTracker — thin wrapper that subscribes to CursorStore for scroll position.
 *
 * Re-renders on j/k (via useCursorCardNodeId) and passes scrollTo to VirtualList.
 * This isolates cursor-driven re-renders: Column doesn't re-render, only this
 * wrapper + VirtualList. Cards self-subscribe via CursorStore.
 *
 * NODE MODEL V2: Uses cursorCardNodeId to find scroll position in items array,
 * eliminating the colIndex dependency.
 *
 * The wrapper approach avoids the cross-component effect timing issue where
 * setScrollOffset from a sibling's useEffect doesn't get flushed by act().
 */
import React, { useMemo } from "react"
import { VirtualList, type VirtualListProps } from "inkx"
import { useCursorCardNodeId } from "../cursor-context.tsx"
import { getScrollToIndex } from "./scroll-helpers.ts"

interface ScrollTrackingVirtualListProps<T> extends Omit<VirtualListProps<T>, "scrollTo"> {
  colIndex: number
  isSelected: boolean
  /** Extract nodeId from items for cursor→index lookup. Falls back to (item as any).node.id */
  keyExtractor?: (item: T) => string
}

/**
 * VirtualList wrapper that subscribes to CursorStore for scroll position.
 * Isolates j/k re-renders from Column — only this wrapper + VirtualList re-render.
 */
export const ScrollTrackingVirtualList = React.memo(function ScrollTrackingVirtualList<T>({
  colIndex: _colIndex,
  isSelected,
  keyExtractor,
  ...virtualListProps
}: ScrollTrackingVirtualListProps<T>): React.ReactElement {
  const cursorCardNodeId = useCursorCardNodeId()

  // Find the card index by looking up cursorCardNodeId in the items array
  const cardIndex = useMemo(() => {
    if (!cursorCardNodeId || !isSelected) return -1
    const items = virtualListProps.items
    const getKey = keyExtractor ?? ((item: T) => (item as { node?: { id?: string } })?.node?.id ?? "")
    for (let i = 0; i < items.length; i++) {
      if (getKey(items[i]!) === cursorCardNodeId) return i
    }
    return -1
  }, [cursorCardNodeId, isSelected, virtualListProps.items, keyExtractor])

  const scrollTo = getScrollToIndex(isSelected, cardIndex, virtualListProps.items.length)

  return <VirtualList scrollTo={scrollTo} {...virtualListProps} />
}) as <T>(props: ScrollTrackingVirtualListProps<T>) => React.ReactElement
