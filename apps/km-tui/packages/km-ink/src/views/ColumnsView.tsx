/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 *
 * Uses the constraint system (FlexRow, ScrollableList) for reliable layout
 * without manual width calculations that can cause gaps or overlaps.
 */
import React from "react";
import { Box, Text } from "ink";
import type { BoardState, ColumnState, CardState } from "../types.ts";
import { TreeNode } from "./TreeNode.tsx";
import { getNodeDisplayName } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";
import { useTreeConfig } from "../ui-context.tsx";
import {
  ConstraintContext,
  FlexRow,
  FlexItem,
  ScrollableList,
  useConstraintContext,
} from "../constraints/index.ts";

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
  const { parent } = useConstraintContext();
  const width = parent.width;
  const height = parent.height;

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

  // Height for cards area: total height - header section (2 lines)
  const cardsHeight = Math.max(1, height - 2);

  // Render function for ScrollableList
  const renderCard = (
    card: CardState,
    actualCardIndex: number,
    _isSelectedItem: boolean,
  ): React.ReactNode => {
    const cardSelected =
      selectionLevel === "card" &&
      isSelected &&
      actualCardIndex === selectedCardIndex &&
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
            actualCardIndex === selectedCardIndex &&
            selectedSubIndex === 0)
        }
        colIndex={colIndex}
        cardIndex={actualCardIndex}
        subIndex={0}
      />
    );
  };

  // Custom overflow renderer matching original style
  const renderOverflow = (
    direction: "top" | "bottom",
    overflowCount: number,
  ): React.ReactNode => {
    if (direction === "top") {
      return <Text dimColor> ▲ {overflowCount} above</Text>;
    }
    return (
      <Text dimColor>
        {"  "}▼ {overflowCount} below
      </Text>
    );
  };

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Header section - fixed 2 lines */}
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

      {/* Cards as tree nodes using ScrollableList */}
      <ConstraintContext.Provider
        value={{
          terminal: { columns: width, rows: cardsHeight },
          parent: { width, height: cardsHeight },
        }}
      >
        <Box
          flexDirection="column"
          width={width}
          height={cardsHeight}
          overflowY="hidden"
        >
          <ScrollableList
            items={column.cards}
            selectedIndex={isSelected ? selectedCardIndex : -1}
            itemHeight={1}
            height={cardsHeight}
            renderItem={renderCard}
            renderOverflow={renderOverflow}
          />
        </Box>
      </ConstraintContext.Provider>
    </Box>
  );
}

// =============================================================================
// Scroll Indicator Component
// =============================================================================

interface ScrollIndicatorProps {
  direction: "left" | "right";
  height: number;
}

function ScrollIndicator({
  direction,
  height,
}: ScrollIndicatorProps): React.ReactElement {
  const arrow = direction === "left" ? "‹" : "›";
  const midPoint = Math.floor((height - 1) / 2);

  return (
    <Box flexDirection="column" width={1} height={height - 1}>
      {Array.from({ length: height - 1 }).map((_, i) => (
        <Text key={i} backgroundColor="gray" color="white">
          {i === midPoint ? arrow : " "}
        </Text>
      ))}
    </Box>
  );
}

// =============================================================================
// Column Separator Component
// =============================================================================

interface ColumnSeparatorProps {
  height: number;
}

function ColumnSeparator({ height }: ColumnSeparatorProps): React.ReactElement {
  return (
    <Box flexDirection="column" width={1} height={height}>
      <Text> </Text>
      {Array.from({ length: height - 1 }).map((_, j) => (
        <Text key={j} color="gray">
          │
        </Text>
      ))}
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
  const indicatorWidth =
    (hasLeftIndicator ? 1 : 0) + (hasRightIndicator ? 1 : 0);

  // Width available for columns (after indicators)
  const columnsWidth = width - indicatorWidth;
  // Account for separators between columns
  const separatorCount = Math.max(0, effectiveVisibleColumns.length - 1);
  const availableForColumns = columnsWidth - separatorCount;

  // Empty state
  if (state.columns.length === 0) {
    return (
      <Box flexDirection="row" width={width} height={height}>
        <Text dimColor>No columns to display</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row" width={width} height={height}>
      {/* Left scroll indicator */}
      {hasLeftIndicator && <ScrollIndicator direction="left" height={height} />}

      {/* Columns container with FlexRow for integer-based width distribution */}
      <ConstraintContext.Provider
        value={{
          terminal: { columns: availableForColumns, rows: height },
          parent: { width: availableForColumns, height },
        }}
      >
        <FlexRow>
          {effectiveVisibleColumns.map((col, i) => {
            const actualColIndex = effectiveScrollOffset + i;

            return (
              <React.Fragment key={col.node.id}>
                <FlexItem flex={1}>
                  <ColumnTree
                    column={col}
                    colIndex={actualColIndex}
                    isSelected={actualColIndex === colIndex}
                    selectedCardIndex={cardIndex}
                    selectedSubIndex={subIndex}
                    selectionLevel={selectionLevel}
                  />
                </FlexItem>
              </React.Fragment>
            );
          })}
        </FlexRow>
      </ConstraintContext.Provider>

      {/* Separators rendered separately to maintain clean layout */}
      {effectiveVisibleColumns.length > 1 &&
        effectiveVisibleColumns.slice(0, -1).map((col, i) => (
          <Box
            key={`sep-${col.node.id}`}
            position="absolute"
            marginLeft={
              (hasLeftIndicator ? 1 : 0) +
              Math.floor((availableForColumns / effectiveMaxCols) * (i + 1)) +
              i
            }
          >
            <ColumnSeparator height={height} />
          </Box>
        ))}

      {/* Right scroll indicator */}
      {hasRightIndicator && (
        <ScrollIndicator direction="right" height={height} />
      )}
    </Box>
  );
}
