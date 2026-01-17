/**
 * Shared TreeNode component for tree/outline views
 *
 * Two variants:
 * - compact: For column views (shorter context, no info columns, limited children)
 * - wide: For full-width views (longer context, info columns, unlimited children)
 *
 * Uses the layered rendering approach:
 * 1. renderRich() - convert raw content to styled ANSI string
 * 2. constrainText() - wrap and truncate using display length
 * 3. Render each line in <Text>
 */
import React from "react";
import { Box, Text } from "ink";
import type { KNode } from "@km/core";
import { getChildren } from "@km/storage";
import { getNodeDisplayName, getParentContext } from "../state.ts";
import {
  getTypeIcon,
  getNodeIcon,
  renderRich,
  displayLength,
  styledUnderline,
} from "../text/index.ts";
import { constrainText } from "../layout/index.ts";
import type { SelectionKey } from "../types.ts";
import {
  getBoardPills,
  formatBoardPills,
  getOwnColor,
} from "../board-pills.ts";

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
  subIndex: number;
  currentSubIndex: number;
  multiSelected: Set<SelectionKey>;
  inOutlineMode: boolean;
  variant?: "compact" | "wide";
  maxContentLines?: number;
  /** Dim child items when this subtree is not the active card (for cards view) */
  dimInactiveChildren?: boolean;
  /** Board IDs to exclude from pills (e.g., current board being viewed) */
  excludeBoardIds?: Set<string>;
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
  dimInactiveChildren = false,
  excludeBoardIds = new Set(),
}: TreeNodeProps): React.ReactElement {
  const children = getChildren(node.id);
  const hasChildren = children.length > 0;
  const isFolded = foldedNodes.has(node.id);
  const isCompact = variant === "compact";

  // Build styled content using layered rendering
  const isTask = node.type === "task";
  // Only nodes that define their own color get colored background (non-tasks) or colored status icon (tasks)
  // Tasks linked to boards show the board pill instead (right-aligned)
  const ownColor = getOwnColor(node);
  // For tasks: use status icon with optional color override
  // For non-tasks with ownColor: use type icon (background will be the color)
  // For non-tasks without ownColor: use type icon
  const nodeIcon = isTask ? getNodeIcon(node.task_status, ownColor) : null;
  const typeIcon = isTask ? "" : getTypeIcon(node.type);
  // For sections, use getNodeDisplayName which strips inline rules
  // For tasks and other types, use raw content
  const rawContent =
    node.type === "section"
      ? getNodeDisplayName(node)
      : node.content || getNodeDisplayName(node);

  // Check if embedded (symlink to another node)
  const isEmbedded = node.symlink_to != null;

  // Layer 1: Render to styled ANSI string (strips [[links]], [fields::], applies styling)
  const styledContent = renderRich(rawContent);

  // Parent context for embedded tasks - show at depth 0 (top-level cards) only
  // This indicates where the task actually lives vs where it's embedded
  const parentContext =
    depth === 0 && isTask && isEmbedded ? getParentContext(node) : null;

  // Build prefix
  const foldIndicator = hasChildren ? (isFolded ? "▶" : "▼") : " ";
  const foldedCount = hasChildren && isFolded ? ` (${children.length})` : "";
  const indent = " ".repeat(depth);
  // Use nodeIcon for tasks, otherwise fall back to typeIcon
  // Non-tasks with ownColor now use background color instead of colored disc
  const iconChar = nodeIcon ? nodeIcon.char : typeIcon;
  const iconColor = nodeIcon ? nodeIcon.color : undefined;
  const iconBgColor = nodeIcon?.backgroundColor;
  const prefixBeforeIcon = `${indent}${foldIndicator}`;
  const prefixAfterIcon = " ";
  const prefixLength =
    prefixBeforeIcon.length + iconChar.length + prefixAfterIcon.length;

  // Board pills - show which boards this task is on
  // In compact mode: just colored dots; in wide mode: @boardname format
  const boardPills = isTask ? getBoardPills(node, excludeBoardIds) : [];
  const boardPillsStr = formatBoardPills(boardPills, isCompact);

  // Info suffix (wide variant only, except board pills which show in both)
  let infoSuffix = "";
  if (!isCompact) {
    const infoParts: string[] = [];
    if (node.priority) infoParts.push(`P${node.priority}`);
    if (node.assigned_to) infoParts.push(`@${node.assigned_to}`);
    if (node.due_date) {
      const dueDate = new Date(node.due_date);
      const dueStr = dueDate.toISOString().slice(5, 10);
      const now = new Date();
      const daysUntilDue = Math.floor(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      // Color based on urgency: red (overdue/today), orange (1-2 days), yellow (3-7 days), green (>7 days)
      let dueDisplay = `⏰${dueStr}`;
      if (daysUntilDue < 0) {
        // Overdue - red curly underline
        dueDisplay = styledUnderline("curly", [255, 80, 80], dueDisplay);
      } else if (daysUntilDue <= 1) {
        // Due today or tomorrow - orange underline
        dueDisplay = styledUnderline("curly", [255, 165, 0], dueDisplay);
      } else if (daysUntilDue <= 7) {
        // Due within a week - yellow underline
        dueDisplay = styledUnderline("single", [255, 255, 0], dueDisplay);
      }
      // No underline for dates > 7 days out
      infoParts.push(dueDisplay);
    } else if (node.scheduled_date) {
      const schedStr = new Date(node.scheduled_date).toISOString().slice(5, 10);
      infoParts.push(`▶${schedStr}`);
    }
    if (boardPillsStr) infoParts.push(boardPillsStr);
    infoSuffix = infoParts.length > 0 ? `  ${infoParts.join(" ")}` : "";
  } else if (boardPillsStr) {
    // Compact mode: just show the colored dots
    infoSuffix = ` ${boardPillsStr}`;
  }

  // Parent context suffix
  // For compact mode: always show context on separate line to maximize content space
  // For wide mode: show inline if single line, otherwise separate line
  const maxContextLen = 20;
  const truncatedContextInline =
    !isCompact && parentContext
      ? parentContext.length > maxContextLen
        ? parentContext.slice(0, maxContextLen - 1) + "…"
        : parentContext
      : null;
  const contextSuffix = truncatedContextInline
    ? ` < ${truncatedContextInline}`
    : "";

  // Calculate available width for content
  // Wrapped lines only need to account for the prefix (continuation indent)
  // The first line also has infoSuffix, but we handle that separately
  const wrapWidth = Math.max(1, width - prefixLength);

  // Layer 2: Constrain styled content to available width and lines
  const { lines: wrappedLines } = constrainText(
    styledContent,
    wrapWidth,
    maxContentLines,
  );

  const firstLine = wrappedLines[0] ?? "";
  const additionalLines = wrappedLines.slice(1);

  // Selection colors and own color background
  // Per design system: selection uses cyan bg + black fg
  // Non-tasks with ownColor get the color as background instead of a colored disc
  const darkBgColors = ["red", "green", "blue", "magenta", "gray", "grey"];
  const hasColoredBg = !isTask && !!ownColor;
  let backgroundColor: string | undefined;
  let textColor: string | undefined;
  if (isSelected || isMultiSelected) {
    // Design system: cyan background, black foreground for all selection states
    backgroundColor = "cyan";
    textColor = "black";
  } else if (hasColoredBg && ownColor) {
    backgroundColor = ownColor;
    textColor = darkBgColors.includes(ownColor) ? "white" : "black";
  }

  // Determine if content should be dimmed:
  // - Done/dropped tasks are always dimmed
  // - Children are dimmed when parent card is not active (cards view mode)
  const isDoneOrDropped =
    isTask && (node.task_status === "done" || node.task_status === "dropped");
  const isInactiveChild = dimInactiveChildren && depth > 0;
  const shouldDim = isDoneOrDropped || isInactiveChild;

  // Track sub-indices for children
  let nextSubIndex = subIndex + 1;

  // Child limits
  const maxChildren = isCompact ? 8 : Infinity;
  const visibleChildren = children.slice(0, maxChildren);
  const hiddenCount = children.length - visibleChildren.length;

  // Continuation indent for wrapped lines
  const continuationIndent = " ".repeat(prefixLength);

  // Multi-line context handling
  const isMultiLine = additionalLines.length > 0;
  const showInlineContext = !isMultiLine && truncatedContextInline;
  // Show context on separate line only for embedded tasks (isEmbedded already gates parentContext)
  const showSeparateContext = isEmbedded && parentContext;

  // Calculate padding needed to clear the rest of the line
  // This prevents old content from showing when re-rendering shorter lines
  const firstLineDisplayLen =
    prefixLength +
    displayLength(firstLine) +
    foldedCount.length +
    (showInlineContext
      ? infoSuffix.length + contextSuffix.length
      : infoSuffix.length);
  const firstLinePadding = " ".repeat(Math.max(0, width - firstLineDisplayLen));

  return (
    <Box flexDirection="column" width={width}>
      {/* Parent context line (shown ABOVE task for embedded items) */}
      {/* Italic + ↖ prefix to distinguish from dimmed done/dropped content */}
      {showSeparateContext && parentContext && (
        <Text dimColor italic wrap="truncate">
          {continuationIndent}↖{" "}
          {parentContext.length > width - prefixLength - 3
            ? "…" + parentContext.slice(-(width - prefixLength - 4))
            : parentContext}
        </Text>
      )}

      {/* First line */}
      <Text
        backgroundColor={backgroundColor}
        color={textColor}
        dimColor={shouldDim}
        wrap="truncate"
      >
        {prefixBeforeIcon}
        <Text
          color={isSelected || isMultiSelected ? textColor : iconColor}
          backgroundColor={
            isSelected || isMultiSelected ? undefined : iconBgColor
          }
        >
          {iconChar}
        </Text>
        {prefixAfterIcon}
        {firstLine}
        {foldedCount}
        {infoSuffix && <Text dimColor>{infoSuffix}</Text>}
        {showInlineContext && (
          <Text dimColor italic>
            {contextSuffix}
          </Text>
        )}
        {firstLinePadding}
      </Text>

      {/* Additional wrapped lines */}
      {additionalLines.map((line, i) => {
        const lineLen = prefixLength + displayLength(line);
        const linePad = " ".repeat(Math.max(0, width - lineLen));
        return (
          <Text
            key={`wrap-${i}`}
            backgroundColor={backgroundColor}
            color={textColor}
            dimColor={shouldDim}
            wrap="truncate"
          >
            {continuationIndent}
            {line}
            {linePad}
          </Text>
        );
      })}

      {/* Children */}
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
                dimInactiveChildren={dimInactiveChildren}
                excludeBoardIds={excludeBoardIds}
              />
            );
          })}
          {hiddenCount > 0 && (
            <Text dimColor wrap="truncate">
              {`${indent} +${hiddenCount} more`.padEnd(width)}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
