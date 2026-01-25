/**
 * Shared TreeNode component for tree/outline views
 *
 * Two variants:
 * - oneliner: Title + parent context inline on one line, truncated (for list/columns/tabs)
 * - multiline: Parent context above title, content can wrap multiple lines (for cards)
 */
import React, { useCallback, useMemo } from "react";
import { Box, Text, useLayoutCallback } from "inkx";
import type { KNode } from "@km/core";
import { useVault } from "../vault-context.tsx";
import {
  getNodeDisplayName,
  getParentContext as getParentContextFromState,
} from "../state.ts";
import { extractBody } from "@km/tree";
import { renderRich } from "../text/index.ts";
import { makeSelectionKey } from "../types.ts";
import {
  useTreeConfig,
  useUISelector,
  useRootBoardId,
  useExcludedSigils,
  useSigilColors,
} from "../ui-context.tsx";
import {
  getNodeStyle,
  buildPrefix,
  formatInfoSuffix,
  truncateContext,
  stripTaskMark,
  VARIANT_CONFIG,
  type GetBoardPillsFn,
} from "./tree-node-helpers.ts";
import { useLayoutRegistryOptional } from "../layout-context.tsx";

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

/**
 * Memoized TreeNode - skips re-render when props are unchanged.
 *
 * Custom comparison focuses on the fields that actually affect rendering:
 * - node.id, node.content, node.task_status (identity and display)
 * - isSelected (selection state)
 * - depth, colIndex, cardIndex, subIndex (position)
 * - dimInactiveChildren (visual state)
 *
 * Callback props (getChildren, etc.) are compared by reference.
 * This is safe because they're typically stable (from storage or parent useMemo).
 */
export const TreeNode = React.memo(TreeNodeImpl, (prev, next) => {
  // Fast path: if node identity changed, must re-render
  if (prev.node.id !== next.node.id) return false;

  // Selection state
  if (prev.isSelected !== next.isSelected) return false;

  // Position (affects key lookups and child selection)
  if (
    prev.colIndex !== next.colIndex ||
    prev.cardIndex !== next.cardIndex ||
    prev.subIndex !== next.subIndex ||
    prev.depth !== next.depth
  ) {
    return false;
  }

  // Visual state
  if (prev.dimInactiveChildren !== next.dimInactiveChildren) return false;

  // Node content that affects display
  if (
    prev.node.content !== next.node.content ||
    prev.node.task_status !== next.node.task_status ||
    prev.node.due_date !== next.node.due_date ||
    prev.node.type !== next.node.type
  ) {
    return false;
  }

  // Callback props by reference (stable if using useCallback or module-level)
  if (
    prev.getChildren !== next.getChildren ||
    prev.getParentContext !== next.getParentContext ||
    prev.getBoardPills !== next.getBoardPills
  ) {
    return false;
  }

  // Pre-computed props
  if (prev.parentContext !== next.parentContext) return false;

  // Children array - compare by length and IDs for efficiency
  const prevChildren = prev.children;
  const nextChildren = next.children;
  if (prevChildren !== nextChildren) {
    if (!prevChildren || !nextChildren) return false;
    if (prevChildren.length !== nextChildren.length) return false;
    for (let i = 0; i < prevChildren.length; i++) {
      if (prevChildren[i]?.id !== nextChildren[i]?.id) return false;
    }
  }

  return true;
});

