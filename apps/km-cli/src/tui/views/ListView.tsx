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
import { getOwnColor } from "../board-pills.ts";

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

      {/* Columns as sections */}
      {state.columns.map((column, cIdx) => {
        const isColSelected = selectionLevel === "column" && colIndex === cIdx;
        const isSelected = colIndex === cIdx;
        const colName = getNodeDisplayName(column.node);
        const count = column.cards.length;
        const ownColor = getOwnColor(column.node);

        // Header text color: bright yellow if selected, dim yellow otherwise
        // Exception: if column has its own color, use appropriate text color
        const headerTextColor = ownColor
          ? ["red", "green", "blue", "magenta", "gray", "grey"].includes(
              ownColor,
            )
            ? "white"
            : "black"
          : isSelected
            ? "yellow"
            : "yellowBright";
        const headerDimmed = !isSelected && !ownColor;

        return (
          <React.Fragment key={column.node.id}>
            {/* Blank line above section header (except first section) */}
            {cIdx > 0 && <Text> </Text>}

            {/* Column/section header */}
            <Text
              bold={isSelected}
              color={isColSelected ? "black" : headerTextColor}
              dimColor={headerDimmed}
              backgroundColor={isColSelected ? "cyan" : ownColor || undefined}
              wrap="truncate"
            >
              {colName} ({count})
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
          </React.Fragment>
        );
      })}

      {state.columns.length === 0 && (
        <Text dimColor>No columns to display</Text>
      )}
    </Box>
  );
}
