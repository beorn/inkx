/**
 * Shared TreeNode component for tree/outline views
 *
 * Two variants:
 * - oneliner: Title + parent context inline on one line, truncated (for list/columns/tabs)
 * - multiline: Parent context above title, content can wrap multiple lines (for cards)
 */
import React from "react";
import { Box, Text } from "ink";
import type { KNode } from "@km/core";
import { getChildren as getChildrenFromStorage } from "@km/storage";
import {
  getNodeDisplayName,
  getParentContext as getParentContextFromState,
} from "../state.ts";
import { renderRich, displayLength } from "../text/index.ts";
import { constrainText } from "../layout/index.ts";
import { makeSelectionKey } from "../types.ts";
import {
  useTreeConfig,
  useUISelector,
  useRootBoardId,
} from "../ui-context.tsx";
import {
  getNodeStyle,
  buildPrefix,
  formatInfoSuffix,
  truncateContext,
  VARIANT_CONFIG,
  type GetBoardPillsFn,
} from "./tree-node-helpers.ts";

export interface TreeNodeProps {
  node: KNode;
  depth: number;
  width: number;
  isSelected: boolean;
  colIndex: number;
  cardIndex: number;
  subIndex: number;
  /** Dim child items when this subtree is not the active card (for cards view) */
  dimInactiveChildren?: boolean;
  /** Pre-loaded children (optional - if not provided, fetched from storage) */
  children?: KNode[];
  /** Pre-computed parent context for embedded tasks (optional) */
  parentContext?: string | null;
  /** Callback to fetch children on unfold (optional - defaults to storage lookup) */
  getChildren?: (id: string) => KNode[];
  /** Callback to get parent context for nested embedded tasks (optional) */
  getParentContext?: (node: KNode) => string | null;
  /** Callback to get board pills for info suffix (optional - defaults to storage lookup) */
  getBoardPills?: GetBoardPillsFn;
}

