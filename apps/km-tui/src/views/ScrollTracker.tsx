/**
 * ScrollTracker — thin wrapper that subscribes to ReactiveNodeStore cursor for scroll position.
 *
 * Re-renders on j/k (via cursorCardNodeId Reactive) and passes scrollTo to ListView.
 * This isolates cursor-driven re-renders: Column doesn't re-render, only this
 * wrapper + ListView. Cards self-subscribe via ReactiveNodeStore.
 *
 * The wrapper approach avoids the cross-component effect timing issue where
 * setScrollOffset from a sibling's useEffect doesn't get flushed by act().
 */
import React, { useMemo } from "react"
import { ListView, type ListViewProps } from "@silvery/ag-react"
import { useNodeStore } from "../state/reactive.ts"
import { useSignal } from "../hooks/use-signal.ts"
import { getScrollToIndex } from "./scroll-helpers.ts"

interface ScrollTrackingListViewProps<T> extends Omit<ListViewProps<T>, "scrollTo"> {
  isSelected: boolean
  /** Extract nodeId from items for cursor→index lookup. Falls back to (item as any).node.id */
  getKey?: (item: T) => string
  /** Explicit scroll anchor (from mouse wheel). Overrides cursor-derived scrollTo when set. */
  scrollAnchor?: number | null
}

/**
 * ListView wrapper that subscribes to ReactiveNodeStore for scroll position.
 * Isolates j/k re-renders from Column — only this wrapper + ListView re-render.
 */
export const ScrollTrackingVirtualList = React.memo(function ScrollTrackingVirtualList<T>({
  isSelected,
  getKey: getKeyProp,
  scrollAnchor,
  ...listViewProps
}: ScrollTrackingListViewProps<T>): React.ReactElement {
  const nodeStore = useNodeStore()
  const _cursorCardNodeId = useSignal(nodeStore.cursorCardNodeId)
  const _cursorDepth = useSignal(nodeStore.cursorDepth)
  const cursorCardNodeId = _cursorDepth === "card" ? _cursorCardNodeId : null

  // Find the card index by looking up cursorCardNodeId in the items array
  const cardIndex = useMemo(() => {
    if (!cursorCardNodeId || !isSelected) return -1
    const items = listViewProps.items
    const getKey = getKeyProp ?? ((item: T) => (item as { node?: { id?: string } })?.node?.id ?? "")
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item != null && getKey(item) === cursorCardNodeId) return i
    }
    return -1
  }, [cursorCardNodeId, isSelected, listViewProps.items, getKeyProp])

  // When scrollAnchor is set (mouse wheel scrolling), use it instead of cursor-derived index.
  // This allows the viewport to scroll independently of the cursor position.
  // scrollAnchor applies even to non-selected columns (mouse can hover over any column).
  const effectiveIndex = scrollAnchor != null ? scrollAnchor : cardIndex
  const hasScrollAnchor = scrollAnchor != null
  const scrollTo = hasScrollAnchor
    ? effectiveIndex // Mouse wheel: scroll to anchor regardless of selection
    : getScrollToIndex(isSelected, effectiveIndex, listViewProps.items.length)

  return <ListView scrollTo={scrollTo} {...listViewProps} />
}) as <T>(props: ScrollTrackingListViewProps<T>) => React.ReactElement
