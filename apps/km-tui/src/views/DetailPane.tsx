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
import { renderRich, getNodeIcon, getStatusIcon } from "../text/index.ts"
import { NodeLine } from "./shared-components.tsx"
import {
  formatDate,
  getStatusDisplay,
  extractReferences,
  getProjectPath,
  stripInlineRefs,
  capitalize,
  resolveProjectDisplayNames,
} from "./detail-pane-helpers.ts"
import { shortName } from "./tree-node-helpers.ts"

export interface DetailPaneProps {
  node: KNode
  width: number
  height: number
}

export function DetailPane({ node, width, height }: DetailPaneProps): React.ReactElement {
  const repo = useRepo()
  // Resolve embedded links to show the target node's details
  const resolvedNode = node.link_to ? (repo.getNode(node.link_to) ?? node) : node
  if (resolvedNode.type === "oi" && resolvedNode.fstype === "folder") {
    return <FolderDetailPane node={resolvedNode} width={width} height={height} />
  }
  return <TaskDetailPane node={resolvedNode} width={width} height={height} />
}

// =============================================================================
// Folder Detail Pane — outline of folder contents
// =============================================================================

function FolderDetailPane({ node, width, height }: DetailPaneProps): React.ReactElement {
  const repo = useRepo()
  const innerWidth = Math.max(10, width - 6)
  const title = getNodeDisplayName(repo, node)
  const children = repo.getChildren(node.id)

  // Build a flat list of outline entries with depth, up to the available height
  const maxEntries = Math.max(1, height - 8) // Reserve for title, separator, counts, footer
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
      borderStyle="single"
      borderColor="white"
      backgroundColor="black"
      paddingX={1}
    >
      <ErrorBoundary fallback={<Text color="red">Error loading details</Text>} resetKey={node.id}>
        {/* Title */}
        <Box width={innerWidth}>
          <Text bold wrap="wrap">
            {renderRich(title)}
          </Text>
        </Box>

        {/* Separator */}
        <Box>
          <Text dimColor>{"─".repeat(innerWidth)}</Text>
        </Box>

        {/* Counts */}
        <Box>
          <Text>
            <Text dimColor>Contents: </Text>
            <Text>
              {totalChildren} item{totalChildren !== 1 ? "s" : ""}
            </Text>
          </Text>
        </Box>

        {/* Outline */}
        <Box flexDirection="column" marginTop={1} overflow="hidden" flexGrow={1}>
          {entries.map((entry, i) => {
            const indent = "  ".repeat(entry.depth)
            const icon = getNodeIcon(entry.node.task_status, undefined, entry.node.task_marker !== undefined)
            const entryTitle = getNodeDisplayName(repo, entry.node)
            return (
              <Box key={`${entry.node.id}-${i}`} height={1}>
                <Text wrap="truncate">
                  {indent}
                  <Text color={icon.color}>{icon.char}</Text> {renderRich(entryTitle)}
                </Text>
              </Box>
            )
          })}
          {hasMore && <Text dimColor> ...and more</Text>}
        </Box>

        {/* Footer: keybindings + debug info */}
        <Box flexGrow={1} />
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor wrap="truncate">
            h/Esc:close Enter:open
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

function TaskDetailPane({ node, width, height }: DetailPaneProps): React.ReactElement {
  const repo = useRepo()
  const innerWidth = Math.max(10, width - 6)
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

  // Get backlinks
  const backlinks = repo.getBacklinks(node.id)
  const backlinkNodes: KNode[] = []
  for (const link of backlinks) {
    const sourceNode = repo.getNode(link.source_id)
    if (sourceNode) {
      backlinkNodes.push(sourceNode)
    }
  }

  const maxBacklinks = 3

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor="white"
      backgroundColor="black"
      paddingX={1}
    >
      <ErrorBoundary fallback={<Text color="red">Error loading details</Text>} resetKey={node.id}>
        {/* Location breadcrumb above title (when path exists) */}
        {projectPath.length > 0 && (
          <Box width={innerWidth}>
            <Text dimColor wrap="truncate">
              {projectPath.join(" / ")}
            </Text>
          </Box>
        )}

        {/* Title - rich rendered, stripped of refs shown separately below */}
        <Box width={innerWidth}>
          <Text bold color="white" wrap="wrap">
            {node.task_status && (
              <Text color={getStatusIcon(node.task_status).color}>{getStatusIcon(node.task_status).char} </Text>
            )}
            {renderRich(stripInlineRefs(title))}
          </Text>
        </Box>

        {/* Separator - full width */}
        <Box>
          <Text dimColor>{"─".repeat(innerWidth)}</Text>
        </Box>

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

        {/* Column-style content area — separator then body + children like a column */}
        {(bodyChildren.length > 0 || structuralChildren.length > 0) && (
          <>
            <Box>
              <Text dimColor>{"─".repeat(innerWidth)}</Text>
            </Box>

            {/* Body content — rendered line-by-line with attachment links shown as readable URLs */}
            {bodyChildren.map((child, i) => (
              <BodyBlock key={`${child.id}-${i}`} content={child.content ?? ""} innerWidth={innerWidth} />
            ))}

            {/* Children rendered as outline items (column cards) */}
            {structuralChildren.length > 0 && (
              <Box flexDirection="column" width={innerWidth} marginTop={bodyChildren.length > 0 ? 1 : 0}>
                <ColumnItems repo={repo} items={structuralChildren} depth={0} innerWidth={innerWidth} />
              </Box>
            )}
          </>
        )}

        {/* Backlinks */}
        {backlinkNodes.length > 0 && (
          <Box flexDirection="column" marginTop={1} width={innerWidth}>
            <Text bold dimColor>
              Backlinks ({backlinkNodes.length})
            </Text>
            {backlinkNodes.slice(0, maxBacklinks).map((bl, i) => (
              <NodeLine key={`${bl.id}-${i}`} node={bl} title={getNodeDisplayName(repo, bl)} />
            ))}
            {backlinkNodes.length > maxBacklinks && <Text dimColor> +{backlinkNodes.length - maxBacklinks} more</Text>}
          </Box>
        )}

        {/* Footer: keybindings + debug info */}
        <Box flexGrow={1} />
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor wrap="truncate">
            h/Esc:close Space:status
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
  isDone,
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
    const formatted = projectMemberships.map((pm) => (pm.section ? `${pm.project} (${pm.section})` : pm.project))
    rows.push({ key: "Projects", value: formatted.join(", ") })
  } else if (refs.projects.length > 0) {
    const resolved = resolveProjectDisplayNames(repo, refs.projects)
    rows.push({ key: "Projects", value: resolved.join(", ") })
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
          <Text color={isDone ? undefined : row.valueColor} dimColor={isDone}>
            {row.value}
          </Text>
        </Box>
      ))}
    </>
  )
}

