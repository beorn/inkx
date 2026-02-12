/**
 * Shared TreeNode component for tree/outline views
 *
 * Two variants:
 * - oneliner: Title + parent context inline on one line, truncated (for list/columns/tabs)
 * - multiline: Parent context above title, content can wrap multiple lines (for cards)
 */
/* oxlint-disable complexity/max-cognitive, complexity/max-cyclomatic -- React component — JSX conditionals inflate score */

import React, { useCallback, useMemo } from "react"
import { useApp as useAppStore, useAppShallow } from "inkx/runtime"
import type { BoardAppStore } from "../board-app-store.ts"
import type { JobRunner } from "@km/core"
import { renderLog, sid } from "../log.ts"
import { Box, ErrorBoundary, Text, useScreenRectCallback } from "inkx"
import type { KNode } from "@km/core"
import { extractTitleTaskMark } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import {
  getNodeDisplayName,
  getParentContext as getParentContextFromState,
} from "../state.ts"
import { extractBody, splitNode, mergeWithPrevious } from "@km/tree"
import { renderRich } from "../text/index.ts"
import { truncateText } from "../layout/index.ts"
import { makeSelectionKey } from "../types.ts"
import { useTreeRenderContext, deriveExcludedSigils } from "../ui-context.tsx"
import { InlineEditField } from "./InlineEditField.tsx"
import {
  getNodeStyle,
  buildPrefix,
  formatInfoSuffix,
  truncateContext,
  stripTaskMark,
  VARIANT_CONFIG,
  type GetBoardPillsFn,
} from "./tree-node-helpers.ts"
import { useLayoutRegistryOptional } from "../layout-context.tsx"

interface TreeNodeProps {
  node: KNode
  depth: number
  isSelected: boolean
  colIndex: number
  cardIndex: number
  subIndex: number
  /** Dim child items when this subtree is not the active card (for cards view) */
  dimInactiveChildren?: boolean
  /** Pre-loaded children (optional - if not provided, fetched from storage) */
  children?: KNode[]
  /** Child count override for fold indicator (optional - used when children array is empty due to folding) */
  childCount?: number
  /** Pre-computed parent context for embedded tasks (optional) */
  parentContext?: string | null
  /** Callback to fetch children on unfold (optional - defaults to storage lookup) */
  getChildren?: (id: string) => KNode[]
  /** Callback to get parent context for nested embedded tasks (optional) */
  getParentContext?: (node: KNode) => string | null
  /** Callback to get board pills for info suffix (optional - defaults to storage lookup) */
  getBoardPills?: GetBoardPillsFn
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
  if (prev.node.id !== next.node.id) return false

  // Selection state
  if (prev.isSelected !== next.isSelected) return false

  // Position (affects key lookups and child selection)
  if (
    prev.colIndex !== next.colIndex ||
    prev.cardIndex !== next.cardIndex ||
    prev.subIndex !== next.subIndex ||
    prev.depth !== next.depth
  ) {
    return false
  }

  // Visual state
  if (prev.dimInactiveChildren !== next.dimInactiveChildren) return false

  // Node content that affects display
  if (
    prev.node.content !== next.node.content ||
    prev.node.task_status !== next.node.task_status ||
    prev.node.due_date !== next.node.due_date ||
    prev.node.type !== next.node.type
  ) {
    return false
  }

  // Callback props by reference (stable if using useCallback or module-level)
  if (
    prev.getChildren !== next.getChildren ||
    prev.getParentContext !== next.getParentContext ||
    prev.getBoardPills !== next.getBoardPills
  ) {
    return false
  }

  // Pre-computed props
  if (prev.parentContext !== next.parentContext) return false
  if (prev.childCount !== next.childCount) return false

  // Children array - compare by length and IDs for efficiency
  const prevChildren = prev.children
  const nextChildren = next.children
  if (prevChildren !== nextChildren) {
    if (!prevChildren || !nextChildren) return false
    if (prevChildren.length !== nextChildren.length) return false
    for (let i = 0; i < prevChildren.length; i++) {
      if (prevChildren[i]?.id !== nextChildren[i]?.id) return false
    }
  }

  return true
})

