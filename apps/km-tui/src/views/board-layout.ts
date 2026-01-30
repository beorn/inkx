/**
 * Board layout calculations - pure functions for column/scroll layout
 */

// Layout constants - centralized to avoid magic numbers scattered through rendering code
export const TOP_BAR_HEIGHT = 1
export const BOTTOM_BAR_HEIGHT = 1

// Padding from edge before scrolling (in columns)
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
  // If everything fits, no scrolling needed
  if (totalCount <= maxVisible) return 0

  // Calculate visible range
  const visibleStart = currentOffset
  const visibleEnd = currentOffset + maxVisible - 1

  // Check if selected is outside visible range (with padding)
  const paddedStart = visibleStart + COLUMN_SCROLL_PADDING
  const paddedEnd = visibleEnd - COLUMN_SCROLL_PADDING

  let newOffset = currentOffset

  if (selectedIndex < paddedStart) {
    // Cursor is near/left of left edge - scroll left
    newOffset = Math.max(0, selectedIndex - COLUMN_SCROLL_PADDING)
  } else if (selectedIndex > paddedEnd) {
    // Cursor is near/right of right edge - scroll right
    newOffset = Math.min(
      totalCount - maxVisible,
      selectedIndex - maxVisible + COLUMN_SCROLL_PADDING + 1,
    )
  }

  // Clamp to valid range
  return Math.max(0, Math.min(newOffset, totalCount - maxVisible))
}

/**
 * Compute board layout dimensions based on terminal size and state
 */
export interface BoardLayoutConfig {
  termWidth: number
  termHeight: number
  columnCount: number
  showDetailPane: boolean
  colIndex: number
  currentScrollOffset: number
}

export interface BoardLayout {
  contentHeight: number
  boardWidth: number
  detailPaneWidth: number
  maxCols: number
  colScrollOffset: number
}