// =============================================================================
// Column Items — children rendered like cards in a column
// =============================================================================

function ColumnItems({
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
  return (
    <>
      {items.map((item, idx) => {
        const icon = getNodeIcon(item.task_status, undefined, item.task_marker !== undefined)
        const indent = "  ".repeat(depth)
        const isDone = item.task_status === "done" || item.task_status === "dropped"
        const allKids = depth < 3 ? repo.getChildren(item.id) : []
        // Split kids into body/structural, treating li as structural
        const { body: rawKidBody, items: kidOiItems } = extractBody(allKids)
        const kidBody: KNode[] = []
        const kidLiItems: KNode[] = []
        for (const k of rawKidBody) {
          if (k.type === "li") kidLiItems.push(k)
          else kidBody.push(k)
        }
        const kidItems = [...kidLiItems, ...kidOiItems]
        // Count hidden children at depth limit
        const hiddenChildCount = depth >= 3 ? repo.getChildren(item.id).length : 0
        // Metadata badges for top-level items (like cards show)
        const dueBadge = item.due_at ? ` ${formatDate(decomposeDatetime(item.due_at)?.date).text}` : ""
        const assigneeBadge = item.assigned_to ? ` @${item.assigned_to}` : ""
        const itemContent = (
          <>
            <Text wrap="wrap" dimColor={isDone}>
              {indent}
              <Text color={isDone ? undefined : icon.color}>{icon.char} </Text>
              {renderRich(stripInlineRefs(getNodeDisplayName(repo, item)))}
              {depth === 0 && (dueBadge || assigneeBadge) && (
                <Text dimColor>
                  {dueBadge}
                  {assigneeBadge}
                </Text>
              )}
              {hiddenChildCount > 0 && <Text dimColor>{` +${hiddenChildCount}`}</Text>}
            </Text>
            {kidBody.map((b, bi) => (
              <Text key={`${b.id}-${bi}`} wrap="wrap" dimColor>
                {indent}
                {"  "}
                {renderRich(b.content ?? "")}
              </Text>
            ))}
            {kidItems.length > 0 && (
              <ColumnItems repo={repo} items={kidItems} depth={depth + 1} innerWidth={innerWidth} />
            )}
          </>
        )
        return (
          <React.Fragment key={`${item.id}-${idx}`}>
            {depth === 0 ? (
              <Box
                flexDirection="column"
                width={innerWidth}
                borderStyle="single"
                borderColor={isDone ? "gray" : "white"}
              >
                {itemContent}
              </Box>
            ) : (
              itemContent
            )}
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

/** Render a body content block line-by-line.
 * Attachment links ([name](url)) are shown with both name and readable URL.
 * Other lines are rendered with standard rich text formatting. */
function BodyBlock({ content, innerWidth }: { content: string; innerWidth: number }): React.ReactElement {
  const lines = content.split("\n")
  return (
    <Box flexDirection="column" width={innerWidth}>
      {lines.map((line, i) => {
        if (line.trim() === "") {
          return <Text key={`blank-${i}`}>{" "}</Text>
        }
        const linkMatch = line.match(MD_LINK_LINE_RE)
        if (linkMatch) {
          const [, name, url] = linkMatch
          const isImage = line.startsWith("!")
          return (
            <Box key={`line-${i}`} flexDirection="row">
              <Text wrap="truncate">
                <Text dimColor>{isImage ? "[img] " : "[link] "}</Text>
                <Text bold underline>
                  {name}
                </Text>
                <Text dimColor> ({url})</Text>
              </Text>
            </Box>
          )
        }
        return (
          <Text key={`line-${i}`} wrap="wrap">
            {renderRich(line)}
          </Text>
        )
      })}
    </Box>
  )
}

export { extractReferences, formatDate, getStatusDisplay, getProjectPath } from "./detail-pane-helpers.ts"
