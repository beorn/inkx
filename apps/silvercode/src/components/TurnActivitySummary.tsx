/**
 * <TurnActivitySummary>
 *
 * Compact per-assistant-turn summary for dense tool activity. The collapsed
 * row gives a friendly sentence ("Read 3 files, ran 1 command") and the
 * expanded body renders the original ToolCall components so command output,
 * diffs, errors, and raw tool payloads remain recoverable.
 *
 * Bead: km-silvercode.turn-activity-summary.
 */

import React, { useState } from "react"
import { Box, Text, lastModifierState, useHover, useModifierKeys, type SilveryMouseEvent } from "silvery"
import type { ContentBlock, ToolCall as ToolCallType, ToolKind } from "@km/agent-harness"
import { ToolCall, ToolContentForceExpandedProvider, ToolMarkerBackgroundProvider } from "./ToolCall.tsx"
import { Content, useContentLayout } from "./Content.tsx"

export type TurnActivitySummaryItem = {
  id: string
  toolCall: ToolCallType
  errorMessage?: string
}

export interface TurnActivitySummaryProps {
  items: readonly TurnActivitySummaryItem[]
  defaultExpanded?: boolean
  details?: React.ReactNode
  livePreview?: React.ReactNode
  timestamp?: string
  width?: "prose" | "wide" | "auto"
  naturalWidth?: number
  onDisclosureToggle?: () => void
  onExpandedChange?: (expanded: boolean) => void
}

const WORDS: Record<ToolKind, { verb: string; activeVerb: string; noun: string }> = {
  read: { verb: "Read", activeVerb: "Reading", noun: "file" },
  edit: { verb: "Edited", activeVerb: "Editing", noun: "file" },
  delete: { verb: "Deleted", activeVerb: "Deleting", noun: "file" },
  move: { verb: "Moved", activeVerb: "Moving", noun: "file" },
  search: { verb: "Searched", activeVerb: "Searching", noun: "query" },
  execute: { verb: "Ran", activeVerb: "Running", noun: "command" },
  think: { verb: "Updated", activeVerb: "Updating", noun: "todo" },
  fetch: { verb: "Fetched", activeVerb: "Fetching", noun: "resource" },
  switch_mode: { verb: "Switched", activeVerb: "Switching", noun: "mode" },
  other: { verb: "Used", activeVerb: "Using", noun: "tool" },
}

type SummaryCount = {
  count: number
  additions: number
  deletions: number
  active: boolean
}

function phrase(kind: ToolKind, summary: SummaryCount): string {
  const count = summary.count
  const words = WORDS[kind] ?? WORDS.other
  const noun = count === 1 ? words.noun : `${words.noun}s`
  const delta =
    kind === "edit" && (summary.additions > 0 || summary.deletions > 0)
      ? ` +${summary.additions} -${summary.deletions}`
      : ""
  const verb = summary.active ? words.activeVerb : words.verb
  return `${verb} ${count} ${noun}${delta}${summary.active ? "..." : ""}`
}

function editDelta(title: string): { additions: number; deletions: number } | null {
  const match = title.match(/\(\+(\d+) -(\d+)\)/)
  if (!match) return null
  return { additions: Number(match[1]), deletions: Number(match[2]) }
}

function summaryParts(items: readonly TurnActivitySummaryItem[]): string[] {
  const counts = new Map<ToolKind, SummaryCount>()
  for (const item of items) {
    const kind = item.toolCall.kind ?? "other"
    const summary = counts.get(kind) ?? { count: 0, additions: 0, deletions: 0, active: false }
    summary.count++
    if (item.toolCall.status === "in_progress" || item.toolCall.status === "pending") summary.active = true
    if (kind === "edit") {
      const delta = editDelta(item.toolCall.title)
      if (delta) {
        summary.additions += delta.additions
        summary.deletions += delta.deletions
      }
    }
    counts.set(kind, summary)
  }
  const order: ToolKind[] = [
    "read",
    "edit",
    "delete",
    "move",
    "search",
    "execute",
    "think",
    "fetch",
    "switch_mode",
    "other",
  ]
  return order.flatMap((kind) => {
    const summary = counts.get(kind)
    return summary && summary.count > 0 ? [phrase(kind, summary)] : []
  })
}

function SummaryText({
  parts,
  expanded,
  backgroundColor,
}: {
  parts: readonly string[]
  expanded: boolean
  backgroundColor?: string
}): React.ReactElement {
  return (
    <Text color={expanded ? "$fg" : "$fg-muted"} bold={expanded} wrap="truncate" backgroundColor={backgroundColor}>
      {parts.flatMap((part, i) => [
        i > 0 ? (
          <Text key={`sep-${i}`} color="$muted" backgroundColor={backgroundColor}>
            {" · "}
          </Text>
        ) : null,
        <Text key={`part-${i}`} backgroundColor={backgroundColor}>
          {part}
        </Text>,
      ])}
    </Text>
  )
}

function textBlockNaturalWidth(block: ContentBlock): number {
  switch (block.type) {
    case "text":
      return Math.max(0, ...block.text.split("\n").map((line) => line.length))
    case "image":
      return block.uri?.length ?? 0
    case "resource_link":
      return block.uri.length
    case "audio":
    case "resource":
      return 0
  }
}

function toolContentNaturalWidth(content: NonNullable<ToolCallType["content"]>[number]): number {
  if (content.type === "diff") {
    const oldWidth = Math.max(0, ...(content.oldText ?? "").split("\n").map((line) => line.length + 1))
    const newWidth = Math.max(0, ...content.newText.split("\n").map((line) => line.length + 1))
    return Math.max(content.path.length, oldWidth, newWidth)
  }
  if (content.type === "content") return textBlockNaturalWidth(content.content)
  if (content.type === "terminal") return content.terminalId.length
  return 0
}

