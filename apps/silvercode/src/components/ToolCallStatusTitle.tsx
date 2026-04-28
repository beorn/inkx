/**
 * <ToolCallStatusTitle>
 *
 * Tool-call title with status-aware animation. The parent `<ToolCall>` row
 * paints the verb color (per `ToolKind`); this component owns only the
 * text + lifecycle animation (shimmer while in progress, typewriter on
 * completion). No verb prefix — opencode keeps the title stable across
 * phases so the eye locks on the identifier (filename, command).
 *
 *   pending      → title in `color`        (caller-supplied kind color)
 *   in_progress  → title in shimmer (TextShimmer wraps the resolved color)
 *   completed    → TextReveal in `color`   (typewrites from 0 chars)
 *   failed       → title in `color`        (caller passes `$error`)
 *
 * The animation primitives (TextShimmer, TextReveal) are silvery-owned;
 * this component just feeds them the title and the caller-supplied color.
 * The `kind` prop is retained on the API for callers that branch on it
 * but no longer affects the rendered text.
 *
 * Bead: km-silvercode.tool-call-rendering-v2 (was: km-silvercode.acp-tool-call).
 */

import React from "react"
import { Text, TextReveal, TextShimmer } from "silvery"
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
  /**
   * Verb color token (e.g. `$info`, `$success`, `$error`). The parent
   * `<ToolCall>` row computes this from `ToolKind` + `status` and passes
   * it down so the row glyph and the title share one resolved color.
   * Defaults to `$muted` when no caller opinion.
   */
  color?: string
}

export function ToolCallStatusTitle({
  status,
  kind: _kind,
  title,
  label,
  color = "$muted",
}: ToolCallStatusTitleProps): React.ReactElement {
  const text = label ?? title

  if (status === "in_progress") {
    return (
      <TextShimmer active bold>
        {text}
      </TextShimmer>
    )
  }

  if (status === "completed") {
    // Typewriter the title so the eye catches the lifecycle transition.
    // Short duration — anything longer feels laggy.
    return <TextReveal text={text} duration={200} bold color={color} />
  }

  // pending and failed share the same shape — caller-supplied color, bold.
  return (
    <Text bold color={color}>
      {text}
    </Text>
  )
}