function TreeNodeImpl({
  node,
  depth,
  isSelected,
  colIndex,
  cardIndex,
  subIndex,
  dimInactiveChildren = false,
  children: childrenProp,
  childCount: childCountProp,
  parentContext: parentContextProp,
  getChildren: getChildrenProp,
  getParentContext: getParentContextProp,
  getBoardPills = () => [],
}: TreeNodeProps): React.ReactElement {
  // Global tree rendering config from context (no per-node subscription)
  const { treeConfig, sigilColors, setUI, rootBoardId } = useTreeRenderContext()
  const {
    maxOutlineDepth: maxDepth,
    inOutlineMode,
    currentSubIndex,
    variant,
  } = treeConfig

  // Single store subscription for per-node state only.
  // On cursor move: none of these change → no re-render from store.
  const selectionKey = makeSelectionKey(node.id, subIndex)
  const nodeState = useAppShallow<
    BoardAppStore,
    {
      isMultiSelected: boolean
      isFolded: boolean
      editBlockIndex: number | null
    }
  >((s) => ({
    isMultiSelected: s.ui.multiSelected.has(selectionKey),
    isFolded: s.foldedNodes.has(node.id),
    editBlockIndex:
      s.ui.inlineEditBlock?.nodeId === node.id
        ? s.ui.inlineEditBlock.blockIndex
        : null,
  }))
  const { isMultiSelected, isFolded } = nodeState
  const editBlockIndex = nodeState.editBlockIndex
  const isInlineEditing = editBlockIndex !== null
  const editingTitle = editBlockIndex === 0
  const excludeBoardIds = rootBoardId
    ? new Set([rootBoardId])
    : new Set<string>()

  const repo = useRepo()
  const jobRunner = useAppStore<BoardAppStore, JobRunner>(
    (s) => s.jobRunner,
  )
  const excludedSigils = useMemo(
    () => deriveExcludedSigils(repo, rootBoardId),
    [repo, rootBoardId],
  )
  const isOneliner = variant === "oneliner"
  const isEmbedded = node.link_to != null

  // For embedded nodes, resolve the target for display purposes
  // The embed node's content is just "![[target]]" - we want to show the linked node's data
  const resolvedNode =
    isEmbedded && node.link_to ? repo.getNode(node.link_to) : null
  const displayNode = resolvedNode ?? node

  // Use provided children or fetch from repo
  // For embeds, get children from the TARGET node (transclusion shows target's children)
  const resolvedGetChildren = getChildrenProp ?? repo.getChildren.bind(repo)
  const childrenSourceId =
    isEmbedded && resolvedNode ? resolvedNode.id : node.id
  const children = childrenProp ?? resolvedGetChildren(childrenSourceId)
  // Use childCountProp if provided (for folded nodes where children array is empty)
  const childCount = childCountProp ?? children.length
  const hasChildren = childCount > 0

  // Debug logging for render tracking
  renderLog.debug?.(
    `TreeNode ${sid(node.id)} children=${children.length} childCount=${childCount} content=${displayNode.content?.slice(0, 30) ?? "(empty)"}`,
  )

  // A node is a task if it has task_status set, regardless of structural type
  // For embeds, check the target node's status
  const isTask = displayNode.task_status != null

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
        isInlineEditing,
      ),
    [
      displayNode.id,
      displayNode.task_status,
      isSelected,
      isMultiSelected,
      dimInactiveChildren,
      depth,
      isInlineEditing,
    ],
  )

  // Memoize prefix - only recalc when fold state or children count changes
  const prefix = useMemo(
    () => buildPrefix(hasChildren, isFolded, childCount, style.ownColor),
    [hasChildren, isFolded, childCount, style.ownColor],
  )

  // Get content, stripping task marks for nodes with task_status
  // The task mark is displayed via the icon, so we don't need it in the text
  // For embeds: use resolved target's display name, never raw "![[target]]" syntax
  const rawContent =
    isEmbedded && resolvedNode
      ? resolvedNode.type === "folder"
        ? getNodeDisplayName(repo, resolvedNode) + "/"
        : resolvedNode.type === "section"
          ? getNodeDisplayName(repo, resolvedNode)
          : resolvedNode.content || getNodeDisplayName(repo, resolvedNode)
      : isEmbedded && !resolvedNode
        ? // Unresolved embed — extract target name from ![[target]] syntax
          (node.content?.replace(/^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/, "$1") ??
          getNodeDisplayName(repo, node))
        : displayNode.type === "section"
          ? getNodeDisplayName(repo, displayNode)
          : displayNode.content || getNodeDisplayName(repo, displayNode)
  const cleanContent = isTask ? stripTaskMark(rawContent) : rawContent

  // For inline editing, use the actual node content (not display name fallback).
  // This ensures new nodes with empty content show an empty edit field,
  // not the short ID that getNodeDisplayName returns as fallback.
  const editContent = isTask
    ? stripTaskMark(displayNode.content ?? "")
    : (displayNode.content ?? "")

  // Compute body/structural split when editing (for per-block navigation)
  const { bodyChildren, structuralChildren } = useMemo(() => {
    if (!isInlineEditing) {
      return { bodyChildren: [] as TNode[], structuralChildren: [] as TNode[] }
    }
    const allChildren = resolvedGetChildren(childrenSourceId)
    const { body, items } = extractBody(allChildren)
    return { bodyChildren: body, structuralChildren: items }
  }, [isInlineEditing, childrenSourceId, resolvedGetChildren])

  // Title save callback (persists without exiting edit mode)
  const handleTitleSave = useCallback(
    (newValue: string) => {
      const originalContent = displayNode.content ?? ""
      const { mark } = extractTitleTaskMark(originalContent)
      const newContent = mark != null ? `[${mark}] ${newValue}` : newValue
      repo.updateNode(displayNode.id, { content: newContent })
    },
    [displayNode.id, displayNode.content, repo],
  )

  // Inline edit callbacks — uses renameNode for backlink-safe renames
  const handleInlineEditConfirm = useCallback(
    (newValue: string) => {
      const originalContent = displayNode.content ?? ""
      const { mark } = extractTitleTaskMark(originalContent)
      const newContent = mark != null ? `[${mark}] ${newValue}` : newValue

      // Only do a full rename if name was already in sync with content (or unset).
      // e.g., "@next" (name) vs "Next Actions" (title) → different → just update content.
      // e.g., "My Task" (name) vs "My Task" (content) → same → rename keeps them in sync.
      // e.g., no name set → always rename (name gets derived from content).
      const node = repo.getNode(displayNode.id)
      const oldName = node?.name ?? ""
      const oldContentName = (originalContent).replace(/^- \[.\]\s*/, "")
      const nameMatchedContent = !oldName || oldName === oldContentName

      if (nameMatchedContent) {
        const impact = repo.getRenameImpact(displayNode.id)
        const s = impact.backlinks.length === 1 ? "" : "s"

        jobRunner.submit({
          description: `Renaming '${oldName}' → '${newValue}'`,
          impact:
            impact.backlinks.length > 0
              ? `${impact.backlinks.length} backlink${s} will be updated`
              : "",
          countdownMs: impact.backlinks.length > 0 ? 5000 : 0,
          execute: (onProgress) => {
            repo.renameNode(displayNode.id, newContent, (info) =>
              onProgress(info.updated, info.total),
            )
          },
        })
      } else {
        // Name and content diverged — just update content, don't rename
        repo.updateNode(displayNode.id, { content: newContent })
      }

      setUI({ inlineEditBlock: null })
    },
    [displayNode.id, displayNode.content, repo, setUI, jobRunner],
  )

  const handleInlineEditCancel = useCallback(() => {
    setUI({ inlineEditBlock: null })
  }, [setUI])

  // Body block save callback (persists content for a body child)
  const handleBlockSave = useCallback(
    (childId: string, newValue: string) => {
      repo.updateNode(childId, { content: newValue })
    },
    [repo],
  )

  // Split at boundary: Enter in title creates a new sibling node
  const handleSplitAtBoundary = useCallback(
    (offset: number) => {
      try {
        const result = splitNode(repo, displayNode.id, offset)
        // Focus the new node (text after cursor) in edit mode
        setUI({ inlineEditBlock: { nodeId: result.afterId, blockIndex: 0 } })
      } catch {
        // Split failed (e.g., root node) — visual bell
        setUI({ bellState: "split-failed" })
      }
    },
    [displayNode.id, repo, setUI],
  )

  // Merge backward: Backspace at start of title merges with previous sibling
  const handleMergeBackward = useCallback(() => {
    try {
      const result = mergeWithPrevious(repo, displayNode.id)
      if (result) {
        // Focus the survivor with cursor at the merge point
        setUI({ inlineEditBlock: { nodeId: result.survivorId, blockIndex: 0 } })
        // TODO: set cursor offset to result.cursorOffset via BlockEditTarget after render
      }
    } catch {
      // Merge failed — visual bell
      setUI({ bellState: "merge-failed" })
    }
  }, [displayNode.id, repo, setUI])

  // Memoize rich text rendering - only recalc when content or sigil config changes
  // In multiline (cards) mode, truncate with ellipsis to fit on single line
  const styledContent = useMemo(() => {
    const rich = renderRich(cleanContent, {
      excludeSigils: excludedSigils,
      sigilColors,
    })
    // Estimate available width for cards (accounting for borders, padding, prefix)
    // This is approximate - actual width depends on terminal and column layout
    if (!isOneliner) {
      return truncateText(rich, 70) // Default ~70 chars for card title
    }
    return rich
  }, [cleanContent, excludedSigils, sigilColors, isOneliner])

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
  )

  // Parent context for embedded tasks - use prop or default implementation
  const resolvedGetParentContext = useCallback(
    (n: KNode) =>
      getParentContextProp
        ? getParentContextProp(n)
        : getParentContextFromState(repo, n),
    [getParentContextProp, repo],
  )
  const parentContext =
    parentContextProp !== undefined
      ? parentContextProp
      : depth === 0 && isTask && isEmbedded
        ? resolvedGetParentContext(node)
        : null

  // Context suffix (shown inline for oneliner variant only)
  const truncatedContext = isOneliner
    ? truncateContext(parentContext, 40) // Fixed max context width
    : null
  const contextSuffix = truncatedContext ? ` < ${truncatedContext}` : ""
  const showInlineContext = truncatedContext !== null

  // Head row measurement for curswantY (only at depth 0)
  const registry = useLayoutRegistryOptional()
  const handleHeadLayout = useCallback(
    (computed: { x: number; y: number; width: number; height: number }) => {
      if (!registry || depth !== 0) return
      registry.updateCardHead(colIndex, cardIndex, computed.y, computed.height)
    },
    [registry, depth, colIndex, cardIndex],
  )

  // Child rendering
  const { maxChildren } = VARIANT_CONFIG[variant]
  const visibleChildren = children.slice(0, maxChildren)
  const hiddenCount = children.length - visibleChildren.length

  return (
    <Box
      flexDirection="column"
      height={isOneliner ? 1 : undefined}
      overflow={isOneliner ? "hidden" : undefined}
    >
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
      {/* Always height={1} to keep title on single line; use truncateText() for ellipsis in cards view */}
      <HeadRow onLayout={handleHeadLayout}>
        <Box
          id={node.id}
          data-view="item"
          {...(isSelected && {
            "data-cursor": true,
            "data-col-index": colIndex,
            "data-card-index": cardIndex,
          })}
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
              {prefix.foldedCount}
            </Text>
          </Box>
          {/* Flexible content box */}
          {/* overflow="hidden" only for oneliner to enable truncation; removed for multiline to allow wrap */}
          <Box
            flexGrow={1}
            flexShrink={1}
            overflow={isOneliner ? "hidden" : undefined}
          >
            {editingTitle ? (
              <Text
                color={style.textColor}
                wrap={isOneliner ? "truncate" : "wrap"}
              >
                {style.taskStatusIcon && (
                  <Text color={style.taskStatusIcon.color}>
                    {style.taskStatusIcon.char}{" "}
                  </Text>
                )}
                <InlineEditField
                  initialValue={editContent}
                  onConfirm={handleInlineEditConfirm}
                  onCancel={handleInlineEditCancel}
                  onSave={handleTitleSave}
                  onSplitAtBoundary={handleSplitAtBoundary}
                  onMergeBackward={handleMergeBackward}
                />
              </Text>
            ) : (
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
                {!isFolded && styledContent}
                {!isFolded && infoSuffix && <Text dimColor>{infoSuffix}</Text>}
                {!isFolded && showInlineContext && (
                  <Text dimColor italic>
                    {contextSuffix}
                  </Text>
                )}
              </Text>
            )}
          </Box>
        </Box>
      </HeadRow>

      {/* Body block editing: when editing this node, show body children as editable blocks */}
      {isInlineEditing &&
        bodyChildren.length > 0 &&
        bodyChildren.map((child, i) => {
          const blockIndex = i + 1 // 0 is title
          const isActiveBlock = editBlockIndex === blockIndex
          return (
            <Box key={child.id} paddingLeft={depth + 1}>
              <Text dimColor>{"  "}</Text>
              {isActiveBlock ? (
                <InlineEditField
                  initialValue={child.content ?? ""}
                  onConfirm={(v) => {
                    handleBlockSave(child.id, v)
                    setUI({ inlineEditBlock: null })
                  }}
                  onCancel={handleInlineEditCancel}
                  onSave={(v) => handleBlockSave(child.id, v)}
                  onSplitAtBoundary={(offset) => {
                    try {
                      const result = splitNode(repo, child.id, offset)
                      setUI({ inlineEditBlock: { nodeId: result.afterId, blockIndex: 0 } })
                    } catch {
                      setUI({ bellState: "split-failed" })
                    }
                  }}
                  onMergeBackward={() => {
                    try {
                      const result = mergeWithPrevious(repo, child.id)
                      if (result) {
                        setUI({ inlineEditBlock: { nodeId: result.survivorId, blockIndex: 0 } })
                      }
                    } catch {
                      setUI({ bellState: "merge-failed" })
                    }
                  }}
                />
              ) : (
                <Text dimColor>{renderRich(child.content ?? "")}</Text>
              )}
            </Box>
          )
        })}

      {/* Children: during editing show only structural (body is rendered as editable blocks above) */}
      {hasChildren && !isFolded && depth < maxDepth && (
        <ErrorBoundary
          fallback={
            <Text color="red" dim>
              [error]
            </Text>
          }
        >
          <NodeChildren
            children={isInlineEditing ? structuralChildren : visibleChildren}
            colIndex={colIndex}
            cardIndex={cardIndex}
            startSubIndex={subIndex + 1}
            depth={depth}
            inOutlineMode={inOutlineMode}
            currentSubIndex={currentSubIndex}
            dimInactiveChildren={dimInactiveChildren}
            hiddenCount={isInlineEditing ? 0 : hiddenCount}
            getChildren={resolvedGetChildren}
            getParentContext={resolvedGetParentContext}
            getBoardPills={getBoardPills}
          />
        </ErrorBoundary>
      )}
    </Box>
  )
}

