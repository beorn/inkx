/**
 * Transcript loop-closure (Layer 3 of the ambient-context safety stack —
 * see `hub/silvercode/design/ambient-context-safety.md` § 3).
 *
 * **The bug this prevents.** Layer 1 + 2 stop ambient content reaching
 * the role-U slot of the prompt — but if the model nonetheless emits
 * transcript-shaped output (a line starting with a role-prefix marker),
 * the bytes go into the session JSONL. Next session's transcript
 * builder happily parses that line back as a new pseudo-user turn.
 * Closed-loop, autocatalytic. Forensic record: session `e8967322` (the
 * original failure mode that triggered this design).
 *
 * **The fix.** The agent-harness parser (`parse.ts`) already runs every
 * assistant text block through `quarantineLeadingRolePrefix` at the
 * canonical loop-closure point — when an assistant text block is
 * constructed from JSONL or live stream-json. This module is the seam
 * for callers who work with `messages[]` arrays directly (transcript
 * builder, prompt assembly): `safeAppendAssistantTurn(messages, text)`
 * is the only canonical way to append an assistant turn.
 *
 * Pure, deterministic; no I/O.
 */

import {
  ASSISTANT_ROLE_QUARANTINE_SENTINEL,
  quarantineLeadingRolePrefix,
  startsWithRolePrefix,
} from "@km/agent-harness"
// Use the legacy AgentEvent-shape ContentBlock (from events.ts) so we can
// pattern-match on `thinking` / `tool_use` blocks too — those flow through
// assistant messages alongside `text` blocks.
import type { ContentBlock } from "@km/agent-harness/events"
import { recordRolePrefixHit } from "./ambient-telemetry.ts"

export { ASSISTANT_ROLE_QUARANTINE_SENTINEL, quarantineLeadingRolePrefix, startsWithRolePrefix }

/** Minimal message shape consumed by the transcript builder. */
export type TranscriptMessage = {
  role: "user" | "assistant" | "system"
  content: string | ContentBlock[]
}

/**
 * Append an assistant turn to a `messages[]` array, with role-prefix
 * loop-closure protection.
 *
 *   - If `assistantText` opens with a role-prefix marker, the marker's
 *     colon is replaced inline with the quarantine sentinel.
 *   - The result is **always** appended as a single `role: "assistant"`
 *     message. We never split into a pseudo-user turn.
 *
 * Returns a new array (does not mutate `messages`).
 *
 * `opts.sessionId` is forwarded to telemetry when a role-prefix is
 * detected — Layer 4 ambient observability surface.
 */
export function safeAppendAssistantTurn(
  messages: readonly TranscriptMessage[],
  assistantText: string,
  opts: { sessionId?: string } = {},
): TranscriptMessage[] {
  const safe = quarantineLeadingRolePrefix(assistantText)
  if (safe !== assistantText) {
    recordRolePrefixHit({
      source: "loop-closure",
      layer: "loop-closure",
      snippet: assistantText,
      sessionId: opts.sessionId,
    })
  }
  return [...messages, { role: "assistant", content: safe }]
}

/**
 * Run every text block through the loop-closure quarantine. Non-text
 * blocks pass through unchanged — only `type: "text"` is at risk for
 * re-ingestion as a user turn header.
 *
 * Used by transcript builders that consume `ContentBlock[]` arrays
 * directly (e.g. when building the next-turn prompt context from a
 * resumed session's parsed assistant message).
 */
export function sanitizeAssistantContentBlocks(
  blocks: readonly ContentBlock[],
  opts: { sessionId?: string } = {},
): ContentBlock[] {
  return blocks.map((b) => {
    if (b.type !== "text") return b
    const safe = quarantineLeadingRolePrefix(b.text)
    if (safe === b.text) return b
    recordRolePrefixHit({
      source: "loop-closure",
      layer: "loop-closure",
      snippet: b.text,
      sessionId: opts.sessionId,
    })
    return { type: "text", text: safe }
  })
}
