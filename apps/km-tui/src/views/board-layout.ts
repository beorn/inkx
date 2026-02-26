/**
 * Board layout constants and helpers
 */

// Layout constants - centralized to avoid magic numbers scattered through rendering code
export const TOP_BAR_HEIGHT = 2
export const BOTTOM_BAR_HEIGHT = 1 // Workspace bottom bar (status counters + command box)
export const FILTER_PANEL_WIDTH = 60
export const COLLAPSED_COL_WIDTH = 3

/** Compute uniform expanded column width given board width and collapsed state.
 *  Columns are flush (no gap/separator) — HVL renders them edge-to-edge. */
export function computeColumnWidths(
  boardWidth: number,
  columns: Array<{ node: { id: string } }>,
  collapsedNodes: Set<string>,
): { expandedWidth: number; effectiveColCount: number } {
  const totalCollapsed = columns.reduce((n, col) => n + (collapsedNodes.has(col.node.id) ? 1 : 0), 0)
  const maxExpandedCols = Math.max(1, Math.floor((boardWidth - totalCollapsed * COLLAPSED_COL_WIDTH) / 35))
  const effectiveColCount = Math.min(columns.length, maxExpandedCols + totalCollapsed)
  const visibleCollapsed = Math.min(totalCollapsed, effectiveColCount)
  const visibleExpanded = Math.max(1, effectiveColCount - visibleCollapsed)
  const collapsedSpace = visibleCollapsed * COLLAPSED_COL_WIDTH
  const expandedWidth = Math.max(20, Math.floor((boardWidth - collapsedSpace) / visibleExpanded))
  return { expandedWidth, effectiveColCount }
}
