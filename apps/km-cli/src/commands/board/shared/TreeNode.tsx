/**
 * Shared TreeNode component for tree/outline views
 *
 * Two variants:
 * - compact: For column views (shorter context, no info columns, limited children)
 * - wide: For full-width views (longer context, info columns, unlimited children)
 */
import React from "react";
import { Box, Text } from "ink";
import type { Node } from "@km/core";
import { getChildren } from "@km/store";
import { getNodeDisplayName, getParentContext } from "@km/shared";
import { getStatusIcon, getTypeIcon } from "./icons.ts";
import type { SelectionKey } from "../types.ts";

// Selection key helper - exported for use by parent components
export function makeSelectionKey(
  col: number,
  card: number,
  sub: number,
): SelectionKey {
  return `${col}:${card}:${sub}`;
}

export interface TreeNodeProps {
  node: Node;
  depth: number;
  width: number;
  isSelected: boolean;
  isMultiSelected: boolean;
  foldedNodes: Set<string>;
  maxDepth: number;
  colIndex: number;
  cardIndex: number;
  /** This node's sub-index in the tree */
  subIndex: number;
  /** The current global selection sub-index */
  currentSubIndex: number;
  multiSelected: Set<SelectionKey>;
  inOutlineMode: boolean;
  /** 'compact' for column views, 'wide' for full-width views */
  variant?: "compact" | "wide";
}

export function TreeNode({
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
  currentSubIndex,
  multiSelected,
  inOutlineMode,
  variant = "wide",
}: TreeNodeProps): React.ReactElement {
  const children = getChildren(node.id);
  const hasChildren = children.length > 0;
  const isFolded = foldedNodes.has(node.id);
  const isCompact = variant === "compact";

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

  // Get parent context for top-level cards
  // Compact: depth 0, Wide: depth 1
  const contextDepth = isCompact ? 0 : 1;
  const parentContext =
    depth === contextDepth && isTask ? getParentContext(node) : null;

  // Fold indicator
  const foldIndicator = hasChildren ? (isFolded ? "\u25B6" : "\u25BC") : " ";
  const foldedCount = hasChildren && isFolded ? ` (${children.length})` : "";

  // Transclusion indicator (→) for symlinked nodes
  const transclusionMark = isTranscluded ? "→" : "";

  // Build prefix with indent (1 space per level for compactness)
  const indent = " ".repeat(depth);
  const prefix = `${indent}${foldIndicator}${icon}${transclusionMark} `;

  // Info columns (right side) - only for wide variant
  let infoSuffix = "";
  if (!isCompact) {
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
    if (node.due_date) {
      const due = new Date(node.due_date);
      const dueStr = due.toISOString().slice(5, 10); // MM-DD
      infoParts.push(`⏰${dueStr}`);
    } else if (node.scheduled_date) {
      const sched = new Date(node.scheduled_date);
      const schedStr = sched.toISOString().slice(5, 10);
      infoParts.push(`▶${schedStr}`);
    }

    infoSuffix = infoParts.length > 0 ? `  ${infoParts.join(" ")}` : "";
  }

  // Parent context suffix (greyed out)
  // Compact: 15 chars, Wide: 20 chars
  const maxContextLen = isCompact ? 15 : 20;
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
  let nextSubIndex = subIndex + 1;

  // Child limit for compact variant
  const maxChildren = isCompact ? 8 : Infinity;
  const visibleChildren = children.slice(0, maxChildren);
  const hiddenCount = children.length - visibleChildren.length;

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
          {visibleChildren.map((child) => {
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
                currentSubIndex={currentSubIndex}
                multiSelected={multiSelected}
                inOutlineMode={inOutlineMode}
                variant={variant}
              />
            );
          })}
          {hiddenCount > 0 && (
            <Text dimColor>
              {indent} +{hiddenCount} more
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