export function TreeNode({
  node,
  depth,
  width,
  isSelected,
  colIndex,
  cardIndex,
  subIndex,
  dimInactiveChildren = false,
  children: childrenProp,
  parentContext: parentContextProp,
  getChildren: getChildrenProp,
  getParentContext: getParentContextProp,
  getBoardPills: getBoardPillsProp,
}: TreeNodeProps): React.ReactElement {
  // Get UI state from context
  const {
    maxOutlineDepth: maxDepth,
    maxContentLines,
    inOutlineMode,
    currentSubIndex,
    variant,
  } = useTreeConfig();
  const foldedNodes = useUISelector((state) => state.foldedNodes);
  const multiSelected = useUISelector((state) => state.multiSelected);
  const rootBoardId = useRootBoardId();

  // Compute derived state from context
  const selectionKey = makeSelectionKey(colIndex, cardIndex, subIndex);
  const isMultiSelected = multiSelected.has(selectionKey);
  const excludeBoardIds = rootBoardId
    ? new Set([rootBoardId])
    : new Set<string>();

  const isOneliner = variant === "oneliner";
  // Use provided children or fetch from storage
  const resolvedGetChildren = getChildrenProp ?? getChildrenFromStorage;
  const children = childrenProp ?? resolvedGetChildren(node.id);
  const hasChildren = children.length > 0;
  const isFolded = foldedNodes.has(node.id);
  const isEmbedded = node.link_to != null;
  const isTask = node.type === "task";

  // Get all styling from helper
  const style = getNodeStyle(
    node,
    isSelected,
    isMultiSelected,
    dimInactiveChildren,
    depth,
  );

  // Build prefix from helper
  const prefix = buildPrefix(
    depth,
    hasChildren,
    isFolded,
    children.length,
    style.icon,
  );

  // Get content
  const rawContent =
    node.type === "section"
      ? getNodeDisplayName(node)
      : node.content || getNodeDisplayName(node);
  const styledContent = renderRich(rawContent);

  // Constrain content to available width
  const wrapWidth = Math.max(1, width - prefix.length);
  const { lines: wrappedLines } = constrainText(
    styledContent,
    wrapWidth,
    maxContentLines,
  );
  const firstLine = wrappedLines[0] ?? "";
  const additionalLines = wrappedLines.slice(1);

  // Info suffix and context (oneliner shows full info, multiline shows compact dots only)
  const infoSuffix = formatInfoSuffix(
    node,
    !isOneliner, // multiline uses compact info (just dots)
    excludeBoardIds,
    getBoardPillsProp,
  );
  // Use provided parentContext or compute it (for embedded tasks at depth 0)
  const resolvedGetParentContext =
    getParentContextProp ?? getParentContextFromState;
  const parentContext =
    parentContextProp !== undefined
      ? parentContextProp
      : depth === 0 && isTask && isEmbedded
        ? resolvedGetParentContext(node)
        : null;
  // Calculate available space for context suffix
  // Reserve: prefix + first line content + info suffix + " < " + some minimum padding
  const firstLineLen = displayLength(firstLine);
  const usedWidth = prefix.length + firstLineLen + infoSuffix.length + 4; // 4 = " < " + buffer
  const contextMaxWidth = Math.max(10, Math.floor((width - usedWidth) * 0.8)); // Use 80% of remaining space
  const truncatedContext = !isCompact
    ? truncateContext(parentContext, contextMaxWidth)
    : null;
  const contextSuffix = truncatedContext ? ` < ${truncatedContext}` : "";

  // Multi-line context handling
  const isMultiLine = additionalLines.length > 0;
  const showInlineContext = !isMultiLine && truncatedContext;
  // Only show separate context above in wide mode when content is multi-line (inline context won't work)
  // Compact mode (columns view) never shows separate context line to keep items compact
  const showSeparateContext =
    !isCompact && isMultiLine && isEmbedded && parentContext;

  // Calculate padding to clear line
  const firstLineDisplayLen =
    prefix.length +
    displayLength(firstLine) +
    prefix.foldedCount.length +
    (showInlineContext
      ? infoSuffix.length + contextSuffix.length
      : infoSuffix.length);
  const firstLinePadding = " ".repeat(Math.max(0, width - firstLineDisplayLen));

  // Continuation indent for wrapped lines
  const continuationIndent = " ".repeat(prefix.length);

  // Child rendering
  const { maxChildren } = VARIANT_CONFIG[variant];
  const visibleChildren = children.slice(0, maxChildren);
  const hiddenCount = children.length - visibleChildren.length;

  return (
    <Box flexDirection="column" width={width}>
      {/* Parent context line (shown ABOVE task for embedded items) */}
      {showSeparateContext && parentContext && (
        <Text dimColor italic wrap="truncate">
          {continuationIndent}
          {parentContext.length > width - prefix.length
            ? "…" + parentContext.slice(-(width - prefix.length - 1))
            : parentContext}
        </Text>
      )}

      {/* First line */}
      <Text
        backgroundColor={style.backgroundColor}
        color={style.textColor}
        dimColor={style.shouldDim}
        strikethrough={style.shouldStrikethrough}
        wrap="truncate"
      >
        {prefix.beforeIcon}
        <Text
          color={
            isSelected || isMultiSelected ? style.textColor : prefix.iconColor
          }
          backgroundColor={
            isSelected || isMultiSelected ? undefined : prefix.iconBgColor
          }
        >
          {prefix.iconChar}
        </Text>
        {prefix.afterIcon}
        {firstLine}
        {prefix.foldedCount}
        {infoSuffix && <Text dimColor>{infoSuffix}</Text>}
        {showInlineContext && (
          <Text dimColor italic>
            {contextSuffix}
          </Text>
        )}
        {firstLinePadding}
      </Text>

      {/* Additional wrapped lines */}
      {additionalLines.map((line, i) => (
        <Text
          key={`wrap-${i}`}
          backgroundColor={style.backgroundColor}
          color={style.textColor}
          dimColor={style.shouldDim}
          strikethrough={style.shouldStrikethrough}
          wrap="truncate"
        >
          {continuationIndent}
          {line}
          {" ".repeat(Math.max(0, width - prefix.length - displayLength(line)))}
        </Text>
      ))}

      {/* Children */}
      {hasChildren && !isFolded && depth < maxDepth && (
        <NodeChildren
          children={visibleChildren}
          colIndex={colIndex}
          cardIndex={cardIndex}
          startSubIndex={subIndex + 1}
          width={width}
          depth={depth}
          inOutlineMode={inOutlineMode}
          currentSubIndex={currentSubIndex}
          dimInactiveChildren={dimInactiveChildren}
          hiddenCount={hiddenCount}
          getChildren={resolvedGetChildren}
          getParentContext={resolvedGetParentContext}
          getBoardPills={getBoardPillsProp}
        />
      )}
    </Box>
  );
}

// =============================================================================
// NodeChildren Subcomponent
// =============================================================================

interface NodeChildrenProps {
  children: KNode[];
  colIndex: number;
  cardIndex: number;
  startSubIndex: number;
  width: number;
  depth: number;
  inOutlineMode: boolean;
  currentSubIndex: number;
  dimInactiveChildren: boolean;
  hiddenCount: number;
  /** Callback to fetch children for nested nodes */
  getChildren?: (id: string) => KNode[];
  /** Callback to get parent context for nested embedded tasks */
  getParentContext?: (node: KNode) => string | null;
  /** Callback to get board pills for info suffix */
  getBoardPills?: GetBoardPillsFn;
}

function NodeChildren({
  children,
  colIndex,
  cardIndex,
  startSubIndex,
  width,
  depth,
  inOutlineMode,
  currentSubIndex,
  dimInactiveChildren,
  hiddenCount,
  getChildren,
  getParentContext,
  getBoardPills,
}: NodeChildrenProps): React.ReactElement {
  const indent = " ".repeat(depth);

  return (
    <Box flexDirection="column">
      {children.map((child, i) => {
        const childSubIndex = startSubIndex + i;
        const childSelected =
          inOutlineMode && currentSubIndex === childSubIndex;

        return (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            width={width}
            isSelected={childSelected}
            colIndex={colIndex}
            cardIndex={cardIndex}
            subIndex={childSubIndex}
            dimInactiveChildren={dimInactiveChildren}
            getChildren={getChildren}
            getParentContext={getParentContext}
            getBoardPills={getBoardPills}
          />
        );
      })}
      {hiddenCount > 0 && (
        <Text dimColor wrap="truncate">
          {`${indent} +${hiddenCount} more`.padEnd(width)}
        </Text>
      )}
    </Box>
  );
}
