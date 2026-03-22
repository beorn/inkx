/**
 * ScrollTracker — thin wrapper that subscribes to ReactiveNodeStore cursor for scroll position.
 *
 * Re-renders on j/k (via cursorCardNodeId Reactive) and passes scrollTo to VirtualList.
 * This isolates cursor-driven re-renders: Column doesn't re-render, only this
 * wrapper + VirtualList. Cards self-subscribe via ReactiveNodeStore.
 *
 * The wrapper approach avoids the cross-component effect timing issue where
 * setScrollOffset from a sibling's useEffect doesn't get flushed by act().
 */
import React, { useMemo } from "react"
import { VirtualList, type VirtualListProps } from "@silvery/react"
import { useNodeStore, useReactive } from "../reactive.ts"
import { getScrollToIndex } from "./scroll-helpers.ts"

interface ScrollTrackingVirtualListProps<T> extends Omit<VirtualListProps<T>, "scrollTo"> {
  isSelected: boolean
  /** Extract nodeId from items for cursor→index lookup. Falls back to (item as any).node.id */
  keyExtractor?: (item: T) => string
  /** Explicit scroll anchor (from mouse wheel). Overrides cursor-derived scrollTo when set. */
  scrollAnchor?: number | null
}

/**
 * VirtualList wrapper that subscribes to CursorStore for scroll position.
 * Isolates j/k re-renders from Column — only this wrapper + VirtualList re-render.
 */
export const ScrollTrackingVirtualList = React.memo(function ScrollTrackingVirtualList<T>({
  isSelected,
  keyExtractor,
  scrollAnchor,
  ...virtualListProps
}: ScrollTrackingVirtualListProps<T>): React.ReactElement {
  const nodeStore = useNodeStore()
  const _cursorCardNodeId = useReactive(nodeStore.cursorCardNodeId)
  const _selectionLevel = useReactive(nodeStore.selectionLevel)
  const cursorCardNodeId = _selectionLevel === "card" ? _cursorCardNodeId : null

  // Find the card index by looking up cursorCardNodeId in the items array
  const cardIndex = useMemo(() => {
    if (!cursorCardNodeId || !isSelected) return -1
    const items = virtualListProps.items
    const getKey = keyExtractor ?? ((item: T) => (item as { node?: { id?: string } })?.node?.id ?? "")
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item != null && getKey(item) === cursorCardNodeId) return i
    }
    return -1
  }, [cursorCardNodeId, isSelected, virtualListProps.items, keyExtractor])

  // When scrollAnchor is set (mouse wheel scrolling), use it instead of cursor-derived index.
  // This allows the viewport to scroll independently of the cursor position.
  // scrollAnchor applies even to non-selected columns (mouse can hover over any column).
  const effectiveIndex = scrollAnchor != null ? scrollAnchor : cardIndex
  const hasScrollAnchor = scrollAnchor != null
  const scrollTo = hasScrollAnchor
    ? effectiveIndex // Mouse wheel: scroll to anchor regardless of selection
    : getScrollToIndex(isSelected, effectiveIndex, virtualListProps.items.length)

  return <VirtualList scrollTo={scrollTo} {...virtualListProps} />
}) as <T>(props: ScrollTrackingVirtualListProps<T>) => React.ReactElement
