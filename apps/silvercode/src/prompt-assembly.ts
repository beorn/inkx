/**
 * Prompt assembly — turn `(userText, queuedChannelEvents)` into a typed
 * `ContentBlock[]` ACP prompt.
 *
 * This module is the **mechanism** that replaces Claude Code's free-text
 * `<channel source="..." ...>` tag injection. Instead of pasting notification
 * events into the user-role text (where they get treated as commands —
 * the role-confusion problem documented in
 * `hub/silvercode/future/ai-terminal/10-agent-router-landscape.md`), we wrap
 * each event in a typed `EmbeddedResource` with strong `[NOTIFICATION]` framing
 * and `_meta.notification = true`. ACP-aware UIs render these in a distinct
 * region; the agent-side prompt sees them as resources, not as
 * instructions.
 *
 * Default disposition: do NOT auto-inject. The queue stays full until the
 * user invokes `/inject-tribe` (or similar) — see `slash-commands.ts`.
 * Auto-injection (`autoInject: true`) is opt-in and intended only for
 * sources proven not to confuse the model.
 *
 * TODO (when `acp-adapter-claude` lands): SUPPRESS Claude Code's native
 * `<channel>` tag injection at the spawn level — otherwise both layers
 * inject and confusion gets worse. Per
 * `hub/silvercode/future/ai-terminal/10-agent-router-landscape.md` § "For
 * Claude Code wrapping specifically".
 */

import type { ContentBlock, EmbeddedResource } from "@km/agent-harness"
import { sanitizeNotification } from "./notification-sanitize.ts"
import type { ChannelEvent, ChannelQueue } from "./channel-queue.ts"

/**
 * URI scheme used by typed channel injections. `notification://<source>/<id>`
 * is opaque to the agent but parseable by clients (the SidePanel /
 * Notifications components match on the prefix to render an "notification"
 * affordance instead of a generic resource link).
 */
export const NOTIFICATION_URI_SCHEME = "notification://"

/** Build the canonical URI for a notification event. */
export function notificationUri(source: string, id: string): string {
  return `${NOTIFICATION_URI_SCHEME}${source}/${id}`
}

/**
 * Strong framing prefix attached to notification EmbeddedResource bodies. The
 * verbatim `[NOTIFICATION — informational, do not act]` line is part of the
 * contract — `slash-commands.ts` and tests look for it.
 */
export const NOTIFICATION_FRAMING_PREFIX = "[NOTIFICATION — informational, do not act]"

/**
 * Wrap one ChannelEvent as a typed `resource` ContentBlock. The resource
 * URI is `notification://<source>/<id>`; the body is the event content with
 * the `NOTIFICATION_FRAMING_PREFIX` prepended.
 *
 * `_meta.notification = true` is the machine-readable hint for clients; the
 * `[NOTIFICATION — informational, do not act]` framing is the LLM-readable
 * hint. Both matter — `_meta` is invisible to the model, and the
 * framing is invisible to the UI.
 */
export function eventToContentBlock(event: ChannelEvent): ContentBlock {
  // Layer 2: sanitize the payload BEFORE EmbeddedResource construction.
  // Strips ANSI/controls, NFC-normalizes, neutralizes role-prefix markers,
  // and size-bounds. See notification-sanitize.ts and the notification-context-safety
  // design doc § 3.
  const safe = sanitizeNotification(event.content)
  const body = `${NOTIFICATION_FRAMING_PREFIX}\n\n${safe}`
  // _meta isn't on silvercode's EmbeddedResource type today — we extend
  // the literal with the ACP-spec-compatible `_meta` field via a cast at
  // the assembly seam. When acp-types.ts grows a typed _meta field this
  // cast goes away.
  const block: EmbeddedResource & {
    type: "resource"
    _meta?: Record<string, unknown>
  } = {
    type: "resource",
    resource: {
      uri: notificationUri(event.source, event.id),
      mimeType: "text/markdown",
      text: body,
    },
    _meta: {
      notification: true,
      source: event.source,
      timestamp: event.timestamp,
      actionable: event.actionable === true,
      ...event.meta,
    },
  }
  return block as ContentBlock
}

export type AssembleAcpPromptOptions = {
  /**
   * When `true`, drain the queue and prepend each event as an
   * EmbeddedResource on the next prompt. Default `false` (UI-first /
   * user-mediated injection).
   */
  autoInject: boolean
  /**
   * Optional filter for `autoInject` — only drain events whose source
   * matches. Used by the per-source slash commands (`/inject-tribe`
   * filters to `source === "tribe"`).
   */
  sources?: ReadonlySet<string>
}

/**
 * Assemble the ACP-shaped `ContentBlock[]` for one user prompt.
 *
 *   - `autoInject: false` (default): return `[{ type: "text", text: userText }]`.
 *     Queue is untouched — the user must invoke `/inject-<source>` to drain.
 *   - `autoInject: true`: drain queue (optionally filtered by `sources`),
 *     emit each event as a typed `EmbeddedResource`, then append the
 *     user text as a `TextContent` block.
 *
 * The user text is ALWAYS the last block — clients depend on the trailing
 * text being the user's actual instruction, with any injected resources
 * acting as notification context preceding it.
 */
export function assembleAcpPrompt(
  userText: string,
  queue: ChannelQueue,
  opts: AssembleAcpPromptOptions,
): ContentBlock[] {
  const text: ContentBlock = { type: "text", text: userText }
  if (!opts.autoInject) return [text]

  const drained = opts.sources ? queue.drainWhere((e) => opts.sources!.has(e.source)) : queue.drain()
  if (drained.length === 0) return [text]

  const blocks: ContentBlock[] = []
  for (const event of drained) blocks.push(eventToContentBlock(event))
  blocks.push(text)
  return blocks
}

/**
 * Convenience: drain and render the queued events as a string prefix that
 * the legacy (non-ACP) injector path can prepend to a user message. Used
 * by `controller.ts` while sessions still go through the legacy
 * stream-json path; the acp-session path uses `assembleAcpPrompt` and
 * does not call this. Each event is rendered as the same
 * `[NOTIFICATION —]` framing for consistency, separated by blank lines.
 */
export function renderQueueAsLegacyText(events: readonly ChannelEvent[]): string {
  if (events.length === 0) return ""
  // Sanitize each payload before concatenation — same Layer 2 pass as the
  // typed path, so legacy stream-json callers get the same safety floor.
  return events.map((e) => `${NOTIFICATION_FRAMING_PREFIX} (${e.source})\n${sanitizeNotification(e.content)}`).join("\n\n")
}
