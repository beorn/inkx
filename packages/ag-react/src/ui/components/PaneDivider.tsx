/**
 * PaneDivider - a one-cell sash for split-pane chrome.
 *
 * This is intentionally lower-level than a full SplitPane/Workspace layout:
 * the parent owns the split tree, ratios, min-size policy, and persistence.
 * PaneDivider owns the reusable visible handle affordance.
 */

import React, { useCallback, useRef, useState } from "react"
import type { SilveryMouseEvent } from "@silvery/ag/mouse-event-types"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useHover } from "../../hooks/useHover"
import { useMouseCursor } from "../../hooks/useMouseCursor"

export type PaneDividerOrientation = "vertical" | "horizontal"

export interface PaneDividerResizeStartEvent {
  readonly orientation: PaneDividerOrientation
  /** x for vertical dividers, y for horizontal dividers. */
  readonly coordinate: number
  readonly x: number
  readonly y: number
  readonly sourceEvent: SilveryMouseEvent
}

export interface PaneDividerProps {
  /** Visible divider orientation: vertical `│` between columns, or horizontal `─` between rows. */
  readonly orientation: PaneDividerOrientation
  /** One-cell thickness by default. Larger values increase the hit zone and visible gutter. */
  readonly size?: number
  /** Idle divider glyph color. Defaults to Sterling's border token. */
  readonly color?: string
  /** Hover/drag divider glyph color. Defaults to the accent foreground token. */
  readonly activeColor?: string
  /** Force active chrome while the parent is processing a drag. */
  readonly active?: boolean
  /** Disable hover cursor and resize-start events while preserving layout. */
  readonly disabled?: boolean
  /** Override the visible glyph for vertical dividers. */
  readonly verticalChar?: string
  /** Override the visible glyph for horizontal dividers. */
  readonly horizontalChar?: string
  /** Fired on mouse-down so the parent split layout can begin a resize gesture. */
  readonly onResizeStart?: (event: PaneDividerResizeStartEvent) => void
  /**
   * Fired on each pointer move while a resize drag is active. `mouseCapture`
   * routes move events to the divider for the whole press — even when the cursor
   * leaves the one-cell hit box — so the parent can track the full gesture
   * without owning a wrapper move/up handler. `coordinate` is x for vertical
   * dividers, y for horizontal.
   */
  readonly onResizeMove?: (coordinate: number) => void
  /** Fired on mouse-up (or cursor-leave-during-capture) ending the resize drag. */
  readonly onResizeEnd?: () => void
}

const DEFAULT_SIZE = 1
const VERTICAL_FILL_LENGTH = 200
const HORIZONTAL_FILL_LENGTH = 400

export function PaneDivider({
  orientation,
  size = DEFAULT_SIZE,
  color = "$border-default",
  activeColor = "$fg-accent",
  active = false,
  disabled = false,
  verticalChar = "│",
  horizontalChar = "─",
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: PaneDividerProps): React.ReactElement {
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  // Internal drag flag: the ref guards the move/up handlers (synchronous, no
  // stale closure); the state drives the active chrome during a drag.
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const armed = !disabled && (active || isHovered || dragging)
  useMouseCursor(armed ? "move" : null)

  const endDrag = useCallback((): void => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    onResizeEnd?.()
  }, [onResizeEnd])

  const handleMouseDown = useCallback(
    (event: SilveryMouseEvent): void => {
      if (disabled) return
      event.preventDefault()
      draggingRef.current = true
      setDragging(true)
      onResizeStart?.({
        orientation,
        coordinate: orientation === "vertical" ? event.x : event.y,
        x: event.x,
        y: event.y,
        sourceEvent: event,
      })
    },
    [disabled, onResizeStart, orientation],
  )

  // `mouseCapture` (below) routes move/up here for the whole press, so a drag
  // started on the sash keeps tracking even when the cursor leaves the 1-cell hit box.
  const handleMouseMove = useCallback(
    (event: SilveryMouseEvent): void => {
      if (!draggingRef.current) return
      onResizeMove?.(orientation === "vertical" ? event.x : event.y)
    },
    [onResizeMove, orientation],
  )

  const visibleColor = armed ? activeColor : color
  const safeSize = Math.max(1, Math.floor(size))

  if (orientation === "vertical") {
    return (
      <Box
        flexShrink={0}
        flexGrow={0}
        width={safeSize}
        height="100%"
        flexDirection="column"
        userSelect="none"
        mouseCapture={!disabled}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
      >
        <Box flexGrow={1} minWidth={0} minHeight={0}>
          <Text color={visibleColor} wrap="wrap" minWidth={0}>
            {verticalChar.repeat(VERTICAL_FILL_LENGTH)}
          </Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box
      flexShrink={0}
      flexGrow={0}
      width="100%"
      height={safeSize}
      flexDirection="row"
      userSelect="none"
      mouseCapture={!disabled}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={endDrag}
    >
      <Box flexGrow={1} minWidth={0} minHeight={0}>
        <Text color={visibleColor} wrap="wrap" minHeight={0}>
          {horizontalChar.repeat(HORIZONTAL_FILL_LENGTH)}
        </Text>
      </Box>
    </Box>
  )
}
