/**
 * Detail Pane Component
 *
 * Shows full task details in a split-pane view on the right side of the board.
 * Displays content, fields, references, subtasks, and backlinks.
 */
/* oxlint-disable complexity/complexity -- React component — node detail display with many conditionals */

import React from "react"
import { Box, Text, ErrorBoundary } from "inkx"
import type { KNode } from "@km/core"
import { decomposeDatetime, isOutline, isItem, isTask } from "@km/core"
import { extractBody } from "@km/tree"
import { useRepo, type Repo } from "../repo-context.tsx"
import { usePaneLabel } from "../pane-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { InlineText, getNodeIcon, getStatusIcon, getColumnHeaderIcon, hyperlink, prettifyUrl } from "../text/index.ts"
import { useTreeConfig } from "../ui-context.tsx"
import {
  formatDate,
  getStatusDisplay,
  extractReferences,
  getProjectPath,
  capitalize,
  resolveProjectDisplayNames,
} from "./detail-pane-helpers.ts"
import { shortName, parseDepsRefs } from "./tree-node-helpers.tsx"
import { NodeLineView } from "./NodeView.tsx"
import { PaneBar } from "./PaneBar.tsx"
import { computeFolderDetailItems, DETAIL_META_PREFIX, DETAIL_TOPBAR_ID, KNOWN_DATA_KEYS } from "./detail-pane-items.ts"

export interface DetailPaneProps {
  node: KNode
  width: number
  height: number
  /** Active cursor node ID within the detail pane. Null = no cursor. */
  detailCursorNodeId?: string | null
  /** Whether this pane is focused (from workspace pane system). Default: true. */
  isFocused?: boolean
}

export function DetailPane({
  node,
  width,
  height,
  detailCursorNodeId = null,
  isFocused = true,
}: DetailPaneProps): React.ReactElement {
  const repo = useRepo()
  const detailFocused = isFocused

  // Resolve embedded links to show the target node's details
  const embedSrc = node.embed_source
  const resolvedNode = embedSrc ? (repo.getNode(embedSrc) ?? node) : node
  if (isOutline(resolvedNode.type, resolvedNode.item) && resolvedNode.fstype === "folder") {
    return (
      <FolderDetailPane
        node={resolvedNode}
        width={width}
        height={height}
        focused={detailFocused}
        detailCursorNodeId={detailCursorNodeId}
      />
    )
  }
  return (
    <TaskDetailPane
      node={resolvedNode}
      width={width}
      height={height}
      focused={detailFocused}
      detailCursorNodeId={detailCursorNodeId}
    />
  )
}

// =============================================================================
// Folder Detail Pane — outline of folder contents
// =============================================================================

interface InternalDetailPaneProps {
  node: KNode
  width: number
  height: number
  focused?: boolean
  detailCursorNodeId: string | null
}

/** Top bar for detail panes — icon + title via PaneBar.
 * $selected bg when cursor is on the topbar, $border bg otherwise. */
function DetailPaneTopBar({
  node,
  isFocused,
  isCursored,
}: {
  node: KNode
  isFocused: boolean
  /** Whether the detail cursor is on the topbar row. */
  isCursored: boolean
}): React.ReactElement {
  const repo = useRepo()
  const paneLabel = usePaneLabel()
  const { iconStyle } = useTreeConfig()
  const title = getNodeDisplayName(repo, node)

  // Pick icon: task status icon for tasks, type-aware icon for outlines
  const icon =
    node.task_status != null
      ? getNodeIcon(node.task_status, undefined, true)
      : getColumnHeaderIcon(node, iconStyle, false)

  // $selected bg when cursor is on topbar, $border (white-ish) otherwise
  const bg = isCursored ? "$selected" : undefined
  const fg = isCursored ? "$selectedfg" : undefined

  return (
    <PaneBar
      isFocused={isFocused}
      backgroundColor={bg}
      paneLabel={paneLabel}
      left={
        <Text bold={isFocused} color={fg} wrap="truncate">
          {" "}
          <Text color={isCursored ? fg : icon.color}>{icon.char}</Text> <InlineText text={title} />
        </Text>
      }
      right={
        <Text color={fg} dimColor={!isCursored}>
          {node.type} {node.id.length > 8 ? node.id.slice(0, 8) : node.id}
        </Text>
      }
    />
  )
}

