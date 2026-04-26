/**
 * <ToolCallStatusTitle>
 *
 * Animated tool-call header that morphs label as the ACP `ToolCallStatus`
 * transitions across the lifecycle:
 *
 *   pending      → "Read…"           (bare, awaiting kick-off)
 *   in_progress  → "Reading file…"   (TextShimmer pulses between $primary/$muted)
 *   completed    → "Read 3 files"    (TextReveal types the final phrase)
 *   failed       → "Read failed"     ($error coloring, no animation)
 *
 * The animation framework (TextShimmer, TextReveal) is provided by silvery —
 * this component is just the status-driven wiring. ACP-named: status is
 * `ToolCallStatus` from acp-types, label vocabulary follows the kind.
 *
 * Bead: km-silvercode.acp-tool-call.
 */

import React from "react"
import { Text, TextReveal, TextShimmer } from "silvery"
import type { ToolCallStatus, ToolKind } from "@km/agent-harness"

// =============================================================================
// Vocabulary
// =============================================================================

/**
 * Per-kind verbs for each lifecycle phase. The vocabulary follows ACP's
 * `ToolKind` taxonomy and aims for Claude-Code's familiar phrasing —
 * "Reading file…", "Read 3 files", "Search failed". Unknown kinds fall
 * back to the generic "Running"/"Ran" pair.
 */
const PHRASES: Record<ToolKind, { progressive: string; pastTense: string; bare: string }> = {
  read: { progressive: "Reading", pastTense: "Read", bare: "Read" },
  edit: { progressive: "Editing", pastTense: "Edited", bare: "Edit" },
  delete: { progressive: "Deleting", pastTense: "Deleted", bare: "Delete" },
  move: { progressive: "Moving", pastTense: "Moved", bare: "Move" },
  search: { progressive: "Searching", pastTense: "Searched", bare: "Search" },
  execute: { progressive: "Running", pastTense: "Ran", bare: "Run" },
  think: { progressive: "Thinking", pastTense: "Thought", bare: "Think" },
  fetch: { progressive: "Fetching", pastTense: "Fetched", bare: "Fetch" },
  switch_mode: { progressive: "Switching mode", pastTense: "Switched mode", bare: "Switch mode" },
  other: { progressive: "Running", pastTense: "Ran", bare: "Run" },
}

/**
 * Compose the phrase shown for a given status. Falls back to the supplied
 * `title` when status is `pending` or unknown — `title` is required by ACP
 * so it always exists. Caller may also override the verb directly via the
 * `label` prop (handy for bespoke titles like "Reading CLAUDE.md").
 */
function phraseFor(status: ToolCallStatus, kind: ToolKind | undefined, title: string): string {
  const phrase = PHRASES[kind ?? "other"]
  switch (status) {
    case "pending":
      return title
    case "in_progress":
      return `${phrase.progressive}…`
    case "completed":
      return `${phrase.pastTense} ${title}`.trim()
    case "failed":
      return `${phrase.bare} failed`
  }
}

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

export function ToolCallStatusTitle({ status, kind, title, label }: ToolCallStatusTitleProps): React.ReactElement {
  const text = label ?? phraseFor(status, kind, title)

  if (status === "in_progress") {
    return (
      <TextShimmer active bold>
        {text}
      </TextShimmer>
    )
  }

  if (status === "completed") {
    // Typewriter the past-tense phrase so the eye catches the morph from
    // shimmer to fixed text. Short duration — anything longer feels laggy.
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
