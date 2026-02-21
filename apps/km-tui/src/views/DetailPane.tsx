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
import { decomposeDatetime } from "@km/core"
import { extractBody } from "@km/tree"
import { useRepo, type Repo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { InlineText, getNodeIcon, getStatusIcon, hyperlink, prettifyUrl } from "../text/index.ts"
import {
  formatDate,
  getStatusDisplay,
  extractReferences,
  getProjectPath,
  capitalize,
  resolveProjectDisplayNames,
} from "./detail-pane-helpers.ts"
import { shortName, parseDepsRefs } from "./tree-node-helpers.ts"
import { NodeLineView } from "./NodeView.tsx"

export interface DetailPaneProps {
  node: KNode
  width: number
  height: number
  scrollOffset?: number
  /** Whether this pane has keyboard focus (bright cursor when true, dim when false) */
  focused?: boolean
}

export function DetailPane({
  node,
  width,
  height,
  scrollOffset = 0,
  focused = true,
}: DetailPaneProps): React.ReactElement {
  const repo = useRepo()
  // Resolve embedded links to show the target node's details
  const resolvedNode = node.link_to ? (repo.getNode(node.link_to) ?? node) : node
  if (resolvedNode.type === "oi" && resolvedNode.fstype === "folder") {
    return (
      <FolderDetailPane
        node={resolvedNode}
        width={width}
        height={height}
        scrollOffset={scrollOffset}
        focused={focused}
      />
    )
  }
  return (
    <TaskDetailPane node={resolvedNode} width={width} height={height} scrollOffset={scrollOffset} focused={focused} />
  )
}

// =============================================================================
// Folder Detail Pane — outline of folder contents
// =============================================================================

function FolderDetailPane({
  node,
  width,
  height,
  scrollOffset = 0,
  focused: detailFocused = true,
}: DetailPaneProps): React.ReactElement {
  const repo = useRepo()
  // Full width inside border (no paddingX on outer Box — title bar spans edge-to-edge)
  const fullWidth = Math.max(10, width - 2) // subtract border only
  const contentWidth = Math.max(8, fullWidth - 2) // 1-space padding each side for text content
  const title = getNodeDisplayName(repo, node)
  const children = repo.getChildren(node.id)

  // Build a flat list of outline entries with depth (scrollable, so allow generous limit)
  const maxEntries = 200
  const entries: { node: KNode; depth: number }[] = []

  function collectChildren(parentId: string, depth: number) {
    if (entries.length >= maxEntries) return
    const kids = parentId === node.id ? children : repo.getChildren(parentId)
    for (const child of kids) {
      if (entries.length >= maxEntries) return
      entries.push({ node: child, depth })
      if (depth < 2) {
        collectChildren(child.id, depth + 1)
      }
    }
  }
  collectChildren(node.id, 0)

  const totalChildren = children.length
  const hasMore = entries.length >= maxEntries

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor="yellow"
      borderDimColor={!detailFocused}
      backgroundColor="black"
    >
      <ErrorBoundary fallback={<Text color="red">Error loading details</Text>} resetKey={node.id}>
        {/* Title — yellow bg spans full width, text padded; dim when detail pane is not focused */}
        <Box width={fullWidth} backgroundColor={detailFocused ? "yellow" : undefined} paddingX={1}>
          <Text bold color={detailFocused ? "black" : "yellow"} dimColor={!detailFocused} wrap="wrap">
            <Text dimColor bold={false}>
              [
            </Text>
            <Text bold>D</Text>
            <Text dimColor bold={false}>
              ]
            </Text>{" "}
            <InlineText text={title} />
          </Text>
        </Box>

        {/* Separator — full width with 1-space padding */}
        <Text dimColor>{" " + "─".repeat(contentWidth) + " "}</Text>

        {/* Scrollable content area */}
        <Box flexDirection="column" overflow="scroll" scrollOffset={scrollOffset} flexGrow={1} paddingX={1}>
          {/* Counts */}
          <Box>
            <Text>
              <Text dimColor>Contents: </Text>
              <Text>
                {totalChildren} item{totalChildren !== 1 ? "s" : ""}
              </Text>
            </Text>
          </Box>

          {/* Outline — uses NodeLineView for consistent icon + title rendering */}
          <Box flexDirection="column" marginTop={1}>
            {entries.map((entry, i) => (
              <NodeLineView
                key={`${entry.node.id}-${i}`}
                node={entry.node}
                displayName={getNodeDisplayName(repo, entry.node)}
                indent={entry.depth}
              />
            ))}
            {hasMore && <Text dimColor> ...and more</Text>}
          </Box>
        </Box>

        {/* Footer: keybindings + debug info — always visible */}
        <Box flexDirection="row" justifyContent="space-between" flexShrink={0} paddingX={1}>
          <Text dimColor wrap="truncate">
            {"h/Esc:close {/}:scroll Enter:open"}
          </Text>
          <Text dimColor wrap="truncate">
            {node.type} {node.id}
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
  scrollOffset = 0,
  focused: detailFocused = true,
}: DetailPaneProps): React.ReactElement {
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

  // Full width inside border (no paddingX on outer Box — title bar spans edge-to-edge)
  const fullWidth = Math.max(10, width - 2) // subtract border only
  const contentWidth = Math.max(8, fullWidth - 2) // 1-space padding each side for text content
  const title = getNodeDisplayName(repo, node)

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
    if (child.type === "li") {
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
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor="yellow"
      borderDimColor={!detailFocused}
      backgroundColor="black"
    >
      <ErrorBoundary fallback={<Text color="red">Error loading details</Text>} resetKey={node.id}>
        {/* Title header — yellow bg when focused, dim yellow text when inactive */}
        <Box
          flexDirection="column"
          width={fullWidth}
          backgroundColor={detailFocused ? "yellow" : undefined}
          paddingX={1}
        >
          {/* Location breadcrumb */}
          {projectPath.length > 0 && (
            <Text color={detailFocused ? "black" : "yellow"} dimColor={!detailFocused} wrap="truncate">
              {projectPath.join(" / ")}
            </Text>
          )}

          {/* Title — InlineText styles sigils but keeps all content visible */}
          <Text bold color={detailFocused ? "black" : "yellow"} dimColor={!detailFocused} wrap="wrap">
            <Text dimColor bold={false}>
              [
            </Text>
            <Text bold>D</Text>
            <Text dimColor bold={false}>
              ]
            </Text>{" "}
            {node.task_status && <Text>{getStatusIcon(node.task_status).char} </Text>}
            <InlineText text={title} />
          </Text>
        </Box>

        {/* Separator below title — full width with 1-space padding */}
        <Text dimColor>{" " + "─".repeat(contentWidth) + " "}</Text>

        {/* Scrollable content area */}
        <Box flexDirection="column" overflow="scroll" scrollOffset={scrollOffset} flexGrow={1} paddingX={1}>
          {/* Metadata fields — aligned key:value table */}
          <MetadataTable
            node={node}
            isDone={isDone}
            statusInfo={statusInfo}
            dueDate={dueDate}
            dueParts={dueParts}
            startParts={startParts}
            refs={refs}
          />

          {/* Content area — separator then body + children */}
          <Text dimColor>{"─".repeat(contentWidth)}</Text>

          {bodyChildren.length === 0 && structuralChildren.length === 0 && <Text dimColor>(empty)</Text>}

          {/* Body content — compact for consecutive same-type items, spaced between different types */}
          {/* Embedded nodes (link_to) resolve to the target and render as inline items */}
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
                  <NodeLineView
                    node={resolvedChild}
                    displayName={getNodeDisplayName(repo, resolvedChild)}
                  />
                </React.Fragment>
              )
            }

            return (
              <React.Fragment key={`${child.id}-${i}`}>
                {needsSpace && <Text> </Text>}
                <BodyBlock content={child.content ?? ""} innerWidth={contentWidth} resolveWikiLink={resolveWikiLink} />
              </React.Fragment>
            )
          })}
          {bodyChildren.length > 2 && <Text> </Text>}

          {/* Children rendered as subitems with separators */}
          {structuralChildren.length > 0 && (
            <Box flexDirection="column" width={contentWidth} marginTop={bodyChildren.length > 0 ? 1 : 0}>
              <DetailSubitems repo={repo} items={structuralChildren} innerWidth={contentWidth} />
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
                return (
                  <Text key={bl.id} wrap="truncate">
                    {"  "}
                    <Text dimColor>{breadcrumb}</Text>
                    <Text bold><InlineText text={blTitle} context={{ resolveWikiLink }} /></Text>
                  </Text>
                )
              })}
              {backlinkNodes.length > maxBacklinks && (
                <Text dimColor> +{backlinkNodes.length - maxBacklinks} more</Text>
              )}
            </Box>
          )}
        </Box>

        {/* Footer: keybindings + debug info — always visible */}
        <Box flexDirection="row" justifyContent="space-between" flexShrink={0} paddingX={1}>
          <Text dimColor wrap="truncate">
            {"h/Esc:close {/}:scroll Space:status"}
          </Text>
          <Text dimColor wrap="truncate">
            {node.type} {node.id}
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

