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
import { Box, Text, useHover, useModifierKeys, usePopoverHandlers, type SilveryMouseEvent } from "silvery"
import type { ToolCall as ToolCallType, ToolKind } from "@km/agent-harness"
import { ToolCall, ToolContentForceExpandedProvider, ToolMarkerBackgroundProvider } from "./ToolCall.tsx"
import { Content, useContentLayout } from "./Content.tsx"
import { SessionEntry } from "./SessionEntry.tsx"

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
  onDisclosureToggle?: () => void
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

function detailsPreview(items: readonly TurnActivitySummaryItem[], details?: React.ReactNode): React.ReactElement {
  if (details)
    return (
      <Box flexDirection="column" gap={1}>
        {details}
      </Box>
    )
  return (
    <Box flexDirection="column" gap={1}>
      {items.map((item) => (
        <ToolCall
          key={item.id}
          toolCall={item.toolCall}
          errorMessage={item.errorMessage}
          defaultExpanded
          interactive={false}
        />
      ))}
    </Box>
  )
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

export function TurnActivitySummary({
  items,
  defaultExpanded = false,
  details,
  livePreview,
  timestamp,
  onDisclosureToggle,
}: TurnActivitySummaryProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [forceExpandDetails, setForceExpandDetails] = useState(false)
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  const { super: cmdHeld } = useModifierKeys({ enabled: isHovered })
  const popover = usePopoverHandlers({ body: detailsPreview(items, details), maxWidth: 100 })
  const contentLayout = useContentLayout()
  const parts = summaryParts(items)
  const text = parts.length > 0 ? parts.join(", ") : `${items.length} tool ${items.length === 1 ? "call" : "calls"}`
  const headerBg = isHovered ? "$bg-surface-hover" : undefined
  const markerBg = expanded ? "$bg-surface-subtle" : isHovered ? "$bg-surface-hover" : undefined
  const active = items.some((item) => item.toolCall.status === "in_progress" || item.toolCall.status === "pending")
  const marker = expanded ? "▾" : isHovered ? "▸" : " "
  const markerColor = marker === " " ? "$muted" : "$fg"
  const headerMaxWidth = Math.max(1, contentLayout.measure)
  const showTimestamp = isHovered && cmdHeld

  function onHeaderEnter(e: Parameters<typeof onMouseEnter>[0]): void {
    onMouseEnter(e)
    if (!expanded) popover.onMouseEnter(e)
  }

  function onHeaderLeave(e: Parameters<typeof onMouseLeave>[0]): void {
    onMouseLeave(e)
    if (!expanded) popover.onMouseLeave(e)
  }

  function onHeaderClick(): void {
    onDisclosureToggle?.()
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
        <Box
          flexDirection="column"
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          backgroundColor={headerBg}
        >
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
      <Box
        position="absolute"
        left={-8}
        top={0}
        width={8}
        height={Math.max(1, items.length * 3)}
        onClick={(e: SilveryMouseEvent) => {
          e.stopPropagation()
          setForceExpandDetails(true)
        }}
      />
      <ToolMarkerBackgroundProvider value={markerBg}>
        <ToolContentForceExpandedProvider value={forceExpandDetails}>
          {details ??
            items.map((item) => <ToolCall key={item.id} toolCall={item.toolCall} errorMessage={item.errorMessage} />)}
        </ToolContentForceExpandedProvider>
      </ToolMarkerBackgroundProvider>
    </Box>
  ) : null

  const body = (
    <Content.Body width="prose">
      {collapsed}
      {expandedBody}
    </Content.Body>
  )

  if (timestamp) {
    return (
      <Box flexDirection="column" width="100%">
        <Content.Row>
          <Content.Left>
            <Content.Aside show={showTimestamp}>{timestamp}</Content.Aside>
          </Content.Left>
          {body}
        </Content.Row>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width="100%">
      {body}
    </Box>
  )
}
