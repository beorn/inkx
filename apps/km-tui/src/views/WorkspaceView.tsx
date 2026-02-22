/**
 * WorkspaceView — renders the workspace layout tree.
 *
 * For a single pane, renders children directly (no wrapper overhead).
 * For multiple panes, recursively splits using flexbox, with divider lines.
 */

import React from "react"
import { Box, Text } from "inkx"
import type { LayoutNode, PaneState } from "../board-types.ts"
import { EmptyPaneWelcome } from "./EmptyPaneWelcome.tsx"

export interface WorkspaceViewProps {
  layout: LayoutNode
  panes: Map<string, PaneState>
  focusedPaneId: string
  /** Render the board content (the main pane view) */
  renderBoard: () => React.ReactNode
}

/**
 * Render the workspace layout.
 *
 * - Single pane: renders board directly, no wrapper
 * - Multiple panes: recursive split layout with divider lines
 */
export function WorkspaceView({ layout, panes, focusedPaneId, renderBoard }: WorkspaceViewProps): React.ReactElement {
  // Single pane (the common case) — render board directly, no overhead
  if (layout.type === "leaf" && panes.size <= 1) {
    return <>{renderBoard()}</>
  }

  return (
    <Box flexGrow={1}>
      <LayoutNodeView
        node={layout}
        panes={panes}
        focusedPaneId={focusedPaneId}
        renderBoard={renderBoard}
      />
    </Box>
  )
}

/** Recursive layout node renderer */
function LayoutNodeView({
  node,
  panes,
  focusedPaneId,
  renderBoard,
}: {
  node: LayoutNode
  panes: Map<string, PaneState>
  focusedPaneId: string
  renderBoard: () => React.ReactNode
}): React.ReactElement {
  if (node.type === "leaf") {
    const pane = panes.get(node.paneId)
    if (!pane) return <Box flexGrow={1}><Text>Missing pane: {node.paneId}</Text></Box>

    const isFocused = node.paneId === focusedPaneId
    const borderColor = isFocused ? "green" : "gray"

    // For multi-pane layouts, wrap each pane in a bordered box
    return (
      <Box flexGrow={1} flexDirection="column" borderStyle="single" borderColor={borderColor}>
        {pane.viewType === "board" ? renderBoard() : <EmptyPaneWelcome />}
      </Box>
    )
  }

  // Split node — render children side by side (h) or stacked (v)
  const flexDirection = node.direction === "h" ? "row" : "column"
  const firstBasis = `${Math.round(node.ratio * 100)}%`
  const secondBasis = `${Math.round((1 - node.ratio) * 100)}%`

  return (
    <Box flexGrow={1} flexDirection={flexDirection}>
      <Box flexBasis={firstBasis} flexGrow={0} flexShrink={0} flexDirection="column">
        <LayoutNodeView
          node={node.left}
          panes={panes}
          focusedPaneId={focusedPaneId}
          renderBoard={renderBoard}
        />
      </Box>
      <Box flexBasis={secondBasis} flexGrow={0} flexShrink={0} flexDirection="column">
        <LayoutNodeView
          node={node.right}
          panes={panes}
          focusedPaneId={focusedPaneId}
          renderBoard={renderBoard}
        />
      </Box>
    </Box>
  )
}