function TreeNodeImpl({
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
  getBoardPills = () => [],
}: TreeNodeProps): React.ReactElement {
  // Get UI state from context
  const {
    maxOutlineDepth: maxDepth,
    inOutlineMode,
    currentSubIndex,
    variant,
  } = useTreeConfig();
  const rootBoardId = useRootBoardId();
  const excludedSigils = useExcludedSigils();
  const sigilColors = useSigilColors();

  // Select only the specific boolean values we need, not entire Sets
  // This prevents re-renders when other nodes' selection/fold state changes
  const selectionKey = makeSelectionKey(colIndex, cardIndex, subIndex);
  const isMultiSelected = useUISelector((state) =>
    state.multiSelected.has(selectionKey),
  );
  const isFolded = useUISelector((state) => state.foldedNodes.has(node.id));
  const excludeBoardIds = rootBoardId
    ? new Set([rootBoardId])
    : new Set<string>();

  const vault = useVault();
  const isOneliner = variant === "oneliner";
  // Use provided children or fetch from vault
  const resolvedGetChildren = getChildrenProp ?? vault.getChildren.bind(vault);
  const children = childrenProp ?? resolvedGetChildren(node.id);
  const hasChildren = children.length > 0;
  const isEmbedded = node.link_to != null;

  // For embedded nodes, resolve the target for display purposes
  // The embed node's content is just "![[target]]" - we want to show the linked node's data
  const resolvedNode =
    isEmbedded && node.link_to ? vault.getNode(node.link_to) : null;
  const displayNode = resolvedNode ?? node;

  // A node is a task if it has task_status set, regardless of structural type
  // For embeds, check the target node's status
  const isTask = displayNode.task_status != null;

  // Memoize style calculation - only recalc when selection or node status changes
  // Use displayNode for visual properties (task_status icon, strikethrough, etc.)
  const style = useMemo(
    () =>
      getNodeStyle(
        displayNode,
        isSelected,
        isMultiSelected,
        dimInactiveChildren,
        depth,
      ),
    [
      displayNode.id,
      displayNode.task_status,
      isSelected,
      isMultiSelected,
      dimInactiveChildren,
      depth,
    ],
  );

  // Memoize prefix - only recalc when fold state or children count changes
  const prefix = useMemo(
    () => buildPrefix(hasChildren, isFolded, children.length, style.ownColor),
    [hasChildren, isFolded, children.length, style.ownColor],
  );

  // Get content, stripping task marks for nodes with task_status
  // The task mark is displayed via the icon, so we don't need it in the text
  const rawContent =
    displayNode.type === "section"
      ? getNodeDisplayName(vault, displayNode)
      : displayNode.content || getNodeDisplayName(vault, displayNode);
  const cleanContent = isTask ? stripTaskMark(rawContent) : rawContent;

  // Memoize rich text rendering - only recalc when content or sigil config changes
  const styledContent = useMemo(
    () =>
      renderRich(cleanContent, { excludeSigils: excludedSigils, sigilColors }),
    [cleanContent, excludedSigils, sigilColors],
  );

  // Memoize info suffix - only recalc when node metadata changes
  // Use displayNode for metadata (due_date, assigned_to, etc.)
  const infoSuffix = useMemo(
    () =>
      formatInfoSuffix(
        displayNode,
        !isOneliner,
        excludeBoardIds,
        getBoardPills,
      ),
    [
      displayNode.id,
      displayNode.due_date,
      displayNode.scheduled_date,
      displayNode.assigned_to,
      displayNode.task_status,
      isOneliner,
      rootBoardId,
      getBoardPills,
    ],
  );

  // Parent context for embedded tasks - use prop or default implementation
  const resolvedGetParentContext = useCallback(
    (n: KNode) =>
      getParentContextProp
        ? getParentContextProp(n)
        : getParentContextFromState(vault, n),
    [getParentContextProp, vault],
  );
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

  // Head row measurement for curswantY (only at depth 0)
  const registry = useLayoutRegistryOptional();
  const handleHeadLayout = useCallback(
    (computed: { x: number; y: number; width: number; height: number }) => {
      if (!registry || depth !== 0) return;
      registry.updateCardHead(colIndex, cardIndex, computed.y, computed.height);
    },
    [registry, depth, colIndex, cardIndex],
  );

  // Child rendering
  const { maxChildren } = VARIANT_CONFIG[variant];
  const visibleChildren = children.slice(0, maxChildren);
  const hiddenCount = children.length - visibleChildren.length;

  return (
    <Box flexDirection="column" height={isOneliner ? 1 : undefined}>
      {/* Parent context line (shown ABOVE task for embedded items, multiline mode only) */}
      {/* Indented to align with title text, dimmed without "< " prefix */}
      {!isOneliner && isEmbedded && parentContext && (
        <Text dimColor italic wrap="truncate">
          {" ".repeat(prefix.length)}
          {parentContext}
        </Text>
      )}

      {/* Main row: Box with paddingLeft for depth indentation */}
      {/* paddingLeft={depth} makes marker flush with border at depth 0 */}
      {/* alignItems="flex-start" prevents row from stretching to match content height */}
      {/* backgroundColor on Box (not Text) to fill row background properly */}
      {/* height={1} in oneliner mode prevents background from bleeding to next line */}
      <HeadRow onLayout={handleHeadLayout}>
        <Box
          id={node.id}
          data-view="item"
          data-cursor={isSelected}
          flexDirection="row"
          alignItems="flex-start"
          paddingLeft={depth}
          backgroundColor={style.backgroundColor}
          height={isOneliner ? 1 : undefined}
        >
          {/* Fixed-width prefix box (fold marker only - new cards style) */}
          <Box width={prefix.length} flexShrink={0}>
            <Text
              color={style.textColor}
              dimColor={style.shouldDim}
              strikethrough={style.shouldStrikethrough}
              wrap="truncate"
            >
              <Text
                color={
                  isSelected || isMultiSelected
                    ? style.textColor
                    : prefix.markerColor
                }
              >
                {prefix.markerChar}
              </Text>
              {prefix.afterMarker}
            </Text>
          </Box>
          {/* Flexible content box */}
          {/* overflow="hidden" only for oneliner to enable truncation; removed for multiline to allow wrap */}
          <Box
            flexGrow={1}
            flexShrink={1}
            overflow={isOneliner ? "hidden" : undefined}
          >
            <Text
              color={style.textColor}
              dimColor={style.shouldDim}
              strikethrough={style.shouldStrikethrough}
              wrap={isOneliner ? "truncate" : "wrap"}
            >
              {/* Task status icon prepended to content (new cards style) */}
              {style.taskStatusIcon && (
                <Text
                  color={
                    isSelected || isMultiSelected
                      ? style.textColor
                      : style.taskStatusIcon.color
                  }
                >
                  {style.taskStatusIcon.char}{" "}
                </Text>
              )}
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
      </HeadRow>

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
          getBoardPills={getBoardPills}
        />
      )}
    </Box>
  );
}

