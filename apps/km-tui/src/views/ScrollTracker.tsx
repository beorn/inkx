/**
 * ScrollTracker — thin wrapper that subscribes to CursorStore for scroll position.
 *
 * Re-renders on j/k (via useCursorCardIndex) and passes scrollTo to VirtualList.
 * This isolates cursor-driven re-renders: Column doesn't re-render, only this
 * wrapper + VirtualList. Cards self-subscribe via CursorStore.
 *
 * The wrapper approach avoids the cross-component effect timing issue where
 * setScrollOffset from a sibling's useEffect doesn't get flushed by act().
 */
import React from "react"
import { VirtualList, type VirtualListProps } from "inkx"
import { useCursorCardIndex } from "../cursor-context.tsx"
import { getScrollToIndex } from "./scroll-helpers.ts"

interface ScrollTrackingVirtualListProps<T> extends Omit<
  VirtualListProps<T>,
  "scrollTo"
> {
  colIndex: number
  isSelected: boolean
}

/**
 * VirtualList wrapper that subscribes to CursorStore for scroll position.
 * Isolates j/k re-renders from Column — only this wrapper + VirtualList re-render.
 */
export const ScrollTrackingVirtualList = React.memo(
  function ScrollTrackingVirtualList<T>({
    colIndex,
    isSelected,
    ...virtualListProps
  }: ScrollTrackingVirtualListProps<T>): React.ReactElement {
    const cardIndex = useCursorCardIndex(colIndex)
    const scrollTo = getScrollToIndex(
      isSelected,
      cardIndex,
      virtualListProps.items.length,
    )

    return <VirtualList scrollTo={scrollTo} {...virtualListProps} />
  },
) as <T>(props: ScrollTrackingVirtualListProps<T>) => React.ReactElement
