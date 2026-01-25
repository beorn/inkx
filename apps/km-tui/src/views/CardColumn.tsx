/**
 * Card and Column components for the Board view
 *
 * Uses inkx overflow="scroll" for native scrolling support.
 * Implements React-level virtualization for large card lists.
 */
import React, { useCallback, useMemo, useRef } from "react";
import createDebug from "debug";
import { useVault } from "../vault-context.tsx";
import { Box, Text, useScreenRectCallback } from "inkx";
import { styledUnderline } from "@beorn/chalkx";
import type { CardState, ColumnState } from "../types.ts";
import { getNodeDisplayName, getCollapsedTypeSuffix } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";
import { TreeNode } from "./TreeNode.tsx";
import { getNodeIcon, renderPlain } from "../text/index.ts";
import { useLayoutRegistryOptional } from "../layout-context.tsx";
import type { NodeLayout } from "../card-positions.ts";

const debug = createDebug("km:tui:card-layout");

// =============================================================================
// Virtualization
// =============================================================================

// Approximate card height (border + content + padding)
// Used to calculate which cards to render
const ESTIMATED_CARD_HEIGHT = 4;

// Number of extra cards to render above and below visible area
// This provides smooth scrolling without visible gaps
// Increased from 5 to 15 to prevent blank rendering during scroll
// when edge-based scrolling preserves offset near window boundaries
const OVERSCAN = 15;

// Maximum number of cards to render at once
// Beyond this, use placeholder to avoid overwhelming React
const MAX_RENDERED_CARDS = 50;

// =============================================================================
// Card Component
// =============================================================================

export interface CardProps {
  card: CardState;
  isSelected: boolean;
  selectedSubIndex: number;
  width: number;
  colIndex: number;
  cardIndex: number;
  /** True if this card is in a virtual body column (renders borderless) */
  isVirtualColumn?: boolean;
}

/**
 * Memoized Card - skips re-render when props are unchanged.
 *
 * Key optimization: cursor movement only changes isSelected for 2 cards
 * (old selection and new selection). All other cards should skip re-render.
 *
 * Layout registration: Uses useScreenRectCallback to register screen positions
 * without causing re-renders. This enables h/l visual navigation across
 * columns with different scroll positions.
 */
/**
 * Helper component that registers the Card's screen position.
 * Must be rendered INSIDE the Card's Box to get the correct node context.
 */
function CardLayoutRegistrar({
  colIndex,
  cardIndex,
  nodeId,
}: {
  colIndex: number;
  cardIndex: number;
  nodeId: string;
}): null {
  const registry = useLayoutRegistryOptional();

  const handleLayout = useCallback(
    (computed: { x: number; y: number; width: number; height: number }) => {
      if (!registry) {
        debug(
          "CardLayoutRegistrar: no registry for col=%d card=%d",
          colIndex,
          cardIndex,
        );
        return;
      }

      const layout: NodeLayout = {
        x: computed.x,
        y: computed.y,
        cardWidth: computed.width,
        cardHeight: computed.height,
      };

      debug(
        "CardLayoutRegistrar: col=%d card=%d y=%d h=%d",
        colIndex,
        cardIndex,
        computed.y,
        computed.height,
      );
      registry.registerCard(colIndex, cardIndex, nodeId, layout);
    },
    [registry, colIndex, cardIndex, nodeId],
  );

  useScreenRectCallback(handleLayout);

  return null;
}

