/**
 * WorkspaceView — renders the workspace layout tree.
 *
 * For a single pane, renders children directly (no wrapper overhead).
 * For multiple panes, recursively splits using flexbox, with divider lines.
 * Each pane shows a number label: [1], [2], [1d] (detail linked to pane 1).
 */

import React from "react"
import { Box, Text } from "inkx"
import type { LayoutNode, PaneState } from "../board-types.ts"
import { getLayoutPaneIds } from "../layout-helpers.ts"
import { EmptyPaneWelcome } from "./EmptyPaneWelcome.tsx"

export interface WorkspaceViewProps {
  layout: LayoutNode
  panes: Map<string, PaneState>
  focusedPaneId: string
  /** Render a pane's board content, receiving the pane ID for state isolation */
  renderPane: (paneId: string) => React.ReactNode
  /** Called when a pane is clicked (for click-to-focus) */
  onPaneClick?: (paneId: string) => void
}

/**
 * Derive display labels for panes based on layout tab order.
 *
 * Top-level panes (board/empty) get sequential numbers: [1], [2], [3]
 * Detail panes get their parent's number + "d": [1d], [2d]
 */
function derivePaneLabels(layout: LayoutNode, panes: Map<string, PaneState>): Map<string, string> {
  const labels = new Map<string, string>()
  const tabOrder = getLayoutPaneIds(layout)
  let boardNumber = 0

  for (const paneId of tabOrder) {
    const pane = panes.get(paneId)
    if (!pane) continue

    if (pane.viewType === "detail") {
      // Detail pane — find parent board pane's number
      // Convention: detail pane IDs end with "-detail" (e.g., "main-detail", "pane-2-detail")
      const parentId = paneId.replace(/-detail$/, "")
      const parentLabel = labels.get(parentId)
      if (parentLabel) {
        labels.set(paneId, `${parentLabel}d`)
      } else {
        // Fallback: use current count
        labels.set(paneId, `${boardNumber}d`)
      }
    } else {
      // Board or empty pane — assign next number
      boardNumber++
      labels.set(paneId, `${boardNumber}`)
    }
  }

  return labels
}

/**
 * Render the workspace layout.
 *
 * - Single pane: renders board directly, no wrapper
 * - Multiple panes: recursive split layout with divider lines
 */
export function WorkspaceView({
  layout,
  panes,
  focusedPaneId,
  renderPane,
  onPaneClick,
}: WorkspaceViewProps): React.ReactElement {
  // Single pane (the common case) — render board directly, no overhead
  if (layout.type === "leaf" && panes.size <= 1) {
    return <>{renderPane(layout.paneId)}</>
  }

  const paneLabels = derivePaneLabels(layout, panes)

  return (
    <Box flexGrow={1}>
      <LayoutNodeView
        node={layout}
        panes={panes}
        focusedPaneId={focusedPaneId}
        paneLabels={paneLabels}
        renderPane={renderPane}
        onPaneClick={onPaneClick}
      />
    </Box>
  )
}

/** Recursive layout node renderer */
function LayoutNodeView({
  node,
  panes,
  focusedPaneId,
  paneLabels,
  renderPane,
  onPaneClick,
}: {
  node: LayoutNode
  panes: Map<string, PaneState>
  focusedPaneId: string
  paneLabels: Map<string, string>
  renderPane: (paneId: string) => React.ReactNode
  onPaneClick?: (paneId: string) => void
}): React.ReactElement {
  if (node.type === "leaf") {
    const pane = panes.get(node.paneId)
    if (!pane) {
      return (
        <Box flexGrow={1}>
          <Text>Missing pane: {node.paneId}</Text>
        </Box>
      )
    }

    const isFocused = node.paneId === focusedPaneId
    const borderColor = isFocused ? "green" : "gray"
    const label = paneLabels.get(node.paneId)

    // For multi-pane layouts, wrap each pane in a bordered box with number label
    return (
      <Box
        flexGrow={1}
        flexDirection="column"
        borderStyle="single"
        borderColor={borderColor}
        onMouseDown={() => onPaneClick?.(node.paneId)}
      >
        {label && (
          <Box>
            <Text color={borderColor} bold={isFocused}>
              [{label}]
            </Text>
            {pane.viewType === "empty" && <Text dimColor> empty</Text>}
          </Box>
        )}
        <Box flexGrow={1} flexDirection="column">
          {pane.viewType === "board" ? renderPane(node.paneId) : <EmptyPaneWelcome />}
        </Box>
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
          paneLabels={paneLabels}
          renderPane={renderPane}
          onPaneClick={onPaneClick}
        />
      </Box>
      <Box flexBasis={secondBasis} flexGrow={0} flexShrink={0} flexDirection="column">
        <LayoutNodeView
          node={node.right}
          panes={panes}
          focusedPaneId={focusedPaneId}
          paneLabels={paneLabels}
          renderPane={renderPane}
          onPaneClick={onPaneClick}
        />
      </Box>
    </Box>
  )
}
