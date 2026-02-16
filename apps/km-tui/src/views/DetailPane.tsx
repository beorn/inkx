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
import { useRepo, type Repo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { renderRich, renderPlain, getNodeIcon } from "../text/index.ts"
import { wrapText } from "../layout/index.ts"
import { NodeLine } from "./shared-components.tsx"

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
      borderColor="cyan"
      backgroundColor="black"
      paddingX={1}
    >
      <ErrorBoundary fallback={<Text color="red">Error loading details</Text>}>
        {/* Title */}
        <Box width={innerWidth}>
          <Text bold wrap="wrap">
            {renderRich(title)}
          </Text>
        </Box>

        {/* Separator */}
        <Box>
          <Text dimColor>{"─".repeat(innerWidth - 2)}</Text>
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
          {entries.map((entry) => {
            const indent = "  ".repeat(entry.depth)
            const icon = getNodeIcon(entry.node.task_status, undefined, entry.node.task_marker !== undefined)
            const entryTitle = getNodeDisplayName(repo, entry.node)
            return (
              <Box key={entry.node.id} height={1}>
                <Text wrap="truncate">
                  {indent}
                  <Text color={icon.color}>{icon.char}</Text> {renderRich(entryTitle)}
                </Text>
              </Box>
            )
          })}
          {hasMore && <Text dimColor> ...and more</Text>}
        </Box>

        {/* Footer hint */}
        <Box flexGrow={1} />
        <Box>
          <Text dimColor>h/Esc:close Enter:open</Text>
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
  const innerWidth = Math.max(10, width - 6) // Account for border + paddingX(1)
  const title = getNodeDisplayName(repo, node)

  // Get fields — use due_at/start_at (preferred), fall back to legacy
  const statusInfo = getStatusDisplay(node.task_status)
  const dueParts = decomposeDatetime(node.due_at) ?? (node.due_date ? { date: node.due_date, time: node.due_time } : undefined)
  const startParts = decomposeDatetime(node.start_at) ?? (node.scheduled_date ? { date: node.scheduled_date, time: node.scheduled_time } : undefined)
  const dueDate = formatDate(dueParts?.date)
  const assignedTo = node.assigned_to

  // Get project path
  const projectPath = getProjectPath(repo, node)

  // Extract references from content
  const refs = extractReferences(node.content)

  // Also check data for stored references
  const dataRefs = node.data as { mentions?: string[]; tags?: string[]; projects?: string[] } | undefined
  if (dataRefs?.mentions) {
    for (const m of dataRefs.mentions) {
      if (!refs.mentions.includes(m)) refs.mentions.push(m)
    }
  }
  if (dataRefs?.tags) {
    for (const t of dataRefs.tags) {
      if (!refs.tags.includes(t)) refs.tags.push(t)
    }
  }
  if (dataRefs?.projects) {
    for (const p of dataRefs.projects) {
      if (!refs.projects.includes(p)) refs.projects.push(p)
    }
  }

  // Get subtasks (children that are tasks)
  const children = repo.getChildren(node.id)
  const subtasks = children.filter((c: KNode) => c.task_marker !== undefined)

  // Get backlinks
  const backlinks = repo.getBacklinks(node.id)
  const backlinkNodes: KNode[] = []
  for (const link of backlinks) {
    const sourceNode = repo.getNode(link.source_id)
    if (sourceNode) {
      backlinkNodes.push(sourceNode)
    }
  }

  // Calculate available lines for content
  // Reserve: title (2), separator (1), fields (~4), refs (~2), subtasks header+items, backlinks header+items
  const estimatedHeaderLines = 10
  const maxSubtasks = 5
  const maxBacklinks = 3
  const contentLines = Math.max(
    1,
    height -
      estimatedHeaderLines -
      Math.min(subtasks.length, maxSubtasks) -
      Math.min(backlinkNodes.length, maxBacklinks) -
      4,
  )

  // Wrap content using shared utility
  const fullContent = node.content || ""
  const contentWidth = innerWidth - 2
  // Render to styled text first, then wrap
  const styledContent = renderRich(fullContent)
  const wrappedContent = wrapText(styledContent, contentWidth)

  const displayContent = wrappedContent.slice(0, contentLines)
  const hasMoreContent = wrappedContent.length > contentLines

  // Check if we have any references to show
  const hasRefs =
    refs.mentions.length > 0 || refs.tags.length > 0 || refs.projects.length > 0 || refs.wikilinks.length > 0

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor="cyan"
      backgroundColor="black"
      paddingX={1}
    >
      <ErrorBoundary fallback={<Text color="red">Error loading details</Text>}>
        {/* Title - rich rendered */}
        <Box width={innerWidth}>
          <Text bold wrap="wrap">
            {renderRich(title)}
          </Text>
        </Box>

        {/* Separator - full width */}
        <Box>
          <Text dimColor>{"─".repeat(innerWidth - 2)}</Text>
        </Box>

        {/* Fields */}
        <Box flexDirection="row" gap={2}>
          <Text>
            <Text dimColor>Status: </Text>
            <Text color={statusInfo.color}>{statusInfo.text}</Text>
          </Text>
          {node.priority != null && node.priority > 0 && (
            <Text>
              <Text dimColor>Priority: </Text>
              <Text
                color={
                  node.priority === 1
                    ? "red"
                    : node.priority === 2
                      ? "yellow"
                      : node.priority === 3
                        ? "yellowBright"
                        : "gray"
                }
              >
                P{node.priority}
              </Text>
            </Text>
          )}
        </Box>

        {dueDate.text && (
          <Box>
            <Text>
              <Text dimColor>Due: </Text>
              <Text
                color={dueDate.urgency === "overdue" ? "red" : dueDate.urgency === "urgent" ? "yellow" : undefined}
                underline={dueDate.urgency === "overdue" || dueDate.urgency === "urgent" || dueDate.urgency === "soon"}
              >
                {dueDate.text}
              </Text>
              {dueParts?.time && <Text dimColor> {dueParts.time}</Text>}
            </Text>
          </Box>
        )}

        {startParts?.date && (
          <Box>
            <Text>
              <Text dimColor>Start: </Text>
              <Text>{formatDate(startParts.date).text}</Text>
              {startParts.time && <Text dimColor> {startParts.time}</Text>}
            </Text>
          </Box>
        )}

        {node.recurrence && (
          <Box>
            <Text>
              <Text dimColor>Recurrence: </Text>
              <Text>{node.recurrence}</Text>
            </Text>
          </Box>
        )}

        {assignedTo && (
          <Box flexDirection="row" gap={2}>
            <Text>
              <Text dimColor>Assigned: </Text>
              <Text color="magenta">@{assignedTo}</Text>
            </Text>
          </Box>
        )}

        {/* Project path */}
        {projectPath.length > 0 && (
          <Box>
            <Text>
              <Text dimColor>Project: </Text>
              <Text>{projectPath.map(renderPlain).join(" / ")}</Text>
            </Text>
          </Box>
        )}

        {/* References */}
        {hasRefs && (
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {refs.tags.map((tag) => (
              <Text key={`tag-${tag}`} color="blue">
                #{tag}
              </Text>
            ))}
            {refs.mentions.map((m) => (
              <Text key={`mention-${m}`} color="magenta">
                @{m}
              </Text>
            ))}
            {refs.projects.map((p) => (
              <Text key={`project-${p}`} color="green">
                +{p}
              </Text>
            ))}
            {refs.wikilinks.map((w) => (
              <Text key={`wiki-${w}`} color="cyan" underline>
                {w.includes("|") ? w.split("|")[1] : w}
              </Text>
            ))}
          </Box>
        )}

        {/* Extra data fields (key:value for anything not already rendered) */}
        {(() => {
          const knownKeys = new Set(["tags", "mentions", "projects", "short_id", "props", "block_id"])
          const data = node.data as Record<string, unknown> | undefined
          if (!data) return null
          const extras = Object.entries(data).filter(
            ([k, v]) => !knownKeys.has(k) && v != null && v !== "",
          )
          if (extras.length === 0) return null
          return (
            <Box flexDirection="column" marginTop={1}>
              {extras.map(([k, v]) => (
                <Box key={k}>
                  <Text>
                    <Text dimColor>{k}: </Text>
                    <Text>{typeof v === "object" ? JSON.stringify(v) : String(v)}</Text>
                  </Text>
                </Box>
              ))}
            </Box>
          )
        })()}

        {/* Content section */}
        {displayContent.length > 0 && (
          <Box flexDirection="column" paddingX={1} marginTop={1} width={innerWidth}>
            <Text bold dimColor>
              Content
            </Text>
            {displayContent.map((line, i) => (
              <Text key={i} wrap="truncate">
                {line}
              </Text>
            ))}
            {hasMoreContent && <Text dimColor>...</Text>}
          </Box>
        )}

        {/* Subtasks */}
        {subtasks.length > 0 && (
          <Box flexDirection="column" paddingX={1} marginTop={1} width={innerWidth}>
            <Text bold dimColor>
              Subtasks ({subtasks.length})
            </Text>
            {subtasks.slice(0, maxSubtasks).map((task) => (
              <NodeLine key={task.id} node={task} title={task.content || getNodeDisplayName(repo, task)} />
            ))}
            {subtasks.length > maxSubtasks && <Text dimColor> +{subtasks.length - maxSubtasks} more</Text>}
          </Box>
        )}

        {/* Backlinks */}
        {backlinkNodes.length > 0 && (
          <Box flexDirection="column" paddingX={1} marginTop={1} width={innerWidth}>
            <Text bold dimColor>
              Backlinks ({backlinkNodes.length})
            </Text>
            {backlinkNodes.slice(0, maxBacklinks).map((bl) => (
              <NodeLine key={bl.id} node={bl} title={getNodeDisplayName(repo, bl)} />
            ))}
            {backlinkNodes.length > maxBacklinks && <Text dimColor> +{backlinkNodes.length - maxBacklinks} more</Text>}
          </Box>
        )}

        {/* Keybindings hint */}
        <Box flexGrow={1} />
        <Box>
          <Text dimColor>h/Esc:close Space:status</Text>
        </Box>
      </ErrorBoundary>
    </Box>
  )
}

