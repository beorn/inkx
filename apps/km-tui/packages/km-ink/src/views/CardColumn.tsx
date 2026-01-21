/**
 * Card and Column components for the Board view
 *
 * Uses inkx overflow="scroll" for native scrolling support.
 */
import React from "react";
import { Box, Text } from "inkx";
import { styledUnderline } from "@beorn/chalkx";
import type { CardState, ColumnState } from "../types.ts";
import { getNodeDisplayName, getCollapsedTypeSuffix } from "../state.ts";
import { getOwnColor, getHeaderStyle } from "../board-pills.ts";
import { TreeNode } from "./TreeNode.tsx";
import { getNodeIcon, renderPlain } from "../text/index.ts";

// =============================================================================
// Card Component
// =============================================================================

export interface CardProps {
  card: CardState;
  isSelected: boolean;
  selectedSubIndex: number;
  width: number;
  colIndex: number;
  cardIndex: number;
}

export function Card({
  card,
  isSelected,
  selectedSubIndex,
  width,
  colIndex,
  cardIndex,
}: CardProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      width={width}
      borderStyle="round"
      borderColor={isSelected ? "yellow" : "blackBright"}
    >
      <TreeNode
        node={card.node}
        depth={0}
        isSelected={isSelected && selectedSubIndex === 0}
        colIndex={colIndex}
        cardIndex={cardIndex}
        subIndex={0}
        dimInactiveChildren={!isSelected}
      />
    </Box>
  );
}

// =============================================================================
// Column Component
// =============================================================================

export interface ColumnProps {
  column: ColumnState;
  colIndex: number;
  isSelected: boolean;
  isCollapsed: boolean;
  selectedCardIndex: number;
  selectedSubIndex: number;
  width: number;
  height: number;
  selectionLevel: "board" | "column" | "card";
}

export function Column({
  column,
  colIndex,
  isSelected,
  isCollapsed,
  selectedCardIndex,
  selectedSubIndex,
  width,
  height,
  selectionLevel,
}: ColumnProps): React.ReactElement {
  // Render name with wiki links stripped: [[target|alias]] → "alias"
  const name = renderPlain(getNodeDisplayName(column.node));
  const typeSuffix = getCollapsedTypeSuffix(column.node);
  const count = column.cards.length;
  const wipLimit = column.wipLimit;

  // Get column's own color (not inherited) for background
  const ownColor = getOwnColor(column.node);
  const wipExceeded = wipLimit !== undefined && count > wipLimit;

  // Build count display
  const countDisplay =
    wipLimit !== undefined ? `(${count}/${wipLimit})` : `(${count})`;
  const warningIndicator = wipExceeded ? " \u26A0" : "";
  const collapsedIndicator = isCollapsed ? " \u25B8" : "";

  const isColumnSelected = isSelected && selectionLevel === "column";
  const headerStyle = getHeaderStyle(ownColor, isSelected, isColumnSelected);

  // Get consistent bullet icon using getNodeIcon (same rules as TreeNode)
  // - Non-tasks with color: filled circle (●) in that color
  // - Non-tasks without color: small bullet (·)
  const icon = getNodeIcon(null, ownColor, false);
  // When column is selected, icon should be black on yellow bg
  const iconColor = isColumnSelected ? "black" : icon.color;

  return (
    <Box flexDirection="column" width={width} maxHeight={height} overflow="hidden">
      {/* Blank line above header */}
      <Box height={1} flexShrink={0}>
        <Text> </Text>
      </Box>

      {/* Column header with background spanning full width */}
      {/* Bold text, bullet uses getNodeIcon for consistent styling with TreeNode */}
      {/* Note: backgroundColor on Text (not Box) ensures fg color applies correctly */}
      <Box height={1} flexShrink={0} width={width}>
        <Text
          bold
          color={headerStyle.color}
          backgroundColor={headerStyle.backgroundColor}
          dimColor={headerStyle.dimColor}
          wrap="truncate"
        >
          {" "}
          <Text color={iconColor}>{icon.char}</Text>
          {" "}
          {name}
          {typeSuffix ? (
            <Text color={isColumnSelected ? "gray" : undefined} dimColor={!isColumnSelected}>{` ${typeSuffix}`}</Text>
          ) : ""}
          {wipExceeded ? (
            <Text color="red">
              {` ${styledUnderline("curly", [255, 80, 80], countDisplay)}${warningIndicator}`}
            </Text>
          ) : (
            <Text color={isColumnSelected ? "gray" : undefined} dimColor={!isColumnSelected}>{` ${countDisplay}`}</Text>
          )}
          {collapsedIndicator}
          {/* Pad to full column width */}
          {" ".repeat(Math.max(0, width - 4 - name.length - countDisplay.length - (typeSuffix?.length ?? 0) - (collapsedIndicator?.length ?? 0)))}
        </Text>
      </Box>

      {isCollapsed ? (
        <Box
          flexDirection="column"
          flexGrow={1}
          minHeight={1}
          justifyContent="center"
          alignItems="center"
        >
          <Text dimColor>[collapsed - {count}]</Text>
        </Box>
      ) : (
        <Box
          flexDirection="column"
          flexGrow={1}
          minHeight={1}
          overflow="scroll"
          scrollTo={selectedCardIndex}
        >
          {column.cards.length === 0 ? (
            <Box marginTop={1}>
              <Text dimColor>(empty)</Text>
            </Box>
          ) : (
            column.cards.map((card: CardState, index: number) => {
              const cardIsSelected =
                isSelected &&
                index === selectedCardIndex &&
                selectionLevel === "card";
              return (
                <Card
                  key={card.node.id}
                  card={card}
                  isSelected={cardIsSelected}
                  selectedSubIndex={cardIsSelected ? selectedSubIndex : -1}
                  width={width}
                  colIndex={colIndex}
                  cardIndex={index}
                />
              );
            })
          )}
        </Box>
      )}
    </Box>
  );
}
