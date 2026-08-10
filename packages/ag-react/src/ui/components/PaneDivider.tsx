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
import { resolveInteractionTreatment } from "@silvery/ag"

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
  /**
   * Strip background — painted across the whole sash (idle and hover). Lets a
   * split host blend the divider into the panes on either side (e.g. the deck
   * passes the focused pane's surface so an idle divider is invisible). Default
   * `undefined` keeps the sash transparent so it inherits whatever is behind it.
   */
  readonly backgroundColor?: string
  /**
   * How the sash reads at rest.
   * - `"line"` (default) — always shows the solid `│`/`─` rule (classic sash).
   * - `"hidden"` — no glyph at rest (background only); the dotted sash appears
   *   only on hover/drag. Pair with {@link backgroundColor} to blend into the
   *   surrounding panes so the divider is invisible until pointed at.
   */
  readonly idleStyle?: "line" | "hidden"
  /** Force active chrome while the parent is processing a drag. */
  readonly active?: boolean
  /** Disable hover cursor and resize-start events while preserving layout. */
  readonly disabled?: boolean
  /** Override the visible glyph for vertical dividers. */
  readonly verticalChar?: string
  /** Override the visible glyph for horizontal dividers. */
  readonly horizontalChar?: string
  /** Hover sash glyph for vertical dividers. Defaults to the dotted rule `┆`. */
  readonly hoverVerticalChar?: string
  /** Hover sash glyph for horizontal dividers. Defaults to the dotted rule `┄`. */
  readonly hoverHorizontalChar?: string
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
  backgroundColor,
  idleStyle = "line",
  active = false,
  disabled = false,
  verticalChar = "│",
  horizontalChar = "─",
  hoverVerticalChar = "┆",
  hoverHorizontalChar = "┄",
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: PaneDividerProps): React.ReactElement {
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  // Internal drag flag: the ref guards the move/up handlers (synchronous, no
  // stale closure); the state drives the active chrome during a drag.
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const mouseCursor = disabled
    ? undefined
    : orientation === "vertical"
      ? "col-resize"
      : "row-resize"

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

  // Sash rendering state machine:
  //  - drag/active     → SOLID rule in the accent color (drag affordance kept)
  //  - hover (no drag) → the DOTTED reveal when the sash is otherwise hidden;
  //                      the classic SOLID accent rule when it is always shown
  //  - idle            → SOLID rule in the idle color, OR nothing when
  //                      `idleStyle="hidden"` (background-only; invisible sash)
  //
  // The dotted glyph is the reveal for the hidden sash; a `"line"` sash keeps its
  // classic solid-accent hover so existing consumers are unchanged.
  const isDragging = active || dragging
  const isHoverArmed = !disabled && isHovered && !isDragging
  const showGlyph = isDragging || isHoverArmed || idleStyle === "line"
  const treatment = resolveInteractionTreatment(
    {
      hovered: isHoverArmed,
      armed: isDragging,
      selected: false,
      focused: false,
      dropTarget: false,
    },
    "control",
    {
      idle: { color },
      revealed: { color: activeColor },
      armed: { color: activeColor },
    },
  )
  const glyphColor = treatment.color
  const safeSize = Math.max(1, Math.floor(size))
  const dottedHover = isHoverArmed && idleStyle === "hidden"
  const verticalGlyph = dottedHover ? hoverVerticalChar : verticalChar
  const horizontalGlyph = dottedHover ? hoverHorizontalChar : horizontalChar

  if (orientation === "vertical") {
    return (
      <Box
        flexShrink={0}
        flexGrow={0}
        width={safeSize}
        height="100%"
        flexDirection="column"
        backgroundColor={backgroundColor}
        userSelect="none"
        mouseCapture={!disabled}
        mouseCursor={mouseCursor}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
      >
        <Box flexGrow={1} minWidth={0} minHeight={0}>
          {showGlyph ? (
            <Text color={glyphColor} wrap="wrap" minWidth={0}>
              {verticalGlyph.repeat(VERTICAL_FILL_LENGTH)}
            </Text>
          ) : null}
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
      backgroundColor={backgroundColor}
      userSelect="none"
      mouseCapture={!disabled}
      mouseCursor={mouseCursor}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={endDrag}
    >
      <Box flexGrow={1} minWidth={0} minHeight={0}>
        {showGlyph ? (
          <Text color={glyphColor} wrap="wrap" minHeight={0}>
            {horizontalGlyph.repeat(HORIZONTAL_FILL_LENGTH)}
          </Text>
        ) : null}
      </Box>
    </Box>
  )
}
