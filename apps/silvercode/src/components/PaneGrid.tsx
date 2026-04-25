/**
 * PaneGrid — 2D binary-split tree of session panes, separated by a single
 * column / row of divider glyphs per gap. Owns the layout tree state +
 * drag-resize logic + drag-move logic.
 *
 * Chrome philosophy (per bead km-silvercode.pane-management): NO border
 * around each pane, NO header strip. Pane separation is a 1-col `│` (row
 * splits) or 1-row `─` (column splits) gutter; the active pane gets a
 * 1-col accent bar inside SessionCard's left edge. That's it.
 *
 *   row-split (vsplit, Ctrl+W v):       column-split (hsplit, Ctrl+W s):
 *   ┌───────────────────┐                ┌───────────────────┐
 *   │ ▎ pane A │ pane B │                │ ▎ pane A          │
 *   │           │        │                │ ─────────────     │
 *   │           │        │                │   pane B          │
 *   └───────────┴────────┘                └───────────────────┘
 *
 * The grid wraps everything in one Box that owns `onMouseMove` /
 * `onMouseUp`, so a drag started on a divider keeps tracking even when
 * the cursor strays into an adjacent pane. (Mouse events in silvery
 * route to the deepest hit, with no global capture; routing the move
 * events through a common ancestor is the v1 fix.)
 *
 * Drag-move (km-silvercode.pane-drag-move): each leaf renders a 1-cell
 * `▤` grab handle at its top-left corner overlaying the active-bar.
 * Mouse-down on the handle starts a "move drag" (vs the resize drag
 * started on a divider). While moving, the leaf under the pointer shows
 * a 1-cell colored band on the edge implied by the pointer's quadrant
 * within that leaf — top/bottom/left/right quarter or the center "swap"
 * zone. Mouse-up commits via `moveLeafTo` or `swapLeaves`.
 *
 * Zoom: when `zoomedPaneId` is set, the grid renders ONLY that pane
 * full-area with no dividers. Toggle via the Ctrl+W z chord wired in
 * App.tsx.
 *
 * Keybindings (in App.tsx, this component is presentation):
 *   Ctrl+W v          — vertical split (row split)
 *   Ctrl+W s          — horizontal split (column split)
 *   Ctrl+W x          — close current pane
 *   Ctrl+W z          — zoom toggle
 *   Ctrl+W H/J/K/L    — swap with neighbor in direction
 *   Ctrl+N            — cycle focus (left-to-right reading order via leafIds)
 */

import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Box, Text, useBoxRect, useMouseCursor } from "silvery"
import type { SessionHandle } from "../controller.ts"
import {
  type DropEdge,
  type LayoutNode,
  type LayoutSplit,
  type SplitDirection,
  moveLeafTo,
  savePanes,
  setSplitWeight,
  swapLeaves,
} from "../pane-layout.ts"
import { SessionCard } from "./SessionCard.tsx"

/** Width of a single divider column / row in cells. */
const DIVIDER_SIZE = 1

/**
 * "Center swap" zone — pointer inside this fraction (around 0.5) of the
 * pane along BOTH axes triggers a swap rather than a split-into.
 *
 * Tuned to be obvious to hit (~50% × 50% rectangle) without being so
 * large that edge drops are awkward. The remaining border ring (the
 * outer ~25% on each side) maps to the four split edges via whichever
 * axis the pointer is closer to.
 */
const CENTER_ZONE_HALF = 0.25 // [0.25, 0.75] on both axes → center

export type PaneGridProps = {
  sessions: ReadonlyArray<SessionHandle>
  focusedSessionId: string
  zoomedPaneId: string | null
  /** Layout tree — owned by the parent (App) so split chords can edit it. */
  tree: LayoutNode
  /** Drag-resize / drag-move emits a new tree here; App persists + re-renders. */
  onTreeChange: (next: LayoutNode) => void
  /** Per-vault root for `.silvercode/panes.json` — persistence on drag-end. */
  cwd: string
  onFocusSession: (id: string) => void
  onApprovePermission: (sessionId: string, requestId: string) => void
  onDenyPermission: (sessionId: string, requestId: string) => void
}

