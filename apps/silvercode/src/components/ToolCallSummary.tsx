/**
 * <ToolCallSummary>
 *
 * Aggregates a sequence of related ACP `ToolCall`s into a single row
 * ("Read 12 files"). The numeric component uses silvery's `<AnimatedNumber>`
 * so the count rolls smoothly as new calls land — eye catches the change
 * without re-reading the line.
 *
 * Pass `breakdown` (one entry per individual call) and an `expanded` flag;
 * when expanded, the summary unfurls into the per-call list. The collapse
 * toggle is owned by the parent (the consumer typically wires it to a row
 * click or focus). Keeping it controlled here avoids each summary owning
 * its own `useState` — important when many summaries stack.
 *
 * Bead: km-silvercode.acp-tool-call.
 */

import React from "react"
import { AnimatedNumber, Box, Muted, Text } from "silvery"
import type { ToolKind } from "@km/agent-harness"
import { formatPathForDisplay } from "../utils/format-path.ts"

// =============================================================================
// Vocabulary — past-tense + plural noun, mirrors ToolCallStatusTitle.
// =============================================================================

/**
 * Per-kind summary phrasing. Pluralization is handled in `phrase()` so the
 * vocabulary stays a flat data table — easier to extend than a switch.
 */
const SUMMARY: Record<ToolKind, { verb: string; noun: string }> = {
  read: { verb: "Read", noun: "file" },
  edit: { verb: "Edited", noun: "file" },
  delete: { verb: "Deleted", noun: "file" },
  move: { verb: "Moved", noun: "file" },
  search: { verb: "Searched", noun: "query" },
  execute: { verb: "Ran", noun: "command" },
  think: { verb: "Thought", noun: "step" },
  fetch: { verb: "Fetched", noun: "resource" },
  switch_mode: { verb: "Switched", noun: "mode" },
  other: { verb: "Ran", noun: "tool" },
}

function phrase(kind: ToolKind, count: number): { lead: string; trail: string } {
  const v = SUMMARY[kind] ?? SUMMARY.other
  const noun = count === 1 ? v.noun : `${v.noun}s`
  return { lead: v.verb, trail: noun }
}

// =============================================================================
// Component
// =============================================================================

/** A single entry contributing to a summary — used for the breakdown popover. */
export interface ToolCallSummaryEntry {
  /** Stable id (typically the ACP `ToolCallId`). */
  id: string
  /** One-line label for the call ("/Users/foo/bar.ts", "ls -la"). */
  label: string
}

export interface ToolCallSummaryProps {
  /** ACP `ToolKind` — drives the verb + noun. */
  kind: ToolKind
  /** Count of aggregated calls. Rendered via `<AnimatedNumber>`. */
  count: number
  /** Per-call labels for the breakdown panel. Optional — when omitted,
   *  the summary is read-only. */
  breakdown?: ReadonlyArray<ToolCallSummaryEntry>
  /** Controlled expanded state. */
  expanded?: boolean
  /** Toggle handler — fires on header click. */
  onToggle?: () => void
}

export function ToolCallSummary({
  kind,
  count,
  breakdown,
  expanded = false,
  onToggle,
}: ToolCallSummaryProps): React.ReactElement {
  const { lead, trail } = phrase(kind, count)
  const canExpand = (breakdown?.length ?? 0) > 0

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="$border"
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      onClick={canExpand ? onToggle : undefined}
    >
      <Box flexDirection="row" gap={1}>
        <Text color="$accent">∑</Text>
        <Text bold color="$primary">
          {lead}{" "}
        </Text>
        {/* Bold + animated: the count is the data the eye should catch. */}
        <AnimatedNumber value={count} duration={400} bold color="$primary" />
        <Text color="$primary"> {trail}</Text>
        <Box flexGrow={1} />
      </Box>
      {expanded && breakdown ? (
        <Box flexDirection="column">
          {breakdown.map((entry) => (
            <Box key={entry.id} flexDirection="row" gap={1}>
              <Muted>·</Muted>
              {/* Tilde-shorten breakdown labels — they are typically file
                  paths the underlying tool calls touched. Non-path labels
                  (commands, queries) are returned verbatim by
                  formatPathForDisplay. */}
              <Text wrap="truncate">{formatPathForDisplay(entry.label)}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}
