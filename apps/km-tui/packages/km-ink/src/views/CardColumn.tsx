/**
 * Card and Column components for the Board view
 *
 * Uses inkx overflow="scroll" for native scrolling support.
 * Implements React-level virtualization for large card lists.
 */
import React, { useMemo } from "react";
import { Box, Text } from "inkx";
import { styledUnderline } from "@beorn/chalkx";
import type { CardState, ColumnState } from "../types.ts";
import { getNodeDisplayName, getCollapsedTypeSuffix } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";
import { TreeNode } from "./TreeNode.tsx";
import { getNodeIcon, renderPlain } from "../text/index.ts";

// =============================================================================
// Virtualization Constants
// =============================================================================

// Approximate card height (border + content + padding)
// Used to calculate which cards to render
const ESTIMATED_CARD_HEIGHT = 4;

// Number of extra cards to render above and below visible area
// This provides smooth scrolling without visible gaps
const OVERSCAN = 5;

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
}

export function Card({
  card,
  isSelected,
  selectedSubIndex,
  width,
  colIndex,
  cardIndex,
}: CardProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      width={width}
      borderStyle="round"
      borderColor={isSelected ? "yellow" : "blackBright"}
    >
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
}

/**
 * Virtualized card list that only renders cards near the visible area.
 *
 * For large card lists (100+), rendering all cards causes significant
 * delays as React/Yoga must process every element. This component:
 * 1. Calculates which cards are likely visible based on height
 * 2. Renders only those cards plus a buffer (OVERSCAN)
 * 3. Uses placeholder elements to maintain scroll position
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
}: VirtualizedCardListProps): React.ReactElement {
  // Calculate virtualization window
  const { startIndex, endIndex, topPlaceholderHeight, bottomPlaceholderHeight } = useMemo(() => {
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

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      minHeight={1}
      overflow="scroll"
      scrollTo={selectedCardIndex - startIndex} // Adjust for virtualization offset
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

export function Column({
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
  // Render name with wiki links stripped: [[target|alias]] → "alias"
  const name = renderPlain(getNodeDisplayName(column.node));
  const typeSuffix = getCollapsedTypeSuffix(column.node);
  const count = column.cards.length;
  const wipLimit = column.wipLimit;

  // Get column's own color (not inherited) for background
  const ownColor = getOwnColor(column.node);
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
  const icon = getNodeIcon(null, ownColor, false);
  // When column is selected, icon should be black on yellow bg
  const iconColor = isColumnSelected ? "black" : icon.color;

  return (
    <Box flexDirection="column" width={width} maxHeight={height} overflow="hidden">
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
          <Text color={iconColor}>{icon.char}</Text>
          {" "}
          {name}
          {typeSuffix ? (
            <Text color={isColumnSelected ? "gray" : undefined} dimColor={!isColumnSelected}>{` ${typeSuffix}`}</Text>
          ) : ""}
          {wipExceeded ? (
            <Text color="red">
              {` ${styledUnderline("curly", [255, 80, 80], countDisplay)}${warningIndicator}`}
            </Text>
          ) : (
            <Text color={isColumnSelected ? "gray" : undefined} dimColor={!isColumnSelected}>{` ${countDisplay}`}</Text>
          )}
          {collapsedIndicator}
          {/* Pad to full column width */}
          {" ".repeat(Math.max(0, width - 4 - name.length - countDisplay.length - (typeSuffix?.length ?? 0) - (collapsedIndicator?.length ?? 0)))}
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
        />
      )}
    </Box>
  );
}