/**
 * Imperative handle exposed to App.tsx so the Escape keystroke (handled
 * at the App-level via useInput) can cancel an in-flight pane drag.
 * Returns true if a drag was active and was cancelled — App can then
 * stop further Escape handling for this keypress.
 */
export type PaneGridHandle = {
  cancelDrag(): boolean
}

/** Drag state for resizing a divider (existing v1 behaviour). */
type ResizeDragState = {
  readonly mode: "resize"
  /** Path from the root to the split being dragged. */
  readonly path: readonly number[]
  /** Pixel size (cols for row-split, rows for column-split) of the parent split's content area at drag start. */
  readonly parentContentSize: number
  /** Weight of the split at drag start. */
  readonly startWeight: number
  /** Pointer coordinate at drag start (clientX for row-split, clientY for column-split). */
  readonly startCoord: number
  /** Direction of the split being dragged — picks clientX vs clientY. */
  readonly direction: SplitDirection
}

/** Drag state for moving a pane (km-silvercode.pane-drag-move). */
type MoveDragState = {
  readonly mode: "move"
  /** Session id being dragged. */
  readonly sourceId: string
  /** Current pointer position (terminal cells, 0-indexed). */
  pointerX: number
  pointerY: number
  /** Current target leaf + edge, computed in mousemove from pointer + leaf rects. */
  targetId: string | null
  edge: DropEdge | "center" | null
}

type DragState = ResizeDragState | MoveDragState

/** Where each leaf is on screen — populated as leaves report their rects. */
type LeafRect = { x: number; y: number; w: number; h: number }