function FolderDetailPane({
  node,
  width,
  height,
  focused: detailFocused = true,
  detailCursorNodeId,
}: InternalDetailPaneProps): React.ReactElement {
  const repo = useRepo()
  // No outer border — WorkspaceView provides pane chrome
  const contentWidth = Math.max(8, width - 2) // 1-space padding each side for text content
  const children = repo.getChildren(node.id)

  // Compute navigable items for cursor tracking
  const items = computeFolderDetailItems(repo, node)

  // Build a flat list of outline entries with depth (scrollable, so allow generous limit)
  const maxEntries = 200
  const entries: { node: KNode; depth: number }[] = []

  function collectChildren(parentId: string, depth: number) {
    if (entries.length >= maxEntries) return
    const kids = parentId === node.id ? children : repo.getChildren(parentId)
    for (const child of kids) {
      if (entries.length >= maxEntries) return
      // Resolve embed nodes to their source (like TreeNode does)
      const displayNode = child.embed_source ? (repo.getNode(child.embed_source) ?? child) : child
      entries.push({ node: displayNode, depth })
      if (depth < 2) {
        collectChildren(child.id, depth + 1)
      }
    }
  }
  collectChildren(node.id, 0)

  const totalChildren = children.length
  const hasMore = entries.length >= maxEntries

  return (
    <Box flexDirection="column" flexGrow={1} width={width} height={height}>
      <DetailPaneTopBar node={node} isFocused={detailFocused} isCursored={detailCursorNodeId === DETAIL_TOPBAR_ID} />
      <Box height={1} flexShrink={0} />
      <ErrorBoundary fallback={<Text color={"$error"}>Error loading details</Text>} resetKey={node.id}>
        {/* Scrollable content area */}
        <Box flexDirection="column" overflow="scroll" flexGrow={1} paddingX={1}>
          {/* Item count */}
          <Text>
            {totalChildren} item{totalChildren !== 1 ? "s" : ""}
          </Text>
          <Text> </Text>

          {/* Outline — uses NodeLineView for consistent icon + title rendering */}
          <Box flexDirection="column">
            {entries.map((entry, i) => {
              // Cursor highlight: match by nodeId for depth-0 (navigable) entries
              const isCursored = entry.depth === 0 && entry.node.id === detailCursorNodeId
              return (
                <Box
                  key={`${entry.node.id}-${i}`}
                  backgroundColor={isCursored ? "$selected" : undefined}
                  color={isCursored ? "$selectedfg" : undefined}
                >
                  <NodeLineView
                    node={entry.node}
                    displayName={getNodeDisplayName(repo, entry.node)}
                    indent={entry.depth}
                  />
                </Box>
              )
            })}
            {hasMore && <Text dimColor> ...and more</Text>}
          </Box>
        </Box>

        {/* Footer: keybindings */}
        <Box flexShrink={0} paddingX={1}>
          <Text dimColor wrap="truncate">
            {"j/k:nav h/Esc:close Enter:open"}
          </Text>
        </Box>
      </ErrorBoundary>
    </Box>
  )
}

// =============================================================================
// Task Detail Pane — task/note details
// =============================================================================

