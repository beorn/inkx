/**
 * Shared TreeNode component for tree/outline views
 *
 * Two variants:
 * - oneliner: Title + parent context inline on one line, truncated (for list/columns/tabs)
 * - multiline: Parent context above title, content can wrap multiple lines (for cards)
 */
/* oxlint-disable complexity/max-cognitive, complexity/max-cyclomatic -- React component — JSX conditionals inflate score */

import React, { useCallback, useMemo } from "react"
import { useApp as useAppStore } from "inkx/runtime"
import type { BoardAppStore } from "../board-app-store.ts"
import { useAtomValue } from "jotai"
import { nodeMultiSelectedAtom, nodeEditAtom, nodeFoldOverrideAtom, nodeExcludedSigilsAtom } from "../node-atoms.ts"
import { renderLog, sid } from "../log.ts"
import { Box, ErrorBoundary, Text, useScreenRectCallback } from "inkx"
import type { KNode } from "@km/core"
import { isOutline } from "@km/core"
import {
  extractTitleTaskMarker,
  isTask,
  stringifyTaskMetadata,
  parseTaskMetadataFromText,
  getStatusForMarker,
} from "@km/core"
import { useRepo } from "../repo-context.tsx"
import {
  getNodeDisplayName,
  isNodeUntitled,
  getParentContext as getParentContextFromState,
  getParentContextEx as getParentContextExFromState,
} from "../state.ts"
import { extractBody, splitNode, mergeWithPrevious } from "@km/tree"
import { isCollapsedChild } from "../hooks/use-columns.ts"
import {
  getTypeBullet,
  getCircleBullet,
  getFoldMarker,
  isSigilName,
  InlineText,
  computeSearchDecorationsFromSource,
  type InlineRenderContext,
  type TextDecoration,
  type StatusIcon,
} from "../text/index.ts"
import { makeSelectionKey } from "../types.ts"
import { useTreeRenderContext, deriveExcludedSigils } from "../ui-context.tsx"
import { useCursorNodePosition } from "../cursor-context.tsx"
import { InlineEditField } from "./InlineEditField.tsx"
import { BodyEditField } from "./BodyEditField.tsx"
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
import { km } from "../theme.ts"

/** Regex to extract target name from ![[target]] or ![[target|alias]] embed syntax. */
const EMBED_EXTRACT_RE = /^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/

/**
 * Clean an embed reference path for display.
 * Strips block-ID syntax (^blockid) and file#fragment separators to produce
 * a human-readable label. For bare block references (^12345), returns empty
 * string so the caller can fall through to getNodeDisplayName.
 */
function cleanEmbedRef(ref: string): string {
  // Bare block reference: "^1203128650780856" → empty (use display name fallback)
  if (/^\^[\w-]+$/.test(ref)) return ""
  // File#^blockid: "shopping#^abc123" → "shopping"
  // File#section: "shopping#Groceries" → "shopping > Groceries"
  const hashIdx = ref.indexOf("#")
  if (hashIdx >= 0) {
    const file = ref.slice(0, hashIdx)
    const fragment = ref.slice(hashIdx + 1)
    // Block ref fragment (^abc) — just show the file name
    if (fragment.startsWith("^")) return file || ""
    // Section fragment — show file > section
    return file && fragment ? `${file} > ${fragment}` : file || fragment || ""
  }
  return ref
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
}

