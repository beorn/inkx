/**
 * List View Component
 *
 * Full-width tree/outline view of the board hierarchy.
 * Shows the same data as board view but in a hierarchical list format.
 * Uses virtualization for performance with large lists.
 *
 * Uses the constraint system for reliable layout.
 */
import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { BoardState, CardState } from "../types.ts";
import { TreeNode } from "./TreeNode.tsx";
import { OverflowIndicator } from "./OverflowIndicator.tsx";
import { getNodeDisplayName } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";
import { useTreeConfig } from "../ui-context.tsx";
import { ConstraintContext, ScrollableList } from "../constraints/index.ts";

// Type for flattened list items
type FlatItem =
  | {
      type: "header";
      colIdx: number;
      cardIdx: -1;
      column: BoardState["columns"][0];
      card?: undefined;
    }
  | {
      type: "card";
      colIdx: number;
      cardIdx: number;
      column: BoardState["columns"][0];
      card: CardState;
    };

interface ListViewProps {
  state: BoardState;
  width: number;
  height: number;
  colIndex: number;
  cardIndex: number;
  subIndex: number;
  selectionLevel: "board" | "column" | "card";
}

export function ListView({
  state,
  width,
  height,
  colIndex,
  cardIndex,
  subIndex,
  selectionLevel,
}: ListViewProps): React.ReactElement {
  // Get UI state from context
  const { maxContentLines, inOutlineMode } = useTreeConfig();

  // Full height minus 1 for top spacer line
  const availableHeight = height - 1;

  // Flatten all cards into a single list for virtualization
  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];

    state.columns.forEach((column, cIdx) => {
      items.push({ type: "header", colIdx: cIdx, cardIdx: -1, column });
      column.cards.forEach((card, idx) => {
        items.push({ type: "card", colIdx: cIdx, cardIdx: idx, column, card });
      });
    });

    return items;
  }, [state.columns]);

  // Calculate the selected item's index in flat list
  const selectedFlatIndex = useMemo(() => {
    let idx = 0;
    for (let c = 0; c < colIndex; c++) {
      idx += 1 + (state.columns[c]?.cards.length ?? 0);
    }
    return selectionLevel === "column" ? idx : idx + 1 + cardIndex;
  }, [colIndex, cardIndex, selectionLevel, state.columns]);

  // Render function for ScrollableList
  const renderItem = (
    item: FlatItem,
    _index: number,
    _isSelected: boolean,
  ): React.ReactNode => {
    if (item.type === "header") {
      const column = item.column;
      const cIdx = item.colIdx;
      const isColSelected = selectionLevel === "column" && colIndex === cIdx;
      const isSelected = colIndex === cIdx;
      const ownColor = getOwnColor(column.node);
      const headerStyle = getHeaderStyle(ownColor, isSelected, isColSelected);

      return (
        <Text
          key={`header-${column.node.id}`}
          bold={isSelected}
          color={headerStyle.color}
          dimColor={headerStyle.dimColor}
          backgroundColor={headerStyle.backgroundColor}
          wrap="truncate"
        >
          {getNodeDisplayName(column.node)} ({column.cards.length})
        </Text>
      );
    }

    // Card item
    const card = item.card;
    const cIdx = item.colIdx;
    const cardIdx = item.cardIdx;
    const isCardSelected =
      selectionLevel === "card" &&
      colIndex === cIdx &&
      cardIndex === cardIdx &&
      !inOutlineMode;

    return (
      <TreeNode
        key={card.node.id}
        node={card.node}
        depth={0}
        width={width}
        isSelected={
          isCardSelected ||
          (selectionLevel === "card" &&
            inOutlineMode &&
            colIndex === cIdx &&
            cardIndex === cardIdx &&
            subIndex === 0)
        }
        colIndex={cIdx}
        cardIndex={cardIdx}
        subIndex={0}
      />
    );
  };

  // Custom overflow renderer
  const renderOverflow = (
    direction: "top" | "bottom",
    count: number,
  ): React.ReactNode => {
    return (
      <OverflowIndicator
        direction={direction === "top" ? "up" : "down"}
        count={count}
        width={width}
        variant="text"
      />
    );
  };

  // Empty state
  if (state.columns.length === 0) {
    return (
      <Box
        flexDirection="column"
        width={width}
        height={height}
        overflowY="hidden"
      >
        <Text> </Text>
        <Text dimColor>No columns to display</Text>
      </Box>
    );
  }

  // Item height (maxContentLines + 1 for spacing)
  const itemHeight = maxContentLines + 1;

  // Content height after top spacer
  const contentHeight = availableHeight - 1;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflowY="hidden"
    >
      {/* Blank line at top */}
      <Text> </Text>

      {/* Virtualized list using ScrollableList */}
      <ConstraintContext.Provider
        value={{
          terminal: { columns: width, rows: contentHeight },
          parent: { width, height: contentHeight },
        }}
      >
        <ScrollableList
          items={flatItems}
          selectedIndex={selectedFlatIndex}
          itemHeight={itemHeight}
          height={contentHeight}
          renderItem={renderItem}
          renderOverflow={renderOverflow}
        />
      </ConstraintContext.Provider>
    </Box>
  );
}
