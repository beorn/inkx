/**
 * Card and Column components for the Board view
 *
 * Extracted from Board.tsx to reduce file size.
 */
import React from "react";
import { Box, Text } from "ink";
import { styledUnderline } from "@beorn/chalkx";
import type { CardState, ColumnState, SelectionKey } from "../types.ts";
import { getNodeDisplayName, getCollapsedTypeSuffix } from "../state.ts";
import { getOwnColor } from "../board-pills.ts";
import { TreeNode, makeSelectionKey } from "./TreeNode.tsx";
import { calculateScrollState } from "../constraints/index.ts";

export interface CardProps {
  card: CardState;
  isSelected: boolean;
  selectedSubIndex: number; // Which sub-item within this card is selected (-1 = card header)
  width: number;
  maxOutlineDepth: number;
  foldedNodes: Set<string>;
  multiSelected: Set<SelectionKey>; // Set of selected sub-item keys within this card
  colIndex: number;
  cardIndex: number;
  /** Maximum lines of content to display per item */
  maxContentLines: number;
}

export function Card({
  card,
  isSelected,
  selectedSubIndex,
  width,
  maxOutlineDepth,
  foldedNodes,
  multiSelected,
  colIndex,
  cardIndex,
  maxContentLines,
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
        maxDepth={maxOutlineDepth}
        width={innerWidth}
        foldedNodes={foldedNodes}
        isSelected={isSelected && selectedSubIndex === 0}
        isMultiSelected={multiSelected.has(
          makeSelectionKey(colIndex, cardIndex, 0),
        )}
        subIndex={0}
        currentSubIndex={selectedSubIndex}
        multiSelected={multiSelected}
        colIndex={colIndex}
        cardIndex={cardIndex}
        inOutlineMode={isSelected}
        variant="compact"
        maxContentLines={maxContentLines}
        dimInactiveChildren={!isSelected}
      />
    </Box>
  );
}

export interface ColumnProps {
  column: ColumnState;
  colIndex: number;
  isSelected: boolean;
  isCollapsed: boolean; // Whether column shows only header with count
  selectedCardIndex: number;
  selectedSubIndex: number; // Which sub-item within the selected card (0 = card header)
  width: number;
  height: number;
  maxOutlineDepth: number;
  foldedNodes: Set<string>;
  multiSelected: Set<SelectionKey>;
  selectionLevel: "board" | "column" | "card"; // Current selection level
  /** Maximum lines of content to display per item */
  maxContentLines: number;
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
  maxOutlineDepth,
  foldedNodes,
  multiSelected,
  selectionLevel,
  maxContentLines,
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
  // Each card takes approximately:
  // - 2 lines for border (top + bottom from borderStyle="round")
  // - 1-3 lines for content (maxContentLines setting)
  // - Some cards may have parent context or wrapped text
  // Use maxContentLines + 3 as a conservative estimate to prevent overflow
  const estimatedCardHeight = maxContentLines + 3;

  // Use constraint system's scroll calculation for consistent behavior
  const scrollState = calculateScrollState(
    column.cards,
    selectedCardIndex,
    baseContentHeight,
    estimatedCardHeight,
    0, // gap
    true, // hasOverflowIndicator
  );

  const hasTopOverflow = scrollState.overflowTop > 0;
  const hasBottomOverflow = scrollState.overflowBottom > 0;

  // Build count display: "(3)" or "(4/3)" with WIP limit
  const countDisplay =
    wipLimit !== undefined ? `(${count}/${wipLimit})` : `(${count})`;
  const warningIndicator = wipExceeded ? " \u26A0" : ""; // Warning sign when WIP exceeded
  const collapsedIndicator = isCollapsed ? " \u25B8" : ""; // Right-pointing triangle when collapsed

  const isColumnSelected = isSelected && selectionLevel === "column";

  // Header text color: bright yellow if this column is selected/has selected cards, dim yellow otherwise
  // Exception: if column has its own color, use appropriate text color for that background
  const headerTextColor = ownColor
    ? ["red", "green", "blue", "magenta", "gray", "grey"].includes(ownColor)
      ? "white"
      : "black"
    : isSelected
      ? "yellow"
      : "yellowBright";
  const headerDimmed = !isSelected && !ownColor;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflowY="hidden"
    >
      {/* Blank line above header */}
      <Text> </Text>

      <Text
        bold={isSelected}
        color={headerTextColor}
        dimColor={headerDimmed}
        backgroundColor={
          isColumnSelected ? "blue" : ownColor ? ownColor : undefined
        }
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
        // Collapsed view: show only count summary
        <Box
          flexDirection="column"
          height={baseContentHeight}
          justifyContent="center"
          alignItems="center"
        >
          <Text dimColor>[collapsed - {count}]</Text>
        </Box>
      ) : (
        // Normal view: show cards with overflow indicators
        // Wrap in a fixed-height Box to prevent content overflow
        // flexShrink={0} prevents the box from growing beyond its height
        <Box
          flexDirection="column"
          height={baseContentHeight}
          flexShrink={0}
          flexGrow={0}
          overflowY="hidden"
        >
          {/* Top overflow indicator - full width bar */}
          {hasTopOverflow && (
            <Box width={width} flexShrink={0}>
              <Text backgroundColor="gray" color="white">
                {" ".repeat(Math.max(0, Math.floor((width - 2) / 2)))}▲
                {" ".repeat(Math.max(0, Math.ceil((width - 2) / 2)))}
              </Text>
            </Box>
          )}
          <Box
            flexDirection="column"
            flexGrow={1}
            alignItems="flex-start"
            overflowY="hidden"
          >
            {scrollState.visible.map(
              ({ item: card, index: actualCardIndex }) => {
                // Card is only selected when at card level (not column or board level)
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
                    maxOutlineDepth={maxOutlineDepth}
                    foldedNodes={foldedNodes}
                    multiSelected={multiSelected}
                    colIndex={colIndex}
                    cardIndex={actualCardIndex}
                    maxContentLines={maxContentLines}
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
          {/* Bottom overflow indicator - full width bar */}
          {hasBottomOverflow && (
            <Box width={width} flexShrink={0}>
              <Text backgroundColor="gray" color="white">
                {" ".repeat(Math.max(0, Math.floor((width - 2) / 2)))}▼
                {" ".repeat(Math.max(0, Math.ceil((width - 2) / 2)))}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