export const PaneGrid = forwardRef<PaneGridHandle, PaneGridProps>(function PaneGrid(props, ref): React.ReactElement {
  const { sessions, focusedSessionId, zoomedPaneId, cwd, onFocusSession, tree, onTreeChange } = props

  const dragRef = useRef<DragState | null>(null)
  const [dragVersion, setDragVersion] = useState(0)
  const bumpDragVersion = useCallback(() => setDragVersion((n) => n + 1), [])

  // Keep a ref to the latest tree so the drag-end persist sees the
  // mid-drag value (state setter from onMouseMove is asynchronous).
  const treeRef = useRef(tree)
  treeRef.current = tree

  // Per-leaf screen rects, populated by each leaf via its inner Box's
  // `useBoxRect()`. Keys are session ids. Stored on a ref because
  // mouse-move recomputes the drop target from this map and we don't
  // want to re-render every leaf whenever any leaf measures.
  const leafRectsRef = useRef(new Map<string, LeafRect>())
  const reportLeafRect = useCallback((id: string, rect: LeafRect) => {
    const prev = leafRectsRef.current.get(id)
    if (prev && prev.x === rect.x && prev.y === rect.y && prev.w === rect.w && prev.h === rect.h) return
    leafRectsRef.current.set(id, rect)
  }, [])

  const sessionMap = useMemo(() => new Map(sessions.map((s) => [s.id, s] as const)), [sessions])

  // ----- divider drag (resize) -----

  const handleDividerMouseDown = useCallback(
    (path: readonly number[], direction: SplitDirection, parentContentSize: number, startCoord: number) => {
      const split = nodeAtPath(treeRef.current, path)
      if (split?.kind !== "split") return
      dragRef.current = {
        mode: "resize",
        path,
        parentContentSize: Math.max(1, parentContentSize),
        startWeight: split.weight,
        startCoord,
        direction,
      }
      bumpDragVersion()
    },
    [bumpDragVersion],
  )

  // ----- pane drag (move) -----

  const handleGrabMouseDown = useCallback(
    (sourceId: string, pointerX: number, pointerY: number) => {
      dragRef.current = {
        mode: "move",
        sourceId,
        pointerX,
        pointerY,
        targetId: null,
        edge: null,
      }
      bumpDragVersion()
    },
    [bumpDragVersion],
  )

  // Compute drop target (which leaf + which edge) from a pointer position.
  const computeDropTarget = useCallback(
    (
      clientX: number,
      clientY: number,
      sourceId: string,
    ): { targetId: string | null; edge: DropEdge | "center" | null } => {
      let hit: { id: string; rect: LeafRect } | null = null
      for (const [id, rect] of leafRectsRef.current) {
        if (id === sourceId) continue
        if (clientX < rect.x || clientX >= rect.x + rect.w) continue
        if (clientY < rect.y || clientY >= rect.y + rect.h) continue
        hit = { id, rect }
        break
      }
      if (!hit) return { targetId: null, edge: null }
      const { rect } = hit
      const fx = (clientX - rect.x) / Math.max(1, rect.w)
      const fy = (clientY - rect.y) / Math.max(1, rect.h)
      // Center zone — the inner half × half rectangle.
      const inCenterX = fx >= 0.5 - CENTER_ZONE_HALF && fx <= 0.5 + CENTER_ZONE_HALF
      const inCenterY = fy >= 0.5 - CENTER_ZONE_HALF && fy <= 0.5 + CENTER_ZONE_HALF
      if (inCenterX && inCenterY) return { targetId: hit.id, edge: "center" }
      // Outside center → pick the edge based on which axis is "more
      // extreme" (the larger distance from 0.5). This avoids the corners
      // being ambiguous between two edges.
      const dx = Math.abs(fx - 0.5)
      const dy = Math.abs(fy - 0.5)
      if (dx >= dy) {
        return { targetId: hit.id, edge: fx < 0.5 ? "left" : "right" }
      }
      return { targetId: hit.id, edge: fy < 0.5 ? "top" : "bottom" }
    },
    [],
  )

  const handleWrapperMouseMove = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current
      if (!drag) return
      if (drag.mode === "resize") {
        const coord = drag.direction === "row" ? clientX : clientY
        const delta = coord - drag.startCoord
        const ratioDelta = delta / drag.parentContentSize
        const next = drag.startWeight + ratioDelta
        onTreeChange(setSplitWeight(treeRef.current, drag.path, next))
        return
      }
      // mode === "move"
      const { targetId, edge } = computeDropTarget(clientX, clientY, drag.sourceId)
      drag.pointerX = clientX
      drag.pointerY = clientY
      const changed = drag.targetId !== targetId || drag.edge !== edge
      drag.targetId = targetId
      drag.edge = edge
      if (changed) bumpDragVersion()
    },
    [onTreeChange, computeDropTarget, bumpDragVersion],
  )

  const handleWrapperMouseUp = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.mode === "resize") {
      dragRef.current = null
      savePanes(cwd, treeRef.current)
      bumpDragVersion()
      return
    }
    // mode === "move" — commit the move/swap.
    const { sourceId, targetId, edge } = drag
    dragRef.current = null
    if (targetId && edge) {
      let next: LayoutNode
      if (edge === "center") {
        next = swapLeaves(treeRef.current, sourceId, targetId)
      } else {
        next = moveLeafTo(treeRef.current, sourceId, targetId, edge)
      }
      if (next !== treeRef.current) {
        onTreeChange(next)
        savePanes(cwd, next)
      }
    }
    bumpDragVersion()
  }, [cwd, onTreeChange, bumpDragVersion])

  // Imperative handle: App-level useInput dispatches Escape here when a
  // drag is in flight so the parent can cancel without coupling through
  // a state round-trip.
  useImperativeHandle(
    ref,
    (): PaneGridHandle => ({
      cancelDrag(): boolean {
        if (dragRef.current?.mode !== "move") return false
        dragRef.current = null
        bumpDragVersion()
        return true
      },
    }),
    [bumpDragVersion],
  )

  const moveDrag = dragRef.current?.mode === "move" ? (dragRef.current as MoveDragState) : null

  const renderLeafFn = useCallback(
    (sessionId: string): React.ReactElement => {
      const handle = sessionMap.get(sessionId)
      if (!handle) {
        // Defensive: tree has a leaf for a session that's gone. Render
        // an empty placeholder so the layout stays stable until the
        // reconcile effect drops the leaf on the next render.
        return <Box flexGrow={1} flexShrink={1} minHeight={0} minWidth={0} />
      }
      const isSourceLeaf = moveDrag?.sourceId === handle.id
      const isTargetLeaf = moveDrag?.targetId === handle.id
      const dropEdge = isTargetLeaf ? (moveDrag?.edge ?? null) : null
      return (
        <LeafContainer
          handle={handle}
          isFocused={handle.id === focusedSessionId}
          isSourceLeaf={isSourceLeaf}
          dropEdge={dropEdge}
          onReportRect={reportLeafRect}
          onFocus={() => onFocusSession(handle.id)}
          onApprove={(rid) => props.onApprovePermission(handle.id, rid)}
          onDeny={(rid) => props.onDenyPermission(handle.id, rid)}
          onGrabMouseDown={(x, y) => handleGrabMouseDown(handle.id, x, y)}
        />
      )
    },
    [sessionMap, focusedSessionId, onFocusSession, props, moveDrag, reportLeafRect, handleGrabMouseDown],
  )

  // dragVersion participates in dependency arrays of memoized callbacks
  // that need to re-evaluate when drag state flips. We don't need it to
  // do anything on its own, but referencing it forces the closure capture
  // each render.
  void dragVersion

  // Zoom mode: render only the focused pane, full area, no dividers.
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
      onMouseMove={(e) => handleWrapperMouseMove(e.clientX, e.clientY)}
      onMouseUp={handleWrapperMouseUp}
      onMouseLeave={handleWrapperMouseUp}
    >
      <NodeRenderer
        node={tree}
        path={[]}
        draggingPath={dragRef.current?.mode === "resize" ? dragRef.current.path : null}
        onDividerMouseDown={handleDividerMouseDown}
        renderLeaf={renderLeafFn}
      />
    </Box>
  )
})

