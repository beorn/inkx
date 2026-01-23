/**
 * Shared Memoized Components for Views
 *
 * These components are used across ListView, TabsView, and ColumnsView
 * to provide consistent, optimized rendering of cards and headers.
 */
import React, { useLayoutEffect } from "react";
import { Box, Text, useLayout } from "inkx";
import createDebug from "debug";

const debug = createDebug("km:tui:layout");
import type { CardState, ColumnState } from "../types.ts";
import type { KNode } from "@km/core";
import { TreeNode } from "./TreeNode.tsx";
import { getNodeDisplayName } from "../state.ts";
import { getOwnColor, getHeaderStyle, type BoardPill } from "../board-pills.ts";
import { getNodeIcon, renderPlain } from "../text/index.ts";
import { useLayoutRegistryOptional } from "../layout-context.tsx";

// =============================================================================
// Memoized Tree Card Component
// =============================================================================

export interface MemoizedTreeCardProps {
  card: CardState;
  colIndex: number;
  cardIndex: number;
  isSelected: boolean;
  /** Optional children to pass to TreeNode (pass [] to skip DB query) */
  children?: KNode[];
  /** Optional board pills callback for performance optimization */
  getBoardPills?: (node: KNode, excludeBoardIds: Set<string>) => BoardPill[];
}

/**
 * Memoized card wrapper for TreeNode - used by all list-style views.
 *
 * Key optimization: cursor movement only changes isSelected for 2 cards
 * (old selection and new selection). All other cards skip re-render.
 *
 * Registers card layout for cross-column navigation (h/l with sticky Y).
 */
export const MemoizedTreeCard = React.memo(function MemoizedTreeCard({
  card,
  colIndex,
  cardIndex,
  isSelected,
  children,
  getBoardPills,
}: MemoizedTreeCardProps): React.ReactElement {
  debug("MemoizedTreeCard render: col=%d card=%d id=%s", colIndex, cardIndex, card.node.id.slice(-8));
  return (
    <CardLayoutTracker
      nodeId={card.node.id}
      colIndex={colIndex}
      cardIndex={cardIndex}
    >
      <TreeNode
        node={card.node}
        depth={0}
        isSelected={isSelected}
        colIndex={colIndex}
        cardIndex={cardIndex}
        subIndex={0}
        children={children}
        getBoardPills={getBoardPills}
      />
    </CardLayoutTracker>
  );
}, (prev, next) => {
  return (
    prev.card.node.id === next.card.node.id &&
    prev.card.node.content === next.card.node.content &&
    prev.card.node.task_status === next.card.node.task_status &&
    prev.colIndex === next.colIndex &&
    prev.cardIndex === next.cardIndex &&
    prev.isSelected === next.isSelected &&
    prev.getBoardPills === next.getBoardPills
  );
});

// =============================================================================
// Card Layout Tracking
// =============================================================================

interface CardLayoutTrackerProps {
  nodeId: string;
  colIndex: number;
  cardIndex: number;
  children: React.ReactNode;
}

/**
 * Wrapper that tracks the card's layout and registers it with the registry.
 *
 * Uses a two-component pattern:
 * 1. Outer Box creates a NodeContext that children can read
 * 2. Inner LayoutReporter reads that context and registers the position
 *
 * Only renders LayoutReporter if a registry is available (i.e., inside LayoutProvider).
 * Tests that don't set up a registry will skip layout tracking.
 */
function CardLayoutTracker({
  nodeId,
  colIndex,
  cardIndex,
  children,
}: CardLayoutTrackerProps): React.ReactElement {
  const registry = useLayoutRegistryOptional();

  // If no registry, just render children without tracking
  if (!registry) {
    return <>{children}</>;
  }

  return (
    <Box flexDirection="column">
      <LayoutReporter nodeId={nodeId} colIndex={colIndex} cardIndex={cardIndex} />
      {children}
    </Box>
  );
}

/**
 * Inner component that reads layout from parent's NodeContext
 * and registers it with the layout registry.
 */
function LayoutReporter({
  nodeId,
  colIndex,
  cardIndex,
}: {
  nodeId: string;
  colIndex: number;
  cardIndex: number;
}): React.ReactElement {
  const registry = useLayoutRegistryOptional();
  const layout = useLayout();

  useLayoutEffect(() => {
    // Only register if we have a registry (tests may not provide one)
    if (!registry) return;

    // Register with full layout info
    // Note: headHeight = 1 (title line), cardHeight = full height including children
    registry.registerCard(colIndex, cardIndex, nodeId, {
      x: layout.x,
      y: layout.y,
      headHeight: 1, // Title is always 1 line
      headWidth: layout.width,
      cardHeight: layout.height,
      cardWidth: layout.width,
    });
    debug(
      "registered: col=%d card=%d id=%s y=%d h=%d",
      colIndex,
      cardIndex,
      nodeId.slice(-8),
      layout.y,
      layout.height,
    );
  }, [registry, colIndex, cardIndex, nodeId, layout.x, layout.y, layout.width, layout.height]);

  // Render empty text so component participates in inkx rendering
  return <Text>{""}</Text>;
}

// =============================================================================
// Memoized Column Header Component
// =============================================================================

export interface MemoizedColumnHeaderProps {
  column: ColumnState;
  colIdx: number;
  isSelected: boolean;
  isColSelected: boolean;
  width: number;
  /** Show blank line above (for list view, not first header) */
  showTopSpacer?: boolean;
  /** Show separator line below header */
  showSeparator?: boolean;
}

/**
 * Memoized column header - used by ListView and ColumnsView.
 */
export const MemoizedColumnHeader = React.memo(function MemoizedColumnHeader({
  column,
  colIdx,
  isSelected,
  isColSelected,
  width,
  showTopSpacer = false,
  showSeparator = true,
}: MemoizedColumnHeaderProps): React.ReactElement {
  const ownColor = getOwnColor(column.node);
  const headerStyle = getHeaderStyle(ownColor, isSelected, isColSelected);

  // Get consistent bullet icon using getNodeIcon (same rules as TreeNode)
  const icon = getNodeIcon(null, ownColor, false);
  const iconColor = isColSelected ? "black" : icon.color;

  // Render header with wiki links stripped: [[target|alias]] → "alias"
  const headerText = renderPlain(getNodeDisplayName(column.node));
  const countText = ` (${column.cards.length})`;
  // Calculate padding to fill full width: " [icon] headerText countText" = 3 + headerText + countText
  const headerContentLen = 3 + headerText.length + countText.length;
  const headerPadding = " ".repeat(Math.max(0, width - headerContentLen));

  return (
    <Box flexDirection="column" width={width}>
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
          <Text color={iconColor}>{icon.char}</Text>
          {" "}
          {headerText}
          <Text color={isColSelected ? "gray" : undefined} dimColor={!isColSelected}>{countText}</Text>
          {headerPadding}
        </Text>
      </Box>
      {showSeparator && (
        <Box width={width}>
          <Text dimColor>{"─".repeat(width)}</Text>
        </Box>
      )}
    </Box>
  );
}, (prev, next) => {
  return (
    prev.column.node.id === next.column.node.id &&
    prev.column.cards.length === next.column.cards.length &&
    prev.colIdx === next.colIdx &&
    prev.isSelected === next.isSelected &&
    prev.isColSelected === next.isColSelected &&
    prev.width === next.width &&
    prev.showTopSpacer === next.showTopSpacer &&
    prev.showSeparator === next.showSeparator
  );
});
