/**
 * Board layout calculations - pure functions for column/scroll layout
 */

import { calcEdgeBasedScrollOffset } from "inkx/scroll-utils"

// Layout constants - centralized to avoid magic numbers scattered through rendering code
export const TOP_BAR_HEIGHT = 1
export const BOTTOM_BAR_HEIGHT = 1

/**
 * Padding from edge before scrolling (in columns).
 *
 * Uses padding=1 for horizontal column scrolling (same as HorizontalVirtualList).
 * Columns are wider than list items, so fewer fit on screen, requiring tighter padding.
 *
 * @see calcEdgeBasedScrollOffset in inkx/scroll-utils.ts for the algorithm
 */
const COLUMN_SCROLL_PADDING = 1

/**
 * Calculate edge-based scroll offset for horizontal column scrolling.
 * Only scrolls when cursor approaches the edge of the visible area.
 *
 * @param selectedIndex - Currently selected column index
 * @param currentOffset - Current scroll offset (leftmost visible column)
 * @param maxVisible - Number of columns visible in viewport
 * @param totalCount - Total number of columns
 * @returns New scroll offset
 */
export function calcEdgeBasedColumnScrollOffset(
  selectedIndex: number,
  currentOffset: number,
  maxVisible: number,
  totalCount: number,
): number {
  return calcEdgeBasedScrollOffset(
    selectedIndex,
    currentOffset,
    maxVisible,
    totalCount,
    COLUMN_SCROLL_PADDING,
  )
}