/**
 * Per-leaf wrapper. Owns:
 *   - `useBoxRect()` to report the leaf's screen rect to PaneGrid for
 *     hit-testing during drag.
 *   - The grab handle overlay at top-left.
 *   - The drop indicator overlay (edge band or center swap band) when
 *     this leaf is the current drag target.
 *   - SessionCard (the actual content).
 *
 * The wrapper's `position="relative"` lets the overlays use absolute
 * positioning inside it without pushing the SessionCard around.
 */
function LeafContainer({
  handle,
  isFocused,
  isSourceLeaf,
  dropEdge,
  onReportRect,
  onFocus,
  onApprove,
  onDeny,
  onGrabMouseDown,
}: {
  handle: SessionHandle
  isFocused: boolean
  isSourceLeaf: boolean
  dropEdge: DropEdge | "center" | null
  onReportRect: (id: string, rect: LeafRect) => void
  onFocus: () => void
  onApprove: (rid: string) => void
  onDeny: (rid: string) => void
  onGrabMouseDown: (x: number, y: number) => void
}): React.ReactElement {
  const rect = useBoxRect()
  // useBoxRect updates synchronously during render — write through
  // immediately so the next mouse move event picks up the rect even if
  // we haven't re-rendered the parent yet.
  if (rect.width > 0 && rect.height > 0) {
    onReportRect(handle.id, { x: rect.x, y: rect.y, w: rect.width, h: rect.height })
  }
  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} minWidth={0} position="relative">
      <SessionCard
        handle={handle}
        isFocused={isFocused}
        isDimmed={isSourceLeaf}
        onFocus={onFocus}
        onApprove={onApprove}
        onDeny={onDeny}
      />
      {/* Grab handle — 1×1 cell at top-left, painted over the active-bar.
          Always visible (per design constraint: hover detection
          unreliable, take the practical path). */}
      <Box
        position="absolute"
        top={0}
        left={0}
        width={1}
        height={1}
        onMouseDown={(e) => onGrabMouseDown(e.clientX, e.clientY)}
      >
        <Text color={isFocused ? "$accent" : "$muted"}>▤</Text>
      </Box>
      {/* Drop indicator overlay — colored 1-cell band on the relevant
          edge, or a 2-col center band for the swap zone. Rendered only
          when this leaf is the current drag target. */}
      {dropEdge && <DropIndicator edge={dropEdge} containerWidth={rect.width} containerHeight={rect.height} />}
    </Box>
  )
}