function TaskDetailPane({
  node,
  width,
  height,
  focused: detailFocused = true,
  detailCursorNodeId,
}: InternalDetailPaneProps): React.ReactElement {
  const repo = useRepo()

  // Wiki link resolver: resolves [[target]] to the node's display title
  const resolveWikiLink = (target: string): string | null => {
    // Try smart resolver first (handles IDs, paths, filenames)
    const resolved = repo.resolveNode(target)
    if (resolved) return getNodeDisplayName(repo, resolved)
    // Try stripping ^ prefix for block IDs (^abc123 → abc123)
    if (target.startsWith("^")) {
      const byId = repo.resolveNode(target.slice(1)) ?? repo.getNode(target.slice(1))
      if (byId) return getNodeDisplayName(repo, byId)
    }
    return null
  }

  // Block ref resolver: resolves ^id to the node's display title
  const resolveBlockRef = (id: string): string | null => {
    const resolved = repo.resolveNode(id) ?? repo.getNode(id)
    if (resolved) return getNodeDisplayName(repo, resolved)
    return null
  }

  // No outer border — WorkspaceView provides pane chrome
  const contentWidth = Math.max(8, width - 2) // 1-space padding each side for text content

  const statusInfo = getStatusDisplay(node.task_status)
  const isDone = node.task_status === "done" || node.task_status === "dropped"
  const dueParts = decomposeDatetime(node.due_at)
  const startParts = decomposeDatetime(node.start_at)
  const dueDate = formatDate(dueParts?.date)
  // Get project path
  const projectPath = getProjectPath(repo, node)

  // Extract references from content
  const refs = extractReferences(node.content)

  // Also check data for stored references
  const mergeUnique = (target: string[], source: string[] | undefined): void => {
    if (!source) return
    for (const item of source) {
      if (!target.includes(item)) target.push(item)
    }
  }
  const dataRefs = node.data as { mentions?: string[]; tags?: string[]; projects?: string[] } | undefined
  mergeUnique(refs.mentions, dataRefs?.mentions)
  mergeUnique(refs.tags, dataRefs?.tags)
  mergeUnique(refs.projects, dataRefs?.projects)

  // Get children — split into body (content blocks) and structural (outline/list items)
  const children = repo.getChildren(node.id)
  // extractBody only treats oi as structural. For the detail pane, list items (li)
  // with task markers or children are also structural — they have subtasks.
  const { body: rawBody, items: oiItems } = extractBody(children)
  // Separate body nodes: li items that are task items go to structural, rest stays as body
  const bodyChildren: KNode[] = []
  const liItems: KNode[] = []
  for (const child of rawBody) {
    if (isItem(child.type, child.item) && !isOutline(child.type, child.item)) {
      liItems.push(child)
    } else {
      bodyChildren.push(child)
    }
  }
  const structuralChildren = [...liItems, ...oiItems]

  // Get backlinks (deduplicated by node ID)
  const backlinks = repo.getBacklinks(node.id)
  const seenBacklinkIds = new Set<string>()
  const backlinkNodes: KNode[] = []
  for (const link of backlinks) {
    if (seenBacklinkIds.has(link.source_id)) continue
    seenBacklinkIds.add(link.source_id)
    const sourceNode = repo.getNode(link.source_id)
    if (sourceNode) {
      backlinkNodes.push(sourceNode)
    }
  }

  const maxBacklinks = 5

  return (
    <Box flexDirection="column" flexGrow={1} width={width} height={height}>
      <DetailPaneTopBar node={node} isFocused={detailFocused} isCursored={detailCursorNodeId === DETAIL_TOPBAR_ID} />
      <Box height={1} flexShrink={0} />
      <ErrorBoundary fallback={<Text color={"$error"}>Error loading details</Text>} resetKey={node.id}>
        {/* Scrollable content area */}
        <Box flexDirection="column" overflow="scroll" flexGrow={1} paddingX={1}>
          {/* Breadcrumb path */}
          {projectPath.length > 0 && (
            <Text dimColor wrap="truncate">
              {projectPath.join(" / ")}
            </Text>
          )}

          {/* Metadata fields — aligned key:value table */}
          <MetadataTable
            node={node}
            isDone={isDone}
            statusInfo={statusInfo}
            dueDate={dueDate}
            dueParts={dueParts}
            startParts={startParts}
            refs={refs}
            cursorMetaKey={detailCursorNodeId?.startsWith(DETAIL_META_PREFIX) ? detailCursorNodeId.slice(DETAIL_META_PREFIX.length) : null}
            isFocused={detailFocused}
          />

          {/* Content area */}
          <Text> </Text>

          {bodyChildren.length === 0 && structuralChildren.length === 0 && <Text dimColor>(empty)</Text>}

          {/* Body content — compact for consecutive same-type items, spaced between different types */}
          {/* Embedded nodes resolve to the target and render as inline items */}
          {bodyChildren.length > 2 && <Text> </Text>}
          {bodyChildren.map((child, i) => {
            const prev = i > 0 ? bodyChildren[i - 1] : undefined
            // Add blank line between different block types, or between paragraphs.
            // Consecutive list items (li) and same-type items render compactly.
            const needsSpace = prev != null && (prev.type !== child.type || child.type === "p")

            // Context-dependent rendering: embeds resolve to target and render as inline items
            const resolvedChild = resolveEmbed(repo, child)
            if (resolvedChild !== child) {
              return (
                <React.Fragment key={`${child.id}-${i}`}>
                  {needsSpace && <Text> </Text>}
                  <NodeLineView node={resolvedChild} displayName={getNodeDisplayName(repo, resolvedChild)} />
                </React.Fragment>
              )
            }

            return (
              <React.Fragment key={`${child.id}-${i}`}>
                {needsSpace && <Text> </Text>}
                <BodyBlock
                  content={child.content ?? ""}
                  innerWidth={contentWidth}
                  resolveWikiLink={resolveWikiLink}
                  resolveBlockRef={resolveBlockRef}
                />
              </React.Fragment>
            )
          })}
          {bodyChildren.length > 2 && <Text> </Text>}

          {/* Children rendered as subitems with separators */}
          {structuralChildren.length > 0 && (
            <Box flexDirection="column" width={contentWidth} marginTop={bodyChildren.length > 0 ? 1 : 0}>
              <DetailSubitems
                repo={repo}
                items={structuralChildren}
                innerWidth={contentWidth}
                cursorNodeId={detailCursorNodeId}
                isFocused={detailFocused}
              />
            </Box>
          )}

          {/* Backlinks — show as breadcrumb path + bold title */}
          {backlinkNodes.length > 0 && (
            <Box flexDirection="column" marginTop={1} width={contentWidth}>
              <Text bold dimColor>
                Backlinks ({backlinkNodes.length})
              </Text>
              {backlinkNodes.slice(0, maxBacklinks).map((bl) => {
                const path = getProjectPath(repo, bl)
                const blTitle = getNodeDisplayName(repo, bl)
                const breadcrumb = path.length > 0 ? path.join(" / ") + " / " : ""
                const backlinkCursorId = `__backlink__${bl.id}`
                const isCursored = detailCursorNodeId === backlinkCursorId
                const blIcon = getNodeIcon(bl.task_status, undefined, bl.task_marker !== undefined)
                return (
                  <Box
                    key={bl.id}
                    backgroundColor={isCursored ? "$selected" : undefined}
                    color={isCursored ? "$selectedfg" : undefined}
                  >
                    <Text wrap="truncate">
                      {"  "}
                      <Text color={isCursored ? undefined : blIcon.color}>{blIcon.char}</Text>
                      {" "}
                      <Text dimColor={!isCursored}>{breadcrumb}</Text>
                      <Text bold>
                        <InlineText text={blTitle} context={{ resolveWikiLink, resolveBlockRef }} />
                      </Text>
                    </Text>
                  </Box>
                )
              })}
              {backlinkNodes.length > maxBacklinks && (
                <Text dimColor> +{backlinkNodes.length - maxBacklinks} more</Text>
              )}
            </Box>
          )}
        </Box>

        {/* Footer: keybindings */}
        <Box flexShrink={0} paddingX={1}>
          <Text dimColor wrap="truncate">
            {detailCursorNodeId?.startsWith(DETAIL_META_PREFIX) ? "j/k:nav Enter:edit h/Esc:close" : "j/k:nav Enter:open h/Esc:close"}
          </Text>
        </Box>
      </ErrorBoundary>
    </Box>
  )
}

