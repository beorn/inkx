/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 */
import React from "react";
import { Box, Text } from "ink";
import type { Node } from "@km/core";
import { getChildren } from "@km/store";
import type { BoardState, ColumnState, SelectionKey } from "./types.ts";
import { makeSelectionKey } from "./InkBoard.tsx";
import { getNodeDisplayName, getParentContext } from "@km/shared";
import { getStatusIcon, getTypeIcon } from "./shared/icons.ts";

interface ColumnsViewProps {
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
  effectiveScrollOffset: number;
  effectiveMaxCols: number;
  effectiveVisibleColumns: ColumnState[];
  selectionLevel: "board" | "column" | "card";
}

interface TreeNodeProps {
  node: Node;
  depth: number;
  width: number;
  isSelected: boolean;
  isMultiSelected: boolean;
  foldedNodes: Set<string>;
  maxDepth: number;
  colIndex: number;
  cardIndex: number;
  subIndex: number;
  multiSelected: Set<SelectionKey>;
  inOutlineMode: boolean;
  currentSubIndex: number;
}

function TreeNode({
  node,
  depth,
  width,
  isSelected,
  isMultiSelected,
  foldedNodes,
  maxDepth,
  colIndex,
  cardIndex,
  multiSelected,
  inOutlineMode,
  currentSubIndex,
}: TreeNodeProps): React.ReactElement {
  const children = getChildren(node.id);
  const hasChildren = children.length > 0;
  const isFolded = foldedNodes.has(node.id);

  // Build line content
  const isTask = node.type === "task";
  const icon = isTask
    ? getStatusIcon(node.task_status)
    : getTypeIcon(node.type);
  const content = node.content || getNodeDisplayName(node);
  const firstLine = content.split("\n")[0] ?? content;

  // Check if this is a transcluded (symlinked) node
  const isTranscluded =
    node.symlink_to !== null && node.symlink_to !== undefined;

  // Get parent context for top-level cards (depth 0)
  const parentContext = depth === 0 && isTask ? getParentContext(node) : null;

  // Fold indicator
  const foldIndicator = hasChildren ? (isFolded ? "\u25B6" : "\u25BC") : " ";
  const foldedCount = hasChildren && isFolded ? ` (${children.length})` : "";

  // Transclusion indicator (→) for symlinked nodes
  const transclusionMark = isTranscluded ? "→" : "";

  // Build prefix with indent (1 space per level for compactness)
  const indent = " ".repeat(depth);
  const prefix = `${indent}${foldIndicator}${icon}${transclusionMark} `;

  // Parent context suffix (greyed out) - truncate to max 15 chars for column view
  const maxContextLen = 15;
  const truncatedContext = parentContext
    ? parentContext.length > maxContextLen
      ? parentContext.slice(0, maxContextLen - 1) + "…"
      : parentContext
    : null;
  const contextSuffix = truncatedContext ? ` < ${truncatedContext}` : "";

  // Calculate available width for content
  const fixedWidth = prefix.length + foldedCount.length + contextSuffix.length;
  const availWidth = Math.max(1, width - fixedWidth);
  const truncatedContent =
    firstLine.length > availWidth
      ? firstLine.slice(0, availWidth - 1) + "…"
      : firstLine;

  // Determine colors
  let backgroundColor: string | undefined;
  let textColor: string | undefined;
  if (isSelected) {
    backgroundColor = "blue";
    textColor = "white";
  } else if (isMultiSelected) {
    backgroundColor = "cyan";
    textColor = "black";
  }

  // Track sub-indices for children
  let nextSubIndex = currentSubIndex + 1;

  return (
    <Box flexDirection="column" width={width}>
      <Text backgroundColor={backgroundColor} color={textColor} wrap="truncate">
        {prefix}
        {truncatedContent}
        {foldedCount}
        {truncatedContext && <Text dimColor>{contextSuffix}</Text>}
      </Text>
      {hasChildren && !isFolded && depth < maxDepth && (
        <Box flexDirection="column">
          {children.slice(0, 8).map((child) => {
            const childSubIndex = nextSubIndex;
            const childKey = makeSelectionKey(
              colIndex,
              cardIndex,
              childSubIndex,
            );
            const childSelected =
              inOutlineMode && currentSubIndex === childSubIndex;
            const childMultiSelected = multiSelected.has(childKey);

            // Increment for next sibling
            nextSubIndex++;

            return (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                width={width}
                isSelected={childSelected}
                isMultiSelected={childMultiSelected}
                foldedNodes={foldedNodes}
                maxDepth={maxDepth}
                colIndex={colIndex}
                cardIndex={cardIndex}
                subIndex={childSubIndex}
                multiSelected={multiSelected}
                inOutlineMode={inOutlineMode}
                currentSubIndex={childSubIndex}
              />
            );
          })}
          {children.length > 8 && (
            <Text dimColor>
              {indent} +{children.length - 8} more
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}

interface ColumnTreeProps {
  column: ColumnState;
  colIndex: number;
  isSelected: boolean;
  selectedCardIndex: number;
  selectedSubIndex: number;
  width: number;
  height: number;
  maxOutlineDepth: number;
  foldedNodes: Set<string>;
  multiSelected: Set<SelectionKey>;
  inOutlineMode: boolean;
  selectionLevel: "board" | "column" | "card";
}

function ColumnTree({
  column,
  colIndex,
  isSelected,
  selectedCardIndex,
  selectedSubIndex,
  width,
  height,
  maxOutlineDepth,
  foldedNodes,
  multiSelected,
  inOutlineMode,
  selectionLevel,
}: ColumnTreeProps): React.ReactElement {
  const name = getNodeDisplayName(column.node);
  const count = column.cards.length;

  // Available height for cards: column height - border (2) - header (1)
  const contentHeight = Math.max(1, height - 3);
  // Each card row takes ~1 line when folded, estimate generously
  const maxVisibleCards = Math.max(1, contentHeight);

  // Only scroll if we actually have more cards than can fit
  const needsScroll = column.cards.length > maxVisibleCards;
  const scrollOffset = needsScroll
    ? Math.max(
        0,
        Math.min(
          selectedCardIndex - Math.floor(maxVisibleCards / 2),
          Math.max(0, column.cards.length - maxVisibleCards),
        ),
      )
    : 0;

  const visibleCards = column.cards.slice(
    scrollOffset,
    scrollOffset + maxVisibleCards,
  );

  // Column header is selected when at column level
  const isColumnHeaderSelected = isSelected && selectionLevel === "column";

  const headerText = `${name} (${count})`;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={isSelected ? "blueBright" : "blackBright"}
    >
      {/* Column header */}
      <Text
        bold
        color={isColumnHeaderSelected ? "white" : "yellow"}
        backgroundColor={isColumnHeaderSelected ? "blue" : undefined}
        wrap="truncate"
      >
        {headerText}
      </Text>

      {/* Cards as tree nodes */}
      <Box flexDirection="column" height={height - 3} overflowY="hidden">
        {scrollOffset > 0 && <Text dimColor> ▲ {scrollOffset} above</Text>}
        {visibleCards.map((card, i) => {
          const actualCardIndex = scrollOffset + i;
          const cardKey = makeSelectionKey(colIndex, actualCardIndex, 0);
          // Card is only selected when at card level
          const cardSelected =
            selectionLevel === "card" &&
            isSelected &&
            actualCardIndex === selectedCardIndex &&
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
                  isSelected &&
                  actualCardIndex === selectedCardIndex &&
                  selectedSubIndex === 0)
              }
              isMultiSelected={cardMultiSelected}
              foldedNodes={foldedNodes}
              maxDepth={maxOutlineDepth}
              colIndex={colIndex}
              cardIndex={actualCardIndex}
              subIndex={0}
              multiSelected={multiSelected}
              inOutlineMode={inOutlineMode}
              currentSubIndex={0}
            />
          );
        })}
        {needsScroll &&
          scrollOffset + visibleCards.length < column.cards.length && (
            <Text dimColor>
              {"  "}▼ {column.cards.length - scrollOffset - visibleCards.length}{" "}
              below
            </Text>
          )}
      </Box>
    </Box>
  );
}

export function ColumnsView({
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
  effectiveScrollOffset,
  effectiveMaxCols,
  effectiveVisibleColumns,
  selectionLevel,
}: ColumnsViewProps): React.ReactElement {
  // Calculate column widths
  const hasLeftIndicator = effectiveScrollOffset > 0;
  const hasRightIndicator =
    effectiveScrollOffset + effectiveMaxCols < state.columns.length;
  const indicatorWidth =
    (hasLeftIndicator ? 1 : 0) + (hasRightIndicator ? 1 : 0);
  const availableWidth = width - indicatorWidth;
  const baseColWidth = Math.floor(availableWidth / effectiveMaxCols);
  const remainder = availableWidth % effectiveMaxCols;

  return (
    <Box flexDirection="row" width={width} height={height}>
      {/* Left scroll indicator */}
      {hasLeftIndicator && (
        <Box flexDirection="column" width={1} height={height - 1}>
          {Array.from({ length: height - 1 }).map((_, i) => (
            <Text key={i} backgroundColor="gray" color="white">
              {i === Math.floor((height - 1) / 2) ? "‹" : " "}
            </Text>
          ))}
        </Box>
      )}

      {/* Columns with tree view inside */}
      {effectiveVisibleColumns.map((col, i) => {
        const actualColIndex = effectiveScrollOffset + i;
        // Distribute extra pixels to the first 'remainder' columns
        const colWidth = baseColWidth + (i < remainder ? 1 : 0);
        return (
          <ColumnTree
            key={col.node.id}
            column={col}
            colIndex={actualColIndex}
            isSelected={actualColIndex === colIndex}
            selectedCardIndex={cardIndex}
            selectedSubIndex={subIndex}
            width={colWidth}
            height={height}
            maxOutlineDepth={maxOutlineDepth}
            foldedNodes={foldedNodes}
            multiSelected={multiSelected}
            inOutlineMode={inOutlineMode}
            selectionLevel={selectionLevel}
          />
        );
      })}

      {/* Right scroll indicator */}
      {hasRightIndicator && (
        <Box flexDirection="column" width={1} height={height - 1}>
          {Array.from({ length: height - 1 }).map((_, i) => (
            <Text key={i} backgroundColor="gray" color="white">
              {i === Math.floor((height - 1) / 2) ? "›" : " "}
            </Text>
          ))}
        </Box>
      )}

      {state.columns.length === 0 && (
        <Text dimColor>No columns to display</Text>
      )}
    </Box>
  );
}
