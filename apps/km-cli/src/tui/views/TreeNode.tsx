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
import type { Node } from "@km/core";
import { getChildren } from "@km/store";
import { getNodeDisplayName, getParentContext } from "@km/shared";
import {
  getStatusIcon,
  getTypeIcon,
  renderRich,
  displayLength,
} from "../../text/index.ts";
import { constrainText, renderParentPath } from "../layout/index.ts";
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
  subIndex: number;
  currentSubIndex: number;
  multiSelected: Set<SelectionKey>;
  inOutlineMode: boolean;
  variant?: "compact" | "wide";
  maxContentLines?: number;
  /** Dim child items when this subtree is not the active card (for cards view) */
  dimInactiveChildren?: boolean;
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
}: TreeNodeProps): React.ReactElement {
  const children = getChildren(node.id);
  const hasChildren = children.length > 0;
  const isFolded = foldedNodes.has(node.id);
  const isCompact = variant === "compact";

  // Build styled content using layered rendering
  const isTask = node.type === "task";
  const statusIcon = isTask ? getStatusIcon(node.task_status) : null;
  const typeIcon = isTask ? "" : getTypeIcon(node.type);
  // For sections, use getNodeDisplayName which strips inline rules
  // For tasks and other types, use raw content
  const rawContent =
    node.type === "section"
      ? getNodeDisplayName(node)
      : node.content || getNodeDisplayName(node);

  // Layer 1: Render to styled ANSI string (strips [[links]], [fields::], applies styling)
  const styledContent = renderRich(rawContent);

  // Check if embedded (symlink to another node)
  const isEmbedded = node.symlink_to != null;

  // Parent context for embedded tasks
  const contextDepth = isCompact ? 0 : 1;
  const parentContext =
    depth === contextDepth && isTask && isEmbedded
      ? getParentContext(node)
      : null;

  // Build prefix
  const foldIndicator = hasChildren ? (isFolded ? "▶" : "▼") : " ";
  const foldedCount = hasChildren && isFolded ? ` (${children.length})` : "";
  const indent = " ".repeat(depth);
  const iconChar = statusIcon ? statusIcon.char : typeIcon;
  const iconColor = statusIcon ? statusIcon.color : undefined;
  const iconBgColor = statusIcon?.backgroundColor;
  const prefixBeforeIcon = `${indent}${foldIndicator}`;
  const prefixAfterIcon = " ";
  const prefixLength =
    prefixBeforeIcon.length + iconChar.length + prefixAfterIcon.length;

  // Info suffix (wide variant only)
  let infoSuffix = "";
  if (!isCompact) {
    const infoParts: string[] = [];
    if (node.priority) infoParts.push(`P${node.priority}`);
    if (node.assigned_to) infoParts.push(`@${node.assigned_to}`);
    if (node.due_date) {
      const dueStr = new Date(node.due_date).toISOString().slice(5, 10);
      infoParts.push(`⏰${dueStr}`);
    } else if (node.scheduled_date) {
      const schedStr = new Date(node.scheduled_date).toISOString().slice(5, 10);
      infoParts.push(`▶${schedStr}`);
    }
    infoSuffix = infoParts.length > 0 ? `  ${infoParts.join(" ")}` : "";
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
  const fixedWidth =
    prefixLength +
    foldedCount.length +
    infoSuffix.length +
    contextSuffix.length;
  const availWidth = Math.max(1, width - fixedWidth);

  // Layer 2: Constrain styled content to available width and lines
  const { lines: wrappedLines } = constrainText(
    styledContent,
    availWidth,
    maxContentLines,
  );

  const firstLine = wrappedLines[0] ?? "";
  const additionalLines = wrappedLines.slice(1);

  // Selection colors
  let backgroundColor: string | undefined;
  let textColor: string | undefined;
  if (isSelected) {
    backgroundColor = "blue";
    textColor = "white";
  } else if (isMultiSelected) {
    backgroundColor = "cyan";
    textColor = "black";
  }

  // Dim children when this card is not active (cards view mode)
  const shouldDim = dimInactiveChildren && depth > 0;

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
  // Show context on separate line if multi-line content OR if compact mode with context
  const showSeparateContext =
    (isMultiLine && parentContext) || (isCompact && parentContext);

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
          backgroundColor={isSelected || isMultiSelected ? undefined : iconBgColor}
        >
          {iconChar}
        </Text>
        {prefixAfterIcon}
        {firstLine}
        {foldedCount}
        {infoSuffix && <Text dimColor>{infoSuffix}</Text>}
        {showInlineContext && <Text dimColor>{contextSuffix}</Text>}
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

      {/* Separate parent context line for multi-line content */}
      {showSeparateContext && (
        <Text dimColor wrap="truncate">
          {renderParentPath(parentContext, width)}
        </Text>
      )}

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
