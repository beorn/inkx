/**
 * <ToolCallStatusTitle>
 *
 * Tool-call title with a neutral transcript grammar:
 *
 *   <bold first word> rest of title
 *
 * Examples: `Read filename`, `Wrote filename`, `Todo added item`.
 * Bash/execute rows pass `shell`, which renders the entire command bold
 * after a `$` marker owned by the parent `<ToolCall>` row.
 * The `kind` prop is retained on the API for callers that branch on it
 * but no longer affects the rendered text.
 *
 * Bead: km-silvercode.tool-call-rendering-v2 (was: km-silvercode.acp-tool-call).
 */

import React from "react"
import { Box, Text, TextShimmer } from "silvery"
import type { ToolCallStatus, ToolKind } from "@km/agent-harness"

// =============================================================================
// Component
// =============================================================================

export interface ToolCallStatusTitleProps {
  /** ACP `ToolCallStatus` — drives the animation choice. */
  status: ToolCallStatus
  /** ACP `ToolKind`. Retained on the API but no longer affects the text. */
  kind?: ToolKind
  /** The base title from the `ToolCall.title` field. */
  title: string
  /**
   * Override the auto-derived label entirely. Use when the ACP title is a
   * structured phrase that doesn't fit the verb scaffolding ("Read 3 files").
   */
  label?: string
  /** Shell commands render the whole command in bold after the `$` marker. */
  shell?: boolean
}

export function ToolCallStatusTitle({
  status,
  kind: _kind,
  title,
  label,
  shell = false,
}: ToolCallStatusTitleProps): React.ReactElement {
  const text = label ?? title

  if (status === "in_progress") {
    return (
      <TextShimmer active bold>
        {text}
      </TextShimmer>
    )
  }

  if (shell) {
    return (
      <Text bold color="$fg">
        {text}
      </Text>
    )
  }

  const split = text.match(/^(\S+)(?:\s+([\s\S]*))?$/)
  const action = split?.[1] ?? text
  const rest = split?.[2] ?? ""

  return (
    <Box flexDirection="row" gap={0} flexShrink={1} minWidth={0}>
      <Text bold color="$fg">
        {action}
      </Text>
      {rest.length > 0 ? <Text color="$fg"> {rest}</Text> : null}
    </Box>
  )
}
