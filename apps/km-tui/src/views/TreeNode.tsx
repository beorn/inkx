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
import type { UndoableRepoHandle } from "../undo/undoable-repo.ts"
import { renderLog, sid } from "../log.ts"
import { Box, ErrorBoundary, Text, useScreenRectCallback } from "inkx"
import type { KNode } from "@km/core"
import { extractTitleTaskMarker, isTask, isBlock } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import { getNodeDisplayName, isNodeUntitled, getParentContext as getParentContextFromState, getParentContextEx as getParentContextExFromState } from "../state.ts"
import { extractBody, splitNode, mergeWithPrevious } from "@km/tree"
import {
  renderRich,
  getTypeBullet,
  getCircleBullet,
  getFoldMarker,
  isSigilName,
  type StatusIcon,
} from "../text/index.ts"
import { stripFgColor } from "../text/rich.ts"
import { truncateText } from "../layout/index.ts"
import { makeSelectionKey } from "../types.ts"
import { useTreeRenderContext, deriveExcludedSigils } from "../ui-context.tsx"
import { InlineEditField } from "./InlineEditField.tsx"
import {
  getNodeStyle,
  buildPrefix,
  formatInfoSuffix,
  formatDateBadge,
  truncateContext,
  stripTaskMark,
  VARIANT_CONFIG,
  type GetBoardPillsFn,
} from "./tree-node-helpers.ts"
import { useNavigator } from "../layout-context.tsx"