const KNOWN_DATA_KEYS = new Set([
  // Parser-generated
  "tags",
  "mentions",
  "projects",
  "projectMemberships",
  "short_id",
  "props",
  "propsRaw",
  "block_id",
  "metadata",
  "name",
  "title",
  "recurrence",
  "depth",
  "fstype",
  "rules",
  "tag",
  "item_count",
  "is_repo_root",
  "embeddingTarget",
  // Internal aggregation (parser)
  "_h1Title",
  "_allMentions",
  "_allTags",
  "_allProjects",
  // Import provenance (shown in footer instead)
  "imported_from",
  "imported_at",
  "asana_project_id",
  // Containment tree (shown via breadcrumb)
  "workspace",
  "team",
  // Timestamps (mapped to native fields)
  "created_at",
  "modified_at",
  // Dependencies (rendered in MetadataTable)
  "deps",
  "blocks",
])

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
}

function MetadataTable({
  node,
  isDone: _isDone,
  statusInfo,
  dueDate,
  dueParts,
  startParts,
  refs,
}: MetadataTableProps): React.ReactElement | null {
  const repo = useRepo()
  const rows: MetadataRow[] = []

  // Status
  if (node.task_status) {
    rows.push({ key: "Status", value: statusInfo.text, valueColor: statusInfo.color })
  }

  // Priority
  if (node.priority) {
    const pColors = ["red", "yellow", "yellowBright", "gray"]
    rows.push({ key: "Priority", value: `P${node.priority}`, valueColor: pColors[node.priority - 1] })
  }

  // Due date
  if (dueParts?.date) {
    const urgencyColors: Record<string, string | undefined> = {
      overdue: "red",
      urgent: "green",
      soon: "yellow",
      normal: undefined,
    }
    rows.push({ key: "Due", value: dueDate.text, valueColor: urgencyColors[dueDate.urgency] })
  }

  // Start date
  if (startParts?.date) {
    const startDate = formatDate(startParts.date)
    rows.push({ key: "Start", value: startDate.text })
  }

  // Recurrence
  if (node.recurrence) {
    rows.push({ key: "Recurrence", value: node.recurrence })
  }

  // Date-related metadata (created, completed) — group with other dates
  const data = node.data as Record<string, unknown> | undefined
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>
  if (metadata.created) rows.push({ key: "Created", value: String(metadata.created) })
  if (metadata.completed) rows.push({ key: "Completed", value: String(metadata.completed) })

  // Assigned
  if (node.assigned_to) {
    rows.push({ key: "Assigned", value: node.assigned_to })
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

  // Tags (preserve # prefix)
  if (refs.tags.length > 0) {
    rows.push({ key: "Tags", value: refs.tags.map((t) => `#${t}`).join(", ") })
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
      rows.push({ key: "Depends on", value: resolved.join(", "), valueColor: "yellow" })
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
      {rows.map((row, i) => (
        <Box key={`${row.key}-${i}`} flexDirection="row">
          <Text dimColor>{row.key.padEnd(maxKeyLen)} </Text>
          <Text color={row.valueColor ?? "white"}>{row.value}</Text>
        </Box>
      ))}
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
 * Heading embeds like `### [x] ![[^GID]]` lose their link_to after parse round-trip
 * because the heading parser doesn't detect embedding syntax.
 * This helper checks the node's title/content for ![[...]] and resolves the target.
 */
function resolveEmbed(repo: Repo, node: KNode): KNode {
  // Already resolved via link_to
  if (node.link_to) {
    return repo.getNode(node.link_to) ?? node
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
}: {
  repo: Repo
  items: KNode[]
  innerWidth: number
}): React.ReactElement {
  return (
    <>
      {items.map((item, idx) => {
        // Context-dependent rendering: resolve embed targets for display
        const displayItem = resolveEmbed(repo, item)
        const icon = getNodeIcon(displayItem.task_status, undefined, displayItem.task_marker !== undefined)
        const isDone = displayItem.task_status === "done" || displayItem.task_status === "dropped"
        // Collapsed sections render muted with just the title + count
        const isSectionCollapsed = item.rules?.collapse === true
        if (isSectionCollapsed) {
          const kidCount = repo.getChildren(item.id).length
          return (
            <React.Fragment key={`${item.id}-${idx}`}>
              <Box>
                <Text dimColor>{"─".repeat(innerWidth)}</Text>
              </Box>
              <Box flexDirection="row" width={innerWidth}>
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
          const kidCount = repo.getChildren(displayItem !== item ? (item.link_to ?? item.id) : item.id).length
          return (
            <React.Fragment key={`${item.id}-${idx}`}>
              <Box>
                <Text dimColor>{"─".repeat(innerWidth)}</Text>
              </Box>
              <Box flexDirection="row" width={innerWidth}>
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
        const childrenSourceId = item.link_to && repo.getNode(item.link_to) ? item.link_to : resolvedId
        const allKids = repo.getChildren(childrenSourceId)
        const { body: rawKidBody, items: kidOiItems } = extractBody(allKids)
        const kidBody: KNode[] = []
        const kidLiItems: KNode[] = []
        for (const k of rawKidBody) {
          if (k.type === "li") kidLiItems.push(k)
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
            <Box flexDirection="row" width={innerWidth}>
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
                    <Text wrap="wrap"><InlineText text={b.content ?? ""} /></Text>
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
        // Collapsed sections are hidden from the outline tree
        if (item.rules?.collapse === true) return null
        // Context-dependent rendering: resolve embed targets for display
        const displayItem = resolveEmbed(repo, item)
        const icon = getNodeIcon(displayItem.task_status, undefined, displayItem.task_marker !== undefined)
        const isDone = displayItem.task_status === "done" || displayItem.task_status === "dropped"
        const title = getNodeDisplayName(repo, displayItem)
        const resolvedId = displayItem !== item ? displayItem.id : item.id
        const childrenSourceId = item.link_to && repo.getNode(item.link_to) ? item.link_to : resolvedId
        const allKids = depth < 3 ? repo.getChildren(childrenSourceId) : []
        const { body: kidBody, items: kidOiItems } = extractBody(allKids)
        const kidLiItems = kidBody.filter((k) => k.type === "li")
        const bodyNodes = kidBody.filter((k) => k.type !== "li")
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
}: {
  content: string
  innerWidth: number
  resolveWikiLink?: (target: string) => string | null
}): React.ReactElement {
  const richOpts = resolveWikiLink ? { resolveWikiLink } : undefined
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
              <Text color="cyan" underline>
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
