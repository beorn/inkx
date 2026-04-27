/**
 * <ToolCallStatusTitle>
 *
 * Tool-call header that shows the title verbatim — the parent <ToolCall>
 * card already paints status via the leading glyph (spinner / ⚙ / ✗) and
 * border color, so a verb prefix on the title is redundant noise.
 *
 *   pending      → "src/foo.ts"           ($muted)
 *   in_progress  → "src/foo.ts" (shimmer between $primary/$muted)
 *   completed    → "src/foo.ts" (TextReveal types the title in $primary)
 *   failed       → "src/foo.ts" ($error)
 *
 * Earlier the title morphed across lifecycle phases ("Reading file…",
 * "Read 3 files", "Search failed"). The user's design feedback: the icon
 * already conveys status — the verb adds nothing the eye can't read from
 * the spinner / ⚙ / ✗. Keeping the title stable across phases also lets
 * the eye lock on the identifier (filename, command) instead of chasing
 * the morph.
 *
 * The animation framework (TextShimmer, TextReveal) is still provided by
 * silvery — we just feed it the unchanged title rather than a verb-decorated
 * phrase. The `kind` prop is preserved on the API but no longer affects the
 * rendered text — it's still useful for callers that branch on it
 * elsewhere.
 *
 * Bead: km-silvercode.acp-tool-call.
 */

import React from "react"
import { Text, TextReveal, TextShimmer } from "silvery"
import type { ToolCallStatus, ToolKind } from "@km/agent-harness"

// =============================================================================
// Component
// =============================================================================

export interface ToolCallStatusTitleProps {
  /** ACP `ToolCallStatus` — drives both vocabulary and animation choice. */
  status: ToolCallStatus
  /** ACP `ToolKind` — drives the verb. Defaults to "other". */
  kind?: ToolKind
  /**
   * The base title from the `ToolCall.title` field. Used in the `pending`
   * label verbatim and as the noun appended to the past-tense verb when
   * the call completes (e.g. `Read /Users/foo/bar.ts`).
   */
  title: string
  /**
   * Override the auto-derived label entirely. Use when the ACP title is a
   * structured phrase that doesn't fit the verb scaffolding ("Read 3 files").
   */
  label?: string
}

export function ToolCallStatusTitle({
  status,
  kind: _kind,
  title,
  label,
}: ToolCallStatusTitleProps): React.ReactElement {
  // The title carries the meaning — filename for read/edit, command for
  // execute, query for search. Status is conveyed entirely by the parent
  // card's leading glyph + border color.
  const text = label ?? title

  if (status === "in_progress") {
    return (
      <TextShimmer active bold>
        {text}
      </TextShimmer>
    )
  }

  if (status === "completed") {
    // Typewriter the title so the eye catches the morph from shimmer to
    // fixed text. Short duration — anything longer feels laggy.
    return <TextReveal text={text} duration={200} bold color="$primary" />
  }

  if (status === "failed") {
    return (
      <Text bold color="$error">
        {text}
      </Text>
    )
  }

  // pending
  return (
    <Text bold color="$muted">
      {text}
    </Text>
  )
}
