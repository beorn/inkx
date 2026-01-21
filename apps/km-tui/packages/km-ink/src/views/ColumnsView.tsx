/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 *
 * Uses inkx overflow="scroll" for native scrolling support.
 */
import React from "react";
import { Box, Text } from "inkx";
import type { BoardState, ColumnState, CardState } from "../types.ts";
import { TreeNode } from "./TreeNode.tsx";
import { getNodeDisplayName } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";
import { useTreeConfig } from "../ui-context.tsx";
import { getNodeIcon, renderPlain } from "../text/index.ts";
import {
  VerticalScrollIndicator,
  ColumnSeparator,
} from "./VerticalScrollIndicator.tsx";

// =============================================================================
// ColumnTree Subcomponent
// =============================================================================

interface ColumnTreeProps {
  column: ColumnState;
  colIndex: number;
  isSelected: boolean;
  selectedCardIndex: number;
  selectedSubIndex: number;
  selectionLevel: "board" | "column" | "card";
  width: number;
}

function ColumnTree({
  column,
  colIndex,
  isSelected,
  selectedCardIndex,
  selectedSubIndex,
  selectionLevel,
}: ColumnTreeProps): React.ReactElement {
  const { inOutlineMode } = useTreeConfig();

  // Render name with wiki links stripped: [[target|alias]] → "alias"
  const name = renderPlain(getNodeDisplayName(column.node));
  const count = column.cards.length;
  const ownColor = getOwnColor(column.node);

  // Column header is selected when at column level
  const isColumnHeaderSelected = isSelected && selectionLevel === "column";
  const headerStyle = getHeaderStyle(
    ownColor,
    isSelected,
    isColumnHeaderSelected,
  );

  // Get consistent bullet icon using getNodeIcon (same rules as TreeNode)
  const icon = getNodeIcon(null, ownColor, false);
  const iconColor = isColumnHeaderSelected ? "black" : icon.color;

  // Maximum column width to prevent overly wide columns (similar to cards view)
  const maxColWidth = 60;

  return (
    <Box flexDirection="column" flexGrow={1} maxWidth={maxColWidth} overflow="hidden">
      {/* Header section */}
      <Box flexDirection="column" height={3} flexShrink={0}>
        <Text> </Text>
        {/* Header row - backgroundColor on Text ensures fg color applies correctly */}
        <Box>
          <Text
            bold={isSelected}
            color={headerStyle.color}
            backgroundColor={headerStyle.backgroundColor}
            wrap="truncate"
          >
            {" "}
            <Text color={iconColor}>{icon.char}</Text>
            {" "}
            {name}
            <Text color={isColumnHeaderSelected ? "gray" : undefined} dimColor={!isColumnHeaderSelected}>{` (${count})`}</Text>
          </Text>
        </Box>
        <Text dimColor wrap="truncate">
          {"─".repeat(100)}
        </Text>
      </Box>

      {/* Cards with inkx native scrolling */}
      <Box
        flexDirection="column"
        flexGrow={1}
        minHeight={1}
        overflow="scroll"
        scrollTo={selectedCardIndex}
      >
        {column.cards.map((card: CardState, index: number) => {
          const cardSelected =
            selectionLevel === "card" &&
            isSelected &&
            index === selectedCardIndex &&
            !inOutlineMode;

          return (
            <TreeNode
              key={card.node.id}
              node={card.node}
              depth={0}
              isSelected={
                cardSelected ||
                (selectionLevel === "card" &&
                  inOutlineMode &&
                  isSelected &&
                  index === selectedCardIndex &&
                  selectedSubIndex === 0)
              }
              colIndex={colIndex}
              cardIndex={index}
              subIndex={0}
            />
          );
        })}
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
  const hasLeftIndicator = effectiveScrollOffset > 0;
  const hasRightIndicator =
    effectiveScrollOffset + effectiveMaxCols < state.columns.length;

  return (
    <Box flexDirection="row" width={width} height={height}>
      {/* Left scroll indicator */}
      {hasLeftIndicator && <VerticalScrollIndicator direction="left" />}

      {/* Columns with tree view inside */}
      {effectiveVisibleColumns.map((col, i) => {
        const actualColIndex = effectiveScrollOffset + i;
        const isLastCol = i === effectiveVisibleColumns.length - 1;
        // Distribute extra pixels to the first 'remainder' columns
        return (
          <React.Fragment key={col.node.id}>
            <ColumnTree
              column={col}
              colIndex={actualColIndex}
              isSelected={actualColIndex === colIndex}
              selectedCardIndex={cardIndex}
              selectedSubIndex={subIndex}
              selectionLevel={selectionLevel}
            />
            {/* Separator line between columns */}
            {!isLastCol && <ColumnSeparator />}
          </React.Fragment>
        );
      })}

      {/* Right scroll indicator */}
      {hasRightIndicator && <VerticalScrollIndicator direction="right" />}

      {state.columns.length === 0 && (
        <Text dimColor>No columns to display</Text>
      )}
    </Box>
  );
}
