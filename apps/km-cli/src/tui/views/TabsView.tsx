/**
 * Tabs View Component
 *
 * Similar to list view but with tab-based navigation between columns.
 * Only shows one column at a time with tabs at the top for switching.
 */
import React from "react";
import { Box, Text } from "ink";
import type { BoardState, SelectionKey } from "../types.ts";
import { TreeNode, makeSelectionKey } from "./TreeNode.tsx";
import { getNodeDisplayName } from "@km/shared";

interface TabsViewProps {
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

export function TabsView({
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
}: TabsViewProps): React.ReactElement {
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

  // Border color - match cards view style
  const borderColor = isColumnHeaderSelected ? "blueBright" : "blackBright";

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

          // Style like cards view column headers:
          // - Active + column level selected: white on blue
          // - Active + card level: yellow, bold
          // - Active + board level: dim (no selection highlight)
          // - Inactive: dim
          const isTabSelected = isActive && isColumnHeaderSelected;
          const isBoardLevel = selectionLevel === "board";
          const showActiveHighlight = isActive && !isBoardLevel;

          // Tab text color:
          // - Selected (column level): white on blue
          // - Active (card level): yellow
          // - Inactive: white (not dim)
          // - Board level: dim
          const textColor = isTabSelected
            ? "white"
            : showActiveHighlight
              ? "yellow"
              : "white";

          return (
            <Box key={column.node.id} marginRight={1}>
              <Text
                bold={showActiveHighlight}
                color={textColor}
                backgroundColor={isTabSelected ? "blue" : undefined}
                dimColor={!showActiveHighlight && selectionLevel === "board"}
              >
                {truncatedName} ({colCount})
              </Text>
              {cIdx < state.columns.length - 1 && <Text dimColor> │</Text>}
            </Box>
          );
        })}
      </Box>

      {/* Content area with full border */}
      <Box
        flexDirection="column"
        width={width}
        height={height - tabBarHeight - 2}
        borderStyle="single"
        borderColor={borderColor}
      >
        {currentColumn ? (
          count > 0 ? (
            <Box
              flexDirection="column"
              height={contentHeight}
              overflowY="hidden"
            >
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
                    width={width - 4}
                    isSelected={
                      cardSelected ||
                      (selectionLevel === "card" &&
                        inOutlineMode &&
                        actualCardIndex === cardIndex &&
                        subIndex === 0)
                    }
                    isMultiSelected={cardMultiSelected}
                    foldedNodes={foldedNodes}
                    maxDepth={maxOutlineDepth}
                    colIndex={colIndex}
                    cardIndex={actualCardIndex}
                    subIndex={0}
                    multiSelected={multiSelected}
                    inOutlineMode={inOutlineMode}
                    currentSubIndex={subIndex}
                    variant="wide"
                    maxContentLines={maxContentLines}
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
