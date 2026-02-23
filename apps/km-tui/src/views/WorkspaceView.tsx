/**
 * WorkspaceView — renders the workspace layout tree.
 *
 * For a single pane, renders children directly (no wrapper overhead).
 * For multiple panes, recursively splits using explicit pixel widths/heights.
 * Each pane shows a number label: [1], [2], [1d] (detail linked to pane 1).
 *
 * Note: flexx does not support percentage flexBasis, so we compute explicit
 * pixel dimensions from the split ratio and available space.
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
  /** Available width in columns for the workspace */
  width: number
  /** Available height in rows for the workspace */
  height: number
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
  width,
  height,
  renderPane,
  onPaneClick,
}: WorkspaceViewProps): React.ReactElement {
  // Single pane (the common case) — render board directly, no overhead
  if (layout.type === "leaf" && panes.size <= 1) {
    return <>{renderPane(layout.paneId)}</>
  }

  const paneLabels = derivePaneLabels(layout, panes)

  return (
    <Box width={width} height={height}>
      <LayoutNodeView
        node={layout}
        panes={panes}
        focusedPaneId={focusedPaneId}
        paneLabels={paneLabels}
        width={width}
        height={height}
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
  width,
  height,
  renderPane,
  onPaneClick,
}: {
  node: LayoutNode
  panes: Map<string, PaneState>
  focusedPaneId: string
  paneLabels: Map<string, string>
  width: number
  height: number
  renderPane: (paneId: string) => React.ReactNode
  onPaneClick?: (paneId: string) => void
}): React.ReactElement {
  if (node.type === "leaf") {
    const pane = panes.get(node.paneId)
    if (!pane) {
      return (
        <Box width={width} height={height}>
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
        width={width}
        height={height}
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

  // Split node — compute pixel sizes from ratio and available space.
  // For horizontal splits, divide width; for vertical, divide height.
  const isHorizontal = node.direction === "h"
  const firstWidth = isHorizontal ? Math.floor(width * node.ratio) : width
  const secondWidth = isHorizontal ? width - firstWidth : width
  const firstHeight = isHorizontal ? height : Math.floor(height * node.ratio)
  const secondHeight = isHorizontal ? height : height - firstHeight

  return (
    <Box width={width} height={height} flexDirection={isHorizontal ? "row" : "column"}>
      <Box width={firstWidth} height={firstHeight} flexDirection="column">
        <LayoutNodeView
          node={node.left}
          panes={panes}
          focusedPaneId={focusedPaneId}
          paneLabels={paneLabels}
          width={firstWidth}
          height={firstHeight}
          renderPane={renderPane}
          onPaneClick={onPaneClick}
        />
      </Box>
      <Box width={secondWidth} height={secondHeight} flexDirection="column">
        <LayoutNodeView
          node={node.right}
          panes={panes}
          focusedPaneId={focusedPaneId}
          paneLabels={paneLabels}
          width={secondWidth}
          height={secondHeight}
          renderPane={renderPane}
          onPaneClick={onPaneClick}
        />
      </Box>
    </Box>
  )
}