function DropIndicator({
  edge,
  containerWidth,
  containerHeight,
}: {
  edge: DropEdge | "center"
  containerWidth: number
  containerHeight: number
}): React.ReactElement {
  if (edge === "center") {
    // Center swap: 2-col-wide vertical accent band centered horizontally.
    // Visibly distinct from "split-into" edge bands (different shape +
    // it's centered, not flush with an edge).
    const left = Math.max(0, Math.floor(containerWidth / 2) - 1)
    return (
      <Box position="absolute" top={0} left={left} width={2} height={containerHeight} backgroundColor="$accent">
        <Text color="$accent-fg">{" ".repeat(2 * Math.max(1, containerHeight))}</Text>
      </Box>
    )
  }
  if (edge === "top") {
    return (
      <Box position="absolute" top={0} left={0} width={containerWidth} height={1} backgroundColor="$accent">
        <Text>{" ".repeat(Math.max(1, containerWidth))}</Text>
      </Box>
    )
  }
  if (edge === "bottom") {
    return (
      <Box position="absolute" bottom={0} left={0} width={containerWidth} height={1} backgroundColor="$accent">
        <Text>{" ".repeat(Math.max(1, containerWidth))}</Text>
      </Box>
    )
  }
  if (edge === "left") {
    return (
      <Box position="absolute" top={0} left={0} width={1} height={containerHeight} backgroundColor="$accent">
        <Text>{" ".repeat(Math.max(1, containerHeight))}</Text>
      </Box>
    )
  }
  // edge === "right"
  return (
    <Box position="absolute" top={0} right={0} width={1} height={containerHeight} backgroundColor="$accent">
      <Text>{" ".repeat(Math.max(1, containerHeight))}</Text>
    </Box>
  )
}

/**
 * Recursive renderer. A leaf renders SessionCard inside a flexGrow box
 * sized via flexBasis (set by its parent split's weight). A split
 * renders two child boxes plus a divider in between.
 */
function NodeRenderer({
  node,
  path,
  draggingPath,
  onDividerMouseDown,
  renderLeaf,
}: {
  node: LayoutNode
  path: readonly number[]
  draggingPath: readonly number[] | null
  onDividerMouseDown: (
    path: readonly number[],
    direction: SplitDirection,
    parentContentSize: number,
    coord: number,
  ) => void
  renderLeaf: (sessionId: string) => React.ReactElement
}): React.ReactElement {
  if (node.kind === "leaf") {
    return (
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
        {renderLeaf(node.sessionId)}
      </Box>
    )
  }
  return (
    <SplitRenderer
      node={node}
      path={path}
      draggingPath={draggingPath}
      onDividerMouseDown={onDividerMouseDown}
      renderLeaf={renderLeaf}
    />
  )
}