// =============================================================================
// Metadata Table — aligned key:value display
// =============================================================================

/** Format a data field value for display — handles objects, arrays, and primitives readably */
function formatDataValue(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v)) return v.map((item) => formatDataValue(item)).join(", ")
  if (typeof v === "object") {
    // Flatten simple key-value objects into "key: value" pairs
    const entries = Object.entries(v as Record<string, unknown>)
    if (entries.length === 0) return "{}"
    return entries.map(([k, val]) => `${k}: ${formatDataValue(val)}`).join(", ")
  }
  return String(v)
}

// KNOWN_DATA_KEYS imported from detail-pane-items.ts

interface MetadataRow {
  key: string
  value: string
  valueColor?: string
}

interface MetadataTableProps {
  node: KNode
  isDone: boolean
  statusInfo: { text: string; color: string }
  dueDate: { text: string; urgency: string }
  dueParts: { date?: string; time?: string } | undefined
  startParts: { date?: string; time?: string } | undefined
  refs: { mentions: string[]; tags: string[]; projects: string[] }
  /** The metadata key currently cursored (e.g., "Status"), or null if no meta row is cursored. */
  cursorMetaKey?: string | null
  /** Whether the detail pane is focused. */
  isFocused?: boolean
}

function MetadataTable({
  node,
  isDone: _isDone,
  statusInfo,
  dueDate,
  dueParts,
  startParts,
  refs,
  cursorMetaKey = null,
  isFocused = true,
}: MetadataTableProps): React.ReactElement | null {
  const repo = useRepo()
  const rows: MetadataRow[] = []
  const nodeIsTask = isTask(node)

  // Status
  if (node.task_status) {
    rows.push({ key: "Status", value: statusInfo.text, valueColor: statusInfo.color })
  } else if (nodeIsTask) {
    rows.push({ key: "Status", value: "none", valueColor: "$muted" })
  }

  // Priority
  if (node.priority) {
    const pColors = ["$error", "$warning", "$primary", "$muted"]
    rows.push({ key: "Priority", value: `P${node.priority}`, valueColor: pColors[node.priority - 1] })
  } else if (nodeIsTask) {
    rows.push({ key: "Priority", value: "none", valueColor: "$muted" })
  }

  // Due date
  if (dueParts?.date) {
    const urgencyColors: Record<string, string | undefined> = {
      overdue: "$error",
      urgent: "$success",
      soon: "$warning",
      normal: undefined,
    }
    rows.push({ key: "Due", value: dueDate.text, valueColor: urgencyColors[dueDate.urgency] })
  } else if (nodeIsTask) {
    rows.push({ key: "Due", value: "none", valueColor: "$muted" })
  }

  // Start date
  if (startParts?.date) {
    const startDate = formatDate(startParts.date)
    rows.push({ key: "Start", value: startDate.text })
  } else if (nodeIsTask) {
    rows.push({ key: "Start", value: "none", valueColor: "$muted" })
  }

  // Recurrence
  if (node.rrule) {
    rows.push({ key: "Recurrence", value: node.rrule })
  } else if (nodeIsTask) {
    rows.push({ key: "Recurrence", value: "none", valueColor: "$muted" })
  }

  // Date-related metadata (created, completed) — group with other dates
  const data = node.data as Record<string, unknown> | undefined
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>
  if (metadata.created) rows.push({ key: "Created", value: String(metadata.created) })
  if (metadata.completed) rows.push({ key: "Completed", value: String(metadata.completed) })

  // Assigned
  if (node.assigned_to) {
    rows.push({ key: "Assigned", value: node.assigned_to })
  } else if (nodeIsTask) {
    rows.push({ key: "Assigned", value: "none", valueColor: "$muted" })
  }

  // Projects — prefer data.projectMemberships (rich: project + section) over inline +project refs
  const projectMemberships = data?.projectMemberships as Array<{ project: string; section?: string }> | undefined
  if (projectMemberships && projectMemberships.length > 0) {
    const formatted = projectMemberships
      .map((pm) => (pm.section ? `${pm.project} (${pm.section})` : pm.project))
      .filter(Boolean)
    if (formatted.length > 0) rows.push({ key: "Projects", value: formatted.join(", ") })
  } else if (refs.projects.length > 0) {
    const resolved = resolveProjectDisplayNames(repo, refs.projects).filter(Boolean)
    if (resolved.length > 0) rows.push({ key: "Projects", value: resolved.join(", ") })
  }

  // Tags (preserve # prefix, filter empty names)
  const validTags = refs.tags.filter(Boolean)
  if (validTags.length > 0) {
    rows.push({ key: "Tags", value: validTags.map((t) => `#${t}`).join(", ") })
  }

  // Mentions (preserve @ prefix) — exclude assignee to avoid duplication
  // Compare via shortName() to handle Unicode vs ASCII mismatches (e.g., "bjørn" vs "bjorn")
  const nonAssigneeMentions = refs.mentions.filter((m) => shortName(m) !== shortName(node.assigned_to ?? ""))
  if (nonAssigneeMentions.length > 0) {
    rows.push({ key: "Mentions", value: nonAssigneeMentions.map((m) => `@${m}`).join(", ") })
  }

  // Dependencies (deps = things this task waits on, blocks = things waiting on this task)
  if (data) {
    const depsRefs = parseDepsRefs(data, "deps")
    if (depsRefs.length > 0) {
      const resolved = depsRefs.map((ref) => {
        const target = repo.getNode(ref)
        return target ? (getNodeDisplayName(repo, target) ?? ref) : ref
      })
      rows.push({ key: "Depends on", value: resolved.join(", "), valueColor: "$warning" })
    }
    const blocksRefs = parseDepsRefs(data, "blocks")
    if (blocksRefs.length > 0) {
      const resolved = blocksRefs.map((ref) => {
        const target = repo.getNode(ref)
        return target ? (getNodeDisplayName(repo, target) ?? ref) : ref
      })
      rows.push({ key: "Blocks", value: resolved.join(", ") })
    }
  }

  // Remaining data.metadata entries (excluding created/completed already shown above)
  const usedKeys = new Set(rows.map((r) => r.key))
  if (data?.metadata && typeof data.metadata === "object") {
    for (const [k, v] of Object.entries(data.metadata as Record<string, unknown>)) {
      if (k === "created" || k === "completed") continue
      const key = capitalize(k)
      if (usedKeys.has(key)) continue
      usedKeys.add(key)
      rows.push({ key, value: String(v) })
    }
  }

  // data.propsRaw entries (inline properties from markdown)
  if (data?.propsRaw && typeof data.propsRaw === "object") {
    for (const [k, v] of Object.entries(data.propsRaw as Record<string, unknown>)) {
      const key = capitalize(k)
      if (usedKeys.has(key)) continue
      usedKeys.add(key)
      rows.push({ key, value: String(v) })
    }
  }

  // Extra data fields not in KNOWN_DATA_KEYS
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      if (KNOWN_DATA_KEYS.has(k)) continue
      const key = capitalize(k)
      if (usedKeys.has(key)) continue
      usedKeys.add(key)
      rows.push({ key, value: formatDataValue(v) })
    }
  }

  if (rows.length === 0) return null

  // Pad keys to the widest key + 2 spaces gap
  const maxKeyLen = Math.max(...rows.map((r) => r.key.length))

  return (
    <>
      {rows.map((row, i) => {
        const isCursored = cursorMetaKey === row.key
        return (
          <Box
            key={`${row.key}-${i}`}
            flexDirection="row"
            backgroundColor={isCursored ? "$selected" : undefined}
            color={isCursored ? "$selectedfg" : undefined}
          >
            <Text dimColor={!isCursored}>{row.key.padEnd(maxKeyLen)} </Text>
            <Text color={isCursored ? undefined : (row.valueColor ?? "$text")}>{row.value}</Text>
          </Box>
        )
      })}
    </>
  )
}

