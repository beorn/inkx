/**
 * Prompt projection — render a slice of cross-agent state as a typed
 * `EmbeddedResource` ContentBlock that prepends the user's prompt.
 *
 * Why: agents inside parallel sessions must see relevant peer activity —
 * file claims by other sessions, pending handoffs, recent broadcasts — but
 * silvercode's architectural rule is "agents don't talk to each other".
 * The host (silvercode) curates and projects a slice of the cross-agent
 * state into each agent's prompt as ambient context.
 *
 * Shape: one `EmbeddedResource` block with URI `coordinator://state/<sessionId>`
 * + `_meta.coordinator = true` so ACP-aware UIs render it as a coordination
 * affordance rather than a generic resource. The body is a markdown digest
 * (peer claims + handoffs + recent broadcasts), with the same strong
 * `[AMBIENT — informational, do not act]` framing the channel-queue path
 * uses, so the agent treats it as context, not as instructions.
 *
 * Opt-in: callers pass `includeCrossAgent: true` to enable. Default off,
 * because not every session needs the cross-agent slice (single-session
 * silvercode invocations have nothing to project).
 *
 * See `hub/silvery/future/ai-terminal/10-agent-router-landscape.md`
 * § "Cross-agent cooperation".
 */

import type { ContentBlock, EmbeddedResource } from "@km/agent-harness"
import { type ChannelQueue } from "./channel-queue.ts"
import { AMBIENT_FRAMING_PREFIX, type AssembleAcpPromptOptions, assembleAcpPrompt } from "./prompt-assembly.ts"
import type { CrossAgentSessionId, CrossAgentState, TribeEvent } from "./cross-agent-state.ts"

/** URI scheme for the coordinator slice. Mirrors `ambient://` from prompt-assembly. */
export const COORDINATOR_URI_SCHEME = "coordinator://"

export function coordinatorUri(sessionId: CrossAgentSessionId): string {
  return `${COORDINATOR_URI_SCHEME}state/${sessionId}`
}

export type CrossAgentSliceOptions = {
  /** Max recent-broadcast lines to include in the digest. Default 10. */
  recentBroadcastLimit?: number
  /**
   * When true, only include peer activity (i.e. claims by sessions other
   * than `selfSessionId`, broadcasts not from self). Default true — self-
   * activity is already in the agent's own conversation history.
   */
  peersOnly?: boolean
}

/**
 * Build the cross-agent slice for one session. Returns an empty array when
 * the slice would be empty (no peer activity AND no pending handoffs) so
 * the prompt isn't littered with "(no peer activity)" noise.
 */
export function crossAgentSlice(
  state: CrossAgentState,
  selfSessionId: CrossAgentSessionId,
  opts: CrossAgentSliceOptions = {},
): ContentBlock[] {
  const peersOnly = opts.peersOnly ?? true
  const recentLimit = opts.recentBroadcastLimit ?? 10

  const allClaims = state.claims()
  const peerClaims = peersOnly ? allClaims.filter((c) => c.sessionId !== selfSessionId) : allClaims
  const handoffs = state.handoffs().filter((h) => h.status === "pending")
  const myInbound = handoffs.filter((h) => h.toSessionId === selfSessionId)
  const myOutbound = handoffs.filter((h) => h.fromSessionId === selfSessionId)
  const allBroadcasts = state.recentBroadcasts()
  const broadcasts = peersOnly ? allBroadcasts.filter((b) => b.fromSessionId !== selfSessionId) : allBroadcasts.slice()
  const recentBroadcasts = broadcasts.slice(Math.max(0, broadcasts.length - recentLimit))

  // Skip the slice entirely when nothing useful to project.
  if (peerClaims.length === 0 && myInbound.length === 0 && myOutbound.length === 0 && recentBroadcasts.length === 0) {
    return []
  }

  const body = renderSliceMarkdown({ peerClaims, myInbound, myOutbound, recentBroadcasts })
  const block: EmbeddedResource & {
    type: "resource"
    _meta?: Record<string, unknown>
  } = {
    type: "resource",
    resource: {
      uri: coordinatorUri(selfSessionId),
      mimeType: "text/markdown",
      text: `${AMBIENT_FRAMING_PREFIX}\n\n${body}`,
    },
    _meta: {
      coordinator: true,
      ambient: true,
      sessionId: selfSessionId,
      peerClaimCount: peerClaims.length,
      pendingInbound: myInbound.length,
      pendingOutbound: myOutbound.length,
      recentBroadcastCount: recentBroadcasts.length,
    },
  }
  return [block as ContentBlock]
}

