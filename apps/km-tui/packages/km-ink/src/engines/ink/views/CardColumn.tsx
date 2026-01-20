/**
 * Card and Column components for the Board view (Stock Ink Version)
 *
 * Uses the constraint system (calculateScrollState) for scrolling
 * (stock ink doesn't support overflow="scroll").
 *
 * Extracted from Board.tsx to reduce file size.
 */
import React from "react";
import { Box, Text } from "ink";
import { styledUnderline } from "@beorn/chalkx";
import type { CardState, ColumnState } from "../../../types.ts";
import {
  getNodeDisplayName,
  getCollapsedTypeSuffix,
} from "../../../state.ts";
import { getOwnColor, getHeaderStyle } from "../../../board-pills.ts";
import { TreeNode } from "./TreeNode.tsx";
import { OverflowIndicator } from "./OverflowIndicator.tsx";
import { calculateScrollState } from "../../../constraints/index.ts";

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
  // Card border uses 2 chars (1 left + 1 right), so inner content is width - 2
  const innerWidth = Math.max(5, width - 2);

  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      width={width}
      borderStyle="round"
      borderColor={isSelected ? "cyanBright" : "blackBright"}
      overflowX="hidden"
    >
      <TreeNode
        node={card.node}
        depth={0}
        width={innerWidth}
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
  const name = getNodeDisplayName(column.node);
  const typeSuffix = getCollapsedTypeSuffix(column.node);
  const count = column.cards.length;
  const wipLimit = column.wipLimit;

  // Get column's own color (not inherited) for background
  const ownColor = getOwnColor(column.node);
  const wipExceeded = wipLimit !== undefined && count > wipLimit;

  // Available height for cards: column height - blank line (1) - header (1)
  const baseContentHeight = Math.max(1, height - 2);
  // Card height: border (2 lines) + content (1 to maxContentLines)
  // Use minimum content height of 1 line for estimation
  const estimatedCardHeight = 1 + 2; // 1 line content + 2 border = 3 lines minimum

  // Use constraint system's scroll calculation
  const scrollState = calculateScrollState(
    column.cards,
    selectedCardIndex,
    baseContentHeight,
    estimatedCardHeight,
    0,
    true,
  );

  // Build count display
  const countDisplay =
    wipLimit !== undefined ? `(${count}/${wipLimit})` : `(${count})`;
  const warningIndicator = wipExceeded ? " \u26A0" : "";
  const collapsedIndicator = isCollapsed ? " \u25B8" : "";

  const isColumnSelected = isSelected && selectionLevel === "column";
  const headerStyle = getHeaderStyle(ownColor, isSelected, isColumnSelected);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflowY="hidden"
    >
      {/* Blank line above header */}
      <Text> </Text>

      {/* Column header */}
      <Text
        bold={isSelected}
        color={headerStyle.color}
        dimColor={headerStyle.dimColor}
        backgroundColor={headerStyle.backgroundColor}
        wrap="truncate"
      >
        {name}
        {typeSuffix ? <Text dimColor>{` ${typeSuffix}`}</Text> : ""}
        {wipExceeded ? (
          <Text color="red">
            {` ${styledUnderline("curly", [255, 80, 80], countDisplay)}${warningIndicator}`}
          </Text>
        ) : (
          ` ${countDisplay}`
        )}
        {collapsedIndicator}
      </Text>

      {isCollapsed ? (
        <Box
          flexDirection="column"
          height={baseContentHeight}
          justifyContent="center"
          alignItems="center"
        >
          <Text dimColor>[collapsed - {count}]</Text>
        </Box>
      ) : (
        <Box
          flexDirection="column"
          height={baseContentHeight}
          flexShrink={0}
          flexGrow={0}
          overflowY="hidden"
        >
          <OverflowIndicator
            direction="up"
            count={scrollState.overflowTop}
            width={width}
          />

          <Box
            flexDirection="column"
            flexGrow={1}
            alignItems="flex-start"
            overflowY="hidden"
          >
            {scrollState.visible.map(
              ({ item: card, index: actualCardIndex }) => {
                const cardIsSelected =
                  isSelected &&
                  actualCardIndex === selectedCardIndex &&
                  selectionLevel === "card";
                return (
                  <Card
                    key={card.node.id}
                    card={card}
                    isSelected={cardIsSelected}
                    selectedSubIndex={cardIsSelected ? selectedSubIndex : -1}
                    width={width}
                    colIndex={colIndex}
                    cardIndex={actualCardIndex}
                  />
                );
              },
            )}
            {column.cards.length === 0 && (
              <Box marginTop={1}>
                <Text dimColor>(empty)</Text>
              </Box>
            )}
          </Box>

          <OverflowIndicator
            direction="down"
            count={scrollState.overflowBottom}
            width={width}
          />
        </Box>
      )}
    </Box>
  );
}
