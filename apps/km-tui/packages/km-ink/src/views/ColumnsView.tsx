/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 */
import React, { useMemo, useCallback } from "react";
import { Box, Text } from "inkx";
import type { BoardState, ColumnState, CardState } from "../types.ts";
import { TreeNode } from "./TreeNode.tsx";
import { getNodeDisplayName } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";
import { useTreeConfig, useUISelector } from "../ui-context.tsx";
import { ConstraintContext, ScrollableList } from "../constraints/index.ts";
import { getChildren } from "@km/storage";
import { estimateTreeNodeHeight, VARIANT_CONFIG } from "./tree-node-helpers.ts";
import { OverflowIndicator } from "./OverflowIndicator.tsx";

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
  const { inOutlineMode, maxContentLines, maxOutlineDepth } = useTreeConfig();
  const foldedNodes = useUISelector((state) => state.foldedNodes);

  const name = getNodeDisplayName(column.node);
  const count = column.cards.length;
  const ownColor = getOwnColor(column.node);

  // Column header is selected when at column level
  const isColumnHeaderSelected = isSelected && selectionLevel === "column";
  const headerStyle = getHeaderStyle(
    ownColor,
    isSelected,
    isColumnHeaderSelected,
  );

  // Available height for cards: column height - blank line (1) - header (1)
  const contentHeight = Math.max(1, height - 2);

  // Height estimation config for TreeNodes (compact mode for columns)
  const heightConfig = useMemo(
    () => ({
      maxContentLines,
      maxOutlineDepth,
      maxChildren: VARIANT_CONFIG.compact.maxChildren,
      availableWidth: width,
    }),
    [maxContentLines, maxOutlineDepth, width],
  );

  // Get item height for variable-height virtualization
  const getItemHeight = useCallback(
    (card: CardState, _index: number): number => {
      return estimateTreeNodeHeight(
        card.node,
        0, // depth
        heightConfig,
        getChildren,
        foldedNodes,
      );
    },
    [heightConfig, foldedNodes],
  );

  // Render function for ScrollableList
  const renderItem = useCallback(
    (card: CardState, index: number, _isSelected: boolean): React.ReactNode => {
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
          width={width}
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
    },
    [
      selectionLevel,
      isSelected,
      selectedCardIndex,
      selectedSubIndex,
      inOutlineMode,
      colIndex,
      width,
    ],
  );

  // Custom overflow renderer
  const renderOverflow = useCallback(
    (direction: "top" | "bottom", count: number): React.ReactNode => {
      return (
        <OverflowIndicator
          direction={direction === "top" ? "up" : "down"}
          count={count}
          width={width}
        />
      );
    },
    [width],
  );

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

      {/* Cards as virtualized tree nodes */}
      <ConstraintContext.Provider
        value={{
          terminal: { columns: width, rows: contentHeight },
          parent: { width, height: contentHeight },
        }}
      >
        <ScrollableList
          items={column.cards}
          selectedIndex={selectedCardIndex}
          getItemHeight={getItemHeight}
          height={contentHeight}
          renderItem={renderItem}
          renderOverflow={renderOverflow}
        />
      </ConstraintContext.Provider>
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
  // Calculate column widths using integer math
  const hasLeftIndicator = effectiveScrollOffset > 0;
  const hasRightIndicator =
    effectiveScrollOffset + effectiveMaxCols < state.columns.length;
  const indicatorWidth =
    (hasLeftIndicator ? 1 : 0) + (hasRightIndicator ? 1 : 0);

  // Account for separator lines between columns (1 char each, n-1 separators)
  const separatorCount = Math.max(0, effectiveVisibleColumns.length - 1);
  const availableWidth = width - indicatorWidth - separatorCount;

  // Use integer math to distribute width evenly without floating-point errors
  const colBaseWidth = Math.floor(availableWidth / effectiveMaxCols);
  const colRemainder = availableWidth % effectiveMaxCols;

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
        // Distribute extra pixels to the first 'remainder' columns
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
