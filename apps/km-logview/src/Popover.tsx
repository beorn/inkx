/**
 * Local popover for km-logview.
 *
 * Minimal hover-preview overlay for pills, truncated segments, and collapsed
 * multi-line bodies. Shows the FULL content of the hovered field — not the
 * whole row JSON.
 *
 * Why local (not silvery)?
 *   km-tui has a richer Popover (apps/km-tui/src/views/Popover.tsx) with a
 *   signal store, warm/swap timings, lazy rendering, and BoardAppStore wiring.
 *   Promoting that to silvery is its own /refactor (decouple from app store,
 *   add mandatory prop tests, update theme tokens). For now, logview's needs
 *   are simpler: immediate show on enter, grace-hide on leave, plain text
 *   content, no metadata fetching. When a second consumer shows up, extract.
 *
 * Design:
 *   - <PopoverProvider> wraps the app; children + overlay siblings.
 *   - usePopover() returns { show, hide, cancelHide } from any descendant.
 *   - Overlay uses position="absolute" + marginTop/marginLeft, clamped to
 *     the app's WindowSize. Below the anchor point where possible, above
 *     when it would clip the bottom.
 *   - HIDE_DELAY grace window lets the cursor transit from trigger to
 *     popover without flicker; popover cancels the pending hide on enter.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { Box, Text, useWindowSize } from "silvery"
import type { SilveryMouseEvent } from "silvery/term"

// =============================================================================
// Types
// =============================================================================

export interface PopoverAnchor {
  /** Terminal column (0-indexed) of the anchor point. */
  x: number
  /** Terminal row (0-indexed) of the anchor point. */
  y: number
}

export interface PopoverContent {
  /** Single title line (bold). Optional. */
  title?: string
  /** Body lines — rendered as dim muted text. Each entry is a visual line. */
  lines: string[]
  /** Max width of the popover box. Default: 60. */
  maxWidth?: number
}

interface PopoverState {
  content: PopoverContent | null
  anchor: PopoverAnchor | null
}

interface PopoverCtxValue {
  show(content: PopoverContent, anchor: PopoverAnchor): void
  hide(): void
  /** Cancel a pending hide — call when mouse enters the popover itself. */
  cancelHide(): void
}

// =============================================================================
// Timing
// =============================================================================

/** Grace period for mouse to transit from anchor into the popover. */
const HIDE_DELAY_MS = 200

// =============================================================================
// Context
// =============================================================================

const PopoverCtx = createContext<PopoverCtxValue | null>(null)

export function usePopover(): PopoverCtxValue | null {
  return useContext(PopoverCtx)
}

// =============================================================================
// Provider
// =============================================================================

export function PopoverProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<PopoverState>({ content: null, anchor: null })
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const show = useCallback(
    (content: PopoverContent, anchor: PopoverAnchor) => {
      clearHide()
      setState({ content, anchor })
    },
    [clearHide],
  )

  const hide = useCallback(() => {
    clearHide()
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null
      setState({ content: null, anchor: null })
    }, HIDE_DELAY_MS)
  }, [clearHide])

  const cancelHide = useCallback(() => {
    clearHide()
  }, [clearHide])

  // Cancel any pending timer on unmount.
  useEffect(() => clearHide, [clearHide])

  const value = useMemo<PopoverCtxValue>(() => ({ show, hide, cancelHide }), [show, hide, cancelHide])

  return (
    <PopoverCtx.Provider value={value}>
      {children}
      <PopoverOverlay state={state} onEnter={cancelHide} onLeave={hide} />
    </PopoverCtx.Provider>
  )
}

// =============================================================================
// Overlay
// =============================================================================

function PopoverOverlay({
  state,
  onEnter,
  onLeave,
}: {
  state: PopoverState
  onEnter: () => void
  onLeave: () => void
}) {
  const { columns, rows } = useWindowSize()
  const { content, anchor } = state
  if (!content || !anchor) return null

  const maxWidth = Math.min(content.maxWidth ?? 60, Math.max(20, columns - 4))
  // Cap height by visible lines — leave room for border + padding.
  const titleLines = content.title ? 1 : 0
  const bodyLines = Math.min(content.lines.length, Math.max(3, rows - 6))
  const height = titleLines + bodyLines + 2 // +2 for top/bottom border

  // Place below-and-right of the anchor when it fits; otherwise clamp.
  // The overlay coordinates are absolute-screen (marginTop/marginLeft).
  let top = anchor.y + 1
  if (top + height > rows) top = Math.max(0, anchor.y - height)
  let left = anchor.x
  if (left + maxWidth > columns) left = Math.max(0, columns - maxWidth)

  return (
    <Box
      position="absolute"
      marginTop={top}
      marginLeft={left}
      maxWidth={maxWidth}
      maxHeight={Math.max(3, rows - top)}
      flexDirection="column"
      borderStyle="round"
      borderColor="$fg-muted"
      backgroundColor="$bg"
      paddingX={1}
      onMouseEnter={(e: SilveryMouseEvent) => {
        e.stopPropagation()
        onEnter()
      }}
      onMouseLeave={(e: SilveryMouseEvent) => {
        e.stopPropagation()
        onLeave()
      }}
      onClick={(e: SilveryMouseEvent) => {
        // Don't let the underlying row handle a click on the popover chrome
        // (which would toggle expand on the row under the overlay).
        e.stopPropagation()
      }}
    >
      {content.title && (
        <Text bold wrap="truncate-end">
          {content.title}
        </Text>
      )}
      {content.lines.slice(0, bodyLines).map((line, i) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable for a given popover content
          key={`l${i}`}
          color="$fg-muted"
          wrap="truncate-end"
        >
          {line}
        </Text>
      ))}
      {content.lines.length > bodyLines && (
        <Text color="$fg-muted">{`…(+${content.lines.length - bodyLines} more lines)`}</Text>
      )}
    </Box>
  )
}
