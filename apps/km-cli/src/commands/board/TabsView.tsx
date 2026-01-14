/**
 * Tabs View Component
 *
 * Similar to list view but with tab-based navigation between columns.
 * Only shows one column at a time with tabs at the top for switching.
 */
import React from "react";
import { Box, Text } from "ink";
import type { Node } from "@km/core";
import { getChildren } from "@km/store";
import type { BoardState, SelectionKey } from "./types.ts";
import { makeSelectionKey } from "./InkBoard.tsx";
import { getNodeDisplayName, getParentContext } from "@km/shared";

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
}

/**
 * Get status icon for tasks
 */
function getStatusIcon(status: string | null | undefined): string {
  switch (status) {
    case "done":
      return "\u2713"; // checkmark
    case "in_progress":
      return "\u25D0"; // half circle
    case "blocked":
      return "\u2298"; // circled slash
    case "waiting":
      return "\u25F7"; // clock
    case "dropped":
      return "\u2205"; // empty set
    default:
      return "\u25CB"; // empty circle
  }
}

/**
 * Get type icon for non-task nodes
 */
function getTypeIcon(type: string): string {
  switch (type) {
    case "folder":
      return "\uD83D\uDCC1"; // folder
    case "file":
      return "\uD83D\uDCC4"; // file
    case "section":
      return "\u00A7"; // section
    case "paragraph":
      return "\u00B6"; // pilcrow
    case "code":
      return "\u2328"; // keyboard
    case "quote":
      return "\u275D"; // quote
    default:
      return "\u2022"; // bullet
  }
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
  subIndex,
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

  // Transclusion indicator
  const transclusionMark = isTranscluded ? "\u2192" : "";

  // Build prefix with indent (1 space per level for compactness)
  const indent = " ".repeat(depth);
  const prefix = `${indent}${foldIndicator}${icon}${transclusionMark} `;

  // Info columns
  const infoParts: string[] = [];

  if (node.priority) {
    infoParts.push(`P${node.priority}`);
  }

  if (node.assigned_to) {
    infoParts.push(`@${node.assigned_to}`);
  }

  if (node.due_date) {
    const due = new Date(node.due_date);
    const dueStr = due.toISOString().slice(5, 10);
    infoParts.push(`\u23F0${dueStr}`);
  } else if (node.scheduled_date) {
    const sched = new Date(node.scheduled_date);
    const schedStr = sched.toISOString().slice(5, 10);
    infoParts.push(`\u25B6${schedStr}`);
  }

  const infoSuffix = infoParts.length > 0 ? `  ${infoParts.join(" ")}` : "";

  // Parent context suffix
  const maxContextLen = 20;
  const truncatedContext = parentContext
    ? parentContext.length > maxContextLen
      ? parentContext.slice(0, maxContextLen - 1) + "\u2026"
      : parentContext
    : null;
  const contextSuffix = truncatedContext ? ` < ${truncatedContext}` : "";

  // Calculate available width
  const fixedWidth =
    prefix.length +
    foldedCount.length +
    infoSuffix.length +
    contextSuffix.length;
  const availWidth = Math.max(1, width - fixedWidth);
  const truncatedContent =
    firstLine.length > availWidth
      ? firstLine.slice(0, availWidth - 1) + "\u2026"
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
  let nextSubIndex = subIndex + 1;

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
            <Box flexDirection="column" height={contentHeight} overflowY="hidden">
              {scrollOffset > 0 && (
                <Text dimColor> {"\u25B2"} {scrollOffset} above</Text>
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
                    currentSubIndex={0}
                  />
                );
              })}
              {needsScroll &&
                scrollOffset + visibleCards.length < count && (
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