/** Markdown digest used as the body of the EmbeddedResource. */
function renderSliceMarkdown(input: {
  peerClaims: readonly { path: string; sessionId: CrossAgentSessionId; exclusive: boolean; claimedAt: number }[]
  myInbound: readonly { id: string; fromSessionId: CrossAgentSessionId; content: string }[]
  myOutbound: readonly { id: string; toSessionId: CrossAgentSessionId; content: string }[]
  recentBroadcasts: readonly TribeEvent[]
}): string {
  const sections: string[] = ["# Cross-agent state"]

  if (input.peerClaims.length > 0) {
    sections.push("## Peer file claims")
    for (const c of input.peerClaims) {
      const tag = c.exclusive ? "exclusive" : "advisory"
      sections.push(`- \`${c.path}\` — ${tag}, held by \`${c.sessionId}\``)
    }
  }

  if (input.myInbound.length > 0) {
    sections.push("## Pending handoffs to you")
    for (const h of input.myInbound) {
      sections.push(`- from \`${h.fromSessionId}\` (id ${h.id}): ${h.content}`)
    }
  }

  if (input.myOutbound.length > 0) {
    sections.push("## Your pending handoffs")
    for (const h of input.myOutbound) {
      sections.push(`- to \`${h.toSessionId}\` (id ${h.id}): ${h.content}`)
    }
  }

  if (input.recentBroadcasts.length > 0) {
    sections.push("## Recent peer broadcasts")
    for (const b of input.recentBroadcasts) {
      const who = b.fromSessionId ? `\`${b.fromSessionId}\`` : `(${b.source})`
      sections.push(`- ${who}: ${b.content}`)
    }
  }

  return sections.join("\n\n")
}

// ───── Composed assembly ──────────────────────────────────────────────────

export type AssembleAcpPromptWithCrossAgentOptions = AssembleAcpPromptOptions & {
  /**
   * Inject a cross-agent slice as the FIRST block when the slice is non-
   * empty. Default false (single-session callers stay unaffected).
   */
  includeCrossAgent?: boolean
  /**
   * State + identity required for the cross-agent slice. Both must be
   * provided when `includeCrossAgent` is true.
   */
  crossAgent?: {
    state: CrossAgentState
    selfSessionId: CrossAgentSessionId
    sliceOptions?: CrossAgentSliceOptions
  }
}

/**
 * Composed assembly: cross-agent slice (if enabled) + ambient channel-queue
 * blocks (if `autoInject`) + user text. The cross-agent slice is FIRST
 * because it's the most stable / curated context; ambient events are
 * mid-prompt; user text is always last (contract from prompt-assembly).
 */
export function assembleAcpPromptWithCrossAgent(
  userText: string,
  queue: ChannelQueue,
  opts: AssembleAcpPromptWithCrossAgentOptions,
): ContentBlock[] {
  const downstream = assembleAcpPrompt(userText, queue, {
    autoInject: opts.autoInject,
    sources: opts.sources,
  })
  if (!opts.includeCrossAgent || !opts.crossAgent) return downstream
  const slice = crossAgentSlice(opts.crossAgent.state, opts.crossAgent.selfSessionId, opts.crossAgent.sliceOptions)
  if (slice.length === 0) return downstream
  return [...slice, ...downstream]
}
