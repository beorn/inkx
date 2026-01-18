/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 */
import React from "react";
import { Box, Text } from "ink";
import type { BoardState, ColumnState } from "../types.ts";
import { makeSelectionKey } from "../types.ts";
import { TreeNode } from "./TreeNode.tsx";
import { getNodeDisplayName } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";
import { useTreeConfig, useUISelector } from "../ui-context.tsx";

// =============================================================================
// ColumnTree Subcomponent
// =============================================================================

interface ColumnTreeProps {
  column: ColumnState;
  colIndex: number;
  isSelected: boolean;
  selectedCardIndex: number;
  selectedSubIndex: number;
  width: number;
  height: number;
  selectionLevel: "board" | "column" | "card";
}

function ColumnTree({
  column,
  colIndex,
  isSelected,
  selectedCardIndex,
  selectedSubIndex,
  width,
  height,
  selectionLevel,
}: ColumnTreeProps): React.ReactElement {
  const { inOutlineMode } = useTreeConfig();
  const multiSelected = useUISelector((s) => s.multiSelected);

  const name = getNodeDisplayName(column.node);
  const count = column.cards.length;
  const ownColor = getOwnColor(column.node);

  // Available height for cards: column height - blank line (1) - header (1)
  const contentHeight = Math.max(1, height - 2);
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

  // Height for cards area
  const cardsHeight = Math.max(1, height - 2);

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Header section */}
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

      {/* Cards as tree nodes */}
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
              colIndex={colIndex}
              cardIndex={actualCardIndex}
              subIndex={0}
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

// =============================================================================
// ColumnsView Component
// =============================================================================

interface ColumnsViewProps {
  state: BoardState;
  width: number;
  height: number;
  colIndex: number;
  cardIndex: number;
  subIndex: number;
  effectiveScrollOffset: number;
  effectiveMaxCols: number;
  effectiveVisibleColumns: ColumnState[];
  selectionLevel: "board" | "column" | "card";
}

export function ColumnsView({
  state,
  width,
  height,
  colIndex,
  cardIndex,
  subIndex,
  effectiveScrollOffset,
  effectiveMaxCols,
  effectiveVisibleColumns,
  selectionLevel,
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
        const separatorCount = effectiveVisibleColumns.length - 1;
        const availWidthForCols = availableWidth - separatorCount;
        const colBaseWidth = Math.floor(availWidthForCols / effectiveMaxCols);
        const colRemainder = availWidthForCols % effectiveMaxCols;
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
              selectionLevel={selectionLevel}
            />
            {/* Separator line between columns */}
            {!isLastCol && (
              <Box flexDirection="column" width={1} height={height}>
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
