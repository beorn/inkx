/**
 * Board layout constants and helpers
 */

// Layout constants - centralized to avoid magic numbers scattered through rendering code
export const TOP_BAR_HEIGHT = 2
export const BOTTOM_BAR_HEIGHT = 1 // Workspace bottom bar (status counters + command box)
export const FILTER_PANEL_WIDTH = 60
export const COLLAPSED_COL_WIDTH = 3

/** Compute expanded column widths given board width and collapsed state.
 *  Columns are flush (no gap/separator) — HVL renders them edge-to-edge.
 *
 *  Takes column ids (string[]) directly. The `collapsedNodes` set carries
 *  the per-column collapsed state.
 *
 *  Returns a base `expandedWidth` and a `remainder` count. The first `remainder`
 *  expanded columns each get +1 char so that column widths sum exactly to the
 *  available viewport (no trailing gap at wide terminals). */
export function computeColumnWidths(
  boardWidth: number,
  columnIds: readonly string[],
  collapsedNodes: Set<string>,
): { expandedWidth: number; remainder: number; effectiveColCount: number } {
  const totalCollapsed = columnIds.reduce((n, id) => n + (collapsedNodes.has(id) ? 1 : 0), 0)
  const maxExpandedCols = Math.max(1, Math.floor((boardWidth - totalCollapsed * COLLAPSED_COL_WIDTH) / 35))
  const effectiveColCount = Math.min(columnIds.length, maxExpandedCols + totalCollapsed)
  const visibleCollapsed = Math.min(totalCollapsed, effectiveColCount)
  const visibleExpanded = Math.max(1, effectiveColCount - visibleCollapsed)
  const collapsedSpace = visibleCollapsed * COLLAPSED_COL_WIDTH
  const expandableSpace = boardWidth - collapsedSpace
  const expandedWidth = Math.max(20, Math.floor(expandableSpace / visibleExpanded))
  const remainder = expandableSpace - expandedWidth * visibleExpanded
  return { expandedWidth, remainder, effectiveColCount }
}
