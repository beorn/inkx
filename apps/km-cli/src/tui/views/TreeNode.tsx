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

/**
 * Render text with wiki links [[like this]] styled as underlined text
 * without the brackets
 */
function renderStyledText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match [[wiki links]] - capture the link text without brackets
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = wikiLinkRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add the wiki link with underline styling (no brackets)
    const linkText = match[1];
    parts.push(
      <Text key={`link-${keyIndex++}`} underline dimColor>
        {linkText}
      </Text>,
    );
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

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
  /** Maximum lines of content to display per node (default: 1) */
  maxContentLines?: number;
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
  maxContentLines = 1,
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
  const contentLines = content.split("\n");

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

  // Word-wrap content to fit available width, respecting maxContentLines
  const wrappedLines: string[] = [];

  for (const line of contentLines) {
    if (wrappedLines.length >= maxContentLines) break;

    if (line.length <= availWidth) {
      wrappedLines.push(line);
    } else {
      // Word wrap this line
      let remaining = line;
      while (remaining.length > 0 && wrappedLines.length < maxContentLines) {
        if (remaining.length <= availWidth) {
          wrappedLines.push(remaining);
          break;
        }
        // Find break point at space, or force break at availWidth
        let breakPoint = remaining.lastIndexOf(" ", availWidth);
        if (breakPoint <= 0) breakPoint = availWidth;
        wrappedLines.push(remaining.slice(0, breakPoint));
        remaining = remaining.slice(breakPoint).trimStart();
      }
    }
  }

  // Truncate last line if we hit the limit and there's more content
  const hasMoreContent =
    wrappedLines.length >= maxContentLines &&
    (contentLines.length > 1 ||
      (contentLines[0]?.length ?? 0) > availWidth * maxContentLines);
  if (hasMoreContent && wrappedLines.length > 0) {
    const lastLine = wrappedLines[wrappedLines.length - 1] ?? "";
    if (lastLine.length >= availWidth) {
      wrappedLines[wrappedLines.length - 1] =
        lastLine.slice(0, availWidth - 1) + "…";
    }
  }

  const firstLine = wrappedLines[0] ?? "";
  const additionalLines = wrappedLines.slice(1);

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

  // Build continuation indent for wrapped lines (aligns with content start)
  const continuationIndent = " ".repeat(prefix.length);

  return (
    <Box flexDirection="column" width={width}>
      {/* First line with prefix, fold indicator, info suffix, and context */}
      <Text backgroundColor={backgroundColor} color={textColor} wrap="truncate">
        {prefix}
        {renderStyledText(firstLine)}
        {foldedCount}
        {infoSuffix && <Text dimColor>{infoSuffix}</Text>}
        {truncatedContext && <Text dimColor>{contextSuffix}</Text>}
      </Text>
      {/* Additional wrapped content lines */}
      {additionalLines.map((line, i) => (
        <Text
          key={`wrap-${i}`}
          backgroundColor={backgroundColor}
          color={textColor}
          wrap="truncate"
        >
          {continuationIndent}
          {renderStyledText(line)}
        </Text>
      ))}
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
                maxContentLines={maxContentLines}
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
