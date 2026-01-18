/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 */
import React from "react";
import { Box, Text } from "ink";
import type { BoardState, ColumnState, SelectionKey } from "../types.ts";
import { TreeNode, makeSelectionKey } from "./TreeNode.tsx";
import { getNodeDisplayName } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";

interface ColumnsViewProps {
  state: BoardState;
  width: number;
  height: number;
  foldedNodes: Set<string>;
  maxOutlineDepth: number;
  multiSelected: Set<SelectionKey>;
  colIndex: number;
  cardIndex: number;
  subIndex: number;
  inOutlineMode: boolean;
  effectiveScrollOffset: number;
  effectiveMaxCols: number;
  effectiveVisibleColumns: ColumnState[];
  selectionLevel: "board" | "column" | "card";
  /** Maximum lines of content to display per node */
  maxContentLines: number;
}

interface ColumnTreeProps {
  column: ColumnState;
  colIndex: number;
  isSelected: boolean;
  selectedCardIndex: number;
  selectedSubIndex: number;
  width: number;
  height: number;
  maxOutlineDepth: number;
  foldedNodes: Set<string>;
  multiSelected: Set<SelectionKey>;
  inOutlineMode: boolean;
  selectionLevel: "board" | "column" | "card";
  /** Maximum lines of content to display per node */
  maxContentLines: number;
}

function ColumnTree({
  column,
  colIndex,
  isSelected,
  selectedCardIndex,
  selectedSubIndex,
  width,
  height,
  maxOutlineDepth,
  foldedNodes,
  multiSelected,
  inOutlineMode,
  selectionLevel,
  maxContentLines,
}: ColumnTreeProps): React.ReactElement {
  const name = getNodeDisplayName(column.node);
  const count = column.cards.length;

  // Get column's own color for background
  const ownColor = getOwnColor(column.node);

  // Available height for cards: column height - blank line (1) - header (1)
  const contentHeight = Math.max(1, height - 2);
  // Each card row takes ~1 line when folded, estimate generously
  const maxVisibleCards = Math.max(1, contentHeight);

  // Only scroll if we actually have more cards than can fit
  const needsScroll = column.cards.length > maxVisibleCards;
  const scrollOffset = needsScroll
    ? Math.max(
        0,
        Math.min(
          selectedCardIndex - Math.floor(maxVisibleCards / 2),
          Math.max(0, column.cards.length - maxVisibleCards),
        ),
      )
    : 0;

  const visibleCards = column.cards.slice(
    scrollOffset,
    scrollOffset + maxVisibleCards,
  );

  // Column header is selected when at column level
  const isColumnHeaderSelected = isSelected && selectionLevel === "column";
  const headerStyle = getHeaderStyle(
    ownColor,
    isSelected,
    isColumnHeaderSelected,
  );

  // Height for cards area: total height - blank line (1) - header (1)
  const cardsHeight = Math.max(1, height - 2);

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Header section: blank line + header, fixed 2-line height */}
      <Box flexDirection="column" height={2} flexShrink={0}>
        <Text> </Text>
        <Text
          bold={isSelected}
          color={headerStyle.color}
          dimColor={headerStyle.dimColor}
          backgroundColor={headerStyle.backgroundColor}
          wrap="truncate"
        >
          {name} ({count})
        </Text>
      </Box>

      {/* Cards as tree nodes - fixed height with overflow hidden */}
      <Box
        flexDirection="column"
        height={cardsHeight}
        alignItems="flex-start"
        overflowY="hidden"
      >
        {scrollOffset > 0 && <Text dimColor> ▲ {scrollOffset} above</Text>}
        {visibleCards.map((card, i) => {
          const actualCardIndex = scrollOffset + i;
          const cardKey = makeSelectionKey(colIndex, actualCardIndex, 0);
          // Card is only selected when at card level
          const cardSelected =
            selectionLevel === "card" &&
            isSelected &&
            actualCardIndex === selectedCardIndex &&
            !inOutlineMode;
          const cardMultiSelected = multiSelected.has(cardKey);

          return (
            <TreeNode
              key={card.node.id}
              node={card.node}
              depth={0}
              width={width}
              isSelected={
                cardSelected ||
                (selectionLevel === "card" &&
                  inOutlineMode &&
                  isSelected &&
                  actualCardIndex === selectedCardIndex &&
                  selectedSubIndex === 0)
              }
              isMultiSelected={cardMultiSelected}
              foldedNodes={foldedNodes}
              maxDepth={maxOutlineDepth}
              colIndex={colIndex}
              cardIndex={actualCardIndex}
              subIndex={0}
              multiSelected={multiSelected}
              inOutlineMode={inOutlineMode}
              currentSubIndex={0}
              variant="compact"
              maxContentLines={maxContentLines}
            />
          );
        })}
        {needsScroll &&
          scrollOffset + visibleCards.length < column.cards.length && (
            <Text dimColor>
              {"  "}▼ {column.cards.length - scrollOffset - visibleCards.length}{" "}
              below
            </Text>
          )}
      </Box>
    </Box>
  );
}