/**
 * Memoized TreeNode - skips re-render when props are unchanged.
 *
 * Custom comparison focuses on the fields that actually affect rendering:
 * - node.id, node.content, node.task_status (identity and display)
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
    prev.node.task_status !== next.node.task_status ||
    prev.node.due_at !== next.node.due_at ||
    prev.node.start_at !== next.node.start_at ||
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

  // Fold depth
  if (prev.remainingDepth !== next.remainingDepth) return false

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
}: TreeNodeProps): React.ReactElement {
  const _tnStart = renderLog.debug ? performance.now() : 0
  renderLog.debug?.(`TreeNode ${sid(node.id)} depth=${depth} remainingDepth=${remainingDepth}`)

  // Global tree rendering config from context (no per-node subscription)
  const { treeConfig, sigilColors, resolveSigilColor, setUI, rootBoardId, searchMatchNodeIds, currentMatchNodeId, searchQuery, jobRunner, undoHandle, taskStatusFilter, boardFocused } =
    useTreeRenderContext()
  const { maxContentLines, variant, iconStyle } = treeConfig

  // Per-node state via Jotai atoms — only this node re-renders when its state changes
  const isMultiSelected = useAtomValue(nodeMultiSelectedAtom(makeSelectionKey(node.id)))
  const editState = useAtomValue(nodeEditAtom(node.id))
  const foldOverride = useAtomValue(nodeFoldOverrideAtom(node.id))
  // Per-node fold override takes precedence, then remainingDepth from parent, then default (unfolded)
  const resolvedDepth = foldOverride ?? remainingDepth ?? Infinity
  const isFolded = resolvedDepth <= 0
  const editBlockIndex = editState?.blockIndex ?? null
  const isInlineEditing = editBlockIndex !== null
  const editingTitle = editBlockIndex === 0
  const excludeBoardIds = rootBoardId ? new Set([rootBoardId]) : new Set<string>()

  const repo = useRepo()
  // Excluded sigils: use Jotai-derived ancestry if available, fallback for compatibility
  const jotaiExcludedSigils = useAtomValue(nodeExcludedSigilsAtom(node.id))
  const excludedSigils = useMemo(() => {
    // If Jotai ancestry is hydrated, use it directly
    if (jotaiExcludedSigils.length > 0) return jotaiExcludedSigils
    // Fallback: derive from rootBoardId + extraExcludedSigils
    const rootSigils = deriveExcludedSigils(repo, rootBoardId)
    if (!extraExcludedSigils?.length) return rootSigils
    return [...rootSigils, ...extraExcludedSigils]
  }, [jotaiExcludedSigils, repo, rootBoardId, extraExcludedSigils])
  const isOneliner = variant === "oneliner"
  // Children inside cards (depth > 0, multiline) should be single-line truncated
  const isCardChild = variant === "multiline" && depth > 0
  const embedSource = node.embed_source
  const isEmbedded = embedSource != null

  // For embedded nodes, resolve the target for display purposes
  // The embed node's content is just "![[target]]" - we want to show the linked node's data
  const resolvedNode = isEmbedded && embedSource ? repo.getNode(embedSource) : null
  const displayNode = resolvedNode ?? node

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

  const nodeIsTask = isTask(displayNode)

  // Memoize style calculation - only recalc when selection or node status changes
  // Use displayNode for visual properties (task_status icon, strikethrough, etc.)
  // Include implicit task properties in deps so style recalculates when they change
  const style = useMemo(() => {
    const s = getNodeStyle(displayNode, isSelected, isMultiSelected, dimInactiveChildren, depth, isInlineEditing, boardFocused)
    if (dim) s.shouldDim = true
    return s
  }, [
    displayNode.id,
    displayNode.task_status,
    displayNode.due_at,
    displayNode.priority,
    displayNode.start_at,
    displayNode.assigned_to,
    displayNode.recurrence,
    isSelected,
    isMultiSelected,
    dimInactiveChildren,
    depth,
    isInlineEditing,
    dim,
    boardFocused,
  ])

  // Search match highlighting: white bg / black fg (current match brighter)
  const isSearchMatch = searchMatchNodeIds.has(node.id)
  const isCurrentMatch = node.id === currentMatchNodeId
  const searchHighlight = isSearchMatch && !isSelected && !isMultiSelected
  const effectiveBg = style.backgroundColor
  const tc = style.textColor
  const sd = style.shouldDim

  // Untitled nodes (showing (shortId) fallback) render very dimmed
  const untitled = isNodeUntitled(repo, displayNode)
  const dimUntitled = untitled && !isSelected && !isMultiSelected

  // Compute the bullet icon based on icon style
  const bulletIcon = useMemo((): StatusIcon => {
    if (nodeIsTask && style.taskStatusIcon) return style.taskStatusIcon
    if (iconStyle === "workflowy") {
      const bullet = getCircleBullet(hasChildren, hasChildren && isFolded)
      return style.ownColor ? { ...bullet, color: style.ownColor } : bullet
    }
    if (iconStyle === "nerdfont") {
      const bullet = getTypeBullet(displayNode, hasChildren) ?? getFoldMarker(hasChildren, isFolded, style.ownColor)
      return style.ownColor ? { ...bullet, color: style.ownColor } : bullet
    }
    // "regular" style — existing fold markers
    const bullet = getFoldMarker(hasChildren, isFolded, style.ownColor)
    return bullet
  }, [nodeIsTask, iconStyle, displayNode.type, hasChildren, isFolded, style.ownColor, style.taskStatusIcon])

  // Memoize prefix - only recalc when bullet icon changes
  const prefix = useMemo(() => buildPrefix(bulletIcon), [bulletIcon])

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
    // Normalize for comparison: lowercase, collapse non-alphanum to hyphens
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\p{L}]+/gu, "-")
        .replace(/^-|-$/g, "")
    const nameNorm = normalize(name.slice(1)) // strip sigil prefix (@/#/+)
    const contentNorm = normalize(cleanContent)
    if (nameNorm === contentNorm) return null // redundant — name is a slugified version of the title
    if (excludedSigils.includes(name)) return null // redundant — excluded by board/column context
    return name
  }, [displayNode.name, cleanContent, excludedSigils])

  // For inline editing, compose raw content with field-only metadata appended
  // (due dates, priority, recurrence, @assigned_to) so they're visible when editing.
  // HR nodes with no content default to "---" (their canonical representation).
  const rawEditContent = displayNode.type === "hr" && !displayNode.content ? "---" : composeRawEditContent(displayNode)
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
  // Strips inline metadata (due:, start:, p:, recur:) from edited text and
  // restores them as structured fields on the node.
  const handleTitleSave = useCallback(
    (newValue: string) => {
      const originalContent = displayNode.content ?? (displayNode.data?.name as string) ?? ""
      const { marker } = extractTitleTaskMarker(originalContent)
      const { cleanContent, ...metaFields } = parseTaskMetadataFromText(newValue)
      const newContent = marker != null ? `${marker} ${cleanContent}` : cleanContent
      // No-op: value didn't change and no metadata to update
      if (newContent === originalContent && Object.keys(metaFields).length === 0) return
      undoHandle.setCursor(displayNode.id)
      repo.updateNode(displayNode.id, { content: newContent, ...metaFields })
    },
    [displayNode.id, displayNode.content, repo, undoHandle],
  )

  // Inline edit callbacks — uses renameNode for backlink-safe renames.
  // Strips inline metadata (due:, start:, p:, recur:) from edited text and
  // restores them as structured fields on the node.
  const handleInlineEditConfirm = useCallback(
    (newValue: string) => {
      const originalContent = displayNode.content ?? (displayNode.data?.name as string) ?? ""
      const { marker } = extractTitleTaskMarker(originalContent)
      const { cleanContent, ...metaFields } = parseTaskMetadataFromText(newValue)
      const newContent = marker != null ? `${marker} ${cleanContent}` : cleanContent
      const hasMetaUpdates = Object.keys(metaFields).length > 0

      // No-op: value didn't change and no metadata to update
      if (newContent === originalContent && !hasMetaUpdates) {
        setUI({ inlineEditBlock: null })
        return
      }

      // Update metadata fields if any were parsed from the edited text
      if (hasMetaUpdates) {
        repo.updateNode(displayNode.id, metaFields)
      }

      // Only do a full rename if name was already in sync with content (or unset).
      // e.g., "@next" (name) vs "Next Actions" (title) → different → just update content.
      // e.g., "My Task" (name) vs "My Task" (content) → same → rename keeps them in sync.
      // e.g., no name set → always rename (name gets derived from content).
      const node = repo.getNode(displayNode.id)
      const oldName = node?.name ?? ""
      const oldContentName = originalContent.replace(/^- \[.\]\s*/, "")
      const nameMatchedContent = !oldName || oldName === oldContentName

      if (newContent !== originalContent && nameMatchedContent) {
        const impact = repo.getRenameImpact(displayNode.id)
        const s = impact.backlinks.length === 1 ? "" : "s"

        jobRunner.submit({
          description: `Renaming '${oldName}' → '${cleanContent}'`,
          impact: impact.backlinks.length > 0 ? `${impact.backlinks.length} backlink${s} will be updated` : "",
          countdownMs: impact.backlinks.length > 0 ? 5000 : 0,
          execute: (onProgress) => {
            undoHandle.setCursor(displayNode.id)
            undoHandle.startBatch("Rename")
            repo.renameNode(displayNode.id, newContent, (info) => onProgress(info.updated, info.total))
            undoHandle.endBatch()
          },
        })
      } else if (newContent !== originalContent) {
        // Name and content diverged — just update content, don't rename
        undoHandle.setCursor(displayNode.id)
        repo.updateNode(displayNode.id, { content: newContent })
      }

      // HR type conversion: p/li with HR content → hr, hr with non-HR content → p
      const hrMatch = isHRContent(newContent)
      const currentType = displayNode.type
      if (hrMatch && (currentType === "p" || currentType === "li") && !isOutline(currentType, displayNode.item)) {
        repo.updateNode(displayNode.id, { type: "hr" })
      } else if (!hrMatch && currentType === "hr") {
        repo.updateNode(displayNode.id, { type: "p" })
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
        // TODO: set cursor offset to result.cursorOffset via activeEditTargetRef after render
      }
    } catch {
      undoHandle.endBatch()
      // Merge failed — visual bell
      setUI({ bellState: "merge-failed" })
    }
  }, [displayNode.id, repo, setUI, undoHandle])

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

  // Memoize inline render context - only recalc when sigil config changes
  const inlineContext: InlineRenderContext = useMemo(() => {
    const excludeSet = excludedSigils.length > 0 ? new Set(excludedSigils) : undefined
    // Resolve [[target]] wikilinks to display titles — cached to avoid repeated DB lookups
    const wikiLinkCache = new Map<string, string | null>()
    const resolveWikiLink = (target: string): string | null => {
      if (!target?.trim()) return null
      const cached = wikiLinkCache.get(target)
      if (cached !== undefined) return cached
      // Use in-memory name index (O(1)) instead of resolveNode (6+ SQL queries)
      const resolved = repo.resolveByName?.(target) ?? repo.getNode(target)
      let result: string | null = null
      if (resolved) {
        result = getNodeDisplayName(repo, resolved)
      } else if (target.startsWith("^")) {
        const byId = repo.getNode(target.slice(1))
        if (byId) result = getNodeDisplayName(repo, byId)
      }
      wikiLinkCache.set(target, result)
      return result
    }
    const resolveBlockRef = (id: string): string | null => {
      if (!id?.trim()) return null
      const cached = wikiLinkCache.get(`^${id}`)
      if (cached !== undefined) return cached
      const resolved = repo.getNode(id)
      const result = resolved ? getNodeDisplayName(repo, resolved) : null
      wikiLinkCache.set(`^${id}`, result)
      return result
    }
    return {
      excludeSigils: excludeSet,
      sigilColors,
      resolveSigilColor,
      resolveWikiLink,
      resolveBlockRef,
      hideFields: true,
    }
  }, [excludedSigils, sigilColors, resolveSigilColor, repo])

  // Search decorations — character-level highlighting of search matches
  const searchDecorations = useMemo(
    () =>
      searchHighlight && searchQuery
        ? computeSearchDecorationsFromSource(processedContent, searchQuery, isCurrentMatch)
        : undefined,
    [searchHighlight, processedContent, searchQuery, isCurrentMatch],
  )

  // Info suffix props — rendered as React component below
  const infoSuffixProps = useMemo(
    () => ({
      node: displayNode,
      isCompact: !isOneliner,
      excludeBoardIds,
      getBoardPills,
    }),
    [displayNode.id, displayNode.assigned_to, displayNode.task_status, isOneliner, rootBoardId, getBoardPills],
  )

  // Inline child count on card titles — removed in favor of +N overflow indicator.
  // Only column headers show count (and only when WIP limit is configured).
  const showInlineChildCount = false

  // Body content indicator: show ··· on card titles when node has body children
  // (paragraphs, quotes, code blocks, etc. — not just structural oi items)
  const hasBody = useMemo(() => {
    if (depth !== 0 || isOneliner) return false
    return extractBody(children).body.length > 0
  }, [depth, isOneliner, children])

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
  const hasDateBadge = !!(displayNode.priority || displayNode.due_at || displayNode.start_at || displayNode.recurrence)

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
  // Apply task status filter (e.g., hide done/dropped) at all tree depths
  // taskStatusFilter is now from TreeRenderContext (board-wide, no per-node subscription)
  // In multiline (cards) mode, maxContentLines controls how many children are visible.
  // In oneliner mode, a fixed cap prevents performance issues with large nodes.
  const maxChildren = variant === "multiline" ? maxContentLines : VARIANT_CONFIG.oneliner.maxChildren

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
      const status = filterNode.task_status ?? getStatusForMarker(filterNode.task_marker)
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
          backgroundColor={effectiveBg}
          height={isOneliner || isCardChild ? 1 : undefined}
        >
          {/* Fixed-width prefix box (fold marker only - new cards style) */}
          <Box width={prefix.length} flexShrink={0}>
            <Text color={tc} dimColor={sd}>
              <Text
                color={
                  isSelected || isMultiSelected
                    ? tc
                    : style.isDoneOrDropped
                      ? undefined
                      : prefix.markerColor
                }
              >
                {prefix.markerChar}
              </Text>
              {prefix.afterMarker}
            </Text>
          </Box>
          {/* Flexible content box */}
          {/* overflow="hidden" for oneliner and card children to enable truncation */}
          <Box flexGrow={1} flexShrink={1} overflow={isOneliner || isCardChild ? "hidden" : undefined}>
            {editingTitle ? (
              <Text color={tc} wrap={isOneliner || isCardChild ? "truncate" : "wrap"}>
                <InlineEditField
                  initialValue={editContent}
                  onConfirm={handleInlineEditConfirm}
                  onCancel={handleInlineEditCancel}
                  onSave={handleTitleSave}
                  onSplitAtBoundary={handleSplitAtBoundary}
                  onMergeBackward={handleMergeBackward}
                  initialCursorPos={editState?.initialCursorPos}
                  stickyX={editState?.stickyX}
                />
              </Text>
            ) : isHR ? (
              <Text color={tc} dimColor={sd} wrap="truncate">
                {cleanContent.trim()}
              </Text>
            ) : (
              <Text
                bold={depth === 0}
                color={dimUntitled ? "$muted" : (tc ?? style.ownColor)}
                dimColor={sd || dimUntitled}
                strikethrough={style.shouldStrikethrough}
                wrap={isOneliner || isCardChild || node.type === "code" || node.type === "table" ? "truncate" : "wrap"}
              >
                {isVerbatim ? (
                  processedContent
                ) : (
                  <InlineText text={processedContent} context={{ ...inlineContext, noColor: searchHighlight || shouldStripColor }} decorations={searchDecorations} />
                )}
                {sigilName && (
                  <>
                    {" "}
                    <Text dimColor={sd}>{sigilName}</Text>
                  </>
                )}
                {!childrenHidden && (
                  <Text dimColor={sd}>
                    <InfoSuffix {...infoSuffixProps} noColor={searchHighlight || shouldStripColor} />
                  </Text>
                )}
                {showInlineChildCount && <Text dimColor> {childCount}</Text>}
                {!childrenHidden && showInlineContext && (
                  <Text dimColor={sd} italic>
                    {contextSuffix}
                  </Text>
                )}
                {hasBody && !childrenVisible && <Text dimColor>{" ···"}</Text>}
              </Text>
            )}
          </Box>
          {/* Right-aligned: child count — always gray (black when selected) */}
          {/* Never bold: bold gray renders as bright/white on terminals */}
          {/* Hidden in card views where overflow indicator shows the count */}
          {/* Placed before date badge so layout is: Title ... COUNT ... dates */}
          {hasChildren && !hideChildCount && (
            <Box flexShrink={0}>
              <Text color={isHighlighted ? tc : "$muted"}>{` ${childCount}`}</Text>
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
              <Text color={isHighlighted ? tc : "$muted"}>{` ${subtaskBadge}`}</Text>
            </Box>
          )}
          {/* Right-aligned: date badge (priority, recurrence, scheduled, due) */}
          {/* Hidden during inline editing — metadata is shown in the editable text */}
          {/* Rightmost element in the row — dates are the last thing on the line */}
          {hasDateBadge && !isInlineEditing && !style.isDoneOrDropped && (
            <Box flexShrink={0}>
              <Text color={tc} wrap="truncate">
                {" "}
                <DateBadge node={displayNode} noColor={shouldStripColor} />
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
            <Box key={`${child.id}-${i}`} paddingLeft={depth + 1}>
              <Text dimColor={!isActiveBlock} color={km.cardBorderEditing}>
                {"  "}
              </Text>
              {isActiveBlock ? (
                <BodyEditField
                  initialValue={child.content ?? ""}
                  onConfirm={(v) => {
                    handleBlockSave(child.id, v)
                    setUI({ inlineEditBlock: null })
                  }}
                  onCancel={handleInlineEditCancel}
                  onSave={(v) => handleBlockSave(child.id, v)}
                  initialCursorPos={editState?.initialCursorPos}
                  stickyX={editState?.stickyX}
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
                <Text color={km.cardBorderEditing} dimColor>
                  <InlineText text={child.content ?? ""} />
                </Text>
              )}
            </Box>
          )
        })}

      {/* Children: during editing show only structural (body is rendered as editable blocks above) */}
      {childrenVisible && (
        <ErrorBoundary
          fallback={
            <Text color={"$error"} dim>
              [error]
            </Text>
          }
          resetKey={`${node.id}-${depth}`}
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
// Display Content Helper
// =============================================================================

/** Clean content for display, preserving multi-line structure.
 * Metadata stripping (fields, block refs) is handled by the inline AST
 * system via InlineRenderContext.hideFields. */
function cleanContentForDisplay(content: string | undefined): string {
  if (!content) return ""
  return (
    content
      // Strip Asana-style "#@mention" tag syntax — the "#" is an orphan prefix
      // that doesn't form a valid sigil with the following "@". Strip it before
      // further processing so it doesn't leave trailing "#" characters.
      .replace(/#@/g, "@")
      // Strip inline embed wikilinks ![[target]] and ![[target|alias]] —
      // replace with alias or target name so raw ![[  never leaks to display.
      // The inline parser (InlineText) also handles this, but stripping here
      // provides defense-in-depth for any code path that uses the returned
      // string without going through InlineText (e.g., search, top bar, CLI).
      .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias ?? target)
  )
}

/** Try to resolve an embed reference (block_id or filename) to a human-readable title.
 * Only returns a result if the resolved node has real content (not itself an embed). */
function tryResolveEmbedRef(
  repo: { getNode(id: string): KNode | undefined; resolveByName?(name: string): KNode | null; resolveNode?(query: string): KNode | null },
  ref: string,
): string | null {
  if (!repo.resolveByName && !repo.resolveNode) return null

  const resolveAndFormat = (query: string): string | null => {
    // Use fast name index first, fall back to getNode (by ID), then resolveNode
    const target = repo.resolveByName?.(query) ?? repo.getNode(query) ?? null
    if (!target) return null
    const content = cleanContentForDisplay(target.content)
    // Guard: don't return content that's itself an embed reference
    if (!content || EMBED_EXTRACT_RE.test(content)) return null
    return content
  }

  // Bare block ref "^blockid" → extract blockid and look up
  const blockMatch = ref.match(/^\^([\w-]+)$/)
  if (blockMatch?.[1] != null) return resolveAndFormat(blockMatch[1])

  // file#^blockid → extract blockid part
  const hashIdx = ref.indexOf("#")
  if (hashIdx >= 0) {
    const fragment = ref.slice(hashIdx + 1)
    if (fragment.startsWith("^")) return resolveAndFormat(fragment.slice(1))
  }

  // Plain filename — try resolving
  return resolveAndFormat(ref)
}

/** Resolve what text to display for a node, handling embeds and section types. */
function getDisplayContent(
  repo: { getNode(id: string): KNode | undefined; resolveNode?(query: string): KNode | null },
  node: KNode,
  displayNode: KNode,
  resolvedNode: KNode | null,
  isEmbedded: boolean,
): string {
  if (isEmbedded && resolvedNode) {
    if (isOutline(resolvedNode.type, resolvedNode.item) && resolvedNode.fstype === "folder") {
      return getNodeDisplayName(repo, resolvedNode) + "/"
    }
    if (isOutline(resolvedNode.type, resolvedNode.item) && resolvedNode.fstype === "mdsection") {
      return getNodeDisplayName(repo, resolvedNode)
    }
    return cleanContentForDisplay(resolvedNode.content) || getNodeDisplayName(repo, resolvedNode)
  }
  if (isEmbedded) {
    // Unresolved embed — extract target name from ![[target]] syntax
    // Try to resolve the embed reference to a real node title
    const raw = node.content?.replace(EMBED_EXTRACT_RE, "$1")
    if (raw) {
      const resolved = tryResolveEmbedRef(repo, raw)
      if (resolved) return resolved
    }
    // Clean block-ID references (^blockid) so they don't show raw IDs
    const cleaned = raw ? cleanEmbedRef(raw) : ""
    if (cleaned) return cleaned
    // Bare block ref (^id) or no content — show short ID fallback
    return `(${node.id.slice(0, 8)})`
  }
  // Content with embed syntax ![[target]] but embed_source not set (unresolved embed)
  // Strip the ![[...]] wrapper so it doesn't render as "!Target" in the TUI
  const trimmed = displayNode.content?.trim()
  if (trimmed && EMBED_EXTRACT_RE.test(trimmed)) {
    const raw = trimmed.replace(EMBED_EXTRACT_RE, "$1")
    // Try to resolve the embed reference to a real node title
    const resolved = tryResolveEmbedRef(repo, raw)
    if (resolved) return resolved
    // Clean block-ID references; bare block refs fall through to short ID
    return cleanEmbedRef(raw) || `(${displayNode.id.slice(0, 8)})`
  }
  if (isOutline(displayNode.type, displayNode.item) && displayNode.fstype === "mdsection") {
    const name = getNodeDisplayName(repo, displayNode)
    // Untitled sections (empty Asana sections) show "(shortId)" fallback from getNodeDisplayName.
    // Replace with a human-readable label instead of a raw GID like "(01KHW5W9)".
    if (/^\([0-9A-Za-z]{8}\)$/.test(name)) return "(untitled section)"
    return name
  }
  // Bare block references (e.g., "^1153379636232754" — Asana recurring task instances).
  // These are regular li nodes whose content is just a numeric block ref.
  // Show a human-readable label instead of the raw ID.
  const stripped = cleanContentForDisplay(displayNode.content)
  if (/^\^[\d]+$/.test(stripped.trim())) {
    // If the node has an embed_source, resolve to target's display name
    const nodeEmbedSource = node.embed_source
    if (nodeEmbedSource) {
      const target = repo.getNode(nodeEmbedSource)
      if (target) return getNodeDisplayName(repo, target)
    }
    // If Asana parent name is available in data, show that
    const parentName = displayNode.data?.asana_parent_name
    if (typeof parentName === "string" && parentName) return parentName
    // Fallback: truncated reference
    const refId = stripped.trim().slice(1) // remove ^
    return `(ref:${refId.slice(0, 6)}...)`
  }
  return stripped || getNodeDisplayName(repo, displayNode)
}

// =============================================================================
// composeRawEditContent — append field-only metadata for editing visibility
// =============================================================================

/**
 * When editing, show raw markdown content with metadata from node fields
 * that aren't already in the text (due dates, priority, recurrence, assigned_to).
 * Uses shared stringifyTaskMetadata from @km/core for DRY consistency
 * with the markdown serializer.
 * On save, the parser re-extracts these back to fields — round-trip safe.
 */
function composeRawEditContent(node: KNode): string {
  // Use content if available, falling back to data.name for folder-type nodes
  // (oi nodes store their title in data.name, not content).
  const baseContent = node.content ?? (node.data?.name as string) ?? ""
  return stringifyTaskMetadata(baseContent, node, { includeAssignedTo: true })
}

// =============================================================================
// FoldAwareChild — Per-node fold override check (avoids global foldDepths subscription)
// =============================================================================

/**
 * Reads per-node fold override via Jotai atom instead of subscribing to the
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
}): React.ReactElement {
  const foldOverride = useAtomValue(nodeFoldOverrideAtom(node.id))

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
      />
    )
  }

  return (
    <FoldedChildRow
      node={node}
      depth={depth}
      dim={dim}
      childCount={childCount}
      extraExcludedSigils={extraExcludedSigils}
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
  }: {
    node: KNode
    depth: number
    dim?: boolean
    childCount?: number
    extraExcludedSigils?: string[]
  }): React.ReactElement {
    renderLog.debug?.(`FoldedChildRow ${sid(node.id)} depth=${depth}`)

    const { treeConfig, sigilColors, resolveSigilColor, rootBoardId, searchMatchNodeIds, currentMatchNodeId, searchQuery } =
      useTreeRenderContext()
    const repo = useRepo()

    const nodeIsTask = isTask(node)
    const hasChildren = childCount > 0
    const style = getNodeStyle(node, false, false, false, depth, false)
    if (dim) style.shouldDim = true

    // Search match highlighting: white bg / black fg (current match brighter)
    const isSearchMatch = searchMatchNodeIds.has(node.id)
    const isCurrentMatch = node.id === currentMatchNodeId
    const searchHighlight = isSearchMatch
    const effectiveBg = style.backgroundColor
    const foldTc = style.textColor
    const foldSd = style.shouldDim

    // Bullet icon — always folded
    const { iconStyle } = treeConfig
    let bulletIcon
    if (nodeIsTask && style.taskStatusIcon) {
      bulletIcon = style.taskStatusIcon
    } else if (iconStyle === "workflowy") {
      bulletIcon = getCircleBullet(hasChildren, hasChildren)
      if (style.ownColor) bulletIcon = { ...bulletIcon, color: style.ownColor }
    } else if (iconStyle === "nerdfont") {
      bulletIcon = getTypeBullet(node, hasChildren) ?? getFoldMarker(hasChildren, true, style.ownColor)
      if (style.ownColor) bulletIcon = { ...bulletIcon, color: style.ownColor }
    } else {
      bulletIcon = getFoldMarker(hasChildren, true, style.ownColor)
    }
    const prefix = buildPrefix(bulletIcon)

    // Content — resolve embeds like TreeNode does (line 250-256)
    const embedSource = node.embed_source
    const isEmbedded = embedSource != null
    const resolvedNode = isEmbedded && embedSource ? repo.getNode(embedSource) : null
    const displayNode = resolvedNode ?? node
    const rawContent = getDisplayContent(repo, node, displayNode, resolvedNode, isEmbedded)
    const displayContent = nodeIsTask ? stripTaskMark(rawContent) : rawContent

    // Inline render context — minimal, no memoization needed (component is memo'd)
    const excludedSigils = useMemo(() => {
      const rootSigils = deriveExcludedSigils(repo, rootBoardId)
      if (!extraExcludedSigils?.length) return rootSigils
      return [...rootSigils, ...extraExcludedSigils]
    }, [repo, rootBoardId, extraExcludedSigils])
    const inlineContext: InlineRenderContext = useMemo(
      () => {
        const wikiLinkCache = new Map<string, string | null>()
        return {
          excludeSigils: excludedSigils.length > 0 ? new Set(excludedSigils) : undefined,
          sigilColors,
          resolveSigilColor,
          resolveWikiLink: (target: string): string | null => {
            if (!target?.trim()) return null
            const cached = wikiLinkCache.get(target)
            if (cached !== undefined) return cached
            const resolved = repo.resolveByName?.(target) ?? repo.getNode(target)
            const result = resolved ? getNodeDisplayName(repo, resolved) : null
            wikiLinkCache.set(target, result)
            return result
          },
          resolveBlockRef: (id: string): string | null => {
            if (!id?.trim()) return null
            const cacheKey = `^${id}`
            const cached = wikiLinkCache.get(cacheKey)
            if (cached !== undefined) return cached
            const resolved = repo.getNode(id)
            const result = resolved ? getNodeDisplayName(repo, resolved) : null
            wikiLinkCache.set(cacheKey, result)
            return result
          },
          hideFields: true,
        }
      },
      [excludedSigils, sigilColors, resolveSigilColor, repo],
    )

    // Search decorations — character-level highlighting of search matches
    const foldSearchDecorations = useMemo(
      () =>
        searchHighlight && searchQuery
          ? computeSearchDecorationsFromSource(displayContent, searchQuery, isCurrentMatch)
          : undefined,
      [searchHighlight, displayContent, searchQuery, isCurrentMatch],
    )

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
            <Text
              color={style.isDoneOrDropped ? undefined : prefix.markerColor}
            >
              {prefix.markerChar}
            </Text>
            {prefix.afterMarker}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Text
            color={foldTc ?? style.ownColor}
            dimColor={foldSd}
            strikethrough={style.shouldStrikethrough}
            wrap="truncate"
          >
            {node.type === "code" || node.type === "table" ? (
              displayContent
            ) : (
              <InlineText text={displayContent} context={inlineContext} decorations={foldSearchDecorations} />
            )}
          </Text>
        </Box>
        {/* Right-aligned: child count — mirrors TreeNode's count display */}
        {hasChildren && (
          <Box flexShrink={0}>
            <Text color={"$muted"}>{` ${childCount}`}</Text>
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

  // Get cursor position from CursorStore to determine which child is selected.
  const { cursorNodeId } = useCursorNodePosition()

  if (allFolded) {
    // Cap folded children at terminal height — no card can show more children
    // than the terminal has rows. Prevents rendering thousands of invisible
    // components (e.g. a card with 2,628 children).
    const maxVisible = process.stdout.rows ?? 50
    const displayChildren =
      orderedChildren.length > maxVisible
        ? orderedChildren.slice(0, maxVisible)
        : orderedChildren
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
            dim={parentDim || item.isBody}
            dimInactiveChildren={dimInactiveChildren || item.isBody}
            getChildren={getChildren}
            getParentContext={getParentContext}
            getBoardPills={getBoardPills}
            extraExcludedSigils={extraExcludedSigils}
            childCount={childCounts?.get(item.node.id) ?? 0}
          />
        ))}
        {totalHiddenCount > 0 && showOverflowIndicator && (
          <Box flexDirection="column" alignItems="center">
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
        // Body items are never selected in outline mode; structural items match by node ID
        const childSelected = !item.isBody && cursorNodeId === item.node.id

        return (
          <TreeNode
            key={`${item.node.id}-${i}`}
            node={item.node}
            depth={depth + 1}
            isSelected={childSelected}
            colIndex={colIndex}
            cardIndex={cardIndex}
            dim={parentDim}
            dimInactiveChildren={dimInactiveChildren || item.isBody}
            getChildren={getChildren}
            getParentContext={getParentContext}
            getBoardPills={getBoardPills}
            extraExcludedSigils={extraExcludedSigils}
            remainingDepth={remainingDepth}
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
