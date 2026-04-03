/**
 * Shared TreeNode component for tree/outline views
 *
 * Two variants:
 * - oneliner: Title + parent context inline on one line, truncated (for list/columns/tabs)
 * - multiline: Parent context above title, content can wrap multiple lines (for cards)
 */
/* oxlint-disable complexity/max-cognitive, complexity/max-cyclomatic -- React component — JSX conditionals inflate score */

import React, { useCallback, useMemo } from "react"
import { useNodeStore, useReactive, type NodeEditState } from "../reactive.ts"
import { renderLog, sid } from "../log.ts"
import { Box, ErrorBoundary, Link, Small, Text, useScreenRectCallback } from "@silvery/ag-react"
import { KNode, getStatusForMarker } from "@km/core"
import { isCardView } from "../types.ts"
import { useRepo } from "../repo-context.tsx"
import {
  isNodeUntitled,
  getParentContext as getParentContextFromState,
  getParentContextEx as getParentContextExFromState,
} from "../state.ts"
import { extractBody, Tree, type TreeReader } from "@km/tree"
import { isCollapsedChild } from "@km/board"
import { isSigilName, InlineText } from "../text/index.ts"
import { useTreeRenderContext, deriveExcludedSigils } from "../ui-context.tsx"
import {
  getNodeStyle,
  buildPrefix,
  InfoSuffix,
  DateBadge,
  formatSubtaskBadge,
  hasUnresolvedDeps,
  truncateContext,
  stripTaskMark,
  isHRContent,
  VARIANT_CONFIG,
  type GetBoardPillsFn,
} from "./tree-node-helpers.tsx"
import { useNavigator } from "../layout-context.tsx"
import { stripKnownMentions } from "./detail-pane-helpers.ts"
import { resolveEmbed, getDisplayContent } from "./embed-display.ts"
import { computeBulletIcon, useTreeInlineContext, useSearchDecorations } from "./tree-node-shared.ts"
import { TitleEditor, BodyBlockEditor } from "./tree-node-edit.tsx"
import { CheckboxIcon } from "./CheckboxIcon.tsx"
import { log } from "../log.ts"
import { useApp as useAppStore } from "@silvery/create/create-app"
import { Workspace, type BoardAppStore } from "../board-app-store.ts"
import type { ErrorInfo } from "react"

// ============================================================================

/** Log NodeChildren rendering errors via loggily instead of silently swallowing them.
 * The ErrorBoundary shows [error] fallback text; this ensures the actual error is logged
 * so developers can diagnose the root cause (bug: km-tui.delete-shows-error). */
function handleNodeChildrenError(error: Error, errorInfo: ErrorInfo): void {
  log.error?.(`NodeChildren render error: ${error.message}`)
  log.error?.(`Component stack: ${errorInfo.componentStack?.split("\n").slice(0, 5).join("\n") ?? "(none)"}`)
}

interface TreeNodeProps {
  node: KNode
  depth: number
  isSelected: boolean
  colIndex: number
  cardIndex: number
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
  /** Additional sigils to exclude (e.g., column-level sigils like @next inside @next column) */
  extraExcludedSigils?: string[]
  /** Force dim styling on this node (used for virtual body cards) */
  dim?: boolean
  /** Collapse blank lines in content (used for compact body cards in cards view) */
  compactContent?: boolean
  /** Hide the right-aligned child count (cards view has overflow indicator instead) */
  hideChildCount?: boolean
  /** Remaining depth budget for fold rendering. When 0, children are hidden.
   * If a node has an override in foldDepths, that takes precedence.
   * Default: Infinity (show everything). */
  remainingDepth?: number
  /** Body content node — render without bullet prefix, dimmed. */
  isBody?: boolean
}