export function ColumnsView({
  state,
  width,
  height,
  foldedNodes,
  maxOutlineDepth,
  multiSelected,
  colIndex,
  cardIndex,
  subIndex,
  inOutlineMode,
  effectiveScrollOffset,
  effectiveMaxCols,
  effectiveVisibleColumns,
  selectionLevel,
  maxContentLines,
}: ColumnsViewProps): React.ReactElement {
  // Calculate column widths
  const hasLeftIndicator = effectiveScrollOffset > 0;
  const hasRightIndicator =
    effectiveScrollOffset + effectiveMaxCols < state.columns.length;
  const indicatorWidth =
    (hasLeftIndicator ? 1 : 0) + (hasRightIndicator ? 1 : 0);
  const availableWidth = width - indicatorWidth;

  return (
    <Box flexDirection="row" width={width} height={height}>
      {/* Left scroll indicator */}
      {hasLeftIndicator && (
        <Box flexDirection="column" width={1} height={height - 1}>
          {Array.from({ length: height - 1 }).map((_, i) => (
            <Text key={i} backgroundColor="gray" color="white">
              {i === Math.floor((height - 1) / 2) ? "‹" : " "}
            </Text>
          ))}
        </Box>
      )}

      {/* Columns with tree view inside */}
      {effectiveVisibleColumns.map((col, i) => {
        const actualColIndex = effectiveScrollOffset + i;
        const isLastCol = i === effectiveVisibleColumns.length - 1;
        // Account for separator lines between columns
        const separatorCount = effectiveVisibleColumns.length - 1;
        const availWidthForCols = availableWidth - separatorCount;
        const colBaseWidth = Math.floor(availWidthForCols / effectiveMaxCols);
        const colRemainder = availWidthForCols % effectiveMaxCols;
        // Distribute extra pixels to the first columns
        const colWidth = colBaseWidth + (i < colRemainder ? 1 : 0);
        return (
          <React.Fragment key={col.node.id}>
            <ColumnTree
              column={col}
              colIndex={actualColIndex}
              isSelected={actualColIndex === colIndex}
              selectedCardIndex={cardIndex}
              selectedSubIndex={subIndex}
              width={colWidth}
              height={height}
              maxOutlineDepth={maxOutlineDepth}
              foldedNodes={foldedNodes}
              multiSelected={multiSelected}
              inOutlineMode={inOutlineMode}
              selectionLevel={selectionLevel}
              maxContentLines={maxContentLines}
            />
            {/* Separator line between columns */}
            {!isLastCol && (
              <Box flexDirection="column" width={1} height={height}>
                {/* Blank line to align with column header spacing */}
                <Text> </Text>
                {Array.from({ length: height - 1 }).map((_, j) => (
                  <Text key={j} color="gray">
                    │
                  </Text>
                ))}
              </Box>
            )}
          </React.Fragment>
        );
      })}

      {/* Right scroll indicator */}
      {hasRightIndicator && (
        <Box flexDirection="column" width={1} height={height - 1}>
          {Array.from({ length: height - 1 }).map((_, i) => (
            <Text key={i} backgroundColor="gray" color="white">
              {i === Math.floor((height - 1) / 2) ? "›" : " "}
            </Text>
          ))}
        </Box>
      )}

      {state.columns.length === 0 && (
        <Text dimColor>No columns to display</Text>
      )}
    </Box>
  );
}
