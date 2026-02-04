/**
 * Mouse Handler for Terminal TUI
 *
 * Implements SGR extended mouse mode for drag-select functionality.
 * SGR mode (\e[?1006h) provides coordinates and button states.
 */

/**
 * Selection range
 */
export interface SelectionRange {
  startX: number
  startY: number
  endX: number
  endY: number
}