/** Regex to extract target name from ![[target]] or ![[target|alias]] embed syntax. */
const EMBED_EXTRACT_RE = /^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/

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
  /** Additional sigils to exclude (e.g., column-level sigils like @next inside @next column) */
  extraExcludedSigils?: string[]
  /** Force dim styling on this node (used for virtual body cards) */
  dim?: boolean
  /** Collapse blank lines in content (used for compact body cards in cards view) */
  compactContent?: boolean
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
  if (prev.dim !== next.dim) return false
  if (prev.compactContent !== next.compactContent) return false

  // Node content that affects display (includes implicit task properties)
  if (
    prev.node.content !== next.node.content ||
    prev.node.task_status !== next.node.task_status ||
    prev.node.due_date !== next.node.due_date ||
    prev.node.due_time !== next.node.due_time ||
    prev.node.scheduled_date !== next.node.scheduled_date ||
    prev.node.scheduled_time !== next.node.scheduled_time ||
    prev.node.priority !== next.node.priority ||
    prev.node.recurrence !== next.node.recurrence ||
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
  subIndex,
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
}: TreeNodeProps): React.ReactElement {
  // Global tree rendering config from context (no per-node subscription)
  const { treeConfig, sigilColors, resolveSigilColor, setUI, rootBoardId } = useTreeRenderContext()
  const { maxOutlineDepth: maxDepth, maxContentLines, inOutlineMode, currentSubIndex, variant, iconStyle } =
    treeConfig

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
    editBlockIndex: s.ui.inlineEditBlock?.nodeId === node.id ? s.ui.inlineEditBlock.blockIndex : null,
  }))
  const { isMultiSelected, isFolded } = nodeState
  const editBlockIndex = nodeState.editBlockIndex
  const isInlineEditing = editBlockIndex !== null
  const editingTitle = editBlockIndex === 0
  const excludeBoardIds = rootBoardId ? new Set([rootBoardId]) : new Set<string>()

  const repo = useRepo()
  const jobRunner = useAppStore<BoardAppStore, JobRunner>((s) => s.jobRunner)
  const undoHandle = useAppStore<BoardAppStore, UndoableRepoHandle>((s) => s.undoHandle)
  const excludedSigils = useMemo(() => {
    const rootSigils = deriveExcludedSigils(repo, rootBoardId)
    if (!extraExcludedSigils?.length) return rootSigils
    return [...rootSigils, ...extraExcludedSigils]
  }, [repo, rootBoardId, extraExcludedSigils])
  const isOneliner = variant === "oneliner"
  // Children inside cards (depth > 0, multiline) should be single-line truncated
  const isCardChild = variant === "multiline" && depth > 0
  const isEmbedded = node.link_to != null

  // For embedded nodes, resolve the target for display purposes
  // The embed node's content is just "![[target]]" - we want to show the linked node's data
  const resolvedNode = isEmbedded && node.link_to ? repo.getNode(node.link_to) : null
  const displayNode = resolvedNode ?? node

  // Use provided children or fetch from repo
  // For embeds, get children from the TARGET node (transclusion shows target's children)
  const resolvedGetChildren = getChildrenProp ?? repo.getChildren.bind(repo)
  const childrenSourceId = isEmbedded && resolvedNode ? resolvedNode.id : node.id
  const children = childrenProp ?? resolvedGetChildren(childrenSourceId)
  // Use childCountProp if provided (for folded nodes where children array is empty)
  const childCount = childCountProp ?? children.length
  const hasChildren = childCount > 0

  // Debug logging for render tracking
  renderLog.debug?.(
    `TreeNode ${sid(node.id)} children=${children.length} childCount=${childCount} content=${displayNode.content?.slice(0, 30) ?? "(empty)"}`,
  )

  const nodeIsTask = isTask(displayNode)

  // Memoize style calculation - only recalc when selection or node status changes
  // Use displayNode for visual properties (task_status icon, strikethrough, etc.)
  // Include implicit task properties in deps so style recalculates when they change
  const style = useMemo(() => {
    const s = getNodeStyle(displayNode, isSelected, isMultiSelected, dimInactiveChildren, depth, isInlineEditing)
    if (dim) s.shouldDim = true
    return s
  }, [
    displayNode.id,
    displayNode.task_status,
    displayNode.due_date,
    displayNode.priority,
    displayNode.scheduled_date,
    displayNode.assigned_to,
    displayNode.recurrence,
    isSelected,
    isMultiSelected,
    dimInactiveChildren,
    depth,
    isInlineEditing,
    dim,
  ])

  // Untitled nodes (showing (shortId) fallback) render very dimmed
  const untitled = isNodeUntitled(repo, displayNode)
  const dimUntitled = untitled && !isSelected && !isMultiSelected

  // Compute the bullet icon based on icon style
  const bulletIcon = useMemo((): StatusIcon => {
    if (nodeIsTask && style.taskStatusIcon) return style.taskStatusIcon
    if (iconStyle === "workflowy") {
      const bullet = getCircleBullet(hasChildren, hasChildren && (isFolded || depth >= maxDepth))
      return style.ownColor ? { ...bullet, color: style.ownColor } : bullet
    }
    if (iconStyle === "nerdfont") {
      const bullet = getTypeBullet(displayNode, hasChildren) ?? getFoldMarker(hasChildren, isFolded, style.ownColor)
      return style.ownColor ? { ...bullet, color: style.ownColor } : bullet
    }
    // "regular" style — existing fold markers
    const bullet = getFoldMarker(hasChildren, isFolded, style.ownColor)
    return bullet
  }, [
    nodeIsTask,
    iconStyle,
    displayNode.type,
    hasChildren,
    isFolded,
    depth,
    maxDepth,
    style.ownColor,
    style.taskStatusIcon,
  ])

  // Memoize prefix - only recalc when bullet icon changes
  const prefix = useMemo(() => buildPrefix(bulletIcon), [bulletIcon])

  // Get content, stripping task marks for nodes with task_status
  // The task mark is displayed via the icon, so we don't need it in the text
  const rawContent = getDisplayContent(repo, node, displayNode, resolvedNode, isEmbedded)
  const cleanContent = nodeIsTask ? stripTaskMark(rawContent) : rawContent

  // Compute sigil for inline display: only if name is a sigil and differs from title
  // Skip sigils that are in the excluded list (e.g., @next on the @next board)
  const sigilName = useMemo(() => {
    const name = displayNode.name
    if (!name || !isSigilName(name)) return null
    if (name === cleanContent) return null // redundant — title IS the sigil
    if (excludedSigils.includes(name)) return null // redundant — excluded by board/column context
    return name
  }, [displayNode.name, cleanContent, excludedSigils])

  // For inline editing, use the actual node content (not display name fallback).
  // This ensures new nodes with empty content show an empty edit field,
  // not the short ID that getNodeDisplayName returns as fallback.
  // HR nodes with no content default to "---" (their canonical representation).
  const rawEditContent = displayNode.content ?? (displayNode.type === "hr" ? "---" : "")
  const editContent = nodeIsTask ? stripTaskMark(rawEditContent) : rawEditContent

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
      const { marker } = extractTitleTaskMarker(originalContent)
      const newContent = marker != null ? `${marker} ${newValue}` : newValue
      undoHandle.setCursor(displayNode.id)
      repo.updateNode(displayNode.id, { content: newContent })
    },
    [displayNode.id, displayNode.content, repo, undoHandle],
  )

  // Inline edit callbacks — uses renameNode for backlink-safe renames
  const handleInlineEditConfirm = useCallback(
    (newValue: string) => {
      const originalContent = displayNode.content ?? ""
      const { marker } = extractTitleTaskMarker(originalContent)
      const newContent = marker != null ? `${marker} ${newValue}` : newValue

      // No-op: value didn't change
      if (newContent === originalContent) {
        setUI({ inlineEditBlock: null })
        return
      }

      // Only do a full rename if name was already in sync with content (or unset).
      // e.g., "@next" (name) vs "Next Actions" (title) → different → just update content.
      // e.g., "My Task" (name) vs "My Task" (content) → same → rename keeps them in sync.
      // e.g., no name set → always rename (name gets derived from content).
      const node = repo.getNode(displayNode.id)
      const oldName = node?.name ?? ""
      const oldContentName = originalContent.replace(/^- \[.\]\s*/, "")
      const nameMatchedContent = !oldName || oldName === oldContentName

      if (nameMatchedContent) {
        const impact = repo.getRenameImpact(displayNode.id)
        const s = impact.backlinks.length === 1 ? "" : "s"

        jobRunner.submit({
          description: `Renaming '${oldName}' → '${newValue}'`,
          impact: impact.backlinks.length > 0 ? `${impact.backlinks.length} backlink${s} will be updated` : "",
          countdownMs: impact.backlinks.length > 0 ? 5000 : 0,
          execute: (onProgress) => {
            undoHandle.setCursor(displayNode.id)
            undoHandle.startBatch("Rename")
            repo.renameNode(displayNode.id, newContent, (info) => onProgress(info.updated, info.total))
            undoHandle.endBatch()
          },
        })
      } else {
        // Name and content diverged — just update content, don't rename
        undoHandle.setCursor(displayNode.id)
        repo.updateNode(displayNode.id, { content: newContent })
      }

      setUI({ inlineEditBlock: null })
    },
    [displayNode.id, displayNode.content, repo, setUI, jobRunner, undoHandle],
  )

  const handleInlineEditCancel = useCallback(() => {
    setUI({ inlineEditBlock: null })
  }, [setUI])

  // Body block save callback (persists content for a body child)
  const handleBlockSave = useCallback(
    (childId: string, newValue: string) => {
      undoHandle.setCursor(displayNode.id)
      repo.updateNode(childId, { content: newValue })
    },
    [repo, undoHandle, displayNode.id],
  )

  // Split at boundary: Enter in title creates a new sibling node
  const handleSplitAtBoundary = useCallback(
    (offset: number) => {
      try {
        undoHandle.setCursor(displayNode.id)
        undoHandle.startBatch("Split node")
        const result = splitNode(repo, displayNode.id, offset)
        undoHandle.endBatch()
        // Focus the new node (text after cursor) in edit mode
        setUI({ inlineEditBlock: { nodeId: result.afterId, blockIndex: 0 } })
      } catch {
        undoHandle.endBatch()
        // Split failed (e.g., root node) — visual bell
        setUI({ bellState: "split-failed" })
      }
    },
    [displayNode.id, repo, setUI, undoHandle],
  )

  // Merge backward: Backspace at start of title merges with previous sibling
  const handleMergeBackward = useCallback(() => {
    try {
      undoHandle.setCursor(displayNode.id)
      undoHandle.startBatch("Merge nodes")
      const result = mergeWithPrevious(repo, displayNode.id)
      undoHandle.endBatch()
      if (result) {
        // Focus the survivor with cursor at the merge point
        setUI({ inlineEditBlock: { nodeId: result.survivorId, blockIndex: 0 } })
        // TODO: set cursor offset to result.cursorOffset via BlockEditTarget after render
      }
    } catch {
      undoHandle.endBatch()
      // Merge failed — visual bell
      setUI({ bellState: "merge-failed" })
    }
  }, [displayNode.id, repo, setUI, undoHandle])

  // When selected (yellow bg), strip ANSI color codes from styled content
  // so all text renders as black-on-yellow for readability
  const isHighlighted = isSelected || isMultiSelected

  // HR detection: node type "hr" from parser, or content matching markdown HR pattern
  const HR_PATTERN = /^(-{3,}|\*{3,}|_{3,})$/
  const isHR = node.type === "hr" || (cleanContent != null && HR_PATTERN.test(cleanContent.trim()))

  // Memoize rich text rendering - only recalc when content or sigil config changes
  // Code blocks and tables render verbatim (no markdown formatting applied)
  const styledContent = useMemo(() => {
    // Collapse blank lines for compact body cards (cards view)
    const content = compactContent ? cleanContent.replace(/\n\s*\n/g, "\n") : cleanContent
    if (node.type === "code" || node.type === "table") {
      return content // Verbatim — no renderRich processing
    }
    const rich = renderRich(content, {
      excludeSigils: excludedSigils,
      sigilColors,
      resolveSigilColor,
    })
    // Estimate available width for cards (accounting for borders, padding, prefix)
    // Only truncate card titles (oi items) — body content (p, quote, etc.)
    // should wrap naturally via inkx's wrap="wrap"
    if (!isOneliner && !isBlock(node.type)) {
      return truncateText(rich, 70) // Default ~70 chars for card title
    }
    return rich
  }, [cleanContent, compactContent, excludedSigils, sigilColors, resolveSigilColor, isOneliner, node.type])

  // Memoize info suffix - only recalc when node metadata changes
  // Use displayNode for metadata (assigned_to, board pills)
  const infoSuffix = useMemo(
    () => formatInfoSuffix(displayNode, !isOneliner, excludeBoardIds, getBoardPills),
    [
      displayNode.id,
      displayNode.assigned_to,
      displayNode.task_status,
      isOneliner,
      rootBoardId,
      getBoardPills,
    ],
  )

  // Memoize date badge (priority, recurrence, scheduled, due) - shown right-aligned
  const dateBadge = useMemo(
    () => formatDateBadge(displayNode),
    [
      displayNode.due_date,
      displayNode.due_time,
      displayNode.scheduled_date,
      displayNode.scheduled_time,
      displayNode.priority,
      displayNode.recurrence,
    ],
  )

  // Parent context for embedded tasks - use prop or default implementation
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
  const parentContext = useMemo(() => {
    if (!rawParentContext) return null
    // Direct match: display name is in excluded sigils
    if (excludedSigils.includes(rawParentContext)) return null
    // Extended check: resolve the parent context source node and compare its name/fs_path
    if (parentContextProp === undefined && depth === 0 && nodeIsTask && isEmbedded) {
      const result = getParentContextExFromState(repo, node)
      if (result) {
        // Check if the source node's name (sigil) is excluded
        if (result.nodeName && excludedSigils.includes(result.nodeName)) return null
        // Check if the source node's fs_path matches an excluded sigil
        if (result.fsPath) {
          const filename = result.fsPath.split("/").pop() || ""
          const fsName = filename.replace(/\.md$/, "")
          if (excludedSigils.includes(fsName)) return null
        }
      }
    }
    return rawParentContext
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

  // Child rendering
  // In multiline (cards) mode, maxContentLines controls how many children are visible.
  // In oneliner mode, a fixed cap prevents performance issues with large nodes.
  const maxChildren = variant === "multiline" ? maxContentLines : VARIANT_CONFIG.oneliner.maxChildren
  const visibleChildren = children.slice(0, maxChildren)
  const hiddenCount = children.length - visibleChildren.length

  // Children are hidden when individually folded OR when outline depth limit is exceeded
  const childrenVisible = hasChildren && !isFolded && depth < maxDepth
  const childrenHidden = hasChildren && !childrenVisible

  // In cards mode (multiline), suppress "+N more" at all levels — the Card
  // component renders a border-based overflow indicator instead.
  const suppressChildOverflow = !isOneliner

  return (
    <Box flexDirection="column" height={isOneliner || isCardChild ? 1 : undefined} overflow={isOneliner || isCardChild ? "hidden" : undefined}>
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
          paddingLeft={Math.max(0, depth - 1)}
          backgroundColor={isInlineEditing && isHR ? "yellow" : style.backgroundColor}
          height={isOneliner || isCardChild ? 1 : undefined}
        >
          {/* Fixed-width prefix box (fold marker only - new cards style) */}
          <Box width={prefix.length} flexShrink={0}>
            <Text color={style.textColor} dimColor={style.shouldDim}>
              <Text color={isSelected || isMultiSelected ? style.textColor : prefix.markerColor}>
                {prefix.markerChar}
              </Text>
              {prefix.afterMarker}
            </Text>
          </Box>
          {/* Flexible content box */}
          {/* overflow="hidden" for oneliner and card children to enable truncation */}
          <Box flexGrow={1} flexShrink={1} overflow={isOneliner || isCardChild ? "hidden" : undefined}>
            {editingTitle ? (
              <Text color={isHR ? "black" : style.textColor} wrap={isOneliner || isCardChild ? "truncate" : "wrap"}>
                <InlineEditField
                  initialValue={editContent}
                  onConfirm={handleInlineEditConfirm}
                  onCancel={handleInlineEditCancel}
                  onSave={handleTitleSave}
                  onSplitAtBoundary={handleSplitAtBoundary}
                  onMergeBackward={handleMergeBackward}
                />
              </Text>
            ) : isHR ? (
              <Text
                color={style.textColor}
                dimColor={style.shouldDim || (!isSelected && !isMultiSelected)}
                wrap="truncate"
              >
                {cleanContent.trim()}
              </Text>
            ) : (
              <Text
                bold={depth === 0 && hasChildren}
                color={dimUntitled ? "gray" : (style.textColor ?? style.ownColor)}
                dimColor={style.shouldDim || dimUntitled}
                strikethrough={style.shouldStrikethrough}
                wrap={isOneliner || isCardChild || node.type === "code" || node.type === "table" ? "truncate" : "wrap"}
              >
                {isHighlighted ? stripFgColor(styledContent) : styledContent}
                {sigilName && (
                  <>
                    {" "}
                    <Text dimColor={!isHighlighted}>{sigilName}</Text>
                  </>
                )}
                {!childrenHidden && infoSuffix && <Text dimColor={!isHighlighted}>{isHighlighted ? stripFgColor(infoSuffix) : infoSuffix}</Text>}
                {!childrenHidden && showInlineContext && (
                  <Text dimColor={!isHighlighted} italic>
                    {contextSuffix}
                  </Text>
                )}
              </Text>
            )}
          </Box>
          {/* Right-aligned: date badge (priority, recurrence, scheduled, due) */}
          {dateBadge && (
            <Box flexShrink={0}>
              <Text color={style.textColor} wrap="truncate">
                {" "}{isHighlighted ? stripFgColor(dateBadge) : dateBadge}
              </Text>
            </Box>
          )}
          {/* Right-aligned: child count — always gray (black when selected) */}
          {/* Never bold: bold gray renders as bright/white on terminals */}
          {hasChildren && (
            <Box flexShrink={0}>
              <Text color={isHighlighted ? style.textColor : "gray"}>
                {` ${childCount}`}
              </Text>
            </Box>
          )}
        </Box>
      </HeadRow>

      {/* Body block editing: when editing this node, show body children as editable blocks */}
      {isInlineEditing &&
        bodyChildren.length > 0 &&
        bodyChildren.map((child, i) => {
          const blockIndex = i + 1 // 0 is title
          const isActiveBlock = editBlockIndex === blockIndex
          return (
            <Box key={child.id} paddingLeft={depth + 1} backgroundColor={isActiveBlock ? "blueBright" : undefined}>
              <Text dimColor={!isActiveBlock} color={isActiveBlock ? "white" : "cyan"}>{"  "}</Text>
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
                      undoHandle.setCursor(displayNode.id)
                      undoHandle.startBatch("Split block")
                      const result = splitNode(repo, child.id, offset)
                      undoHandle.endBatch()
                      setUI({
                        inlineEditBlock: {
                          nodeId: result.afterId,
                          blockIndex: 0,
                        },
                      })
                    } catch {
                      undoHandle.endBatch()
                      setUI({ bellState: "split-failed" })
                    }
                  }}
                  onMergeBackward={() => {
                    try {
                      undoHandle.setCursor(displayNode.id)
                      undoHandle.startBatch("Merge blocks")
                      const result = mergeWithPrevious(repo, child.id)
                      undoHandle.endBatch()
                      if (result) {
                        setUI({
                          inlineEditBlock: {
                            nodeId: result.survivorId,
                            blockIndex: 0,
                          },
                        })
                      }
                    } catch {
                      undoHandle.endBatch()
                      setUI({ bellState: "merge-failed" })
                    }
                  }}
                />
              ) : (
                <Text color="cyan" dimColor>{renderRich(child.content ?? "")}</Text>
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
            extraExcludedSigils={extraExcludedSigils}
            showOverflowIndicator={!suppressChildOverflow}
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
// Display Content Helper
// =============================================================================

/** Resolve what text to display for a node, handling embeds and section types. */
function getDisplayContent(
  repo: { getNode(id: string): KNode | undefined },
  node: KNode,
  displayNode: KNode,
  resolvedNode: KNode | null,
  isEmbedded: boolean,
): string {
  if (isEmbedded && resolvedNode) {
    if (resolvedNode.type === "oi" && resolvedNode.fstype === "folder") {
      return getNodeDisplayName(repo, resolvedNode) + "/"
    }
    if (resolvedNode.type === "oi" && resolvedNode.fstype === "mdsection") {
      return getNodeDisplayName(repo, resolvedNode)
    }
    return resolvedNode.content || getNodeDisplayName(repo, resolvedNode)
  }
  if (isEmbedded) {
    // Unresolved embed — extract target name from ![[target]] syntax
    return node.content?.replace(EMBED_EXTRACT_RE, "$1") ?? getNodeDisplayName(repo, node)
  }
  // Content with embed syntax ![[target]] but link_to not set (unresolved embed)
  // Strip the ![[...]] wrapper so it doesn't render as "!Target" in the TUI
  const trimmed = displayNode.content?.trim()
  if (trimmed && EMBED_EXTRACT_RE.test(trimmed)) {
    return trimmed.replace(EMBED_EXTRACT_RE, "$1")
  }
  if (displayNode.type === "oi" && displayNode.fstype === "mdsection") {
    return getNodeDisplayName(repo, displayNode)
  }
  return displayNode.content || getNodeDisplayName(repo, displayNode)
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
  /** Additional sigils to exclude (e.g., column-level sigils like @next inside @next column) */
  extraExcludedSigils?: string[]
  /** Whether to show the "+N more" overflow indicator (default: true).
   * In cards mode, suppressed at all levels in favor of a single consolidated "..." at the card root. */
  showOverflowIndicator?: boolean
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
  extraExcludedSigils,
  showOverflowIndicator = true,
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

  return (
    <Box flexDirection="column">
      {orderedChildren.map((item, i) => {
        const childSubIndex = startSubIndex + i
        // Body items are never selected in outline mode
        const childSelected = inOutlineMode && currentSubIndex === childSubIndex && !item.isBody

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
            extraExcludedSigils={extraExcludedSigils}
          />
        )
      })}
      {hiddenCount > 0 && showOverflowIndicator && (
        <Box flexDirection="column" alignItems="center">
          <Text dimColor wrap="truncate">
            +{hiddenCount} more
          </Text>
        </Box>
      )}
    </Box>
  )
}