// =============================================================================
// HeadRow Subcomponent (measures head position for curswantY)
// =============================================================================

interface HeadRowProps {
  onLayout: (computed: {
    x: number
    y: number
    width: number
    height: number
  }) => void
  children: React.ReactNode
}

function HeadRow({ onLayout, children }: HeadRowProps): React.ReactElement {
  // Use a child registrar with useScreenRectCallback to get screen-relative
  // positions (accounting for scroll offsets). Box.onLayout provides contentRect
  // which doesn't change on scroll — that would give wrong positions for
  // cross-column navigation when columns have different scroll offsets.
  return (
    <Box flexDirection="column">
      <HeadLayoutRegistrar onLayout={onLayout} />
      {children}
    </Box>
  )
}

/** Reports the HeadRow's screen-relative position via useScreenRectCallback. */
function HeadLayoutRegistrar({
  onLayout,
}: {
  onLayout: HeadRowProps["onLayout"]
}): null {
  const callbackRef = React.useRef(onLayout)
  callbackRef.current = onLayout
  useScreenRectCallback((rect) => callbackRef.current(rect))
  return null
}

// =============================================================================
// NodeChildren Subcomponent
// =============================================================================

interface NodeChildrenProps {
  children: KNode[]
  colIndex: number
  cardIndex: number
  startSubIndex: number
  depth: number
  inOutlineMode: boolean
  currentSubIndex: number
  dimInactiveChildren: boolean
  hiddenCount: number
  /** Callback to fetch children for nested nodes */
  getChildren?: (id: string) => KNode[]
  /** Callback to get parent context for nested embedded tasks */
  getParentContext?: (node: KNode) => string | null
  /** Callback to get board pills for info suffix */
  getBoardPills?: GetBoardPillsFn
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
  const indent = " ".repeat(depth)

  // Apply recursive body extraction: separate body content from structural items
  const { body: bodyChildren, items: structuralChildren } =
    extractBody(children)

  // Determine rendering order:
  // - If structural items exist, body items are dimmed (non-selectable)
  // - If no structural items, all items are treated normally
  const hasStructural = structuralChildren.length > 0

  // Build ordered children list with body flag
  const orderedChildren = hasStructural
    ? [
        ...bodyChildren.map((c) => ({ node: c, isBody: true })),
        ...structuralChildren.map((c) => ({ node: c, isBody: false })),
      ]
    : children.map((c) => ({ node: c, isBody: false }))

  return (
    <Box flexDirection="column">
      {orderedChildren.map((item, i) => {
        const childSubIndex = startSubIndex + i
        // Body items are never selected in outline mode
        const childSelected =
          inOutlineMode && currentSubIndex === childSubIndex && !item.isBody

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
        )
      })}
      {hiddenCount > 0 && (
        <Text dimColor wrap="truncate">
          {indent} +{hiddenCount} more
        </Text>
      )}
    </Box>
  )
}
