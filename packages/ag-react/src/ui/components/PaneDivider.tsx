/**
 * PaneDivider - a one-cell sash for split-pane chrome.
 *
 * This is intentionally lower-level than a full SplitPane/Workspace layout:
 * the parent owns the split tree, ratios, min-size policy, and persistence.
 * PaneDivider owns the reusable visible handle affordance.
 */

import React, { useCallback } from "react"
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
}: PaneDividerProps): React.ReactElement {
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  const armed = !disabled && (active || isHovered)
  useMouseCursor(armed ? "move" : null)

  const handleMouseDown = useCallback(
    (event: SilveryMouseEvent): void => {
      if (disabled) return
      event.preventDefault()
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

  const visibleColor = armed ? activeColor : color
  const safeSize = Math.max(1, Math.floor(size))

  // The fill `<Text wrap="wrap">{char.repeat(N)}</Text>` lays out at its full
  // intrinsic extent (N rows for vertical, N cols for horizontal) because each
  // repeated glyph is an unbreakable single-cell token — CSS §4.5 auto-min-size
  // floors the Text's main-axis size at that intrinsic length. The fill Box is
  // bounded by its flex parent, but WITHOUT `overflow="hidden"` the render phase
  // paints the Text at its own (overflowing) rect, bleeding divider glyphs into
  // sibling panes below/right of a bounded divider region. `overflow="hidden"`
  // clips the fill to the Box — the canonical "clip without scroll indicators"
  // pattern. Do NOT remove it: regressed as the hab-deck "C1 divider bleed".
  // See tests/features/pane-divider-extent.test.tsx.

  if (orientation === "vertical") {
    return (
      <Box
        flexShrink={0}
        flexGrow={0}
        flexBasis={safeSize}
        width={safeSize}
        flexDirection="column"
        userSelect="none"
        mouseCapture={!disabled}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onMouseDown={handleMouseDown}
      >
        <Box flexGrow={1} minWidth={0} minHeight={0} overflow="hidden">
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
      flexBasis={safeSize}
      height={safeSize}
      flexDirection="row"
      userSelect="none"
      mouseCapture={!disabled}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={handleMouseDown}
    >
      <Box flexGrow={1} minWidth={0} minHeight={0} overflow="hidden">
        <Text color={visibleColor} wrap="wrap" minHeight={0}>
          {horizontalChar.repeat(HORIZONTAL_FILL_LENGTH)}
        </Text>
      </Box>
    </Box>
  )
}
