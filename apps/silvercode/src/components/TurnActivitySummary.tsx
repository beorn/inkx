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
import { Box, Muted, Text, useHover, usePopoverHandlers } from "silvery"
import type { ToolCall as ToolCallType, ToolKind } from "@km/agent-harness"
import { ToolCall } from "./ToolCall.tsx"

export type TurnActivitySummaryItem = {
  id: string
  toolCall: ToolCallType
  errorMessage?: string
}

export interface TurnActivitySummaryProps {
  items: readonly TurnActivitySummaryItem[]
  defaultExpanded?: boolean
}

const WORDS: Record<ToolKind, { verb: string; noun: string }> = {
  read: { verb: "Read", noun: "file" },
  edit: { verb: "Edited", noun: "file" },
  delete: { verb: "Deleted", noun: "file" },
  move: { verb: "Moved", noun: "file" },
  search: { verb: "Searched", noun: "query" },
  execute: { verb: "Ran", noun: "command" },
  think: { verb: "Updated", noun: "todo" },
  fetch: { verb: "Fetched", noun: "resource" },
  switch_mode: { verb: "Switched", noun: "mode" },
  other: { verb: "Used", noun: "tool" },
}

function phrase(kind: ToolKind, count: number): string {
  const words = WORDS[kind] ?? WORDS.other
  const noun = count === 1 ? words.noun : `${words.noun}s`
  return `${words.verb} ${count} ${noun}`
}

function summaryParts(items: readonly TurnActivitySummaryItem[]): string[] {
  const counts = new Map<ToolKind, number>()
  for (const item of items) {
    const kind = item.toolCall.kind ?? "other"
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
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
    const count = counts.get(kind) ?? 0
    return count > 0 ? [phrase(kind, count)] : []
  })
}

function hasFailure(items: readonly TurnActivitySummaryItem[]): boolean {
  return items.some((item) => item.toolCall.status === "failed")
}

function detailsPreview(items: readonly TurnActivitySummaryItem[]): React.ReactElement {
  return (
    <Box flexDirection="column" paddingY={1}>
      {items.map((item) => (
        <ToolCall key={item.id} toolCall={item.toolCall} errorMessage={item.errorMessage} defaultExpanded />
      ))}
    </Box>
  )
}

export function TurnActivitySummary({ items, defaultExpanded = false }: TurnActivitySummaryProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  const popover = usePopoverHandlers({ body: detailsPreview(items), maxWidth: 100 })
  const parts = summaryParts(items)
  const text = parts.length > 0 ? parts.join(", ") : `${items.length} tool ${items.length === 1 ? "call" : "calls"}`
  const failed = hasFailure(items)
  const rowBg = isHovered ? "$bg-surface-hover" : undefined

  function onEnter(e: Parameters<typeof onMouseEnter>[0]): void {
    onMouseEnter(e)
    popover.onMouseEnter(e)
  }

  function onLeave(e: Parameters<typeof onMouseLeave>[0]): void {
    onMouseLeave(e)
    popover.onMouseLeave(e)
  }

  return (
    <Box flexDirection="column" width="100%">
      <Box
        flexDirection="row"
        gap={1}
        width="100%"
        backgroundColor={rowBg}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={() => setExpanded((v) => !v)}
      >
        <Muted>{expanded ? "▾" : "▸"}</Muted>
        <Text bold color={failed ? "$danger" : "$primary"}>
          Turn activity
        </Text>
        <Text color="$muted" wrap="truncate">
          {text}
        </Text>
        <Box flexGrow={1} />
      </Box>
      {expanded ? (
        <Box flexDirection="column">
          {items.map((item) => (
            <ToolCall key={item.id} toolCall={item.toolCall} errorMessage={item.errorMessage} defaultExpanded />
          ))}
        </Box>
      ) : null}
    </Box>
  )
}