export const Card = React.memo(
  function Card({
    card,
    isSelected,
    selectedSubIndex,
    width,
    colIndex,
    cardIndex,
    isVirtualColumn,
  }: CardProps): React.ReactElement {
    const nodeId = card.node.id;

    // Virtual body content renders borderless (inline body content)
    // This includes: cards in virtual columns OR individual virtual body cards
    if (isVirtualColumn || card.isVirtual) {
      return (
        <Box
          flexDirection="column"
          flexShrink={0}
          width={width}
          paddingLeft={1}
        >
          <CardLayoutRegistrar
            colIndex={colIndex}
            cardIndex={cardIndex}
            nodeId={nodeId}
          />
          <TreeNode
            node={card.node}
            depth={0}
            isSelected={false}
            colIndex={colIndex}
            cardIndex={cardIndex}
            subIndex={0}
            dimInactiveChildren={true}
          />
        </Box>
      );
    }

    return (
      <Box
        flexDirection="column"
        flexShrink={0}
        width={width}
        borderStyle="round"
        borderColor={isSelected ? "yellow" : "blackBright"}
      >
        <CardLayoutRegistrar
          colIndex={colIndex}
          cardIndex={cardIndex}
          nodeId={nodeId}
        />
        <TreeNode
          node={card.node}
          depth={0}
          isSelected={isSelected && selectedSubIndex === 0}
          colIndex={colIndex}
          cardIndex={cardIndex}
          subIndex={0}
          dimInactiveChildren={!isSelected}
        />
      </Box>
    );
  },
  (prev, next) => {
    // Fast equality check for Card props
    return (
      prev.card.node.id === next.card.node.id &&
      prev.card.node.content === next.card.node.content &&
      prev.card.node.task_status === next.card.node.task_status &&
      prev.isSelected === next.isSelected &&
      prev.selectedSubIndex === next.selectedSubIndex &&
      prev.width === next.width &&
      prev.colIndex === next.colIndex &&
      prev.cardIndex === next.cardIndex
    );
  },
);

// =============================================================================
// Edge-Based Scrolling
// =============================================================================

// Padding from edge before scrolling (in items)
// When cursor is within this many items of the edge, scroll to keep padding
const SCROLL_PADDING = 2;

/**
 * Calculate edge-based scroll offset.
 * Only scrolls when cursor approaches the edge of the visible area.
 *
 * @param selectedIndex - Currently selected item index
 * @param currentOffset - Current scroll offset (top visible item)
 * @param visibleCount - Number of items visible in viewport
 * @param totalCount - Total number of items
 * @returns New scroll offset
 */
function calcEdgeBasedScrollOffset(
  selectedIndex: number,
  currentOffset: number,
  visibleCount: number,
  totalCount: number,
): number {
  // If nothing to scroll, stay at 0
  if (totalCount <= visibleCount) return 0;

  // Calculate visible range
  const visibleStart = currentOffset;
  const visibleEnd = currentOffset + visibleCount - 1;

  // Check if selected is outside visible range (with padding)
  const paddedStart = visibleStart + SCROLL_PADDING;
  const paddedEnd = visibleEnd - SCROLL_PADDING;

  let newOffset = currentOffset;

  if (selectedIndex < paddedStart) {
    // Cursor is near/above top edge - scroll up
    // Place cursor at SCROLL_PADDING from top
    newOffset = Math.max(0, selectedIndex - SCROLL_PADDING);
  } else if (selectedIndex > paddedEnd) {
    // Cursor is near/below bottom edge - scroll down
    // Place cursor at SCROLL_PADDING from bottom
    newOffset = Math.min(
      totalCount - visibleCount,
      selectedIndex - visibleCount + SCROLL_PADDING + 1,
    );
  }

  // Clamp to valid range
  return Math.max(0, Math.min(newOffset, totalCount - visibleCount));
}

// =============================================================================
// Virtualized Card List Component
// =============================================================================

interface VirtualizedCardListProps {
  cards: CardState[];
  selectedCardIndex: number;
  selectedSubIndex: number;
  isSelected: boolean;
  selectionLevel: "board" | "column" | "card";
  width: number;
  height: number;
  colIndex: number;
  /** True if this is a virtual body column (cards render borderless) */
  isVirtualColumn?: boolean;
}

/**
 * Virtualized card list that only renders cards near the visible area.
 *
 * For large card lists (100+), rendering all cards causes significant
 * delays as React/Yoga must process every element. This component:
 * 1. Calculates which cards are likely visible based on height
 * 2. Renders only those cards plus a buffer (OVERSCAN)
 * 3. Uses placeholder elements to maintain scroll position
 * 4. Uses edge-based scrolling (only scrolls when cursor approaches edge)
 */
