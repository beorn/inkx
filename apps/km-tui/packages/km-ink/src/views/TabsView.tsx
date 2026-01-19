/**
 * Tabs View Component
 *
 * Similar to list view but with tab-based navigation between columns.
 * Only shows one column at a time with tabs at the top for switching.
 *
 * Uses inkx overflow="scroll" for native scrolling support.
 */
import React from "react";
import { Box, Text } from "inkx";
import type { BoardState, CardState } from "../types.ts";
import { TreeNode } from "./TreeNode.tsx";
import { getNodeDisplayName } from "../state.ts";
import { useTreeConfig } from "../ui-context.tsx";

interface TabsViewProps {
  state: BoardState;
  width: number;
  height: number;
  colIndex: number;
  cardIndex: number;
  subIndex: number;
  selectionLevel: "board" | "column" | "card";
}

export function TabsView({
  state,
  width,
  height,
  colIndex,
  cardIndex,
  subIndex,
  selectionLevel,
}: TabsViewProps): React.ReactElement {
  const { inOutlineMode } = useTreeConfig();

  // Layout breakdown:
  // - 1 line: top spacer
  // - 1 line: tab bar
  // - 1 line: border
  // - rest: content
  const headerHeight = 3;
  const contentHeight = Math.max(1, height - headerHeight);

  // Get current column
  const currentColumn = state.columns[colIndex];
  const count = currentColumn?.cards.length ?? 0;

  // Column header is selected when at column level
  const isColumnHeaderSelected = selectionLevel === "column";

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Spacer line between top bar and tabs */}
      <Box height={1} />

      {/* Tab bar - simple pipe-separated tabs */}
      <Box flexDirection="row" width={width} height={1}>
        {state.columns.map((column, cIdx) => {
          const isActive = cIdx === colIndex;
          const colName = getNodeDisplayName(column.node);
          const colCount = column.cards.length;
          // Truncate tab name if needed
          const maxTabWidth =
            Math.floor((width - 4) / Math.max(state.columns.length, 1)) - 3;
          const truncatedName =
            colName.length > maxTabWidth
              ? colName.slice(0, maxTabWidth - 1) + "\u2026"
              : colName;

          // Style like cards view column headers
          const isTabSelected = isActive && isColumnHeaderSelected;
          const isBoardLevel = selectionLevel === "board";
          const showActiveHighlight = isActive && !isBoardLevel;

          const textColor = isTabSelected
            ? "black"
            : showActiveHighlight
              ? "yellow"
              : "white";

          return (
            <Box key={column.node.id} marginRight={1}>
              <Text
                bold={showActiveHighlight}
                color={textColor}
                backgroundColor={isTabSelected ? "cyan" : undefined}
                dimColor={!showActiveHighlight && selectionLevel === "board"}
              >
                {truncatedName} ({colCount})
              </Text>
              {cIdx < state.columns.length - 1 && <Text dimColor> │</Text>}
            </Box>
          );
        })}
      </Box>

      {/* Top border only */}
      <Text dimColor>{"─".repeat(width)}</Text>

      {/* Content area with inkx native scrolling */}
      <Box flexDirection="column" width={width} height={contentHeight}>
        {currentColumn ? (
          count > 0 ? (
            <Box
              flexDirection="column"
              height={contentHeight}
              overflow="scroll"
              scrollTo={cardIndex}
            >
              {currentColumn.cards.map((card, actualCardIndex) => {
                const cardSelected =
                  selectionLevel === "card" &&
                  actualCardIndex === cardIndex &&
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
                        actualCardIndex === cardIndex &&
                        subIndex === 0)
                    }
                    colIndex={colIndex}
                    cardIndex={actualCardIndex}
                    subIndex={0}
                  />
                );
              })}
            </Box>
          ) : (
            <Box marginLeft={1}>
              <Text dimColor>(empty)</Text>
            </Box>
          )
        ) : (
          <Text dimColor>No column selected</Text>
        )}
      </Box>
    </Box>
  );
}
