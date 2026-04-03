/**
 * WorkspaceView — renders the workspace layout tree.
 *
 * For a single pane, renders board directly with PaneBar above.
 * For multiple panes, recursively splits using flexGrow based on split ratios.
 * Only vertical (side-by-side) splits are supported; horizontal splits are not yet implemented.
 *
 * Pane chrome: each pane has a PaneBar (colored top bar). No outer borders —
 * only a vertical separator between adjacent panes.
 */

import React, { useMemo } from "react"
import { Box, Text, useTheme } from "@silvery/ag-react"
import { ownerPaneId, isDetailViewPane, type LayoutNode, type PaneState } from "../board/board-types.ts"
import { getLayoutPaneIds } from "../layout-helpers.ts"
import { PaneLabelProvider } from "../pane-context.tsx"
import { deriveUnfocusedTheme } from "../theme.ts"
import { EmptyPaneWelcome } from "./EmptyPaneWelcome.tsx"
import { PaneBar } from "./PaneBar.tsx"

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

    if (isDetailViewPane(pane)) {
      // Detail pane — find parent board pane's number via ownerPaneId()
      const parentId = ownerPaneId(paneId)
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
 * - Multiple panes: recursive split layout with vertical separator
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
    <Box flexGrow={1} flexDirection="column" overflow="hidden">
      <LayoutNodeView
        node={layout}
        panes={panes}
        focusedPaneId={focusedPaneId}
        paneLabels={paneLabels}
        renderPane={renderPane}
        onPaneClick={onPaneClick}
        isLeftChild={true}
      />
    </Box>
  )
}

/**
 * PaneTitleBar — top bar for non-board panes (detail, empty).
 *
 * Uses shared PaneBar for consistent styling with board panes.
 * Shows the pane type on the left and [N] indicator on the right.
 */
function PaneTitleBar({
  label,
  suffix,
  isFocused,
}: {
  label: string | undefined
  suffix?: string
  isFocused: boolean
}): React.ReactElement {
  return (
    <PaneBar
      isFocused={isFocused}
      paneLabel={label ?? "?"}
      left={
        <Text bold={isFocused} wrap="truncate">
          {suffix || "Pane"}
        </Text>
      }
    />
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
  isLeftChild: _isLeftChild,
}: {
  node: LayoutNode
  panes: Map<string, PaneState>
  focusedPaneId: string
  paneLabels: Map<string, string>
  renderPane: (paneId: string) => React.ReactNode
  onPaneClick?: (paneId: string) => void
  isLeftChild: boolean
}): React.ReactElement {
  if (node.type === "leaf") {
    const pane = panes.get(node.paneId)
    const isFocused = node.paneId === focusedPaneId
    const label = paneLabels.get(node.paneId)
    const theme = useTheme()
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const paneTheme = useMemo(() => (isFocused ? undefined : deriveUnfocusedTheme(theme)), [isFocused, theme])

    if (!pane) {
      return (
        <Box flexGrow={1} flexDirection="column">
          <Text>Missing pane: {node.paneId}</Text>
        </Box>
      )
    }

    const isBoard = pane.viewType === "board"
    const labelSuffix = pane.viewType === "empty" ? "Empty" : ""

    return (
      <Box
        flexGrow={1}
        flexDirection="column"
        color={isFocused ? undefined : "$fg"}
        focusScope
        testID={node.paneId}
        theme={paneTheme}
        onMouseDown={() => onPaneClick?.(node.paneId)}
      >
        {/* Board panes (including detail): Board renders its own PaneBar */}
        {/* Empty panes: PaneTitleBar provides the top bar */}
        {!isBoard && <PaneTitleBar label={label} suffix={labelSuffix} isFocused={isFocused} />}
        <Box flexGrow={1} flexDirection="column">
          {isBoard ? (
            <PaneLabelProvider value={label ?? "?"}>{renderPane(node.paneId)}</PaneLabelProvider>
          ) : (
            <EmptyPaneWelcome />
          )}
        </Box>
      </Box>
    )
  }

  // Split node — only vertical (side-by-side) splits supported
  const leftGrow = Math.round(node.ratio * 100)
  const rightGrow = 100 - leftGrow

  return (
    <Box flexGrow={1} flexDirection="row">
      <Box flexGrow={leftGrow} flexBasis={0} flexDirection="column">
        <LayoutNodeView
          node={node.left}
          panes={panes}
          focusedPaneId={focusedPaneId}
          paneLabels={paneLabels}
          renderPane={renderPane}
          onPaneClick={onPaneClick}
          isLeftChild={true}
        />
      </Box>
      {/* Vertical separator between panes */}
      <Box flexShrink={0} flexDirection="column">
        <PaneSeparator />
      </Box>
      <Box flexGrow={rightGrow} flexBasis={0} flexDirection="column">
        <LayoutNodeView
          node={node.right}
          panes={panes}
          focusedPaneId={focusedPaneId}
          paneLabels={paneLabels}
          renderPane={renderPane}
          onPaneClick={onPaneClick}
          isLeftChild={false}
        />
      </Box>
    </Box>
  )
}

/** Vertical separator between adjacent panes — a single │ column */
function PaneSeparator(): React.ReactElement {
  const SEPARATOR_FILL = "│\n".repeat(200)
  return (
    <Box flexGrow={1} flexDirection="column" overflow="hidden">
      <Text dimColor>{SEPARATOR_FILL}</Text>
    </Box>
  )
}
