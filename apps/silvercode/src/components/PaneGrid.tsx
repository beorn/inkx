/**
 * PaneGrid — 2D binary-split tree of session panes, separated by a single
 * column / row of divider glyphs per gap. Owns the layout tree state +
 * drag-resize logic.
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
 * Zoom: when `zoomedPaneId` is set, the grid renders ONLY that pane
 * full-area with no dividers. Toggle via the Ctrl+W z chord wired in
 * App.tsx.
 *
 * Keybindings (in App.tsx, this component is presentation):
 *   Ctrl+W v  — vertical split (row split)
 *   Ctrl+W s  — horizontal split (column split)
 *   Ctrl+W x  — close current pane
 *   Ctrl+W z  — zoom toggle
 *   Ctrl+N    — cycle focus (left-to-right reading order via leafIds)
 */

import React, { useCallback, useMemo, useRef, useState } from "react"
import { Box, Text, useBoxRect, useMouseCursor } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { type LayoutNode, type LayoutSplit, type SplitDirection, savePanes, setSplitWeight } from "../pane-layout.ts"
import { SessionCard } from "./SessionCard.tsx"

/** Width of a single divider column / row in cells. */
const DIVIDER_SIZE = 1

export type PaneGridProps = {
  sessions: ReadonlyArray<SessionHandle>
  focusedSessionId: string
  zoomedPaneId: string | null
  /** Layout tree — owned by the parent (App) so split chords can edit it. */
  tree: LayoutNode
  /** Drag-resize emits a new tree here; App persists + re-renders. */
  onTreeChange: (next: LayoutNode) => void
  /** Per-vault root for `.silvercode/panes.json` — persistence on drag-end. */
  cwd: string
  onFocusSession: (id: string) => void
  onApprovePermission: (sessionId: string, requestId: string) => void
  onDenyPermission: (sessionId: string, requestId: string) => void
}

type DragState = {
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

export function PaneGrid(props: PaneGridProps): React.ReactElement {
  const { sessions, focusedSessionId, zoomedPaneId, cwd, onFocusSession, tree, onTreeChange } = props

  const dragRef = useRef<DragState | null>(null)
  const [, forceRender] = useState(0)

  // Keep a ref to the latest tree so the drag-end persist sees the
  // mid-drag value (state setter from onMouseMove is asynchronous).
  const treeRef = useRef(tree)
  treeRef.current = tree

  const sessionMap = useMemo(() => new Map(sessions.map((s) => [s.id, s] as const)), [sessions])

  const handleDividerMouseDown = useCallback(
    (path: readonly number[], direction: SplitDirection, parentContentSize: number, startCoord: number) => {
      const split = nodeAtPath(treeRef.current, path)
      if (split?.kind !== "split") return
      dragRef.current = {
        path,
        parentContentSize: Math.max(1, parentContentSize),
        startWeight: split.weight,
        startCoord,
        direction,
      }
      forceRender((n) => n + 1)
    },
    [],
  )

  const handleWrapperMouseMove = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current
      if (!drag) return
      const coord = drag.direction === "row" ? clientX : clientY
      const delta = coord - drag.startCoord
      const ratioDelta = delta / drag.parentContentSize
      const next = drag.startWeight + ratioDelta
      onTreeChange(setSplitWeight(treeRef.current, drag.path, next))
    },
    [onTreeChange],
  )

  const handleWrapperMouseUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    savePanes(cwd, treeRef.current)
    forceRender((n) => n + 1)
  }, [cwd])

  const renderLeafFn = useCallback(
    (sessionId: string): React.ReactElement => {
      const handle = sessionMap.get(sessionId)
      if (!handle) {
        // Defensive: tree has a leaf for a session that's gone. Render
        // an empty placeholder so the layout stays stable until the
        // reconcile effect drops the leaf on the next render.
        return <Box flexGrow={1} flexShrink={1} minHeight={0} minWidth={0} />
      }
      return (
        <SessionCard
          handle={handle}
          isFocused={handle.id === focusedSessionId}
          onFocus={() => onFocusSession(handle.id)}
          onApprove={(rid) => props.onApprovePermission(handle.id, rid)}
          onDeny={(rid) => props.onDenyPermission(handle.id, rid)}
        />
      )
    },
    [sessionMap, focusedSessionId, onFocusSession, props],
  )

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
        draggingPath={dragRef.current?.path ?? null}
        onDividerMouseDown={handleDividerMouseDown}
        renderLeaf={renderLeafFn}
      />
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
