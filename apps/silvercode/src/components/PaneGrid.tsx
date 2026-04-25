/**
 * PaneGrid — 1D row of session panes, separated by a single-column
 * vertical divider per gap. Owns the weight state + drag-resize logic.
 *
 * Chrome philosophy (per bead km-silvercode.pane-management course
 * correction): NO border around each pane, NO header strip. Pane
 * separation is a 1-col `│` gutter; the active pane gets a 1-col
 * accent bar inside SessionCard's left edge. That's it.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ ▎ pane 1 content │ pane 2 content │ pane 3...  │
 *   │   ──────────────              ─                │
 *   │   left edge bar = active     │ = divider       │
 *   └────────────────────────────────────────────────┘
 *
 * The grid wraps everything in one Box that owns `onMouseMove` /
 * `onMouseUp`, so a drag started on a divider keeps tracking even when
 * the cursor strays into an adjacent pane. (Mouse events in silvery
 * route to the deepest hit, with no global capture; routing the move
 * events through a common ancestor is the v1 fix.)
 *
 * Zoom: when `zoomedPaneId` is set, the grid renders ONLY that pane
 * full-width with no dividers. Toggle via the Ctrl+W z chord wired in
 * App.tsx.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, Text, useBoxRect, useMouseCursor } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { loadPanes, reconcileWeights, resizeBoundary, savePanes } from "../pane-layout.ts"
import { SessionCard } from "./SessionCard.tsx"

/** Width of a single divider column in cells. */
const DIVIDER_WIDTH = 1

export type PaneGridProps = {
  sessions: ReadonlyArray<SessionHandle>
  focusedSessionId: string
  zoomedPaneId: string | null
  /** Per-vault root for `.silvercode/panes.json` persistence. */
  cwd: string
  onFocusSession: (id: string) => void
  onApprovePermission: (sessionId: string, requestId: string) => void
  onDenyPermission: (sessionId: string, requestId: string) => void
}

type DragState = {
  /** Index of the divider being dragged (between pane[i] and pane[i+1]). */
  readonly dividerIndex: number
  /** Total grid width at drag start (excluding dividers). Used to convert px-delta → ratio. */
  readonly gridContentWidth: number
  /** Combined weight of the two adjacent panes at drag start. */
  readonly combinedWeight: number
  /** x at drag start (terminal column). */
  readonly startX: number
  /** Snapshot of weights at drag start so we can recompute relative to it. */
  readonly startWeights: ReadonlyArray<number>
}

