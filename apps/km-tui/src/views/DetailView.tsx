/**
 * DetailView — renders a node as a readable document.
 *
 * Layout: metadata rows at top, then the content tree rendered as a
 * document outline — headings, body paragraphs, task items with markers,
 * nested lists with indentation. Like reading the .md file in the TUI.
 *
 * Cursor navigation: j/k moves through __meta__ property rows first,
 * then document lines. The cursor ID uses the DETAIL_META_PREFIX
 * convention (e.g., "__meta__Status", "__meta__Due").
 */

import React, { useMemo } from "react"
import { Box, Text, Small, H1, H2, H3, Muted, Blockquote, CodeBlock, HR } from "@silvery/ag-react"
import { KNode, type KNode as KNodeType } from "@km/core"
import { decomposeDatetime } from "@km/core"
import { getStatusIcon } from "../icons.ts"
import { InlineText } from "../text/InlineComponents.tsx"
import { useRepo } from "../repo-context.tsx"
import { useNodeStore, useReactive } from "../reactive.ts"
import { getNodeDisplayName } from "../state.ts"
import { DETAIL_META_PREFIX, computeMetadataKeys } from "./detail-pane-items.ts"
import { getStatusDisplay, formatDate, resolveProjectDisplayNames } from "./detail-pane-helpers.ts"
import { resolveEmbed } from "./embed-display.ts"
import { parseDepsRefs } from "./tree-node-helpers.tsx"

// =============================================================================
// DetailView Component
// =============================================================================

export interface DetailViewProps {
  /** Root node ID (the item being detailed) */
  rootId: string | null
  /** Available width */
  width: number
  /** Available height */
  height: number
}

/**
 * Detail view — single column showing item properties + children.
 *
 * Layout:
 * - Title header (item name with icon, selection-colored background)
 * - Separator
 * - Metadata property rows (navigable with j/k via __meta__ cursor IDs)
 * - Separator (if both properties and children exist)
 * - Tree children rendered as Cards (matching column card infrastructure)
 *
 * Children use the same Card infrastructure as CardColumn: bordered cards
 * with fold indicators, overflow counts, and VirtualList virtualization.
 */