/**
 * Memoized TreeNode - skips re-render when props are unchanged.
 *
 * Custom comparison focuses on the fields that actually affect rendering:
 * - node.id, node.content, node.item?.task?.status (identity and display)
 * - isSelected (selection state)
 * - depth, colIndex, cardIndex (position)
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
  if (prev.colIndex !== next.colIndex || prev.cardIndex !== next.cardIndex || prev.depth !== next.depth) {
    return false
  }

  // Visual state
  if (prev.dimInactiveChildren !== next.dimInactiveChildren) return false
  if (prev.dim !== next.dim) return false
  if (prev.compactContent !== next.compactContent) return false

  // Node content that affects display (includes implicit task properties)
  if (
    prev.node.content !== next.node.content ||
    prev.node.embed_source !== next.node.embed_source ||
    prev.node.item?.task?.status !== next.node.item?.task?.status ||
    prev.node.due_at !== next.node.due_at ||
    prev.node.start_at !== next.node.start_at ||
    prev.node.priority !== next.node.priority ||
    prev.node.rrule !== next.node.rrule ||
    prev.node.assigned_to !== next.node.assigned_to ||
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

  // Fold depth
  if (prev.remainingDepth !== next.remainingDepth) return false

  // Body flag
  if (prev.isBody !== next.isBody) return false

  // Pre-computed props
  if (prev.parentContext !== next.parentContext) return false
  if (prev.childCount !== next.childCount) return false
  if (prev.extraExcludedSigils !== next.extraExcludedSigils) return false

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
  dimInactiveChildren = false,
  children: childrenProp,
  childCount: childCountProp,
  parentContext: parentContextProp,
  getChildren: getChildrenProp,
  getParentContext: getParentContextProp,
  getBoardPills = () => [],
  extraExcludedSigils,
  dim = false,
  compactContent = false,
  hideChildCount = false,
  remainingDepth = Infinity,
  isBody = false,
}: TreeNodeProps): React.ReactElement {
  // @ts-expect-error -- loggily's conditional debug may be undefined at runtime but tsc sees it as always-defined
  const _tnStart = renderLog.debug ? performance.now() : 0
  renderLog.debug?.(`TreeNode ${sid(node.id)} depth=${depth} remainingDepth=${remainingDepth}`)

  // Global tree rendering config from context (no per-node subscription)
  const {
    treeConfig,
    sigilColors,
    resolveSigilColor,
    setUI,
    rootBoardId,
    searchMatchNodeIds,
    currentMatchNodeId,
    searchQuery,
    jobRunner,
    undoHandle,
    taskStatusFilter,
  } = useTreeRenderContext()
  const { maxContentLines, variant, iconStyle } = treeConfig

  // Per-node state via reactive signals — only this node re-renders when its state changes
  const nodeStore = useNodeStore()
  const isMultiSelected = useReactive(nodeStore.getOrCreate(node.id).multiSelected)
  const editState = useReactive(nodeStore.getOrCreate(node.id).edit)
  const foldOverride = useReactive(nodeStore.getOrCreate(node.id).foldOverride)
  // Per-node fold override takes precedence, then remainingDepth from parent, then default (unfolded)
  const resolvedDepth = foldOverride ?? remainingDepth ?? Infinity
  const isFolded = resolvedDepth <= 0
  const editBlockIndex = editState?.blockIndex ?? null
  const isInlineEditing = editBlockIndex !== null
  const editingTitle = editBlockIndex === 0
  const excludeBoardIds = rootBoardId ? new Set([rootBoardId]) : new Set<string>()

  const repo = useRepo()
  // Excluded sigils: use reactive store if hydrated, fallback for compatibility
  const reactiveExcludedSigils = useReactive(nodeStore.getOrCreate(node.id).excludedSigils)
  const excludedSigils = useMemo(() => {
    // If reactive store is hydrated, use it directly
    if (reactiveExcludedSigils.length > 0) return reactiveExcludedSigils
    // Fallback: derive from rootBoardId + extraExcludedSigils
    const rootSigils = deriveExcludedSigils(repo, rootBoardId)
    if (!extraExcludedSigils?.length) return rootSigils
    return [...rootSigils, ...extraExcludedSigils]
  }, [reactiveExcludedSigils, repo, rootBoardId, extraExcludedSigils])
  const isOneliner = variant === "oneliner"
  // Children inside cards (depth > 0, multiline) should be single-line truncated
  const isCardChild = variant === "multiline" && depth > 0
  // At depth 0 (card level), use pre-resolved data from CardView.
  // At depth > 0 (nested children), resolve per-node.
  const cardView = depth === 0 && isCardView(node) ? node : undefined
  const embedRes = cardView
    ? {
        isEmbedded: cardView.resolvedNode !== undefined || cardView.isBrokenEmbed,
        resolvedNode: cardView.resolvedNode ?? null,
        displayNode: cardView.resolvedNode ?? node,
        isBrokenEmbed: cardView.isBrokenEmbed,
      }
    : resolveEmbed(repo, node)
  const { isEmbedded, resolvedNode, displayNode, isBrokenEmbed } = embedRes

  // Use provided children or fetch from repo
  // For embeds, get children from the TARGET node (transclusion shows target's children)
  const resolvedGetChildren = getChildrenProp ?? repo.getChildren.bind(repo)
  const childrenSourceId = isEmbedded && resolvedNode ? resolvedNode.id : node.id
  const rawChildren = childrenProp ?? resolvedGetChildren(childrenSourceId)
  // Filter out collapsed children (km.collapse:: true, detailOnly) — these are only
  // shown in the detail pane, never as sub-items inside cards.
  const children = useMemo(() => rawChildren.filter((c) => !isCollapsedChild(c)), [rawChildren])
  // Use childCountProp if provided (for folded nodes where children array is empty)
  const childCount = childCountProp ?? children.length
  const hasChildren = childCount > 0

  // Debug logging for render tracking (includes hook duration)
  if (_tnStart) {
    const hookMs = (performance.now() - _tnStart).toFixed(0)
    renderLog.debug?.(
      `TreeNode ${sid(node.id)} hooks=${hookMs}ms children=${children.length} childCount=${childCount} content=${displayNode.content?.slice(0, 30) ?? "(empty)"}`,
    )
  }

  const nodeIsTask = KNode.isTask(displayNode)

  // Memoize style calculation - only recalc when selection or node status changes
  // Use displayNode for visual properties (task_status icon, strikethrough, etc.)
  // Include implicit task properties in deps so style recalculates when they change
  const style = useMemo(() => {
    const s = getNodeStyle(displayNode, isSelected, isMultiSelected, dimInactiveChildren, depth, isInlineEditing)
    if (dim || isBody) s.shouldDim = true
    return s
  }, [
    displayNode.id,
    displayNode.item?.task?.status,
    displayNode.due_at,
    displayNode.priority,
    displayNode.start_at,
    displayNode.assigned_to,
    displayNode.rrule,
    isSelected,
    isMultiSelected,
    dimInactiveChildren,
    depth,
    isInlineEditing,
    dim,
    isBody,
  ])

  // Card title highlight: when cursor is on a sub-item (not the card title),
  // show yellow text instead of inverse selection. Only applies at depth 0 (card title).
  // Per-node cursorInDescendant Reactive — only the active card's node fires.
  const cursorInDescendant = useReactive(nodeStore.getOrCreate(node.id).cursorInDescendant)
  const titleHighlightOnly = depth === 0 && isSelected && !isMultiSelected && cursorInDescendant

  // Search match highlighting: white bg / black fg (current match brighter)
  const isSearchMatch = searchMatchNodeIds.has(node.id)
  const isCurrentMatch = node.id === currentMatchNodeId
  const searchHighlight = isSearchMatch && !isSelected && !isMultiSelected
  const effectiveBg = titleHighlightOnly ? undefined : style.backgroundColor
  const tc = titleHighlightOnly ? "$selection-bg" : style.textColor
  const sd = style.shouldDim

  // Untitled nodes (showing (shortId) fallback) render very dimmed
  const untitled = isNodeUntitled(repo, displayNode)
  const dimUntitled = untitled && !isSelected && !isMultiSelected

  // Compute the bullet icon based on icon style (body nodes get no bullet)
  const bulletIcon = useMemo(
    () =>
      isBody
        ? null
        : computeBulletIcon(
            displayNode,
            nodeIsTask,
            style.taskStatusIcon,
            hasChildren,
            isFolded,
            style.ownColor,
            iconStyle,
          ),
    [isBody, nodeIsTask, iconStyle, displayNode.type, hasChildren, isFolded, style.ownColor, style.taskStatusIcon],
  )

  // Memoize prefix - body nodes get empty prefix (just indentation space)
  const prefix = useMemo(
    () =>
      bulletIcon ? buildPrefix(bulletIcon) : { markerChar: "", markerColor: undefined, afterMarker: " ", length: 1 },
    [bulletIcon],
  )

  // Get content, stripping task marks for nodes with task_status
  // The task mark is displayed via the icon, so we don't need it in the text
  const rawContent = getDisplayContent(repo, node, displayNode, resolvedNode, isEmbedded)
  const cleanContent = nodeIsTask ? stripTaskMark(rawContent) : rawContent
  // Strip @mentions and +projects from card title display — the info suffix already shows short names
  // Fall back to original if stripping leaves nothing (e.g., user files like @shi-delei.md)
  const stripped = depth === 0 ? stripKnownMentions(cleanContent) : ""
  const displayContent = stripped.trim() ? stripped : cleanContent

  // Compute sigil for inline display: only if name is a sigil and differs from title
  // Skip sigils that are in the excluded list (e.g., @next on the @next board)
  const sigilName = useMemo(() => {
    const name = displayNode.name
    if (!name || !isSigilName(name)) return null
    // Compare via locale-aware collation: treats ø≡o, é≡e, æ≡ae, etc.
    const collator = new Intl.Collator("en", { sensitivity: "base" })
    const nameBase = name
      .slice(1)
      .replace(/[^a-z0-9\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
    const contentBase = cleanContent.replace(/[^a-z0-9\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")
    if (collator.compare(nameBase, contentBase) === 0) return null // redundant — name is a slugified version of the title
    if (excludedSigils.includes(name)) return null // redundant — excluded by board/column context
    return name
  }, [displayNode.name, cleanContent, excludedSigils])

  // Compute body/structural split for children display when editing.
  // The BodyBlockEditor internally computes bodyChildren; this just provides
  // structuralChildren for NodeChildren when isInlineEditing is true.
  const structuralChildren = useMemo(() => {
    if (!isInlineEditing) return children
    const allChildren = resolvedGetChildren(childrenSourceId)
    return extractBody(allChildren).items
  }, [isInlineEditing, childrenSourceId, resolvedGetChildren, children])

  // When selected (yellow bg), strip ANSI color codes from styled content
  // so all text renders as black-on-yellow for readability.
  // Also strip colors for done/dropped tasks — colored dates/priorities aren't meaningful.
  const isHighlighted = isSelected || isMultiSelected
  const shouldStripColor = isHighlighted || style.isDoneOrDropped

  // HR detection: node type "hr" from parser, or content matching markdown HR pattern
  const isHR = node.type === "hr" || (cleanContent != null && isHRContent(cleanContent))

  // Memoize content for display - collapse blank lines for compact body cards
  const isVerbatim = node.type === "code" || node.type === "table"
  const processedContent = useMemo(() => {
    return compactContent ? displayContent.replace(/\n\s*\n/g, "\n") : displayContent
  }, [displayContent, compactContent])

  // Shared inline render context (wikilink/blockref resolution, sigil exclusion)
  const inlineContext = useTreeInlineContext(
    repo,
    rootBoardId,
    extraExcludedSigils,
    sigilColors,
    resolveSigilColor,
    excludedSigils,
  )

  // Search decorations — character-level highlighting of search matches
  const searchDecorations = useSearchDecorations(processedContent, searchHighlight, searchQuery, isCurrentMatch)

  // Info suffix props — rendered as React component below
  const infoSuffixProps = useMemo(
    () => ({
      node: displayNode,
      isCompact: !isOneliner,
      excludeBoardIds,
      getBoardPills,
    }),
    [displayNode.id, displayNode.assigned_to, displayNode.item?.task?.status, isOneliner, rootBoardId, getBoardPills],
  )

  // Inline child count on card titles — removed in favor of +N overflow indicator.
  // Only column headers show count (and only when WIP limit is configured).
  const showInlineChildCount = false

  // Body content indicator: show ··· on card titles when node has body children
  // (paragraphs, quotes, code blocks, etc. — not just structural oi items)
  const hasBody = useMemo(() => {
    if (depth !== 0 || isOneliner) return false
    if (cardView) return cardView.hasBodyChildren
    return extractBody(children).body.length > 0
  }, [depth, isOneliner, children, cardView])

  // Subtask progress badge: "3/7" showing done/total task children (cards only)
  const subtaskBadge = useMemo(() => {
    if (depth !== 0 || isOneliner) return null
    return formatSubtaskBadge(children)
  }, [depth, isOneliner, children])

  // Dependency badge: show when this task has unresolved dependencies
  const isBlocked = useMemo(() => {
    if (depth !== 0 || isOneliner) return false
    return hasUnresolvedDeps(displayNode, repo.getNode.bind(repo))
  }, [depth, isOneliner, displayNode.id, displayNode.data])

  // Date badge check — rendered as React component below
  const hasDateBadge = !!(displayNode.priority || displayNode.due_at || displayNode.start_at || displayNode.rrule)

  // Parent context for embedded tasks - use prop or default implementation.
  // Returns both the display text and the source node ID (for navigation links).
  const resolvedGetParentContext = useCallback(
    (n: KNode) => (getParentContextProp ? getParentContextProp(n) : getParentContextFromState(repo, n)),
    [getParentContextProp, repo],
  )
  const rawParentContext =
    parentContextProp !== undefined
      ? parentContextProp
      : depth === 0 && nodeIsTask && isEmbedded
        ? resolvedGetParentContext(node)
        : null
  // Suppress parent context if it matches an excluded sigil (redundant on that board/column).
  // Check both the display name AND the source node's sigil name / fs_path.
  // This handles the case where a column is "@next" but its display name is "Next Actions".
  // Also resolves the parent node ID for navigation links.
  const { parentContext, parentNodeId } = useMemo((): { parentContext: string | null; parentNodeId: string | null } => {
    if (!rawParentContext) return { parentContext: null, parentNodeId: null }
    // Direct match: display name is in excluded sigils
    if (excludedSigils.includes(rawParentContext)) return { parentContext: null, parentNodeId: null }
    // Extended check: resolve the parent context source node and compare its name/fs_path
    if (parentContextProp === undefined && depth === 0 && nodeIsTask && isEmbedded) {
      const result = getParentContextExFromState(repo, node)
      if (result) {
        // Check if the source node's name (sigil) is excluded
        if (result.nodeName && excludedSigils.includes(result.nodeName)) {
          return { parentContext: null, parentNodeId: null }
        }
        // Check if the source node's fs_path matches an excluded sigil
        if (result.fsPath) {
          const filename = result.fsPath.split("/").pop() || ""
          const fsName = filename.replace(/\.md$/, "")
          if (excludedSigils.includes(fsName)) return { parentContext: null, parentNodeId: null }
        }
        return { parentContext: rawParentContext, parentNodeId: result.nodeId }
      }
    }
    // When parentContextProp is provided externally, resolve nodeId via getParentContextEx
    if (parentContextProp !== undefined && depth === 0 && isEmbedded) {
      const result = getParentContextExFromState(repo, node)
      return { parentContext: rawParentContext, parentNodeId: result?.nodeId ?? null }
    }
    return { parentContext: rawParentContext, parentNodeId: null }
  }, [rawParentContext, excludedSigils, parentContextProp, depth, nodeIsTask, isEmbedded, repo, node])

  // Context suffix (shown inline for oneliner variant only)
  const truncatedContext = isOneliner
    ? truncateContext(parentContext, 40) // Fixed max context width
    : null
  const contextSuffix = truncatedContext ? ` < ${truncatedContext}` : ""
  const showInlineContext = truncatedContext !== null

  // Head row measurement for curswantY (only at depth 0)
  const registry = useNavigator()
  const handleHeadLayout = useCallback(
    (computed: { x: number; y: number; width: number; height: number }) => {
      if (!registry || depth !== 0) return
      registry.updateHead(colIndex, cardIndex, computed.y, computed.height)
    },
    [registry, depth, colIndex, cardIndex],
  )

  // Check if a descendant is being edited or has cursor — expand to show all children.
  // Uses per-node reactive signals where possible to avoid O(N) global re-renders.
  const expandedEditCardId = useReactive(nodeStore.expandedEditCardId)
  const editNodeId = useAppStore<BoardAppStore, string | null | undefined>((s) =>
    s.workspace ? Workspace.getActiveBoardPane(s)?.inlineEditBlock?.nodeId : undefined,
  )
  // Cursor expansion: reuse cursorInDescendant from above (per-card signal, O(1) re-renders)
  const shouldExpand =
    // Edit: card-level expansion
    (depth === 0 && expandedEditCardId === node.id) ||
    // Edit: sub-item-level expansion (any depth)
    (depth > 0 && editNodeId != null && isAncestorOf(repo, node.id, editNodeId)) ||
    // Cursor: card-level expansion when cursor is on a descendant
    (depth === 0 && cursorInDescendant)

  // Child rendering
  // Apply task status filter (e.g., hide done/dropped) at all tree depths
  // taskStatusFilter is now from TreeRenderContext (board-wide, no per-node subscription)
  // In multiline (cards) mode, maxContentLines controls how many children are visible.
  // In oneliner mode, a fixed cap prevents performance issues with large nodes.
  // When a descendant is being edited or cursor is on it, bypass the limit.
  const maxChildren = shouldExpand
    ? Infinity
    : variant === "multiline"
      ? maxContentLines
      : VARIANT_CONFIG.oneliner.maxChildren

  // Combined filter + slice with early exit: stop after collecting maxChildren matches.
  // For a card with 2,628 children and maxChildren=3, this scans ~3-10 items (not 2,628).
  const { visibleChildren, hiddenCount } = useMemo(() => {
    if (taskStatusFilter.size === 0) {
      return {
        visibleChildren: children.length <= maxChildren ? children : children.slice(0, maxChildren),
        hiddenCount: Math.max(0, children.length - maxChildren),
      }
    }
    const visible: typeof children = []
    let totalPassing = 0
    for (const child of children) {
      // For embed children, resolve to source node to get task_status
      const filterNode = child.embed_source ? (repo.getNode(child.embed_source) ?? child) : child
      const status = filterNode.item?.task?.status ?? getStatusForMarker(filterNode.item?.task?.marker)
      if (!status || taskStatusFilter.has(status)) {
        totalPassing++
        if (visible.length < maxChildren) visible.push(child)
      }
    }
    return { visibleChildren: visible, hiddenCount: totalPassing - visible.length }
  }, [children, taskStatusFilter, maxChildren, repo])

  // Children are hidden when individually folded
  const childrenVisible = hasChildren && !isFolded
  const childrenHidden = hasChildren && !childrenVisible

  // In cards mode (multiline), suppress "+N more" at all levels — the Card
  // component renders a border-based overflow indicator instead.
  const suppressChildOverflow = !isOneliner

  return (
    <Box flexDirection="column" height={isOneliner ? 1 : undefined} overflow={isOneliner ? "hidden" : undefined}>
      {/* Parent context line (shown ABOVE task for embedded items, multiline mode only) */}
      {/* Indented to align with title text, dimmed without "< " prefix */}
      {/* Wrapped in Link for Cmd+click navigation to the parent node */}
      {!isOneliner && isEmbedded && parentContext && (
        <Box paddingLeft={prefix.length}>
          {parentNodeId ? (
            <Link href={`km://node/${parentNodeId}`} color="$muted" underline={false}>
              <Text italic wrap="truncate">
                {parentContext}
              </Text>
            </Link>
          ) : (
            <Text dimColor italic wrap="truncate">
              {parentContext}
            </Text>
          )}
        </Box>
      )}

      {/* Main row: Box with paddingLeft for depth indentation */}
      {/* paddingLeft={depth} makes marker flush with border at depth 0 */}
      {/* alignItems="flex-start" prevents row from stretching to match content height */}
      {/* backgroundColor on Box (not Text) to fill row background properly */}
      {/* Always height={1} to keep title on single line; use constrainText() for ellipsis in cards view */}
      <HeadRow onLayout={handleHeadLayout}>
        <Box
          id={node.id}
          data-view="item"
          {...(isSelected &&
            !titleHighlightOnly && {
              "data-cursor": true,
              "data-col-index": colIndex,
              "data-card-index": cardIndex,
            })}
          flexDirection="row"
          alignItems={isOneliner || isCardChild ? undefined : "flex-start"}
          overflow={isOneliner || isCardChild ? "hidden" : undefined}
          paddingLeft={Math.max(0, depth - 1)}
          backgroundColor={effectiveBg}
          height={isOneliner || isCardChild ? 1 : undefined}
        >
          {/* Fixed-width prefix box (bullet/checkbox) */}
          <Box width={prefix.length} flexShrink={0}>
            <Text color={tc} dimColor={sd}>
              {nodeIsTask && style.taskStatusIcon ? (
                <CheckboxIcon
                  nodeId={node.id}
                  icon={style.taskStatusIcon}
                  textColor={tc}
                  shouldDim={sd}
                  isSelected={isSelected}
                  isMultiSelected={isMultiSelected}
                  isDoneOrDropped={style.isDoneOrDropped}
                />
              ) : (
                <Text
                  color={isSelected || isMultiSelected ? tc : style.isDoneOrDropped ? undefined : prefix.markerColor}
                >
                  {prefix.markerChar}
                </Text>
              )}
              {prefix.afterMarker}
            </Text>
          </Box>
          {/* Flexible content box */}
          {/* overflow="hidden" for oneliner and card children to enable truncation */}
          <Box
            flexGrow={1}
            flexShrink={1}
            overflow={isOneliner || isCardChild ? "hidden" : undefined}
            paddingRight={isOneliner || isCardChild ? 2 : 0}
          >
            {editingTitle ? (
              <Text color={tc} wrap={isOneliner || isCardChild ? "truncate" : "wrap"}>
                {/* editState guaranteed non-null when editingTitle is true (editBlockIndex === 0) */}
                <TitleEditor
                  displayNode={displayNode}
                  editState={editState as NodeEditState}
                  nodeIsTask={nodeIsTask}
                  repo={repo}
                  setUI={setUI}
                  jobRunner={jobRunner}
                  undoHandle={undoHandle}
                />
              </Text>
            ) : isHR ? (
              <Text color={tc} dimColor={sd} wrap="truncate">
                {cleanContent.trim()}
              </Text>
            ) : (
              <Text
                bold={depth === 0}
                color={isBrokenEmbed && !isHighlighted ? "$error" : dimUntitled ? "$warning" : (tc ?? style.ownColor)}
                dimColor={sd}
                strikethrough={style.shouldStrikethrough}
                wrap={isOneliner || isCardChild || node.type === "code" || node.type === "table" ? "truncate" : "wrap"}
              >
                {isVerbatim ? (
                  processedContent
                ) : (
                  <InlineText
                    text={processedContent}
                    context={{
                      ...inlineContext,
                      // Strip inline colors when selected/done or search highlighted.
                      // Links use dotted underline (no color) by default, so no heading clash.
                      colorOverride: searchHighlight || shouldStripColor ? null : undefined,
                    }}
                    decorations={searchDecorations}
                  />
                )}
                {sigilName && (
                  <>
                    {" "}
                    <Text dimColor={sd}>{sigilName}</Text>
                  </>
                )}
                {!childrenHidden && (
                  <Text dimColor={sd}>
                    <InfoSuffix {...infoSuffixProps} stripColor={searchHighlight || shouldStripColor} />
                  </Text>
                )}
                {showInlineChildCount && <Text dimColor> {childCount}</Text>}
                {!childrenHidden && showInlineContext && parentNodeId && (
                  <Link href={`km://node/${parentNodeId}`} color="$muted" underline={false}>
                    <Text italic>{contextSuffix}</Text>
                  </Link>
                )}
                {!childrenHidden && showInlineContext && !parentNodeId && (
                  <Text dimColor={sd} italic>
                    {contextSuffix}
                  </Text>
                )}
                {hasBody && (!childrenVisible || hiddenCount > 0) && <Text dimColor>{" ···"}</Text>}
              </Text>
            )}
          </Box>
          {/* Right-aligned: child count — always gray (black when selected) */}
          {/* Never bold: bold gray renders as bright/white on terminals */}
          {/* Hidden in card views where overflow indicator shows the count */}
          {/* Placed before date badge so layout is: Title ... COUNT ... dates */}
          {hasChildren && !hideChildCount && (
            <Box flexShrink={0}>
              <Text color={isHighlighted ? tc : "$disabled-fg"}>{` ${childCount}`}</Text>
            </Box>
          )}
          {/* Right-aligned: blocked indicator — shown when task has unresolved deps */}
          {isBlocked && !isInlineEditing && (
            <Box flexShrink={0}>
              <Text color={isHighlighted ? tc : "$error"}>{" blocked"}</Text>
            </Box>
          )}
          {/* Right-aligned: subtask progress badge — "3/7" done/total */}
          {subtaskBadge && !isInlineEditing && (
            <Box flexShrink={0}>
              <Text color={isHighlighted ? tc : "$disabled-fg"}>{` ${subtaskBadge}`}</Text>
            </Box>
          )}
          {/* Right-aligned: date badge (priority, recurrence, scheduled, due) */}
          {/* Hidden during inline editing — metadata is shown in the editable text */}
          {/* Rightmost element in the row — dates are the last thing on the line */}
          {hasDateBadge && !isInlineEditing && !style.isDoneOrDropped && (
            <Box flexShrink={0}>
              <Text color={tc} wrap="truncate">
                {" "}
                <DateBadge node={displayNode} stripColor={shouldStripColor} />
              </Text>
            </Box>
          )}
        </Box>
      </HeadRow>

      {/* Body block editing: when editing this node, show body children as editable blocks */}
      {/* editState guaranteed non-null when isInlineEditing is true (editBlockIndex !== null) */}
      {isInlineEditing && (
        <BodyBlockEditor
          displayNode={displayNode}
          editState={editState as NodeEditState}
          childrenSourceId={childrenSourceId}
          resolvedGetChildren={resolvedGetChildren}
          depth={depth}
          repo={repo}
          setUI={setUI}
          undoHandle={undoHandle}
        />
      )}

      {/* Children: during editing show only structural (body is rendered as editable blocks above) */}
      {childrenVisible && (
        <ErrorBoundary
          fallback={
            <Text color={"$error"} dim>
              [error]
            </Text>
          }
          resetKeys={[node.id, depth, children.length]}
          onError={handleNodeChildrenError}
        >
          <NodeChildren
            children={isInlineEditing ? structuralChildren : visibleChildren}
            colIndex={colIndex}
            cardIndex={cardIndex}
            depth={depth}
            dimInactiveChildren={dimInactiveChildren}
            dim={dim || style.isDoneOrDropped}
            hiddenCount={isInlineEditing ? 0 : hiddenCount}
            getChildren={resolvedGetChildren}
            getParentContext={resolvedGetParentContext}
            getBoardPills={getBoardPills}
            extraExcludedSigils={extraExcludedSigils}
            showOverflowIndicator={!suppressChildOverflow}
            remainingDepth={resolvedDepth - 1}
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
  onLayout: (computed: { x: number; y: number; width: number; height: number }) => void
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
function HeadLayoutRegistrar({ onLayout }: { onLayout: HeadRowProps["onLayout"] }): null {
  const callbackRef = React.useRef(onLayout)
  callbackRef.current = onLayout
  useScreenRectCallback((rect) => callbackRef.current(rect))
  return null
}

// =============================================================================
// FoldAwareChild — Per-node fold override check (avoids global foldDepths subscription)
// =============================================================================

/**
 * Reads per-node fold override via reactive signal instead of subscribing to the
 * entire foldDepths Map from Zustand. When any fold changes, only the affected
 * node's FoldAwareChild re-renders — not every NodeChildren in the tree.
 */
const FoldAwareChild = React.memo(function FoldAwareChild({
  node,
  isSelected,
  depth,
  colIndex,
  cardIndex,
  dim,
  dimInactiveChildren,
  getChildren,
  getParentContext,
  getBoardPills,
  extraExcludedSigils,
  childCount,
  isBody,
}: {
  node: KNode
  isSelected: boolean
  depth: number
  colIndex: number
  cardIndex: number
  dim: boolean
  dimInactiveChildren: boolean
  getChildren?: (id: string) => KNode[]
  getParentContext?: (node: KNode) => string | null
  getBoardPills?: GetBoardPillsFn
  extraExcludedSigils?: string[]
  childCount: number
  isBody?: boolean
}): React.ReactElement {
  const nodeStore = useNodeStore()
  const foldOverride = useReactive(nodeStore.getOrCreate(node.id).foldOverride)

  // If this child has an explicit unfold override or is the cursor target,
  // use full TreeNode (cursor can land here via J/K block navigation)
  if ((foldOverride !== undefined && foldOverride > 0) || isSelected) {
    return (
      <TreeNode
        node={node}
        depth={depth}
        isSelected={isSelected}
        colIndex={colIndex}
        cardIndex={cardIndex}
        dim={dim}
        dimInactiveChildren={dimInactiveChildren}
        getChildren={getChildren}
        getParentContext={getParentContext}
        getBoardPills={getBoardPills}
        extraExcludedSigils={extraExcludedSigils}
        remainingDepth={foldOverride ?? 0}
        isBody={isBody}
      />
    )
  }

  return (
    <FoldedChildRow
      node={node}
      depth={depth}
      dim={dim || isBody}
      childCount={childCount}
      extraExcludedSigils={extraExcludedSigils}
      isBody={isBody}
    />
  )
})

// =============================================================================
// FoldedChildRow — Lightweight replacement for TreeNode when folded
// =============================================================================

/**
 * Minimal component for children rendered at remainingDepth <= 0 (folded).
 * Renders a single line: bullet + title, truncated. Skips TreeNode's 15+ hooks
 * (cursor, edit, layout registration, overflow, etc.) since folded children:
 * - Can't be selected (cursor stays at card level)
 * - Can't be edited
 * - Don't render their own children
 * - Don't need layout registration for cross-column navigation
 *
 * Performance: ~3 React elements vs TreeNode's ~15, 2 hooks vs 15+.
 * With 90 folded children on screen, this saves ~300-400ms on initial render.
 */
const FoldedChildRow = React.memo(
  function FoldedChildRow({
    node,
    depth,
    dim = false,
    childCount = 0,
    extraExcludedSigils,
    isBody = false,
  }: {
    node: KNode
    depth: number
    dim?: boolean
    childCount?: number
    extraExcludedSigils?: string[]
    isBody?: boolean
  }): React.ReactElement {
    renderLog.debug?.(`FoldedChildRow ${sid(node.id)} depth=${depth}`)

    const {
      treeConfig,
      sigilColors,
      resolveSigilColor,
      rootBoardId,
      searchMatchNodeIds,
      currentMatchNodeId,
      searchQuery,
    } = useTreeRenderContext()
    const repo = useRepo()

    // Read multi-selection signal so grandchildren highlight when parent is selected
    const nodeStore = useNodeStore()
    const isMultiSelected = useReactive(nodeStore.getOrCreate(node.id).multiSelected)

    const nodeIsTask = KNode.isTask(node)
    const hasChildren = childCount > 0
    const style = getNodeStyle(node, false, isMultiSelected, false, depth, false)
    if (dim) style.shouldDim = true

    // Search match highlighting: white bg / black fg (current match brighter)
    const isSearchMatch = searchMatchNodeIds.has(node.id)
    const isCurrentMatch = node.id === currentMatchNodeId
    const searchHighlight = isSearchMatch
    const effectiveBg = style.backgroundColor
    const foldTc = style.textColor
    const foldSd = style.shouldDim

    // Bullet icon — always folded (isFolded=true for computeBulletIcon)
    // Body nodes get no bullet — just indentation space
    const { iconStyle } = treeConfig
    const bulletIcon = isBody
      ? null
      : computeBulletIcon(node, nodeIsTask, style.taskStatusIcon, hasChildren, true, style.ownColor, iconStyle)
    const prefix = bulletIcon
      ? buildPrefix(bulletIcon)
      : { markerChar: "", markerColor: undefined as string | undefined, afterMarker: " ", length: 1 }

    // Content — resolve embeds
    const { isEmbedded, resolvedNode, displayNode, isBrokenEmbed } = resolveEmbed(repo, node)
    const rawContent = getDisplayContent(repo, node, displayNode, resolvedNode, isEmbedded)
    const displayContent = nodeIsTask ? stripTaskMark(rawContent) : rawContent

    // Shared inline context and search decorations
    const inlineContext = useTreeInlineContext(repo, rootBoardId, extraExcludedSigils, sigilColors, resolveSigilColor)
    const foldSearchDecorations = useSearchDecorations(displayContent, searchHighlight, searchQuery, isCurrentMatch)

    return (
      <Box
        id={node.id}
        data-view="item"
        flexDirection="row"
        overflow="hidden"
        paddingLeft={Math.max(0, depth - 1)}
        backgroundColor={effectiveBg}
        height={1}
      >
        <Box width={prefix.length} flexShrink={0}>
          <Text color={foldTc} dimColor={foldSd}>
            <Text color={isMultiSelected ? foldTc : style.isDoneOrDropped ? undefined : prefix.markerColor}>{prefix.markerChar}</Text>
            {prefix.afterMarker}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} overflow="hidden" paddingRight={2}>
          <Text
            color={isBrokenEmbed && !isMultiSelected ? "$error" : (foldTc ?? style.ownColor)}
            dimColor={foldSd}
            strikethrough={style.shouldStrikethrough}
            wrap="truncate"
          >
            {node.type === "code" || node.type === "table" ? (
              displayContent
            ) : (
              <InlineText
                text={displayContent}
                context={{
                  ...inlineContext,
                  colorOverride: searchHighlight || isMultiSelected || style.isDoneOrDropped ? null : undefined,
                }}
                decorations={foldSearchDecorations}
              />
            )}
          </Text>
        </Box>
        {/* Right-aligned: child count — mirrors TreeNode's count display */}
        {hasChildren && (
          <Box flexShrink={0}>
            <Text color={"$disabled-fg"}>{` ${childCount}`}</Text>
          </Box>
        )}
      </Box>
    )
  },
  (prev, next) =>
    prev.node === next.node &&
    prev.depth === next.depth &&
    prev.dim === next.dim &&
    prev.childCount === next.childCount &&
    prev.extraExcludedSigils === next.extraExcludedSigils,
)

// =============================================================================
// NodeChildren Subcomponent
// =============================================================================

interface NodeChildrenProps {
  children: KNode[]
  colIndex: number
  cardIndex: number
  depth: number
  dimInactiveChildren: boolean
  /** Force dim on all children (e.g., parent is done/dropped) */
  dim?: boolean
  hiddenCount: number
  /** Callback to fetch children for nested nodes */
  getChildren?: (id: string) => KNode[]
  /** Callback to get parent context for nested embedded tasks */
  getParentContext?: (node: KNode) => string | null
  /** Callback to get board pills for info suffix */
  getBoardPills?: GetBoardPillsFn
  /** Additional sigils to exclude (e.g., column-level sigils like @next inside @next column) */
  extraExcludedSigils?: string[]
  /** Whether to show the "+N more" overflow indicator (default: true).
   * In cards mode, suppressed at all levels in favor of a single consolidated "..." at the card root. */
  showOverflowIndicator?: boolean
  /** Remaining depth budget for fold rendering (passed from parent TreeNode) */
  remainingDepth?: number
}

function NodeChildren({
  children,
  colIndex,
  cardIndex,
  depth,
  dimInactiveChildren,
  dim: parentDim = false,
  hiddenCount,
  getChildren,
  getParentContext,
  getBoardPills,
  extraExcludedSigils,
  showOverflowIndicator = true,
  remainingDepth,
}: NodeChildrenProps): React.ReactElement {
  // Apply recursive body extraction: separate body content from structural items
  const { body: bodyChildren, items: structuralChildren } = extractBody(children)

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

  // Fast path: when remainingDepth <= 0, ALL children will be folded (no sub-children).
  // Use FoldedChildRow (2 hooks, 3 elements) instead of TreeNode (15+ hooks, 15 elements).
  // Exception: children with explicit foldDepth overrides use FoldAwareChild (per-node atom).
  const allFolded = remainingDepth !== undefined && remainingDepth <= 0
  const repo = useRepo()

  // Batch-fetch child counts for fold markers when using lightweight path.
  // Called unconditionally (React hooks rule), but only does work when allFolded.
  const childCounts = useMemo(
    () => (allFolded ? repo.getChildCounts(orderedChildren.map((item) => item.node.id)) : null),
    [allFolded, repo, orderedChildren],
  )

  // Get cursor position from ReactiveNodeStore to determine which child is selected.
  const nodeStore = useNodeStore()
  const cursorNodeId = useReactive(nodeStore.cursorNodeId)

  if (allFolded) {
    // Cap folded children at terminal height — no card can show more children
    // than the terminal has rows. Prevents rendering thousands of invisible
    // components (e.g. a card with 2,628 children).
    const maxVisible = process.stdout.rows ?? 50
    const displayChildren = orderedChildren.length > maxVisible ? orderedChildren.slice(0, maxVisible) : orderedChildren
    const truncatedCount = orderedChildren.length - displayChildren.length
    const totalHiddenCount = hiddenCount + truncatedCount

    return (
      <Box flexDirection="column">
        {displayChildren.map((item) => (
          <FoldAwareChild
            key={item.node.id}
            node={item.node}
            isSelected={cursorNodeId === item.node.id}
            depth={depth + 1}
            colIndex={colIndex}
            cardIndex={cardIndex}
            dim={parentDim}
            dimInactiveChildren={dimInactiveChildren}
            getChildren={getChildren}
            getParentContext={getParentContext}
            getBoardPills={getBoardPills}
            extraExcludedSigils={extraExcludedSigils}
            childCount={childCounts?.get(item.node.id) ?? 0}
            isBody={item.isBody}
          />
        ))}
        {totalHiddenCount > 0 && showOverflowIndicator && (
          <Box flexDirection="column" alignItems="center">
            <Small wrap="truncate">+{totalHiddenCount} more</Small>
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {orderedChildren.map((item, i) => {
        const childSelected = cursorNodeId === item.node.id

        return (
          <TreeNode
            key={`${item.node.id}-${i}`}
            node={item.node}
            depth={depth + 1}
            isSelected={childSelected}
            colIndex={colIndex}
            cardIndex={cardIndex}
            dim={parentDim}
            dimInactiveChildren={dimInactiveChildren}
            getChildren={getChildren}
            getParentContext={getParentContext}
            getBoardPills={getBoardPills}
            extraExcludedSigils={extraExcludedSigils}
            remainingDepth={remainingDepth}
            isBody={item.isBody}
          />
        )
      })}
      {hiddenCount > 0 && showOverflowIndicator && (
        <Box flexDirection="column" alignItems="center">
          <Small wrap="truncate">+{hiddenCount} more</Small>
        </Box>
      )}
    </Box>
  )
}

/** Check if `ancestorId` is an ancestor of `nodeId` via Tree.ancestors(). */
function isAncestorOf(repo: TreeReader, ancestorId: string, nodeId: string): boolean {
  return Tree.ancestors(repo, nodeId).some((a) => a.id === ancestorId)
}