function itemNaturalWidth(item: TurnActivitySummaryItem): number {
  const titleWidth = item.toolCall.title.length
  const contentWidth = Math.max(0, ...(item.toolCall.content ?? []).map(toolContentNaturalWidth))
  const errorWidth = item.errorMessage ? Math.max(0, ...item.errorMessage.split("\n").map((line) => line.length)) : 0
  // One marker cell plus one gap before the title/content column.
  return 2 + Math.max(titleWidth, contentWidth, errorWidth)
}

function summaryNaturalWidth(items: readonly TurnActivitySummaryItem[], fallbackText: string): number {
  return Math.max(fallbackText.length + 2, ...items.map(itemNaturalWidth))
}

export function TurnActivitySummary({
  items,
  defaultExpanded = false,
  details,
  livePreview,
  timestamp,
  width = "prose",
  naturalWidth,
  onDisclosureToggle,
  onExpandedChange,
}: TurnActivitySummaryProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [forceExpandDetails, setForceExpandDetails] = useState(false)
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  const modifierState = useModifierKeys({ enabled: isHovered })
  const cmdHeld = modifierState.super || lastModifierState.super
  const contentLayout = useContentLayout()
  const parts = summaryParts(items)
  const text = parts.length > 0 ? parts.join(", ") : `${items.length} tool ${items.length === 1 ? "call" : "calls"}`
  const headerBg = isHovered ? "$bg-surface-hover" : undefined
  const markerBg = expanded ? "$bg-surface-subtle" : isHovered ? "$bg-surface-hover" : undefined
  const active = items.some((item) => item.toolCall.status === "in_progress" || item.toolCall.status === "pending")
  const marker = expanded ? "▾" : isHovered ? "▸" : " "
  const markerColor = marker === " " ? "$muted" : "$fg"
  const headerMaxWidth = Math.max(1, contentLayout.measure)
  const expandedNaturalWidth = naturalWidth ?? summaryNaturalWidth(items, text)
  const showTimestamp = isHovered && cmdHeld
  const separateExpandedBody = items.length > 8

  function onHeaderEnter(e: Parameters<typeof onMouseEnter>[0]): void {
    onMouseEnter(e)
  }

  function onHeaderLeave(e: Parameters<typeof onMouseLeave>[0]): void {
    onMouseLeave(e)
  }

  function onHeaderClick(): void {
    onDisclosureToggle?.()
    const next = !expanded
    onExpandedChange?.(next)
    setExpanded((v) => {
      if (v) setForceExpandDetails(false)
      return !v
    })
  }

  const collapsed = (
    <Box flexDirection="column" width="100%">
      <Box
        width="100%"
        maxWidth={headerMaxWidth}
        flexDirection="row"
        flexShrink={1}
        minWidth={0}
        backgroundColor={headerBg}
        onMouseEnter={onHeaderEnter}
        onMouseLeave={onHeaderLeave}
        onClick={onHeaderClick}
      >
        <Box width={1} flexShrink={0} backgroundColor={markerBg}>
          <Text color={markerColor} backgroundColor={markerBg}>
            {marker}
          </Text>
        </Box>
        <Box width={1} flexShrink={0} backgroundColor={headerBg}>
          <Text backgroundColor={headerBg}> </Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} backgroundColor={headerBg}>
          <SummaryText parts={parts.length > 0 ? parts : [text]} expanded={expanded} backgroundColor={headerBg} />
          <Box flexGrow={1} />
        </Box>
      </Box>
      {active && livePreview ? (
        <Box flexDirection="column" paddingLeft={2} width="100%" minWidth={0}>
          {livePreview}
        </Box>
      ) : null}
    </Box>
  )

  const expandedBody = expanded ? (
    <Box
      flexDirection="column"
      position="relative"
      gap={0}
      onClick={(e: SilveryMouseEvent) => {
        e.stopPropagation()
        setForceExpandDetails(true)
      }}
      onMouseDown={() => {
        onDisclosureToggle?.()
      }}
    >
      <ToolMarkerBackgroundProvider value={markerBg}>
        <ToolContentForceExpandedProvider value={forceExpandDetails}>
          {separateExpandedBody ? (
            <Box height={1}>
              <Text> </Text>
            </Box>
          ) : null}
          {details ??
            items.map((item) => <ToolCall key={item.id} toolCall={item.toolCall} errorMessage={item.errorMessage} />)}
        </ToolContentForceExpandedProvider>
      </ToolMarkerBackgroundProvider>
    </Box>
  ) : null

  const collapsedBody = <Content.Body width="prose">{collapsed}</Content.Body>
  const expandedBodyRow = expandedBody ? (
    <Content.Row>
      {width === "auto" ? (
        <Content.Auto naturalWidth={expandedNaturalWidth}>{expandedBody}</Content.Auto>
      ) : (
        <Content.Body width={width}>{expandedBody}</Content.Body>
      )}
    </Content.Row>
  ) : null

  if (timestamp) {
    return (
      <Box flexDirection="column" width="100%">
        <Content.Row>
          <Content.Left>
            <Content.Aside show={showTimestamp}>{timestamp}</Content.Aside>
          </Content.Left>
          {collapsedBody}
        </Content.Row>
        {expandedBodyRow}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width="100%">
      <Content.Row>{collapsedBody}</Content.Row>
      {expandedBodyRow}
    </Box>
  )
}