export function DetailView({ rootId, width, height }: DetailViewProps): React.ReactElement {
  const repo = useRepo()
  const nodeStore = useNodeStore()
  const cursorCardNodeId = useReactive(nodeStore.cursorCardNodeId)

  const rawNode = rootId ? repo.getNode(rootId) : null
  const { displayNode } = rawNode ? resolveEmbed(repo, rawNode) : { displayNode: null }
  const rootNode = displayNode ?? rawNode
  const effectiveId = rootNode?.id ?? rootId
  if (!rootNode) {
    return (
      <Box flexDirection="column" width={width} height={height} paddingX={1}>
        <Small>(no item selected)</Small>
      </Box>
    )
  }

  const metaKeys = computeMetadataKeys(rootNode)
  const children = useMemo(() => repo.getChildren(effectiveId), [repo, effectiveId])
  const contentWidth = Math.max(8, width - 2)

  const title = rootNode.content ?? rootNode.name ?? "(untitled)"

  return (
    <Box flexDirection="column" width={width} height={height} overflow="hidden">
      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingRight={2}>
        {/* Document title — H1 */}
        <Box paddingX={1}>
          <H1 wrap="wrap">
            <InlineText text={title} />
          </H1>
        </Box>

        {/* Metadata property rows */}
        {metaKeys.length > 0 && (
          <>
            <Box height={1} />
            {metaKeys.map((key) => {
              const metaId = `${DETAIL_META_PREFIX}${key}`
              const isSelected = cursorCardNodeId === metaId
              return (
                <MetadataRow
                  key={key}
                  metaId={metaId}
                  label={key}
                  node={rootNode}
                  isSelected={isSelected}
                  width={contentWidth}
                />
              )
            })}
          </>
        )}

        {/* Separator */}
        {(metaKeys.length > 0 || true) && children.length > 0 && (
          <Box height={1} flexShrink={0} width={width}>
            <HR />
          </Box>
        )}

        {/* Doc-style content tree — headings start at depth 1 (H2) since title is H1 */}
        {children.length > 0 ? (
          <DocContent nodes={children} depth={1} repo={repo} cursorNodeId={cursorCardNodeId} />
        ) : metaKeys.length === 0 ? (
          <Box paddingX={1}>
            <Small>(empty)</Small>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

// =============================================================================
// DocContent — renders a node tree as a readable document
// =============================================================================

interface DocContentProps {
  nodes: KNodeType[]
  depth: number
  repo: { getChildren(parentId: string): KNodeType[]; getNode(id: string): KNodeType | null }
  cursorNodeId?: string | null
}

const MAX_DOC_DEPTH = 6

function DocContent({ nodes, depth, repo, cursorNodeId }: DocContentProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {nodes.map((node) => (
        <DocNode key={node.id} node={node} depth={depth} repo={repo} cursorNodeId={cursorNodeId} />
      ))}
    </Box>
  )
}

function DocNode({
  node,
  depth,
  repo,
  cursorNodeId,
}: {
  node: KNodeType
  depth: number
  repo: DocContentProps["repo"]
  cursorNodeId?: string | null
}): React.ReactElement {
  const children = useMemo(() => repo.getChildren(node.id), [repo, node.id])
  const content = node.content ?? node.name ?? ""
  const isHeading = KNode.isOutline(node)
  const isTask = KNode.isTask(node)
  const isItem = KNode.isItem(node)
  const isCursor = node.id === cursorNodeId
  const indent = depth * 2

  const bg = isCursor ? "$selection-bg" : undefined
  const cursorProps = isCursor ? { "data-cursor": true } : {}

  // ── Heading ── H2/H3/muted-bold with spacing
  // Headings do NOT indent their children — content flows at current indent level.
  // A blank line after the heading provides visual separation.
  if (isHeading) {
    const Heading = depth <= 1 ? H2 : depth === 2 ? H3 : null
    const headingColor = isCursor ? "$selection" : undefined
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Box id={node.id} paddingLeft={indent} backgroundColor={bg} {...cursorProps}>
          {Heading ? (
            <Heading color={headingColor} wrap="wrap">
              <InlineText text={content} />
            </Heading>
          ) : (
            <Text bold color={headingColor ?? "$muted"} wrap="wrap">
              <InlineText text={content} />
            </Text>
          )}
        </Box>
        <Box height={1} />
        {children.length > 0 && depth < MAX_DOC_DEPTH && (
          <DocContent nodes={children} depth={depth} repo={repo} cursorNodeId={cursorNodeId} />
        )}
      </Box>
    )
  }

  // ── Task item ── status icon + content (matching board card style)
  if (isTask) {
    const icon = getStatusIcon(node.task_status ?? "todo")
    const isDone = node.task_status === "done" || node.task_status === "dropped"
    const textColor = isCursor ? "$selection" : isDone ? "$muted" : undefined
    return (
      <Box flexDirection="column">
        <Box id={node.id} paddingLeft={indent} backgroundColor={bg} {...cursorProps}>
          <Text color={isCursor ? "$selection" : icon.color}>{icon.char} </Text>
          <Text color={textColor} strikethrough={isDone} wrap="wrap">
            <InlineText text={content} />
          </Text>
        </Box>
        {children.length > 0 && depth < MAX_DOC_DEPTH && (
          <DocContent nodes={children} depth={depth + 1} repo={repo} cursorNodeId={cursorNodeId} />
        )}
      </Box>
    )
  }

  // ── List item ── bullet + content
  if (isItem) {
    return (
      <Box flexDirection="column">
        <Box id={node.id} paddingLeft={indent} backgroundColor={bg} {...cursorProps}>
          <Text color={isCursor ? "$selection" : "$muted"}>{node.list_marker ?? "•"} </Text>
          <Text color={isCursor ? "$selection" : undefined} wrap="wrap">
            <InlineText text={content} />
          </Text>
        </Box>
        {children.length > 0 && depth < MAX_DOC_DEPTH && (
          <DocContent nodes={children} depth={depth + 1} repo={repo} cursorNodeId={cursorNodeId} />
        )}
      </Box>
    )
  }

  // ── Block content (paragraph, quote, code, hr) ──
  if (node.type === "hr") {
    return (
      <Box paddingLeft={indent}>
        <HR />
      </Box>
    )
  }
  if (!content) return <Box />
  if (node.type === "quote") {
    return (
      <Box paddingLeft={indent}>
        <Blockquote>
          <InlineText text={content} />
        </Blockquote>
      </Box>
    )
  }
  if (node.type === "code") {
    return (
      <Box paddingLeft={indent}>
        <CodeBlock>{content}</CodeBlock>
      </Box>
    )
  }
  // Paragraph
  return (
    <Box paddingLeft={indent}>
      <Text wrap="wrap">
        <InlineText text={content} />
      </Text>
    </Box>
  )
}

// =============================================================================
// MetadataRow — renders a single property row with label + value
// =============================================================================

interface MetadataRowProps {
  /** Virtual cursor ID for this row (e.g., "__meta__Status") */
  metaId: string
  /** Property label (e.g., "Status", "Due", "Priority") */
  label: string
  /** The node whose metadata to display */
  node: KNode
  /** Whether this row is currently selected */
  isSelected: boolean
  /** Available width */
  width: number
}

/** Label column width for metadata rows */
const LABEL_WIDTH = 12

/**
 * Renders a single metadata property row: [label] [value]
 *
 * Selection highlighting uses $selection/$selection tokens,
 * which the per-pane theme dims for unfocused panes.
 */
function MetadataRow({ metaId, label, node, isSelected, width }: MetadataRowProps): React.ReactElement {
  const repo = useRepo()
  const bg = isSelected ? "$selection-bg" : undefined
  const fg = isSelected ? "$selection" : undefined
  const labelColor = isSelected ? "$selection" : "$muted"

  const value = getMetadataValue(label, node, repo)

  return (
    <Box
      id={metaId}
      height={1}
      flexShrink={0}
      width={width + 2}
      backgroundColor={bg}
      flexDirection="row"
      {...(isSelected && { "data-cursor": true })}
    >
      <Box width={1} flexShrink={0} />
      <Box width={LABEL_WIDTH} flexShrink={0}>
        <Text color={labelColor} wrap="truncate">
          {label}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text color={fg} wrap="truncate">
          {value.element ?? value.text}
        </Text>
      </Box>
    </Box>
  )
}

// =============================================================================
// Metadata value resolution
// =============================================================================

interface MetadataValue {
  text: string
  element?: React.ReactElement
}

/**
 * Resolve the display value for a metadata property key.
 * Returns plain text and optionally a styled React element.
 */
function getMetadataValue(key: string, node: KNode, repo: import("../repo-context.tsx").Repo): MetadataValue {
  const data = node.data as Record<string, unknown> | undefined
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>

  switch (key) {
    case "Status": {
      const status = getStatusDisplay(node.task_status)
      return {
        text: status.text,
        element: <Text color={status.color}>{status.text}</Text>,
      }
    }
    case "Priority": {
      const p = node.priority
      return { text: p ? `P${p}` : "none" }
    }
    case "Due": {
      const dueParts = decomposeDatetime(node.due_at)
      if (!dueParts?.date) return { text: "none" }
      const { text, urgency } = formatDate(dueParts.date)
      const color = urgency === "overdue" ? "$error" : urgency === "urgent" ? "$warning" : undefined
      return {
        text,
        element: color ? <Text color={color}>{text}</Text> : undefined,
      }
    }
    case "Start": {
      const startParts = decomposeDatetime(node.start_at)
      return { text: startParts?.date ?? "none" }
    }
    case "Recurrence":
      return { text: node.rrule ?? "none" }
    case "Created":
      return { text: String(metadata.created ?? "") }
    case "Completed":
      return { text: String(metadata.completed ?? "") }
    case "Assigned":
      return { text: node.assigned_to ?? "none" }
    case "Projects": {
      const projectMemberships = data?.projectMemberships as Array<{ project: string }> | undefined
      const slugs = projectMemberships?.map((p) => p.project) ?? []
      const names = resolveProjectDisplayNames(repo, slugs)
      return { text: names.join(", ") || "none" }
    }
    case "Tags": {
      const tags = (data as { tags?: string[] } | undefined)?.tags ?? []
      return { text: tags.map((t) => `#${t}`).join(" ") || "none" }
    }
    case "Mentions": {
      const mentions = (data as { mentions?: string[] } | undefined)?.mentions ?? []
      return { text: mentions.map((m) => `@${m}`).join(" ") || "none" }
    }
    case "Depends on": {
      const deps = data ? parseDepsRefs(data, "deps") : []
      return {
        text:
          deps.map((d) => getNodeDisplayName(repo, repo.getNode(d) ?? ({ content: d } as KNode))).join(", ") || "none",
      }
    }
    case "Blocks": {
      const blocks = data ? parseDepsRefs(data, "blocks") : []
      return {
        text:
          blocks.map((b) => getNodeDisplayName(repo, repo.getNode(b) ?? ({ content: b } as KNode))).join(", ") ||
          "none",
      }
    }
    default: {
      // Check metadata, propsRaw, or data for the key
      const lowerKey = key.toLowerCase()
      if (metadata[lowerKey] !== undefined) return { text: String(metadata[lowerKey]) }
      const propsRaw = (data?.propsRaw ?? {}) as Record<string, unknown>
      if (propsRaw[lowerKey] !== undefined) return { text: String(propsRaw[lowerKey]) }
      if (data?.[lowerKey] !== undefined) return { text: String(data[lowerKey]) }
      // Try original case
      if (metadata[key] !== undefined) return { text: String(metadata[key]) }
      if (propsRaw[key] !== undefined) return { text: String(propsRaw[key]) }
      if (data?.[key] !== undefined) return { text: String(data[key]) }
      return { text: "" }
    }
  }
}