// =============================================================================
// Embed Resolution Helper
// =============================================================================

/** Wiki link pattern: ![[target]] or [[target]] with optional alias */
const WIKI_EMBED_RE = /^!\[\[([^\]|#^]+)(?:#[^\]|^]+)?(?:#?\^([^\]|]+))?(?:\|([^\]]+))?\]\]$/

/**
 * Resolve a node that might be an unresolved embed.
 * Heading embeds like `### [x] ![[^GID]]` lose their embed_source after parse round-trip
 * because the heading parser doesn't detect embedding syntax.
 * This helper checks the node's title/content for ![[...]] and resolves the target.
 */
function resolveEmbed(repo: Repo, node: KNode): KNode {
  // Already resolved via embed_source
  const embedSrc = node.embed_source
  if (embedSrc) {
    return repo.getNode(embedSrc) ?? node
  }
  // Check if title/content is an embed wiki link
  const text = node.title ?? node.content ?? ""
  const match = text.match(WIKI_EMBED_RE)
  if (!match) return node

  const target = match[1]?.trim()
  if (!target) return node

  // Try resolving: ^blockId → strip ^ and look up by ID
  if (target.startsWith("^")) {
    const id = target.slice(1)
    const resolved = repo.resolveNode(id) ?? repo.getNode(id)
    if (resolved) return resolved
  }
  // Try as-is (path, name, ID)
  const resolved = repo.resolveNode(target)
  if (resolved) return resolved

  return node
}

// =============================================================================
// Detail Subitems — line-separated items with outline tree for nested children
// =============================================================================

function DetailSubitems({
  repo,
  items,
  innerWidth,
  cursorNodeId = null,
  isFocused = true,
}: {
  repo: Repo
  items: KNode[]
  innerWidth: number
  cursorNodeId?: string | null
  isFocused?: boolean
}): React.ReactElement {
  return (
    <>
      {items.map((item, idx) => {
        // Context-dependent rendering: resolve embed targets for display
        const displayItem = resolveEmbed(repo, item)
        const icon = getNodeIcon(displayItem.task_status, undefined, displayItem.task_marker !== undefined)
        const isDone = displayItem.task_status === "done" || displayItem.task_status === "dropped"
        const isCursored = item.id === cursorNodeId
        const cursorBg = isCursored ? ("$selected" as const) : undefined
        const cursorFg = isCursored ? ("$selectedfg" as const) : undefined
        // Collapsed sections render muted with just the title + count
        // Comments and Attachments expand by default in detail pane (collapse only affects board view)
        const sectionName = getNodeDisplayName(repo, displayItem)
        const expandInDetail = /^(Comments|Attachments)$/i.test(sectionName)
        const isSectionCollapsed = item.rules?.collapse === true && !expandInDetail
        if (isSectionCollapsed) {
          const kidCount = repo.getChildren(item.id).length
          return (
            <React.Fragment key={`${item.id}-${idx}`}>
              <Box>
                <Text dimColor>{"─".repeat(innerWidth)}</Text>
              </Box>
              <Box flexDirection="row" width={innerWidth} backgroundColor={cursorBg} color={cursorFg} >
                <Box width={2} flexShrink={0}>
                  <Text dimColor>{icon.char}</Text>
                </Box>
                <Box flexGrow={1} flexShrink={1}>
                  <Text dimColor wrap="truncate">
                    <InlineText text={getNodeDisplayName(repo, displayItem)} />
                    {kidCount > 0 ? ` ··· ${kidCount}` : " ···"}
                  </Text>
                </Box>
              </Box>
            </React.Fragment>
          )
        }
        // Completed items: fold to single dimmed line with child count
        if (isDone) {
          const kidCount = repo.getChildren(displayItem !== item ? (item.embed_source ?? item.id) : item.id).length
          return (
            <React.Fragment key={`${item.id}-${idx}`}>
              <Box>
                <Text dimColor>{"─".repeat(innerWidth)}</Text>
              </Box>
              <Box flexDirection="row" width={innerWidth} backgroundColor={cursorBg} color={cursorFg} >
                <Box width={2} flexShrink={0}>
                  <Text dimColor>{icon.char}</Text>
                </Box>
                <Box flexGrow={1} flexShrink={1}>
                  <Text dimColor wrap="truncate">
                    <InlineText text={getNodeDisplayName(repo, displayItem)} />
                    {kidCount > 0 ? ` ··· ${kidCount}` : ""}
                  </Text>
                </Box>
              </Box>
            </React.Fragment>
          )
        }
        // For embeds, get children from the target node (transclusion)
        const resolvedId = displayItem !== item ? displayItem.id : item.id
        const embedTarget = item.embed_source
        const childrenSourceId = embedTarget && repo.getNode(embedTarget) ? embedTarget : resolvedId
        const allKids = repo.getChildren(childrenSourceId)
        const { body: rawKidBody, items: kidOiItems } = extractBody(allKids)
        const kidBody: KNode[] = []
        const kidLiItems: KNode[] = []
        for (const k of rawKidBody) {
          if (isItem(k.type, k.item) && !isOutline(k.type, k.item)) kidLiItems.push(k)
          else kidBody.push(k)
        }
        const kidItems = [...kidLiItems, ...kidOiItems]
        const dueBadge = displayItem.due_at ? ` ${formatDate(decomposeDatetime(displayItem.due_at)?.date).text}` : ""
        const assigneeBadge = displayItem.assigned_to ? ` @${displayItem.assigned_to}` : ""
        const isMultiLine = kidBody.length > 0 || kidItems.length > 0
        return (
          <React.Fragment key={`${item.id}-${idx}`}>
            {/* Extra spacing before multi-line items */}
            {idx > 0 && isMultiLine && <Text> </Text>}

            {/* Separator above each subitem */}
            <Box>
              <Text dimColor>{"─".repeat(innerWidth)}</Text>
            </Box>

            {/* Title line: hanging checkmark (checkmark col + title col) */}
            <Box flexDirection="row" width={innerWidth} backgroundColor={cursorBg} color={cursorFg} >
              <Box width={2} flexShrink={0}>
                <Text color={isDone ? undefined : icon.color} dimColor={isDone}>
                  {icon.char}
                </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text bold wrap="wrap" dimColor={isDone}>
                  <InlineText text={getNodeDisplayName(repo, displayItem)} />
                  {(dueBadge || assigneeBadge) && (
                    <Text dimColor bold={false}>
                      {dueBadge}
                      {assigneeBadge}
                    </Text>
                  )}
                </Text>
              </Box>
            </Box>

            {/* Body content — left-aligned with title (indented past checkmark) */}
            {kidBody.map((b, bi) => (
              <React.Fragment key={`${b.id}-${bi}`}>
                {bi > 0 && <Text> </Text>}
                <Box flexDirection="row" width={innerWidth}>
                  <Box width={2} flexShrink={0} />
                  <Box flexGrow={1} flexShrink={1}>
                    <Text wrap="wrap">
                      <InlineText text={b.content ?? ""} />
                    </Text>
                  </Box>
                </Box>
              </React.Fragment>
            ))}

            {/* Spacing after body content */}
            {kidBody.length > 0 && <Text> </Text>}

            {/* Sub-subitems — outline tree, single line each */}
            {kidItems.length > 0 && (
              <Box flexDirection="column">
                <OutlineTree repo={repo} items={kidItems} depth={1} innerWidth={innerWidth} />
              </Box>
            )}
          </React.Fragment>
        )
      })}
    </>
  )
}

/** Outline tree for nested sub-subitems. One line per item, truncated body preview. */
function OutlineTree({
  repo,
  items,
  depth,
  innerWidth,
}: {
  repo: Repo
  items: KNode[]
  depth: number
  innerWidth: number
}): React.ReactElement {
  const indent = "  ".repeat(depth)
  return (
    <>
      {items.map((item, idx) => {
        // Context-dependent rendering: resolve embed targets for display
        const displayItem = resolveEmbed(repo, item)
        const title = getNodeDisplayName(repo, displayItem)
        // Collapsed sections are hidden from the outline tree
        // (but Comments and Attachments expand by default in detail pane)
        const expandInOutline = /^(Comments|Attachments)$/i.test(title)
        if (item.rules?.collapse === true && !expandInOutline) return null
        const icon = getNodeIcon(displayItem.task_status, undefined, displayItem.task_marker !== undefined)
        const isDone = displayItem.task_status === "done" || displayItem.task_status === "dropped"
        const resolvedId = displayItem !== item ? displayItem.id : item.id
        const embedTarget = item.embed_source
        const childrenSourceId = embedTarget && repo.getNode(embedTarget) ? embedTarget : resolvedId
        const allKids = depth < 3 ? repo.getChildren(childrenSourceId) : []
        const { body: kidBody, items: kidOiItems } = extractBody(allKids)
        const kidLiItems = kidBody.filter((k) => isItem(k.type, k.item) && !isOutline(k.type, k.item))
        const bodyNodes = kidBody.filter((k) => !isItem(k.type, k.item) || isOutline(k.type, k.item))
        const kidItems = [...kidLiItems, ...kidOiItems]
        const hiddenCount = depth >= 3 ? repo.getChildren(childrenSourceId).length : 0

        // Single-line body preview: first non-empty line, truncated, URLs stripped
        const bodyPreview =
          bodyNodes
            .map((b) => (b.content ?? "").split("\n")[0]?.trim())
            .filter(Boolean)
            .join(" ")
            .replace(/<(https?:\/\/[^>]+)>/g, "")
            .replace(/https?:\/\/\S+/g, "")
            .trim() || undefined

        // Completed items: one-liner only (no body preview, no children)
        const showKids = !isDone && kidItems.length > 0
        const showBody = !isDone && bodyPreview

        return (
          <React.Fragment key={`${item.id}-${idx}`}>
            <Text wrap="truncate" dimColor={isDone}>
              {indent}
              <Text color={isDone ? undefined : icon.color}>{icon.char} </Text>
              <InlineText text={title} />
              {isDone && kidItems.length > 0 && <Text dimColor>{` ··· ${kidItems.length}`}</Text>}
              {showBody && <Text dimColor> \u2025 {bodyPreview}</Text>}
              {!isDone && hiddenCount > 0 && <Text dimColor>{` +${hiddenCount}`}</Text>}
            </Text>
            {showKids && <OutlineTree repo={repo} items={kidItems} depth={depth + 1} innerWidth={innerWidth} />}
          </React.Fragment>
        )
      })}
    </>
  )
}
// =============================================================================
// Body Block — rich body content with attachment link rendering
// =============================================================================

/** Regex to detect markdown links: [text](url) and image embeds: ![alt](url) */
const MD_LINK_LINE_RE = /^!?\[([^\]]+)\]\(([^)]+)\)$/

/** Regex to detect list items: `- text`, `* text`, or indented variants */
const LIST_ITEM_RE = /^(\s*[-*] )(.*)/

/** Regex to detect blockquotes: `> text` */
const BLOCKQUOTE_RE = /^(> ?)(.*)/

/** Render a body content block line-by-line.
 * Attachment links ([name](url)) are shown with both name and readable URL.
 * List items (- or *) render the bullet prefix dimmed.
 * Blockquotes (>) render the > prefix dimmed.
 * Wiki links [[target]] resolve to node titles when resolveWikiLink is provided.
 * Other lines are rendered with standard rich text formatting. */
function BodyBlock({
  content,
  innerWidth,
  resolveWikiLink,
  resolveBlockRef,
}: {
  content: string
  innerWidth: number
  resolveWikiLink?: (target: string) => string | null
  resolveBlockRef?: (id: string) => string | null
}): React.ReactElement {
  const richOpts = resolveWikiLink || resolveBlockRef ? { resolveWikiLink, resolveBlockRef } : undefined
  const lines = content.split("\n")
  return (
    <Box flexDirection="column" width={innerWidth}>
      {lines.map((line, i) => {
        if (line.trim() === "") {
          return <Text key={`blank-${i}`}> </Text>
        }
        const linkMatch = line.match(MD_LINK_LINE_RE)
        if (linkMatch) {
          const [, name, url] = linkMatch
          const isImage = line.startsWith("!")
          const displayUrl = prettifyUrl(url ?? "")
          return (
            <Text key={`line-${i}`} wrap="truncate">
              <Text dimColor>{isImage ? "[img] " : ""}</Text>
              <Text color={"$primary"} underline>
                {hyperlink(`${name}`, url ?? "")}
              </Text>
              <Text dimColor> {displayUrl}</Text>
            </Text>
          )
        }
        const listMatch = line.match(LIST_ITEM_RE)
        if (listMatch) {
          const [, prefix, rest] = listMatch
          return (
            <Text key={`line-${i}`} wrap="wrap">
              <Text dimColor>{prefix}</Text>
              <InlineText text={rest ?? ""} context={richOpts} />
            </Text>
          )
        }
        const quoteMatch = line.match(BLOCKQUOTE_RE)
        if (quoteMatch) {
          const [, prefix, rest] = quoteMatch
          return (
            <Text key={`line-${i}`} wrap="wrap">
              <Text dimColor>{prefix}</Text>
              <InlineText text={rest ?? ""} context={richOpts} />
            </Text>
          )
        }
        return (
          <Text key={`line-${i}`} wrap="wrap">
            <InlineText text={line} context={richOpts} />
          </Text>
        )
      })}
    </Box>
  )
}

export { extractReferences, formatDate, getStatusDisplay, getProjectPath } from "./detail-pane-helpers.ts"