function VirtualizedCardList({
  cards,
  selectedCardIndex,
  selectedSubIndex,
  isSelected,
  selectionLevel,
  width,
  height,
  colIndex,
  isVirtualColumn,
}: VirtualizedCardListProps): React.ReactElement {
  // Track scroll offset for edge-based scrolling
  // Using ref to persist across renders without causing re-renders
  const scrollOffsetRef = useRef(0);

  // Calculate how many cards fit in the viewport
  const visibleCardCount = Math.max(
    1,
    Math.floor(height / ESTIMATED_CARD_HEIGHT),
  );

  // Calculate edge-based scroll offset
  const newScrollOffset = calcEdgeBasedScrollOffset(
    selectedCardIndex,
    scrollOffsetRef.current,
    visibleCardCount,
    cards.length,
  );
  scrollOffsetRef.current = newScrollOffset;

  // Calculate virtualization window
  const {
    startIndex,
    endIndex,
    topPlaceholderHeight,
    bottomPlaceholderHeight,
  } = useMemo(() => {
    const totalCards = cards.length;

    // For small lists, render everything
    if (totalCards <= MAX_RENDERED_CARDS) {
      return {
        startIndex: 0,
        endIndex: totalCards,
        topPlaceholderHeight: 0,
        bottomPlaceholderHeight: 0,
      };
    }

    // Center the window around the selected card
    const halfWindow = Math.floor(MAX_RENDERED_CARDS / 2);
    let start = Math.max(0, selectedCardIndex - halfWindow);
    let end = Math.min(totalCards, start + MAX_RENDERED_CARDS);

    // Adjust start if we hit the end
    if (end === totalCards) {
      start = Math.max(0, end - MAX_RENDERED_CARDS);
    }

    // Add overscan
    start = Math.max(0, start - OVERSCAN);
    end = Math.min(totalCards, end + OVERSCAN);

    // Calculate placeholder heights
    const topHeight = start * ESTIMATED_CARD_HEIGHT;
    const bottomHeight = (totalCards - end) * ESTIMATED_CARD_HEIGHT;

    return {
      startIndex: start,
      endIndex: end,
      topPlaceholderHeight: topHeight,
      bottomPlaceholderHeight: bottomHeight,
    };
  }, [cards.length, selectedCardIndex, height]);

  if (cards.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} minHeight={1}>
        <Box marginTop={1}>
          <Text dimColor>(empty)</Text>
        </Box>
      </Box>
    );
  }

  // Get the slice of cards to render
  const visibleCards = cards.slice(startIndex, endIndex);

  // Calculate scrollTo index using edge-based offset
  // scrollOffsetRef.current is the logical top card index
  // We need to translate to the index within our rendered slice
  const hasTopPlaceholder = topPlaceholderHeight > 0;
  const scrollToIndex =
    newScrollOffset - startIndex + (hasTopPlaceholder ? 1 : 0);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      height={height}
      overflow="scroll"
      scrollTo={Math.max(0, scrollToIndex)}
    >
      {/* Top placeholder for cards above visible range */}
      {topPlaceholderHeight > 0 && (
        <Box height={topPlaceholderHeight} flexShrink={0} />
      )}

      {/* Render visible cards */}
      {visibleCards.map((card: CardState, i: number) => {
        const actualIndex = startIndex + i;
        const cardIsSelected =
          isSelected &&
          actualIndex === selectedCardIndex &&
          selectionLevel === "card";
        return (
          <Card
            key={card.node.id}
            card={card}
            isSelected={cardIsSelected}
            selectedSubIndex={cardIsSelected ? selectedSubIndex : -1}
            width={width}
            colIndex={colIndex}
            cardIndex={actualIndex}
            isVirtualColumn={isVirtualColumn}
          />
        );
      })}

      {/* Bottom placeholder for cards below visible range */}
      {bottomPlaceholderHeight > 0 && (
        <Box height={bottomPlaceholderHeight} flexShrink={0} />
      )}
    </Box>
  );
}

// =============================================================================
// Column Component
// =============================================================================

export interface ColumnProps {
  column: ColumnState;
  colIndex: number;
  isSelected: boolean;
  isCollapsed: boolean;
  selectedCardIndex: number;
  selectedSubIndex: number;
  width: number;
  height: number;
  selectionLevel: "board" | "column" | "card";
}

/**
 * Memoized Column - skips re-render when props are unchanged.
 *
 * When moving cursor within a column, only selectedCardIndex changes.
 * The Column still re-renders, but memoized Cards skip unless their
 * isSelected prop changed.
 */
