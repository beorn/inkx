/**
 * List View Component
 *
 * Full-width tree/outline view of the board hierarchy.
 * Shows the same data as board view but in a hierarchical list format.
 * Uses virtualization for performance with large lists.
 */
import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { BoardState, SelectionKey, CardState } from "../types.ts";
import { TreeNode, makeSelectionKey } from "./TreeNode.tsx";
import { getNodeDisplayName } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";
import { calculateScrollState } from "../constraints/index.ts";

interface ListViewProps {
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
  selectionLevel: "board" | "column" | "card";
  /** Maximum lines of content to display per node */
  maxContentLines: number;
}

export function ListView({
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
  selectionLevel,
  maxContentLines,
}: ListViewProps): React.ReactElement {
  // In tree view, we show all columns and their cards in a flat hierarchy
  // Root -> Columns -> Cards -> Children

  const availableHeight = height - 2;
  const colWidth = width;

  // Flatten all cards into a single list for virtualization
  // Each item knows its column index for proper selection tracking
  const flatItems = useMemo(() => {
    const items: Array<{
      type: "header" | "card";
      colIdx: number;
      cardIdx: number;
      column: (typeof state.columns)[0];
      card?: CardState;
    }> = [];

    state.columns.forEach((column, cIdx) => {
      // Add column header
      items.push({ type: "header", colIdx: cIdx, cardIdx: -1, column });
      // Add cards
      column.cards.forEach((card, cardIdx) => {
        items.push({ type: "card", colIdx: cIdx, cardIdx, column, card });
      });
    });

    return items;
  }, [state.columns]);

  // Calculate the selected item's index in flat list
  const selectedFlatIndex = useMemo(() => {
    let idx = 0;
    for (let c = 0; c < colIndex; c++) {
      idx += 1 + (state.columns[c]?.cards.length ?? 0); // header + cards
    }
    if (selectionLevel === "column") {
      return idx; // column header
    }
    return idx + 1 + cardIndex; // skip header, then cardIndex
  }, [colIndex, cardIndex, selectionLevel, state.columns]);

  // Virtualize: only render visible items
  // Estimate ~2 lines per item (header or card with content)
  const itemHeight = maxContentLines + 1;
  const scrollState = calculateScrollState(
    flatItems,
    selectedFlatIndex,
    availableHeight - 1, // -1 for top spacer
    itemHeight,
    0,
    true,
  );

  return (
    <Box
      flexDirection="column"
      width={width}
      height={availableHeight}
      alignItems="flex-start"
      overflowY="hidden"
    >
      {/* Blank line at top to separate from top bar */}
      <Text> </Text>

      {/* Top overflow indicator */}
      {scrollState.overflowTop > 0 && (
        <Text dimColor>▲ {scrollState.overflowTop} more above</Text>
      )}

      {/* Virtualized items */}
      {scrollState.visible.map(({ item, index: _flatIdx }) => {
        if (item.type === "header") {
          const column = item.column;
          const cIdx = item.colIdx;
          const isColSelected =
            selectionLevel === "column" && colIndex === cIdx;
          const isSelected = colIndex === cIdx;
          const colName = getNodeDisplayName(column.node);
          const count = column.cards.length;
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
              {colName} ({count})
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
        const cardKey = makeSelectionKey(cIdx, cardIdx, 0);
        const isCardMultiSelected = multiSelected.has(cardKey);

        return (
          <TreeNode
            key={card.node.id}
            node={card.node}
            depth={0}
            width={colWidth - 2}
            isSelected={
              isCardSelected ||
              (selectionLevel === "card" &&
                inOutlineMode &&
                colIndex === cIdx &&
                cardIndex === cardIdx &&
                subIndex === 0)
            }
            isMultiSelected={isCardMultiSelected}
            foldedNodes={foldedNodes}
            maxDepth={maxOutlineDepth + 1}
            colIndex={cIdx}
            cardIndex={cardIdx}
            subIndex={0}
            currentSubIndex={subIndex}
            multiSelected={multiSelected}
            inOutlineMode={inOutlineMode}
            variant="wide"
            maxContentLines={maxContentLines}
          />
        );
      })}

      {/* Bottom overflow indicator */}
      {scrollState.overflowBottom > 0 && (
        <Text dimColor>▼ {scrollState.overflowBottom} more below</Text>
      )}

      {state.columns.length === 0 && (
        <Text dimColor>No columns to display</Text>
      )}
    </Box>
  );
}
