/**
 * DetailView — renders the detail pane as a single column.
 *
 * Shows the focused item's metadata properties as navigable rows,
 * followed by tree children as Card components (matching column card
 * rendering: borders, fold indicators, overflow counts, virtualization).
 *
 * Cursor navigation: j/k moves through __meta__ property rows first,
 * then tree children. The cursor ID uses the DETAIL_META_PREFIX
 * convention (e.g., "__meta__Status", "__meta__Due").
 */

import React, { useCallback, useMemo } from "react"
import { Box, Text, Small } from "@silvery/react"
import type { KNode } from "@km/core"
import { decomposeDatetime } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import { useNodeStore, useReactive } from "../reactive.ts"
import { getNodeDisplayName } from "../state.ts"
import { DETAIL_META_PREFIX, computeMetadataKeys } from "./detail-pane-items.ts"
import { getStatusDisplay, formatDate, resolveProjectDisplayNames } from "./detail-pane-helpers.ts"
import { parseDepsRefs } from "./tree-node-helpers.tsx"
import { Card } from "./CardColumn.tsx"
import { ScrollTrackingVirtualList } from "./ScrollTracker.tsx"
import { useTreeRenderContext } from "../ui-context.tsx"

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
  const { treeConfig } = useTreeRenderContext()

  const rootNode = rootId ? repo.getNode(rootId) : null
  if (!rootNode) {
    return (
      <Box flexDirection="column" width={width} height={height} paddingX={1}>
        <Small>(no item selected)</Small>
      </Box>
    )
  }

  // Compute metadata keys and children
  const metaKeys = computeMetadataKeys(rootNode)
  const children = useMemo(() => repo.getChildren(rootId), [repo, rootId])

  // Effective content width (minus padding)
  const contentWidth = Math.max(8, width - 2)

  // Height consumed by metadata section (rows + separator)
  const metaHeight = metaKeys.length + (metaKeys.length > 0 && children.length > 0 ? 1 : 0)
  // Remaining height for children cards (virtualized)
  const childrenHeight = Math.max(1, height - metaHeight)

  // Card width matches column convention: width - 1 for scroll indicator space
  const cardWidth = Math.max(8, width - 1)

  // Stable renderItem callback for VirtualList — Card self-subscribes to cursor
  const renderItem = useCallback(
    (child: KNode, index: number) => (
      <Card key={child.id} card={child} width={cardWidth} colIndex={0} cardIndex={index} />
    ),
    [cardWidth],
  )

  const keyExtractor = useCallback((child: KNode) => child.id, [])

  return (
    <Box flexDirection="column" width={width} height={height} overflow="hidden">
      {/* Title is shown in the pane bar — no duplicate header needed */}

      {/* Scrollable content: metadata rows + children */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {/* Metadata property rows */}
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

        {/* Separator between metadata and children */}
        {metaKeys.length > 0 && children.length > 0 && (
          <Box height={1} flexShrink={0} width={width}>
            <Text color="$disabled-fg">{"\u2500".repeat(Math.max(0, width))}</Text>
          </Box>
        )}

        {/* Children as Cards — uses Card infrastructure for borders, fold
            indicators, overflow counts, and VirtualList for virtualization.
            Matches column card rendering (embedding rule). */}
        {children.length > 0 ? (
          <ScrollTrackingVirtualList
            isSelected={true}
            items={children}
            width={cardWidth}
            height={childrenHeight}
            itemHeight={treeConfig.maxContentLines + 2}
            overscan={2}
            maxRendered={20}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
          />
        ) : metaKeys.length === 0 ? (
          /* Empty state — no metadata and no children */
          <Box paddingX={1}>
            <Small>(empty)</Small>
          </Box>
        ) : null}
      </Box>
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
