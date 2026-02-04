/**
 * Shared Memoized Components for Views
 *
 * These components are used across ListView, TabsView, and ColumnsView
 * to provide consistent, optimized rendering of cards and headers.
 */
import React, { useCallback } from "react"
import { Box, Text, useContentRectCallback } from "inkx"
import { createConditionalLogger } from "@beorn/logger"

const log = createConditionalLogger("km:tui:layout")
import type { CardState, ColumnState } from "../types.ts"
import type { KNode } from "@km/core"
import { TreeNode } from "./TreeNode.tsx"
import { getNodeDisplayName } from "../state.ts"
import { getOwnColor, getHeaderStyle, type BoardPill } from "../board-pills.ts"
import { getNodeIcon, renderPlain } from "../text/index.ts"
import { useLayoutRegistryOptional } from "../layout-context.tsx"
import { useRepo } from "../repo-context.tsx"

// =============================================================================
// Memoized Tree Card Component
// =============================================================================

interface MemoizedTreeCardProps {
  card: CardState
  colIndex: number
  cardIndex: number
  isSelected: boolean
  /** Optional children to pass to TreeNode (pass [] to skip DB query) */
  children?: KNode[]
  /** Optional board pills callback for performance optimization */
  getBoardPills?: (node: KNode, excludeBoardIds: Set<string>) => BoardPill[]
}

/**
 * Memoized card wrapper for TreeNode - used by all list-style views.
 *
 * Key optimization: cursor movement only changes isSelected for 2 cards
 * (old selection and new selection). All other cards skip re-render.
 *
 * Registers card layout for cross-column navigation (h/l with sticky Y).
 */
export const MemoizedTreeCard = React.memo(
  function MemoizedTreeCard({
    card,
    colIndex,
    cardIndex,
    isSelected,
    children,
    getBoardPills,
  }: MemoizedTreeCardProps): React.ReactElement {
    // Count renders for profiling
    const g = globalThis as unknown as Record<string, number>
    g.__memoizedTreeCardRenderCount = (g.__memoizedTreeCardRenderCount ?? 0) + 1
    log.debug?.(
      `MemoizedTreeCard render: col=${colIndex} card=${cardIndex} id=${card.node.id.slice(-8)}`,
    )
    return (
      <CardLayoutTracker
        nodeId={card.node.id}
        colIndex={colIndex}
        cardIndex={cardIndex}
        isSelected={isSelected}
      >
        <TreeNode
          node={card.node}
          depth={0}
          isSelected={isSelected}
          colIndex={colIndex}
          cardIndex={cardIndex}
          subIndex={0}
          children={children}
          childCount={card.childCount}
          getBoardPills={getBoardPills}
        />
      </CardLayoutTracker>
    )
  },
  (prev, next) => {
    return (
      prev.card.node.id === next.card.node.id &&
      prev.card.node.content === next.card.node.content &&
      prev.card.node.task_status === next.card.node.task_status &&
      prev.colIndex === next.colIndex &&
      prev.cardIndex === next.cardIndex &&
      prev.isSelected === next.isSelected &&
      prev.getBoardPills === next.getBoardPills
    )
  },
)

// =============================================================================
// Card Layout Tracking
// =============================================================================

interface CardLayoutTrackerProps {
  nodeId: string
  colIndex: number
  cardIndex: number
  isSelected: boolean
  children: React.ReactNode
}

/**
 * Wrapper that tracks the card's layout and registers it with the registry.
 *
 * Uses useContentRectCallback to register measured positions without causing re-renders.
 * This avoids the blank screen issue with useLayout() + many cards.
 */
function CardLayoutTracker({
  nodeId,
  colIndex,
  cardIndex,
  isSelected: _isSelected,
  children,
}: CardLayoutTrackerProps): React.ReactElement {
  const registry = useLayoutRegistryOptional()

  // Register measured position after layout - no re-renders
  const handleLayout = useCallback(
    (computed: { x: number; y: number; width: number; height: number }) => {
      if (!registry) return

      // Use measured dimensions directly from inkx layout
      registry.registerCard(colIndex, cardIndex, nodeId, {
        x: computed.x,
        y: computed.y,
        cardWidth: computed.width,
        cardHeight: computed.height,
      })
      log.debug?.(
        `registered: col=${colIndex} card=${cardIndex} id=${nodeId.slice(-8)} y=${computed.y} h=${computed.height}`,
      )
    },
    [registry, colIndex, cardIndex, nodeId],
  )

  useContentRectCallback(handleLayout)

  return (
    <Box
      flexDirection="column"
      id={nodeId}
      data-view="card"
      // Note: data-cursor is set by TreeNode, not here, to avoid duplicates
    >
      {children}
    </Box>
  )
}