export function PaneGrid(props: PaneGridProps): React.ReactElement {
  const { sessions, focusedSessionId, zoomedPaneId, cwd, onFocusSession } = props

  // Hydrate weights from disk on first mount, reconciled to current pane count.
  // Subsequent renders read from the in-memory `weights` state; persistence
  // happens on drag-end + on pane add/remove.
  const initialWeights = useMemo(() => reconcileWeights(loadPanes(cwd), sessions.length), [cwd, sessions.length])
  const [weights, setWeights] = useState<ReadonlyArray<number>>(initialWeights)

  // Reconcile weights when the pane count changes (spawn/close). Persist on
  // change so a later session sees the same layout (minus the
  // newly-added/closed pane).
  useEffect(() => {
    setWeights((prev) => {
      const next = reconcileWeights(prev, sessions.length)
      if (next.length !== prev.length) savePanes(cwd, next)
      return next
    })
  }, [sessions.length, cwd])

  const dragRef = useRef<DragState | null>(null)
  const [, forceRender] = useState(0)

  // useBoxRect on the wrapper — gives us the screen-relative origin for
  // converting mouse clientX → "column inside grid". We need this on
  // re-render so the drag math stays correct after a layout change
  // (e.g. side panel toggle).
  const gridRect = useBoxRect()

  // Total weight; cached per render for the flexBasis math below.
  const totalWeight = useMemo(
    () => weights.reduce((a, b) => a + b, 0) || sessions.length || 1,
    [weights, sessions.length],
  )

  const handleDividerMouseDown = useCallback(
    (dividerIndex: number, clientX: number) => {
      // Width available to panes = grid width minus one column per divider.
      const dividerCount = Math.max(0, sessions.length - 1)
      const gridContentWidth = Math.max(1, gridRect.width - dividerCount * DIVIDER_WIDTH)
      const combinedWeight = (weights[dividerIndex] ?? 1) + (weights[dividerIndex + 1] ?? 1)
      dragRef.current = {
        dividerIndex,
        gridContentWidth,
        combinedWeight,
        startX: clientX,
        startWeights: weights,
      }
      // Re-render so the divider can paint a "dragging" cue (subtle —
      // we just bump the accent shade via the dragging state).
      forceRender((n) => n + 1)
    },
    [gridRect.width, sessions.length, weights],
  )

  const handleWrapperMouseMove = useCallback((clientX: number) => {
    const drag = dragRef.current
    if (!drag) return
    // Convert pixel-delta on the screen to a ratio of the combined weight.
    // The shared edge moves with the cursor, so deltaRatio = deltaCols /
    // combinedPaneCols, where combinedPaneCols ≈ combinedWeight / totalWeight
    // * gridContentWidth. We compute it this way so the math is independent
    // of the in-flight totalWeight (which doesn't change during drag because
    // we conserve it pairwise).
    const total = drag.startWeights.reduce((a, b) => a + b, 0) || 1
    const combinedCols = (drag.combinedWeight / total) * drag.gridContentWidth
    if (combinedCols <= 0) return
    const deltaCols = clientX - drag.startX
    const deltaRatio = deltaCols / combinedCols
    const next = resizeBoundary(drag.startWeights, drag.dividerIndex, deltaRatio)
    setWeights(next)
  }, [])

  const handleWrapperMouseUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    // Persist after drag-end so we don't thrash disk during the move.
    savePanes(cwd, weights)
    forceRender((n) => n + 1)
  }, [cwd, weights])

  // Zoom mode: render only the focused pane, full width, no dividers.
  if (zoomedPaneId) {
    const zoomed = sessions.find((s) => s.id === zoomedPaneId)
    if (zoomed) {
      return (
        <Box flexDirection="row" flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
            <SessionCard
              handle={zoomed}
              isFocused
              onFocus={() => onFocusSession(zoomed.id)}
              onApprove={(rid) => props.onApprovePermission(zoomed.id, rid)}
              onDeny={(rid) => props.onDenyPermission(zoomed.id, rid)}
            />
          </Box>
        </Box>
      )
    }
  }

  return (
    <Box
      flexDirection="row"
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      minWidth={0}
      onMouseMove={(e) => handleWrapperMouseMove(e.clientX)}
      onMouseUp={handleWrapperMouseUp}
      onMouseLeave={handleWrapperMouseUp}
    >
      {sessions.map((s, i) => {
        const weight = weights[i] ?? 1
        const basisPct = `${(weight / totalWeight) * 100}%`
        const isFocused = s.id === focusedSessionId
        return (
          <React.Fragment key={s.id}>
            <Box flexDirection="column" flexGrow={0} flexShrink={1} flexBasis={basisPct} minHeight={0} minWidth={0}>
              <SessionCard
                handle={s}
                isFocused={isFocused}
                onFocus={() => onFocusSession(s.id)}
                onApprove={(rid) => props.onApprovePermission(s.id, rid)}
                onDeny={(rid) => props.onDenyPermission(s.id, rid)}
              />
            </Box>
            {i < sessions.length - 1 && (
              <PaneDivider
                index={i}
                onMouseDown={handleDividerMouseDown}
                isDragging={dragRef.current?.dividerIndex === i}
              />
            )}
          </React.Fragment>
        )
      })}
    </Box>
  )
}

/**
 * Single-column vertical divider between two panes. Renders a column of
 * `│` glyphs in `$border` (or `$accent` while being dragged). Hover
 * sets the col-resize mouse cursor; mousedown starts a drag the
 * PaneGrid wrapper tracks.
 */
function PaneDivider({
  index,
  onMouseDown,
  isDragging,
}: {
  index: number
  onMouseDown: (index: number, clientX: number) => void
  isDragging: boolean
}): React.ReactElement {
  const [hover, setHover] = useState(false)
  // Silvery's MouseCursorShape currently exposes the X11 set without
  // `col-resize` / `row-resize`. `move` is the closest available signal
  // ("you can drag this") — when the shape vocabulary grows, switch to
  // col-resize. Tracked downstream in silvery; v1 uses `move` so the
  // hover hint still works on Ghostty / Kitty.
  useMouseCursor(hover || isDragging ? "move" : null)
  const color = isDragging ? "$accent" : hover ? "$accent" : "$border"
  return (
    <Box
      flexShrink={0}
      flexGrow={0}
      flexBasis={DIVIDER_WIDTH}
      width={DIVIDER_WIDTH}
      flexDirection="column"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(e) => onMouseDown(index, e.clientX)}
    >
      {/* A single Text whose content fills the full column with `│`
          glyphs. flex-grow makes it stretch the column's height; the
          underlying Text wraps each `│` to its own row because the
          divider's width is 1. */}
      <Box flexGrow={1} flexShrink={1}>
        <Text color={color} wrap="wrap">
          {"│".repeat(200)}
        </Text>
      </Box>
    </Box>
  )
}