export const Column = React.memo(function Column({
  column,
  colIndex,
  isSelected,
  isCollapsed,
  selectedCardIndex,
  selectedSubIndex,
  width,
  height,
  selectionLevel,
}: ColumnProps): React.ReactElement {
  const vault = useVault();
  // Render name with wiki links stripped: [[target|alias]] → "alias"
  const name = renderPlain(getNodeDisplayName(vault, column.node));
  const typeSuffix = getCollapsedTypeSuffix(vault, column.node);
  const count = column.cards.length;
  const wipLimit = column.wipLimit;
  const isVirtual = column.isVirtual ?? false;

  // Get column's own color (not inherited) for background
  // Virtual body columns use dimmed gray styling
  const ownColor = isVirtual ? undefined : getOwnColor(column.node);
  const wipExceeded = wipLimit !== undefined && count > wipLimit;

  // Build count display
  const countDisplay =
    wipLimit !== undefined ? `(${count}/${wipLimit})` : `(${count})`;
  const warningIndicator = wipExceeded ? " \u26A0" : "";
  const collapsedIndicator = isCollapsed ? " \u25B8" : "";

  const isColumnSelected = isSelected && selectionLevel === "column";
  const headerStyle = getHeaderStyle(ownColor, isSelected, isColumnSelected);

  // Get consistent bullet icon using getNodeIcon (same rules as TreeNode)
  // - Non-tasks with color: filled circle (●) in that color
  // - Non-tasks without color: small bullet (·)
  // - Virtual body columns: dimmed info icon
  const icon = isVirtual
    ? { char: "·", color: "gray" as const }
    : getNodeIcon(null, ownColor, false);
  // When column is selected, icon should be black on yellow bg
  const iconColor = isColumnSelected ? "black" : icon.color;

  return (
    <Box
      id={column.node.id}
      data-view="column"
      data-selected={isSelected}
      flexDirection="column"
      width={width}
      maxHeight={height}
      overflow="hidden"
    >
      {/* Blank line above header */}
      <Box height={1} flexShrink={0}>
        <Text> </Text>
      </Box>

      {/* Column header with background spanning full width */}
      {/* Bold text, bullet uses getNodeIcon for consistent styling with TreeNode */}
      {/* Note: backgroundColor on Text (not Box) ensures fg color applies correctly */}
      <Box height={1} flexShrink={0} width={width}>
        <Text
          bold
          color={headerStyle.color}
          backgroundColor={headerStyle.backgroundColor}
          dimColor={headerStyle.dimColor}
          wrap="truncate"
        >
          {" "}
          <Text color={iconColor}>{icon.char}</Text> {name}
          {typeSuffix ? (
            <Text
              color={isColumnSelected ? "gray" : undefined}
              dimColor={!isColumnSelected}
            >{` ${typeSuffix}`}</Text>
          ) : (
            ""
          )}
          {wipExceeded ? (
            <Text color="red">
              {` ${styledUnderline("curly", [255, 80, 80], countDisplay)}${warningIndicator}`}
            </Text>
          ) : (
            <Text
              color={isColumnSelected ? "gray" : undefined}
              dimColor={!isColumnSelected}
            >{` ${countDisplay}`}</Text>
          )}
          {collapsedIndicator}
          {/* Pad to full column width */}
          {" ".repeat(
            Math.max(
              0,
              width -
                4 -
                name.length -
                countDisplay.length -
                (typeSuffix?.length ?? 0) -
                (collapsedIndicator?.length ?? 0),
            ),
          )}
        </Text>
      </Box>

      {isCollapsed ? (
        <Box
          flexDirection="column"
          flexGrow={1}
          minHeight={1}
          justifyContent="center"
          alignItems="center"
        >
          <Text dimColor>[collapsed - {count}]</Text>
        </Box>
      ) : (
        <VirtualizedCardList
          cards={column.cards}
          selectedCardIndex={selectedCardIndex}
          selectedSubIndex={selectedSubIndex}
          isSelected={isSelected}
          selectionLevel={selectionLevel}
          width={width}
          height={height - 2} // Subtract header height
          colIndex={colIndex}
          isVirtualColumn={isVirtual}
        />
      )}
    </Box>
  );
});