// =============================================================================
// Memoized Column Header Component
// =============================================================================

interface MemoizedColumnHeaderProps {
  column: ColumnState
  colIdx: number
  isSelected: boolean
  isColSelected: boolean
  width: number
  /** Show blank line above (for list view, not first header) */
  showTopSpacer?: boolean
  /** Show separator line below header */
  showSeparator?: boolean
}

/**
 * Memoized column header - used by ListView and ColumnsView.
 */
export const MemoizedColumnHeader = React.memo(
  function MemoizedColumnHeader({
    column,
    colIdx,
    isSelected,
    isColSelected,
    width,
    showTopSpacer = false,
    showSeparator = true,
  }: MemoizedColumnHeaderProps): React.ReactElement {
    const repo = useRepo()
    const ownColor = getOwnColor(column.node)
    const headerStyle = getHeaderStyle(ownColor, isSelected, isColSelected)

    // Get consistent bullet icon using getNodeIcon (same rules as TreeNode)
    const icon = getNodeIcon(null, ownColor, false)
    const iconColor = isColSelected ? "black" : icon.color

    // Render header with wiki links stripped: [[target|alias]] → "alias"
    const headerText = renderPlain(getNodeDisplayName(repo, column.node))
    const countText = ` (${column.cards.length})`
    // Calculate padding to fill full width: " [icon] headerText countText" = 3 + headerText + countText
    const headerContentLen = 3 + headerText.length + countText.length
    const headerPadding = " ".repeat(Math.max(0, width - headerContentLen))

    return (
      <Box
        flexDirection="column"
        width={width}
        id={column.node.id}
        {...(isColSelected && {
          "data-cursor": true,
          "data-col-index": colIdx,
          "data-card-index": -1,
        })}
      >
        {/* Blank line above (except first header in list view) */}
        {showTopSpacer && (
          <Box height={1}>
            <Text> </Text>
          </Box>
        )}
        <Box width={width}>
          <Text
            bold
            color={headerStyle.color}
            dimColor={headerStyle.dimColor}
            backgroundColor={headerStyle.backgroundColor}
            wrap="truncate"
          >
            {" "}
            <Text color={iconColor}>{icon.char}</Text> {headerText}
            <Text
              color={isColSelected ? "gray" : undefined}
              dimColor={!isColSelected}
            >
              {countText}
            </Text>
            {headerPadding}
          </Text>
        </Box>
        {showSeparator && (
          <Box width={width}>
            <Text dimColor>{"─".repeat(width)}</Text>
          </Box>
        )}
      </Box>
    )
  },
  (prev, next) => {
    return (
      prev.column.node.id === next.column.node.id &&
      prev.column.cards.length === next.column.cards.length &&
      prev.colIdx === next.colIdx &&
      prev.isSelected === next.isSelected &&
      prev.isColSelected === next.isColSelected &&
      prev.width === next.width &&
      prev.showTopSpacer === next.showTopSpacer &&
      prev.showSeparator === next.showSeparator
    )
  },
)

// =============================================================================
// Modal Dialog Component
// =============================================================================

export interface ModalDialogProps {
  /** Border color (default: cyan) */
  borderColor?: string
  /** Dialog title (rendered bold in borderColor) */
  title?: string
  /** Dialog width */
  width?: number
  /** Dialog height (optional, omit for auto-height) */
  height?: number
  /** Footer hint text (rendered dimColor at bottom) */
  footer?: React.ReactNode
  /** Dialog children */
  children: React.ReactNode
}

/**
 * Reusable modal dialog with consistent styling.
 *
 * Features:
 * - Solid black background (covers board content)
 * - Double border in cyan (configurable)
 * - Horizontal padding (2), vertical padding (1)
 * - Optional title and footer with spacing
 */
export function ModalDialog({
  borderColor = "cyan",
  title,
  width,
  height,
  footer,
  children,
}: ModalDialogProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="double"
      borderColor={borderColor}
      backgroundColor="black"
      paddingX={2}
      paddingY={1}
    >
      {title && (
        <Text color={borderColor} bold>
          {title}
        </Text>
      )}
      {children}
      {footer &&
        (typeof footer === "string" ? <Text dimColor>{footer}</Text> : footer)}
    </Box>
  )
}
