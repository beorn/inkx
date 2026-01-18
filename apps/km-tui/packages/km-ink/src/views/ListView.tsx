/**
 * List View Component
 *
 * Full-width tree/outline view of the board hierarchy.
 * Shows the same data as board view but in a hierarchical list format.
 * Uses virtualization for performance with large lists.
 */
import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { BoardState, CardState } from "../types.ts";
import { TreeNode } from "./TreeNode.tsx";
import { OverflowIndicator } from "./OverflowIndicator.tsx";
import { getNodeDisplayName } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";
import { useTreeConfig } from "../ui-context.tsx";
import { calculateScrollState } from "../constraints/index.ts";

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

  const availableHeight = height - 2;
  const colWidth = width;

  // Flatten all cards into a single list for virtualization
  const flatItems = useMemo(() => {
    const items: Array<{
      type: "header" | "card";
      colIdx: number;
      cardIdx: number;
      column: (typeof state.columns)[0];
      card?: CardState;
    }> = [];

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

  // Virtualize: only render visible items
  const itemHeight = maxContentLines + 1;
  const scrollState = calculateScrollState(
    flatItems,
    selectedFlatIndex,
    availableHeight - 1,
    itemHeight,
    0,
    true,
  );

  return (
    <Box
      flexDirection="column"
      width={width}
      height={availableHeight}
      overflowY="hidden"
    >
      {/* Blank line at top */}
      <Text> </Text>

      <OverflowIndicator
        direction="up"
        count={scrollState.overflowTop}
        width={width}
        variant="text"
      />

      {/* Virtualized items */}
      {scrollState.visible.map(({ item }) => {
        if (item.type === "header") {
          const column = item.column;
          const cIdx = item.colIdx;
          const isColSelected =
            selectionLevel === "column" && colIndex === cIdx;
          const isSelected = colIndex === cIdx;
          const ownColor = getOwnColor(column.node);
          const headerStyle = getHeaderStyle(
            ownColor,
            isSelected,
            isColSelected,
          );

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
        if (!card) return null;

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
            width={colWidth}
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
      })}

      <OverflowIndicator
        direction="down"
        count={scrollState.overflowBottom}
        width={width}
        variant="text"
      />

      {state.columns.length === 0 && (
        <Text dimColor>No columns to display</Text>
      )}
    </Box>
  );
}
