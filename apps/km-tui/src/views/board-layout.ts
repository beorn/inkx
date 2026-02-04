/**
 * Board layout calculations - pure functions for column/scroll layout
 */

import { calcEdgeBasedScrollOffset } from "inkx/scroll-utils"

// Layout constants - centralized to avoid magic numbers scattered through rendering code
export const TOP_BAR_HEIGHT = 1
export const BOTTOM_BAR_HEIGHT = 1

/**
 * Input parameters for column width calculation
 */
export interface ColumnWidthParams {
  /** Total width available for the board area */
  boardWidth: number
  /** Number of visible columns */
  visibleColumnCount: number
  /** Number of columns that can fit in viewport */
  maxCols: number
  /** Current horizontal scroll offset (0-indexed leftmost visible column) */
  scrollOffset: number
  /** Total number of columns in the board */
  totalColumns: number
  /** Optional maximum column width (used by ColumnsView, not cards view) */
  maxColWidth?: number
}

/**
 * Result of column width calculation
 */
export interface ColumnWidthResult {
  /** Whether left scroll indicator should be shown */
  hasLeftIndicator: boolean
  /** Whether right scroll indicator should be shown */
  hasRightIndicator: boolean
  /** Width consumed by scroll indicators (0, 1, or 2) */
  indicatorWidth: number
  /** Number of separator lines between columns */
  separatorCount: number
  /** Total width available for columns after subtracting indicators and separators */
  availableWidth: number
  /** Base width for each column before remainder distribution */
  baseColWidth: number
  /** Extra pixels to distribute to first N columns */
  remainder: number
}

/**
 * Calculate column width parameters for board views.
 *
 * Shared between Board.tsx (cards view) and ColumnsView.tsx (columns view).
 * Handles scroll indicator presence, separator lines, and distributes
 * available width evenly across columns.
 *
 * @param params - Input parameters for calculation
 * @returns Calculated width values for rendering columns
 */
export function calcColumnWidths(params: ColumnWidthParams): ColumnWidthResult {
  const {
    boardWidth,
    visibleColumnCount,
    maxCols,
    scrollOffset,
    totalColumns,
  } = params

  const hasLeftIndicator = scrollOffset > 0
  const hasRightIndicator = scrollOffset + maxCols < totalColumns
  const indicatorWidth =
    (hasLeftIndicator ? 1 : 0) + (hasRightIndicator ? 1 : 0)
  const separatorCount = visibleColumnCount - 1
  const availableWidth = boardWidth - indicatorWidth - separatorCount
  const baseColWidth = Math.floor(availableWidth / maxCols)
  const remainder = availableWidth % maxCols

  return {
    hasLeftIndicator,
    hasRightIndicator,
    indicatorWidth,
    separatorCount,
    availableWidth,
    baseColWidth,
    remainder,
  }
}

/**
 * Calculate the width for a specific column by index.
 *
 * Distributes remainder pixels to the first N columns and optionally
 * applies a maximum width constraint.
 *
 * @param index - Column index within visible columns (0-indexed)
 * @param baseColWidth - Base width for each column
 * @param remainder - Extra pixels to distribute to first N columns
 * @param maxColWidth - Optional maximum column width cap
 * @returns Final width for this column
 */
export function getColumnWidth(
  index: number,
  baseColWidth: number,
  remainder: number,
  maxColWidth?: number,
): number {
  const rawWidth = baseColWidth + (index < remainder ? 1 : 0)
  return maxColWidth !== undefined ? Math.min(rawWidth, maxColWidth) : rawWidth
}

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
