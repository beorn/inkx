/**
 * Mouse Handler for Terminal TUI
 *
 * Implements SGR extended mouse mode for drag-select functionality.
 * SGR mode (\e[?1006h) provides coordinates and button states.
 */

/**
 * Mouse event types
 */
type MouseButton = "left" | "middle" | "right" | "none"
type MouseEventType = "down" | "up" | "move" | "scroll"

/**
 * Mouse event data
 */
interface MouseEvent {
  type: MouseEventType
  button: MouseButton
  x: number // 1-indexed column
  y: number // 1-indexed row
  shift: boolean
  meta: boolean
  ctrl: boolean
  scrollDirection?: "up" | "down"
}

/**
 * Selection range
 */
export interface SelectionRange {
  startX: number
  startY: number
  endX: number
  endY: number
}