// =============================================================================
// Helper Functions
// =============================================================================

// Due date urgency levels
type DueUrgency = "overdue" | "urgent" | "soon" | "normal"

// Format date for display (e.g., "Jan 10" or "2026-01-10") with urgency info
function formatDate(dateStr: string | undefined): {
  text: string
  urgency: DueUrgency
} {
  if (!dateStr) return { text: "", urgency: "normal" }
  try {
    // Parse date string as local date to avoid timezone issues
    // YYYY-MM-DD should be treated as local midnight, not UTC midnight
    const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    const date = parts ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) : new Date(dateStr)

    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const dateLocal = new Date(date)
    dateLocal.setHours(0, 0, 0, 0)

    // Calculate days until due
    const daysUntilDue = Math.floor((dateLocal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    // Determine urgency
    let urgency: DueUrgency = "normal"
    if (daysUntilDue < 0) {
      urgency = "overdue"
    } else if (daysUntilDue <= 1) {
      urgency = "urgent" // Due today or tomorrow
    } else if (daysUntilDue <= 3) {
      urgency = "soon" // Due within 3 days
    }

    // Format display text
    const sameYear = date.getFullYear() === now.getFullYear()
    const text = sameYear
      ? date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : dateStr

    return { text, urgency }
  } catch {
    return { text: dateStr, urgency: "normal" }
  }
}

// Status display with color
const STATUS_DISPLAY: Record<string, { text: string; color: string }> = {
  done: { text: "done", color: "green" },
  wip: { text: "wip", color: "yellow" },
  blocked: { text: "blocked", color: "red" },
  dropped: { text: "dropped", color: "gray" },
}

function getStatusDisplay(status?: string): { text: string; color: string } {
  return STATUS_DISPLAY[status ?? ""] ?? { text: "todo", color: "blue" }
}

// Extract references from content
interface References {
  mentions: string[]
  tags: string[]
  projects: string[]
  wikilinks: string[]
}

// Extract unique matches from content using a regex pattern
function extractMatches(content: string, pattern: RegExp): string[] {
  const matches = new Set<string>()
  let match
  while ((match = pattern.exec(content)) !== null) {
    if (match[1]) matches.add(match[1])
  }
  return [...matches]
}

function extractReferences(content: string | undefined): References {
  if (!content) {
    return { mentions: [], tags: [], projects: [], wikilinks: [] }
  }
  return {
    mentions: extractMatches(content, /@(\w+)/g),
    tags: extractMatches(content, /#(\w+)/g),
    projects: extractMatches(content, /\+(\w+)/g),
    wikilinks: extractMatches(content, /\[\[([^\]]+)\]\]/g),
  }
}

// Build project path (ancestors to root)
function getProjectPath(repo: Repo, node: KNode): string[] {
  const path: string[] = []
  let currentId = node.parent_id

  while (currentId) {
    const parent = repo.getNode(currentId)
    if (!parent) break

    // Only include folders and files (not sections or the board root)
    if (parent.type === "oi" && (parent.fstype === "folder" || parent.fstype === "file" || parent.fstype === "mdfile")) {
      path.unshift(getNodeDisplayName(repo, parent))
    }
    currentId = parent.parent_id
  }

  return path
}

// Export for testing
export { extractReferences, formatDate, getStatusDisplay, getProjectPath }
