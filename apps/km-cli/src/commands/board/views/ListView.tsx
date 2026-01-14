/**
 * List View Component
 *
 * Full-width tree/outline view of the board hierarchy.
 * Shows the same data as board view but in a hierarchical list format.
 */
import React from "react";
import { Box, Text } from "ink";
import type { BoardState, SelectionKey } from "../types.ts";
import { TreeNode, makeSelectionKey } from "./TreeNode.tsx";
import { getNodeDisplayName } from "@km/shared";

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
}: ListViewProps): React.ReactElement {
  // In tree view, we show all columns and their cards in a flat hierarchy
  // Root -> Columns -> Cards -> Children

  const availableHeight = height - 2;
  const colWidth = width;

  return (
    <Box flexDirection="column" width={width} height={availableHeight}>
      {/* Columns as bordered sections */}
      {state.columns.map((column, cIdx) => {
        const isColSelected = selectionLevel === "column" && colIndex === cIdx;
        const isColumnActive = colIndex === cIdx;
        const colName = getNodeDisplayName(column.node);
        const count = column.cards.length;
        const borderColor = isColumnActive ? "blueBright" : "blackBright";

        const headerText = `${colName} (${count})`;

        return (
          <Box
            key={column.node.id}
            flexDirection="column"
            width={colWidth}
            borderStyle="single"
            borderColor={borderColor}
          >
            {/* Column header - use inverse for full-width selection highlight */}
            <Text
              bold
              color={isColSelected ? "white" : "yellow"}
              backgroundColor={isColSelected ? "blue" : undefined}
              wrap="truncate"
            >
              {headerText}
            </Text>

            {/* Cards in column */}
            {column.cards.map((card, cardIdx) => {
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
                  width={colWidth - 4}
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
                />
              );
            })}
          </Box>
        );
      })}

      {state.columns.length === 0 && (
        <Text dimColor>No columns to display</Text>
      )}
    </Box>
  );
}
