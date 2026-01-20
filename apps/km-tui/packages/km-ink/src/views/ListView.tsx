/**
 * List View Component
 *
 * Full-width tree/outline view of the board hierarchy.
 * Shows the same data as board view but in a hierarchical list format.
 *
 * Uses inkx overflow="scroll" for native scrolling support.
 */
import React, { useMemo } from "react";
import { Box, Text } from "inkx";
import type { BoardState, CardState } from "../types.ts";
import { TreeNode } from "./TreeNode.tsx";
import { getNodeDisplayName } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";
import { useTreeConfig } from "../ui-context.tsx";

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
  const { inOutlineMode } = useTreeConfig();

  // Flatten all cards into a single list
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

  // Empty state
  if (state.columns.length === 0) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Text> </Text>
        <Text dimColor>No columns to display</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={width} maxHeight={height} overflow="hidden">
      {/* Blank line at top */}
      <Box height={1} flexShrink={0}>
        <Text> </Text>
      </Box>

      {/* Scrollable list using inkx native scrolling */}
      <Box
        flexDirection="column"
        flexGrow={1}
        minHeight={1}
        overflow="scroll"
        scrollTo={selectedFlatIndex}
      >
        {flatItems.map((item, index) => {
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
        })}
      </Box>
    </Box>
  );
}