function SplitRenderer({
  node,
  path,
  draggingPath,
  onDividerMouseDown,
  renderLeaf,
}: {
  node: LayoutSplit
  path: readonly number[]
  draggingPath: readonly number[] | null
  onDividerMouseDown: (
    path: readonly number[],
    direction: SplitDirection,
    parentContentSize: number,
    coord: number,
  ) => void
  renderLeaf: (sessionId: string) => React.ReactElement
}): React.ReactElement {
  // useBoxRect gives us the parent split's actual content size, which we
  // use to convert pointer-pixel deltas to weight deltas during drag.
  const containerRect = useBoxRect()
  const containerSize = node.direction === "row" ? containerRect.width : containerRect.height
  // Divider eats DIVIDER_SIZE cells along the split direction; the rest
  // is split between children.
  const contentSize = Math.max(1, containerSize - DIVIDER_SIZE)
  const isDragging = draggingPath !== null && pathEquals(draggingPath, path)
  // Children get flex-basis as a percentage of the container so they
  // grow / shrink with the available space; divider is a fixed
  // DIVIDER_SIZE column / row.
  const firstBasis = `${node.weight * 100}%`
  const secondBasis = `${(1 - node.weight) * 100}%`
  return (
    <Box flexDirection={node.direction} flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
      <Box flexDirection="column" flexGrow={0} flexShrink={1} flexBasis={firstBasis} minHeight={0} minWidth={0}>
        <NodeRenderer
          node={node.children[0]}
          path={[...path, 0]}
          draggingPath={draggingPath}
          onDividerMouseDown={onDividerMouseDown}
          renderLeaf={renderLeaf}
        />
      </Box>
      <PaneDivider
        direction={node.direction}
        isDragging={isDragging}
        onMouseDown={(coord) => onDividerMouseDown(path, node.direction, contentSize, coord)}
      />
      <Box flexDirection="column" flexGrow={0} flexShrink={1} flexBasis={secondBasis} minHeight={0} minWidth={0}>
        <NodeRenderer
          node={node.children[1]}
          path={[...path, 1]}
          draggingPath={draggingPath}
          onDividerMouseDown={onDividerMouseDown}
          renderLeaf={renderLeaf}
        />
      </Box>
    </Box>
  )
}

/**
 * Single-cell divider between two split children. For a row split it's
 * a vertical column of `│`; for a column split it's a horizontal row of
 * `─`. Hover sets the resize mouse cursor; mousedown starts a drag the
 * PaneGrid wrapper tracks.
 */
function PaneDivider({
  direction,
  isDragging,
  onMouseDown,
}: {
  direction: SplitDirection
  isDragging: boolean
  onMouseDown: (coord: number) => void
}): React.ReactElement {
  const [hover, setHover] = useState(false)
  // Silvery's MouseCursorShape currently exposes the X11 set without
  // `col-resize` / `row-resize`. `move` is the closest available signal
  // ("you can drag this") — when the shape vocabulary grows, switch to
  // col-resize / row-resize accordingly. v1 used `move` for the row
  // case; we keep that here too.
  useMouseCursor(hover || isDragging ? "move" : null)
  const color = isDragging || hover ? "$accent" : "$border"
  if (direction === "row") {
    // Vertical divider — 1-col wide, full height.
    return (
      <Box
        flexShrink={0}
        flexGrow={0}
        flexBasis={DIVIDER_SIZE}
        width={DIVIDER_SIZE}
        flexDirection="column"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onMouseDown={(e) => onMouseDown(e.clientX)}
      >
        <Box flexGrow={1} flexShrink={1}>
          <Text color={color} wrap="wrap">
            {"│".repeat(200)}
          </Text>
        </Box>
      </Box>
    )
  }
  // Horizontal divider — 1-row tall, full width.
  return (
    <Box
      flexShrink={0}
      flexGrow={0}
      flexBasis={DIVIDER_SIZE}
      height={DIVIDER_SIZE}
      flexDirection="row"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(e) => onMouseDown(e.clientY)}
    >
      <Box flexGrow={1} flexShrink={1}>
        <Text color={color} wrap="wrap">
          {"─".repeat(400)}
        </Text>
      </Box>
    </Box>
  )
}

// ---------- helpers ----------

function pathEquals(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function nodeAtPath(node: LayoutNode, path: readonly number[]): LayoutNode | null {
  let cur: LayoutNode = node
  for (const idx of path) {
    if (cur.kind !== "split") return null
    cur = cur.children[idx === 0 ? 0 : 1]
  }
  return cur
}
