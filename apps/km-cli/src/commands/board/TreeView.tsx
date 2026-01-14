/**
 * Tree View Component
 *
 * Full-width tree/outline view of the board hierarchy.
 * Shows the same data as board view but in a hierarchical list format.
 */
import React from "react";
import { Box, Text } from "ink";
import type { Node } from "@km/core";
import { getChildren } from "@km/store";
import type { BoardState, SelectionKey } from "./types.ts";
import { makeSelectionKey } from "./InkBoard.tsx";
import { getNodeDisplayName, getParentContext } from "@km/shared";
import { getStatusIcon, getTypeIcon } from "./shared/icons.ts";

interface TreeViewProps {
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
  nodeSubIndex: number; // This node's sub-index
  currentSubIndex: number; // The current global selection sub-index
  multiSelected: Set<SelectionKey>;
  inOutlineMode: boolean;
  // Additional info columns
  showStatus?: boolean;
  showDue?: boolean;
  showPriority?: boolean;
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
  nodeSubIndex,
  currentSubIndex,
  multiSelected,
  inOutlineMode,
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

  // Get parent context for top-level cards (depth 1)
  // Shows where the task belongs, e.g., "< Green card" for a task from green-card.md
  // For transcluded items, getParentContext follows symlink_to to get original location
  const parentContext = depth === 1 && isTask ? getParentContext(node) : null;

  // Fold indicator
  const foldIndicator = hasChildren ? (isFolded ? "\u25B6" : "\u25BC") : " ";
  const foldedCount = hasChildren && isFolded ? ` (${children.length})` : "";

  // Transclusion indicator (→) for symlinked nodes
  const transclusionMark = isTranscluded ? "→" : "";

  // Build prefix with indent (1 space per level for compactness)
  const indent = " ".repeat(depth);
  const prefix = `${indent}${foldIndicator}${icon}${transclusionMark} `;

  // Info columns (right side) - organized for quick scanning
  const infoParts: string[] = [];

  // Priority (P1-P5)
  if (node.priority) {
    infoParts.push(`P${node.priority}`);
  }

  // Assignee/owner (@person)
  if (node.assigned_to) {
    infoParts.push(`@${node.assigned_to}`);
  }

  // Date column: show most relevant date
  // Priority: due_date (upcoming) > scheduled_date (planned start)
  if (node.due_date) {
    const due = new Date(node.due_date);
    const dueStr = due.toISOString().slice(5, 10); // MM-DD
    infoParts.push(`⏰${dueStr}`);
  } else if (node.scheduled_date) {
    const sched = new Date(node.scheduled_date);
    const schedStr = sched.toISOString().slice(5, 10);
    infoParts.push(`▶${schedStr}`);
  }

  const infoSuffix = infoParts.length > 0 ? `  ${infoParts.join(" ")}` : "";

  // Parent context suffix (greyed out) - truncate to max 20 chars
  const maxContextLen = 20;
  const truncatedContext = parentContext
    ? parentContext.length > maxContextLen
      ? parentContext.slice(0, maxContextLen - 1) + "…"
      : parentContext
    : null;
  const contextSuffix = truncatedContext ? ` < ${truncatedContext}` : "";

  // Calculate available width for content
  const fixedWidth =
    prefix.length +
    foldedCount.length +
    infoSuffix.length +
    contextSuffix.length;
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
  let nextSubIndex = nodeSubIndex + 1;

  return (
    <Box flexDirection="column" width={width}>
      <Text backgroundColor={backgroundColor} color={textColor} wrap="truncate">
        {prefix}
        {truncatedContent}
        {foldedCount}
        {infoSuffix && <Text dimColor>{infoSuffix}</Text>}
        {truncatedContext && <Text dimColor>{contextSuffix}</Text>}
      </Text>
      {hasChildren && !isFolded && depth < maxDepth && (
        <Box flexDirection="column">
          {children.map((child) => {
            const childSubIndex = nextSubIndex;
            const childKey = makeSelectionKey(
              colIndex,
              cardIndex,
              childSubIndex,
            );
            const childSelected =
              inOutlineMode && currentSubIndex === childSubIndex;
            const childMultiSelected = multiSelected.has(childKey);

            // Increment for next sibling (accounting for this child's descendants)
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
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export function TreeView({
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
}: TreeViewProps): React.ReactElement {
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
                  multiSelected={multiSelected}
                  inOutlineMode={inOutlineMode}
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
