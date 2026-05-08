/**
 * <ToolCallStatusTitle>
 *
 * Tool-call title with a neutral transcript grammar. Tool rows are muted and
 * non-bold by default so commands, reads, writes, and miscellaneous tools read
 * as one activity stream; failures pass an error color from the parent.
 * The `kind` prop is retained on the API for callers that branch on it
 * but no longer affects the rendered text.
 *
 * Bead: km-silvercode.tool-call-rendering-v2 (was: km-silvercode.acp-tool-call).
 */

import React from "react"
import { Box, Text, useBoxRect } from "silvery"
import type { ToolCallStatus, ToolKind } from "@km/agent-harness"
import { LinkifiedText } from "./LinkifiedText.tsx"
import { useContentLayout } from "./Content.tsx"

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
  /** Shell commands render the whole command after the `$` marker. */
  shell?: boolean
  /** Optional text color override, used to mute collapsed shell commands. */
  color?: string
  /** Linkify file/image references inside non-shell titles. */
  linkify?: boolean
  /** Long titles stay single-line by default; expanded summary bodies can wrap. */
  wrap?: "truncate" | "wrap"
}

function truncateText(text: string, width: number, wrap: "truncate" | "wrap"): string {
  if (wrap !== "truncate" || width <= 0) return text
  const chars = Array.from(text)
  if (chars.length <= width) return text
  if (width <= 1) return "…"
  return `${chars.slice(0, width - 1).join("")}…`
}

export function ToolCallStatusTitle({
  status: _status,
  kind: _kind,
  title,
  label,
  shell = false,
  color,
  linkify = false,
  wrap = "truncate",
}: ToolCallStatusTitleProps): React.ReactElement {
  const text = label ?? title
  const rect = useBoxRect()
  const layout = useContentLayout()
  const fallbackWidth = Math.max(0, layout.measure - 2)
  const measuredWidth = Math.floor(rect.width)
  const maxWidth = measuredWidth > 0 && fallbackWidth > 0 ? Math.min(measuredWidth, fallbackWidth) : fallbackWidth
  const displayText = truncateText(text, maxWidth, wrap)

  if (shell) {
    return (
      <Box flexShrink={1} minWidth={0}>
        <LinkifiedText text={displayText} color={color ?? "$muted"} wrap={wrap} />
      </Box>
    )
  }

  return (
    <Box flexShrink={1} minWidth={0}>
      {linkify ? (
        <LinkifiedText text={displayText} color={color ?? "$muted"} wrap={wrap} />
      ) : (
        <Text color={color ?? "$muted"} wrap={wrap}>
          {displayText}
        </Text>
      )}
    </Box>
  )
}
