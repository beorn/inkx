/**
 * Shared TreeNode component for tree/outline views
 *
 * Two variants:
 * - oneliner: Title + parent context inline on one line, truncated (for list/columns/tabs)
 * - multiline: Parent context above title, content can wrap multiple lines (for cards)
 */
/* oxlint-disable complexity/max-cognitive, complexity/max-cyclomatic -- React component — JSX conditionals inflate score */

import React, { useCallback, useMemo } from "react"
import { useNodeStore, useTreeNode, type NodeEditState } from "../state/reactive.ts"
import { useSignal, useNode } from "../hooks/use-signal.ts"
import { renderLog, sid } from "../log.ts"
import { Box, ErrorBoundary, Link, Text, useScrollRect, useTheme } from "@silvery/ag-react"
import { KNode, getStatusForMarker } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import {
  isNodeUntitled,
  getParentContext as getParentContextFromState,
  getParentContextEx as getParentContextExFromState,
} from "../state.ts"
import { extractBody, Tree, type TreeReader } from "@km/tree"
import { isCollapsedChild } from "@km/board"
import { isSigilName, InlineText } from "../text/index.ts"
import { useTreeRenderContext, deriveExcludedSigils } from "../state/ui-context.tsx"
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
  MAX_EXPANDED_CHILDREN,
  type GetBoardPillsFn,
} from "./tree-node-helpers.tsx"
import { useNavigator } from "../layout-context.tsx"
import { stripKnownMentions } from "./detail-pane-helpers.ts"
import { resolveSymlink, getDisplayContent } from "./symlink-display.ts"
import { computeBulletIcon, useTreeInlineContext, useSearchDecorations } from "./tree-node-shared.ts"
import { TitleEditor, BodyBlockEditor } from "./tree-node-edit.tsx"
import { selectedBg, multiSelectedBg } from "../theme.ts"
import { CheckboxIcon } from "./CheckboxIcon.tsx"
import { log } from "../log.ts"
import { useApp as useAppStore } from "@silvery/create"
import { Workspace, type BoardAppStore } from "../state/board-app-store.ts"
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
  /** Pre-computed parent context for symlinked tasks (optional) */
  parentContext?: string | null
  /** Callback to fetch children on unfold (optional - defaults to storage lookup) */
  getChildren?: (id: string) => KNode[]
  /** Callback to get parent context for nested symlinked tasks (optional) */
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
    prev.node.symlink_to !== next.node.symlink_to ||
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
    sel,
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
  const n = useTreeNode(node.id)
  const isNodeSelected = useSignal(n.selected)
  const editState = useSignal(n.edit)
  const foldOverride = useSignal(n.foldOverride)
  // Sticky-fold state — drives the inverse fold-marker visual for pinned nodes.
  const stickyFold = useSignal(n.sticky)
  // Per-node fold override takes precedence, then remainingDepth from parent, then default (unfolded)
  const resolvedDepth = foldOverride ?? remainingDepth ?? Infinity
  const isFolded = resolvedDepth <= 0
  const editBlockIndex = editState?.blockIndex ?? null
  const isInlineEditing = editBlockIndex !== null
  const editingTitle = editBlockIndex === 0
  const excludeBoardIds = rootBoardId ? new Set([rootBoardId]) : new Set<string>()

  const repo = useRepo()

  // Per-node projected view state via ViewTree signals
  const viewNode = useNode(node.id)

  // Excluded sigils: use reactive store if hydrated, fallback for compatibility
  const reactiveExcludedSigils = useSignal(n.excludedSigils as () => string[])
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
  // Exception: when editing, show full content so cursor isn't hidden in truncated area
  const isCardChild = variant === "multiline" && depth > 0 && !isInlineEditing
  // Symlink resolution via ViewTree projection when available, resolveSymlink() fallback.
  // viewNode.isSymlink = symlink resolved successfully. isBrokenSymlink = symlink target missing.
  // isSymlinked = either case (isSymlink OR isBrokenSymlink).
  const { displayNode, isSymlinked, resolvedNode, isBrokenSymlink } = viewNode
    ? {
        displayNode: viewNode.display ?? node,
        isSymlinked: viewNode.isSymlink || viewNode.isBrokenSymlink,
        resolvedNode: viewNode.isSymlink && viewNode.display !== node ? (viewNode.display ?? null) : null,
        isBrokenSymlink: viewNode.isBrokenSymlink,
      }
    : resolveSymlink(repo, node)

  // Children: use ViewTree childIds when available (already fold/hidden/symlink resolved).
  // Fallback to manual fetch for contexts without ViewTree (storybook, tests).
  const resolvedGetChildren = getChildrenProp ?? repo.getChildren.bind(repo)
  const childrenSourceId = isSymlinked && resolvedNode ? resolvedNode.id : node.id
  const children = useMemo(() => {
    if (viewNode && !childrenProp) {
      // ViewTree provides visible child IDs — map to KNode objects.
      // Still need isCollapsedChild filter: detail-only nodes (km.collapse:: true)
      // are tree-visible but shouldn't render inside cards.
      return viewNode.childIds
        .map((id) => repo.getNode(id))
        .filter((n): n is KNode => n != null && !isCollapsedChild(n))
    }
    // Fallback: manual fetch + collapsed child filter
    const raw = childrenProp ?? resolvedGetChildren(childrenSourceId)
    return raw.filter((c) => !isCollapsedChild(c))
  }, [viewNode?.childIds, childrenProp, childrenSourceId, resolvedGetChildren, repo])
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
    const s = getNodeStyle(displayNode, isSelected, isNodeSelected, dimInactiveChildren, depth, isInlineEditing)
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
    isNodeSelected,
    dimInactiveChildren,
    depth,
    isInlineEditing,
    dim,
    isBody,
  ])

  // Cursor node (isSelected): inverse yellow on its title row only.
  // Parent card (cursorInDescendant): yellow fg + faint highlight bg on title row.
  // Multi-selected sub-item (isNodeSelected && !isSelected): stronger bg tint
  // on the head row so the user can visually count selected items.
  const cursorInDescendant = useSignal(nodeStore.cursorDescendant(node.id))
  const isParentOfCursor = depth === 0 && cursorInDescendant

  // If an ancestor is selected, the card/column already provides the visual bg
  // (selectedBg from CardColumn). Don't add per-node multiSelectedBg on top —
  // that creates a zebra pattern where sections get 14% tint while sub-items
  // inherit the card's 6% tint.
  const hasSelectedAncestor = useSignal(nodeStore.selectedAncestor(node.id))

  // Search match highlighting: white bg / black fg (current match brighter)
  const isSearchMatch = searchMatchNodeIds.has(node.id)
  const isCurrentMatch = node.id === currentMatchNodeId
  const searchHighlight = isSearchMatch && !isSelected && !isNodeSelected
  // Cursor node: inverse bg on head row.
  // Parent of cursor: yellow fg + faint highlight bg on head row.
  // Multi-selected (non-cursor) sub-item: stronger bg tint, but only when
  // the node is independently selected (not just a descendant of a selected card).
  // Card-level subtle bg for a multi-selected card comes from CardColumn.
  const theme = useTheme()
  const isMultiSelectedOnly = isNodeSelected && !isSelected && !hasSelectedAncestor
  const effectiveBg = isSelected || isParentOfCursor ? undefined : style.backgroundColor
  const headRowBg = isSelected
    ? style.backgroundColor // inverse ($selection-bg)
    : isParentOfCursor
      ? selectedBg(theme) // faint highlight
      : isMultiSelectedOnly
        ? multiSelectedBg(theme) // stronger tint for multi-selected sub-items
        : undefined
  const tc = isSelected
    ? style.textColor // $selection (black) for inverse
    : isParentOfCursor
      ? "$primary" // yellow fg for parent card title
      : style.textColor
  const sd = style.shouldDim

  // Untitled nodes (showing (shortId) fallback) render very dimmed
  const untitled = isNodeUntitled(repo, displayNode)
  const dimUntitled = untitled && !isSelected && !isNodeSelected

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
            stickyFold,
          ),
    [
      isBody,
      nodeIsTask,
      iconStyle,
      displayNode.type,
      hasChildren,
      isFolded,
      style.ownColor,
      style.taskStatusIcon,
      stickyFold,
    ],
  )

  // Memoize prefix - body nodes get empty prefix (just indentation space)
  const prefix = useMemo(
    () =>
      bulletIcon ? buildPrefix(bulletIcon) : { markerChar: "", markerColor: undefined, afterMarker: " ", length: 1 },
    [bulletIcon],
  )

  // Get content, stripping task marks for nodes with task_status
  // The task mark is displayed via the icon, so we don't need it in the text
  const rawContent = getDisplayContent(repo, node, displayNode, resolvedNode, isSymlinked)
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

  // STABLE body classification: compute the body ID set from the FULL children
  // array before any slicing. This is CURSOR-INDEPENDENT — `children` is derived
  // from data (ViewTree childIds or repo.getChildren), never from cursor position.
  // Passing this set to NodeChildren means each child's isBody flag is determined
  // by data only, not by which slice happens to be visible.
  //
  // Without this, NodeChildren would call extractBody(visibleChildren), and slicing
  // can include/exclude outline items, flipping body classification on cursor move
  // (e.g. cursor expansion grows the slice from 3 to 20 and suddenly an outline
  // sibling appears, reclassifying earlier tasks as body).
  //
  // Preserves the existing invariant: body classification only applies when body
  // and structural items coexist. If all children are non-outline (no `items`),
  // they are treated as normal children (no body dim).
  const stableBodyIdSet = useMemo(() => {
    const { body, items } = extractBody(children)
    if (body.length === 0 || items.length === 0) return null // classify all as non-body
    const ids = new Set<string>()
    for (const b of body) ids.add(b.id)
    return ids
  }, [children])

  // Strip inline colors when a text color override is active (cursor inverse)
  // or for done/dropped tasks (colored dates/priorities aren't meaningful).
  // When textColor is set, competing inline colors would clash with the forced fg.
  const isHighlighted = isSelected || isNodeSelected
  const shouldStripColor = (isSelected && tc != null) || style.isDoneOrDropped

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

  // Body content indicator: show ··· on card titles when node has body children
  // (paragraphs, quotes, code blocks, etc. — not just structural oi items)
  // Uses ViewTree projection when available, falls back to manual extraction.
  const hasBodyFallback = useMemo(() => {
    if (depth !== 0 || isOneliner) return false
    return extractBody(children).body.length > 0
  }, [depth, isOneliner, children])
  const hasBody = viewNode ? viewNode.hasBody && depth === 0 && !isOneliner : hasBodyFallback

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

  // Parent context for symlinked tasks - use prop or default implementation.
  // Returns both the display text and the source node ID (for navigation links).
  const resolvedGetParentContext = useCallback(
    (n: KNode) => (getParentContextProp ? getParentContextProp(n) : getParentContextFromState(repo, n)),
    [getParentContextProp, repo],
  )
  const rawParentContext =
    parentContextProp !== undefined
      ? parentContextProp
      : depth === 0 && nodeIsTask && isSymlinked
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
    if (parentContextProp === undefined && depth === 0 && nodeIsTask && isSymlinked) {
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
    if (parentContextProp !== undefined && depth === 0 && isSymlinked) {
      const result = getParentContextExFromState(repo, node)
      return { parentContext: rawParentContext, parentNodeId: result?.nodeId ?? null }
    }
    return { parentContext: rawParentContext, parentNodeId: null }
  }, [rawParentContext, excludedSigils, parentContextProp, depth, nodeIsTask, isSymlinked, repo, node])

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
  const editingDescendant = useSignal(nodeStore.editingDescendant(node.id))
  // Cursor expansion: when cursor is inside this node's subtree, bypass maxContentLines
  // so all siblings of the cursor target are visible.
  const cursor = useSignal(nodeStore.cursor)
  const cursorIsChild = cursor != null && cursor !== node.id && repo.getNode(cursor)?.parent_id === node.id
  const shouldExpand =
    // Edit: expand when any descendant is being edited (reduced signal)
    editingDescendant ||
    // Cursor: expand card when cursor is on a descendant
    (depth === 0 && cursorInDescendant) ||
    // Cursor: expand sub-items when cursor is a direct child
    (depth > 0 && cursorIsChild)

  // Child rendering
  // Apply task status filter (e.g., hide done/dropped) at all tree depths
  // taskStatusFilter is now from TreeRenderContext (board-wide, no per-node subscription)
  // In multiline (cards) mode, maxContentLines controls how many children are visible.
  // In oneliner mode, a fixed cap prevents performance issues with large nodes.
  // When expanded (cursor/edit), cap to MAX_EXPANDED_CHILDREN to avoid overflow.
  const maxChildren = shouldExpand
    ? MAX_EXPANDED_CHILDREN
    : variant === "multiline"
      ? maxContentLines
      : VARIANT_CONFIG.oneliner.maxChildren

  // Combined filter + slice with early exit: stop after collecting maxChildren matches.
  // For a card with 2,628 children and maxChildren=3, this scans ~3-10 items (not 2,628).
  // "+1 more" takes the same space as showing the item — so show it instead.
  const effectiveMax = children.length === maxChildren + 1 ? maxChildren + 1 : maxChildren
  const { visibleChildren, hiddenCount } = useMemo(() => {
    if (taskStatusFilter.size === 0) {
      return {
        visibleChildren: children.length <= effectiveMax ? children : children.slice(0, effectiveMax),
        hiddenCount: Math.max(0, children.length - effectiveMax),
      }
    }
    const visible: typeof children = []
    let totalPassing = 0
    for (const child of children) {
      // For symlinked children, resolve to source node to get task_status
      const filterNode = child.symlink_to ? (repo.getNode(child.symlink_to) ?? child) : child
      const status = filterNode.item?.task?.status ?? getStatusForMarker(filterNode.item?.task?.marker)
      if (!status || taskStatusFilter.has(status)) {
        totalPassing++
        if (visible.length < effectiveMax) visible.push(child)
      }
    }
    return { visibleChildren: visible, hiddenCount: totalPassing - visible.length }
  }, [children, taskStatusFilter, effectiveMax, repo])

  // Children are hidden when individually folded
  const childrenVisible = hasChildren && !isFolded
  const childrenHidden = hasChildren && !childrenVisible

  return (
    <Box flexDirection="column" height={isOneliner ? 1 : undefined} overflow={isOneliner ? "hidden" : undefined}>
      {/* Parent context line (shown ABOVE task for symlinked items, multiline mode only) */}
      {/* Indented to align with title text, dimmed without "< " prefix */}
      {/* Wrapped in Link for Cmd+click navigation to the parent node */}
      {!isOneliner && isSymlinked && parentContext && (
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
          {...(isSelected && {
            "data-cursor": true,
            "data-col-index": colIndex,
            "data-card-index": cardIndex,
          })}
          flexDirection="row"
          alignItems={isOneliner || isCardChild ? undefined : "flex-start"}
          overflow={isOneliner || isCardChild ? "hidden" : undefined}
          paddingLeft={Math.max(0, depth - 1)}
          backgroundColor={headRowBg ?? effectiveBg}
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
                  isNodeSelected={isNodeSelected}
                  isDoneOrDropped={style.isDoneOrDropped}
                  undoHandle={undoHandle}
                />
              ) : (
                <Text
                  color={isSelected || isNodeSelected ? tc : style.isDoneOrDropped ? undefined : prefix.markerColor}
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
                  sel={sel}
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
                // Body blocks (paragraphs, li's, etc.) are prose, not structure:
                // plain weight + muted color, NO italic. Card titles (structural
                // items at depth 0) stay bold. Everything else renders with
                // normal fg (no bold, no muted). See bead km-tui.body-vs-subitem-emphasis.
                bold={depth === 0 && !isBody}
                color={
                  isBrokenSymlink && !isSelected
                    ? "$error"
                    : dimUntitled
                      ? "$warning"
                      : isBody && !isSelected && !isNodeSelected
                        ? "$muted"
                        : (tc ?? style.ownColor)
                }
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
          {/* Hidden in cards view (overflow indicators are enough) */}
          {/* Placed before date badge so layout is: Title ... COUNT ... dates */}
          {hasChildren && !hideChildCount && isOneliner && (
            <Box flexShrink={0}>
              <Text color={isSelected ? tc : "$disabled-fg"}>{` ${childCount}`}</Text>
            </Box>
          )}
          {/* Right-aligned: blocked indicator — shown when task has unresolved deps */}
          {isBlocked && !isInlineEditing && (
            <Box flexShrink={0}>
              <Text color={isSelected ? tc : "$error"}>{" blocked"}</Text>
            </Box>
          )}
          {/* Right-aligned: subtask progress badge — "3/7" done/total */}
          {/* Hidden in cards view — overflow indicators are enough */}
          {subtaskBadge && !isInlineEditing && isOneliner && (
            <Box flexShrink={0}>
              <Text color={isSelected ? tc : "$disabled-fg"}>{` ${subtaskBadge}`}</Text>
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
      {/* TreeNode is passed through to render non-active body blocks (breaks circular import). */}
      {isInlineEditing && (
        <BodyBlockEditor
          displayNode={displayNode}
          editState={editState as NodeEditState}
          childrenSourceId={childrenSourceId}
          resolvedGetChildren={resolvedGetChildren}
          depth={depth}
          colIndex={colIndex}
          cardIndex={cardIndex}
          repo={repo}
          setUI={setUI}
          sel={sel}
          undoHandle={undoHandle}
          TreeNode={TreeNode}
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
            dim={dim || isBody || style.isDoneOrDropped}
            hiddenCount={isInlineEditing ? 0 : hiddenCount}
            getChildren={resolvedGetChildren}
            getParentContext={resolvedGetParentContext}
            getBoardPills={getBoardPills}
            extraExcludedSigils={extraExcludedSigils}
            showOverflowIndicator={depth > 0}
            remainingDepth={resolvedDepth - 1}
            bodyIdSet={stableBodyIdSet}
            suppressCursorHighlight={isInlineEditing || editingDescendant}
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
  // Use a child registrar with useScrollRect to get screen-relative
  // positions (accounting for scroll offsets). Box.onLayout provides boxRect
  // which doesn't change on scroll — that would give wrong positions for
  // cross-column navigation when columns have different scroll offsets.
  return (
    <Box flexDirection="column">
      <HeadLayoutRegistrar onLayout={onLayout} />
      {children}
    </Box>
  )
}

/** Reports the HeadRow's screen-relative position via useScrollRect. */
function HeadLayoutRegistrar({ onLayout }: { onLayout: HeadRowProps["onLayout"] }): null {
  const callbackRef = React.useRef(onLayout)
  callbackRef.current = onLayout
  useScrollRect((rect) => callbackRef.current(rect))
  return null
}

// =============================================================================
// FoldAwareChild — Per-node fold override check (avoids global foldDepths subscription)
// =============================================================================

/**
 * Reads per-node fold override via reactive signal instead of subscribing to the
 * entire foldDepths Map from the store. When any fold changes, only the affected
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
  const foldOverride = useSignal(useTreeNode(node.id).foldOverride)

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
    const nf = useTreeNode(node.id)
    const isNodeSelected = useSignal(nf.selected)
    const stickyFold = useSignal(nf.sticky)

    const nodeIsTask = KNode.isTask(node)
    const hasChildren = childCount > 0
    const style = getNodeStyle(node, false, isNodeSelected, false, depth, false)
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
      : computeBulletIcon(
          node,
          nodeIsTask,
          style.taskStatusIcon,
          hasChildren,
          true,
          style.ownColor,
          iconStyle,
          stickyFold,
        )
    const prefix = bulletIcon
      ? buildPrefix(bulletIcon)
      : { markerChar: "", markerColor: undefined as string | undefined, afterMarker: " ", length: 1 }

    // Content — resolve symlinks
    const { isSymlinked, resolvedNode, displayNode, isBrokenSymlink } = resolveSymlink(repo, node)
    const rawContent = getDisplayContent(repo, node, displayNode, resolvedNode, isSymlinked)
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
            <Text color={isNodeSelected ? foldTc : style.isDoneOrDropped ? undefined : prefix.markerColor}>
              {prefix.markerChar}
            </Text>
            {prefix.afterMarker}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} overflow="hidden" paddingRight={2}>
          <Text
            color={isBrokenSymlink && !isNodeSelected ? "$error" : (foldTc ?? style.ownColor)}
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
                  colorOverride: searchHighlight || isNodeSelected || style.isDoneOrDropped ? null : undefined,
                }}
                decorations={foldSearchDecorations}
              />
            )}
          </Text>
        </Box>
        {/* Right-aligned: child count — only in oneliner (columns) view */}
        {hasChildren && treeConfig.variant === "oneliner" && (
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
  /** Callback to get parent context for nested symlinked tasks */
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
  /** Stable body ID set computed from the FULL children array (before slicing).
   * When provided, body classification is data-derived (cursor-independent).
   * When null/undefined, NodeChildren falls back to extractBody(children) which
   * is stable for unsliced children (e.g. when no maxChildren cap applies). */
  bodyIdSet?: Set<string> | null
  /** When true, suppress cursor selection highlights on children.
   * Set by the parent TreeNode when it or a descendant is being edited —
   * the bold focusborder is sufficient, row-level inverse is redundant. */
  suppressCursorHighlight?: boolean
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
  bodyIdSet,
  suppressCursorHighlight = false,
}: NodeChildrenProps): React.ReactElement {
  // Classify each child as body or structural using the STABLE body ID set
  // computed from the parent's full children array (cursor-independent).
  //
  // Fallback path: if no stable set was passed (legacy callers), call
  // extractBody(children) — but this is only stable when `children` is the
  // full unsliced array. This fallback matches the previous behavior.
  const orderedChildren = useMemo(() => {
    if (bodyIdSet !== undefined) {
      // Stable path: preserve input order but flag body children per the stable set.
      // Body-first ordering is already enforced upstream in the full children list
      // (extractBody puts body before items), so preserving input order is correct.
      if (!bodyIdSet || bodyIdSet.size === 0) {
        return children.map((c) => ({ node: c, isBody: false }))
      }
      return children.map((c) => ({ node: c, isBody: bodyIdSet.has(c.id) }))
    }
    // Legacy fallback: re-derive from the (possibly sliced) children array.
    const { body: bodyChildren, items: structuralChildren } = extractBody(children)
    const hasStructural = structuralChildren.length > 0
    return hasStructural
      ? [
          ...bodyChildren.map((c) => ({ node: c, isBody: true })),
          ...structuralChildren.map((c) => ({ node: c, isBody: false })),
        ]
      : children.map((c) => ({ node: c, isBody: false }))
  }, [children, bodyIdSet])

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

  // Get cursor position from NodeStore to determine which child is selected.
  // When suppressCursorHighlight is true (parent is editing or has an editing
  // descendant), suppress cursor selection highlights — the bold focusborder
  // is sufficient, row-level inverse is redundant.
  const nodeStore = useNodeStore()
  const cursor = useSignal(nodeStore.cursor)
  const effectiveCursor = suppressCursorHighlight ? null : cursor

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
            isSelected={effectiveCursor === item.node.id}
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
          <Box paddingLeft={Math.max(0, depth) + 2}>
            <Text dimColor wrap="truncate">
              +{totalHiddenCount} more
            </Text>
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {orderedChildren.map((item, i) => {
        const childSelected = effectiveCursor === item.node.id

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
        <Box paddingLeft={Math.max(0, depth) + 2}>
          <Text dimColor wrap="truncate">
            +{hiddenCount} more
          </Text>
        </Box>
      )}
    </Box>
  )
}

/** Check if `ancestorId` is an ancestor of `nodeId` via Tree.ancestors(). */
function isAncestorOf(repo: TreeReader, ancestorId: string, nodeId: string): boolean {
  return Tree.ancestors(repo, nodeId).some((a) => a.id === ancestorId)
}
