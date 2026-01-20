/**
 * Shared TreeNode component for tree/outline views
 *
 * Two variants:
 * - oneliner: Title + parent context inline on one line, truncated (for list/columns/tabs)
 * - multiline: Parent context above title, content can wrap multiple lines (for cards)
 */
import React from "react";
import { Box, Text } from "inkx";
import type { KNode } from "@km/core";
import { getChildren as getChildrenFromStorage } from "@km/storage";
import {
  getNodeDisplayName,
  getParentContext as getParentContextFromState,
} from "../state.ts";
import { renderRich } from "../text/index.ts";
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

  // Info suffix (oneliner shows full info, multiline shows compact dots only)
  const infoSuffix = formatInfoSuffix(
    node,
    !isOneliner, // multiline uses compact info (just dots)
    excludeBoardIds,
    getBoardPillsProp,
  );

  // Parent context for embedded tasks
  const resolvedGetParentContext =
    getParentContextProp ?? getParentContextFromState;
  const parentContext =
    parentContextProp !== undefined
      ? parentContextProp
      : depth === 0 && isTask && isEmbedded
        ? resolvedGetParentContext(node)
        : null;

  // Context suffix (shown inline for oneliner variant only)
  const truncatedContext = isOneliner
    ? truncateContext(parentContext, 40) // Fixed max context width
    : null;
  const contextSuffix = truncatedContext ? ` < ${truncatedContext}` : "";
  const showInlineContext = truncatedContext !== null;

  // Child rendering
  const { maxChildren } = VARIANT_CONFIG[variant];
  const visibleChildren = children.slice(0, maxChildren);
  const hiddenCount = children.length - visibleChildren.length;

  return (
    <Box flexDirection="column">
      {/* Parent context line (shown ABOVE task for embedded items, multiline mode only) */}
      {/* Indented to align with title text */}
      {!isOneliner && isEmbedded && parentContext && (
        <Text dimColor italic wrap="truncate">
          {" ".repeat(prefix.length)}
          {"< "}
          {parentContext}
        </Text>
      )}

      {/* Main row: two-column layout for hanging bullet */}
      <Box
        flexDirection="row"
        alignItems="flex-start"
        backgroundColor={style.backgroundColor}
      >
        {/* Prefix column: fold indicator + icon (fixed width, top-aligned) */}
        <Box width={prefix.length} flexShrink={0}>
          <Text
            color={style.textColor}
            dimColor={style.shouldDim}
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
          </Text>
        </Box>

        {/* Content column: wraps naturally to remaining space */}
        <Box flexGrow={1}>
          <Text
            color={style.textColor}
            dimColor={style.shouldDim}
            strikethrough={style.shouldStrikethrough}
            wrap={isOneliner ? "truncate" : "wrap"}
          >
            {styledContent}
            {prefix.foldedCount}
            {infoSuffix && <Text dimColor>{infoSuffix}</Text>}
            {showInlineContext && (
              <Text dimColor italic>
                {contextSuffix}
              </Text>
            )}
          </Text>
        </Box>
      </Box>

      {/* Children */}
      {hasChildren && !isFolded && depth < maxDepth && (
        <NodeChildren
          children={visibleChildren}
          colIndex={colIndex}
          cardIndex={cardIndex}
          startSubIndex={subIndex + 1}
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
          {indent} +{hiddenCount} more
        </Text>
      )}
    </Box>
  );
}
