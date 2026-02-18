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
import { extractBody, stripForDisplay } from "@km/tree"
import { useRepo, type Repo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { renderRich, renderPlain, getNodeIcon } from "../text/index.ts"
import { NodeLine } from "./shared-components.tsx"
import {
  formatDate,
  getStatusDisplay,
  extractReferences,
  getProjectPath,
  stripInlineRefs,
  capitalize,
} from "./detail-pane-helpers.ts"

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

  const statusInfo = getStatusDisplay(node.task_status)
  const isDone = node.task_status === "done" || node.task_status === "dropped"
  const dueParts = decomposeDatetime(node.due_at)
  const startParts = decomposeDatetime(node.start_at)
  const dueDate = formatDate(dueParts?.date)
  const assignedTo = node.assigned_to

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

  // Get children — split into body (content blocks) and structural (outline items)
  const children = repo.getChildren(node.id)
  const { body: bodyChildren, items: structuralChildren } = extractBody(children)

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

  // Check if we have any references to show
  const hasRefs =
    refs.mentions.length > 0 || refs.tags.length > 0 || refs.projects.length > 0 || refs.wikilinks.length > 0

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
      <ErrorBoundary fallback={<Text color="red">Error loading details</Text>}>
        {/* Title - rich rendered, stripped of refs shown separately below */}
        <Box width={innerWidth}>
          <Text bold wrap="wrap">
            {renderRich(stripInlineRefs(title))}
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
                dimColor={isDone}
                color={
                  isDone
                    ? undefined
                    : node.priority === 1
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
                dimColor={isDone}
                color={
                  isDone
                    ? undefined
                    : dueDate.urgency === "overdue"
                      ? "red"
                      : dueDate.urgency === "urgent"
                        ? "yellow"
                        : undefined
                }
                underline={
                  isDone
                    ? false
                    : dueDate.urgency === "overdue" || dueDate.urgency === "urgent" || dueDate.urgency === "soon"
                }
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
              <Text dimColor={isDone}>{formatDate(startParts.date).text}</Text>
              {startParts.time && <Text dimColor> {startParts.time}</Text>}
            </Text>
          </Box>
        )}

        {node.recurrence && (
          <Box>
            <Text>
              <Text dimColor>Recurrence: </Text>
              <Text dimColor={isDone}>{node.recurrence}</Text>
            </Text>
          </Box>
        )}

        {assignedTo && (
          <Box flexDirection="row" gap={2}>
            <Text>
              <Text dimColor>Assigned: </Text>
              <Text dimColor={isDone} color={isDone ? undefined : "magenta"}>
                @{assignedTo}
              </Text>
            </Text>
          </Box>
        )}

        {/* Project path */}
        {projectPath.length > 0 && (
          <Box>
            <Text>
              <Text dimColor>Project: </Text>
              <Text dimColor={isDone} color={isDone ? undefined : "green"}>
                +{projectPath.map(renderPlain).join("/")}
              </Text>
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

        {/* Structured metadata (created::, completed::, etc.) */}
        <DataFields entries={Object.entries((node.data?.metadata as Record<string, string>) ?? {})} />

        {/* Block ID */}
        {node.block_id && (
          <Box>
            <Text>
              <Text dimColor>ID: </Text>
              <Text dimColor>^{node.block_id}</Text>
            </Text>
          </Box>
        )}

        {/* Inline properties (key:: value from markdown) */}
        <DataFields entries={Object.entries((node.data?.propsRaw as Record<string, string>) ?? {})} isDone={isDone} />

        {/* Extra data fields (key:value for anything not already rendered) */}
        <DataFields
          entries={Object.entries((node.data as Record<string, unknown>) ?? {}).filter(
            ([k, v]) => !KNOWN_DATA_KEYS.has(k) && v != null && v !== "",
          )}
          capitalizeKey={false}
        />

        {/* Body content — raw text, stripped of metadata */}
        {bodyChildren.length > 0 && (
          <Box flexDirection="column" marginTop={1} width={innerWidth}>
            {bodyChildren.map((child) => (
              <Text key={child.id} wrap="wrap">
                {stripForDisplay(child.content ?? "")}
              </Text>
            ))}
          </Box>
        )}

        {/* Structural children — outline items (tasks, sections) */}
        {structuralChildren.length > 0 && (
          <Box flexDirection="column" marginTop={bodyChildren.length > 0 ? 0 : 1} width={innerWidth}>
            <OutlineItems repo={repo} items={structuralChildren} depth={0} />
          </Box>
        )}

        {/* Backlinks */}
        {backlinkNodes.length > 0 && (
          <Box flexDirection="column" marginTop={1} width={innerWidth}>
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
// Data Fields — shared renderer for structured metadata/props blocks
// =============================================================================

const KNOWN_DATA_KEYS = new Set([
  "tags",
  "mentions",
  "projects",
  "short_id",
  "props",
  "propsRaw",
  "block_id",
  "metadata",
  "name",
  "title",
  "recurrence",
])

interface DataFieldsProps {
  entries: [string, unknown][]
  isDone?: boolean
  capitalizeKey?: boolean
}

function DataFields({ entries, isDone = false, capitalizeKey = true }: DataFieldsProps): React.ReactElement | null {
  if (entries.length === 0) return null
  return (
    <>
      {entries.map(([k, v]) => (
        <Box key={k}>
          <Text dimColor={isDone}>
            <Text dimColor>{capitalizeKey ? capitalize(k) : k}: </Text>
            <Text>{typeof v === "object" ? JSON.stringify(v) : String(v)}</Text>
          </Text>
        </Box>
      ))}
    </>
  )
}

// =============================================================================
// Node Outline — body content + structural children as unified tree
// =============================================================================

function OutlineItems({ repo, items, depth }: { repo: Repo; items: KNode[]; depth: number }): React.ReactElement {
  return (
    <>
      {items.map((item) => {
        const icon = getNodeIcon(item.task_status, undefined, item.task_marker !== undefined)
        const indent = "  ".repeat(depth)
        const isDone = item.task_status === "done" || item.task_status === "dropped"
        const kids = depth < 2 ? repo.getChildren(item.id) : []
        const { body: kidBody, items: kidItems } = extractBody(kids)
        return (
          <React.Fragment key={item.id}>
            <Text wrap="wrap" dimColor={isDone}>
              {indent}
              <Text color={isDone ? undefined : icon.color}>{icon.char} </Text>
              {renderRich(stripInlineRefs(getNodeDisplayName(repo, item)))}
            </Text>
            {kidBody.map((b) => (
              <Text key={b.id} wrap="wrap" dimColor>
                {indent}
                {"  "}
                {stripForDisplay(b.content ?? "")}
              </Text>
            ))}
            {kidItems.length > 0 && <OutlineItems repo={repo} items={kidItems} depth={depth + 1} />}
          </React.Fragment>
        )
      })}
    </>
  )
}
export { extractReferences, formatDate, getStatusDisplay, getProjectPath } from "./detail-pane-helpers.ts"
