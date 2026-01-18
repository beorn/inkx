/**
 * Tabs View Component
 *
 * Similar to list view but with tab-based navigation between columns.
 * Only shows one column at a time with tabs at the top for switching.
 */
import React from "react";
import { Box, Text } from "ink";
import type { BoardState } from "../types.ts";
import { makeSelectionKey } from "../types.ts";
import { TreeNode } from "./TreeNode.tsx";
import { getNodeDisplayName } from "../state.ts";
import { useTreeConfig, useUISelector } from "../ui-context.tsx";

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
  const multiSelected = useUISelector((s) => s.multiSelected);

  // Tab bar height (1 line for spacing + 1 for tabs)
  const tabBarHeight = 2;
  // Content height: total - tab bar - border (2)
  const contentHeight = Math.max(1, height - tabBarHeight - 4);

  // Get current column
  const currentColumn = state.columns[colIndex];
  const count = currentColumn?.cards.length ?? 0;

  // Calculate visible cards with scrolling
  const maxVisibleCards = Math.max(1, contentHeight);
  const needsScroll = count > maxVisibleCards;
  const scrollOffset = needsScroll
    ? Math.max(
        0,
        Math.min(
          cardIndex - Math.floor(maxVisibleCards / 2),
          Math.max(0, count - maxVisibleCards),
        ),
      )
    : 0;

  const visibleCards = currentColumn
    ? currentColumn.cards.slice(scrollOffset, scrollOffset + maxVisibleCards)
    : [];

  // Column header is selected when at column level
  const isColumnHeaderSelected = selectionLevel === "column";

  return (
    <Box flexDirection="column" width={width} height={height - 2}>
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

      {/* Content area */}
      <Box
        flexDirection="column"
        width={width}
        height={height - tabBarHeight - 3}
      >
        {currentColumn ? (
          count > 0 ? (
            <Box flexDirection="column" flexGrow={1} overflowY="hidden">
              {scrollOffset > 0 && (
                <Text dimColor>
                  {" "}
                  {"\u25B2"} {scrollOffset} above
                </Text>
              )}
              {visibleCards.map((card, i) => {
                const actualCardIndex = scrollOffset + i;
                const cardKey = makeSelectionKey(colIndex, actualCardIndex, 0);
                const cardSelected =
                  selectionLevel === "card" &&
                  actualCardIndex === cardIndex &&
                  !inOutlineMode;
                const cardMultiSelected = multiSelected.has(cardKey);

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
                    isMultiSelected={cardMultiSelected}
                    colIndex={colIndex}
                    cardIndex={actualCardIndex}
                    subIndex={0}
                  />
                );
              })}
              {needsScroll && scrollOffset + visibleCards.length < count && (
                <Text dimColor>
                  {" \u25BC"} {count - scrollOffset - visibleCards.length} below
                </Text>
              )}
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