// =============================================================================
// HeadRow Subcomponent (measures head position for curswantY)
// =============================================================================

interface HeadRowProps {
  onLayout: (computed: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  children: React.ReactNode;
}

function HeadRow({ onLayout, children }: HeadRowProps): React.ReactElement {
  useLayoutCallback(onLayout);
  return <Box flexDirection="column">{children}</Box>;
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

  // Apply recursive body extraction: separate body content from structural items
  const { body: bodyChildren, items: structuralChildren } =
    extractBody(children);

  // Determine rendering order:
  // - If structural items exist, body items are dimmed (non-selectable)
  // - If no structural items, all items are treated normally
  const hasStructural = structuralChildren.length > 0;

  // Build ordered children list with body flag
  const orderedChildren = hasStructural
    ? [
        ...bodyChildren.map((c) => ({ node: c, isBody: true })),
        ...structuralChildren.map((c) => ({ node: c, isBody: false })),
      ]
    : children.map((c) => ({ node: c, isBody: false }));

  return (
    <Box flexDirection="column">
      {orderedChildren.map((item, i) => {
        const childSubIndex = startSubIndex + i;
        // Body items are never selected in outline mode
        const childSelected =
          inOutlineMode && currentSubIndex === childSubIndex && !item.isBody;

        return (
          <TreeNode
            key={item.node.id}
            node={item.node}
            depth={depth + 1}
            isSelected={childSelected}
            colIndex={colIndex}
            cardIndex={cardIndex}
            subIndex={childSubIndex}
            dimInactiveChildren={dimInactiveChildren || item.isBody}
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
