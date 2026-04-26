/**
 * `wire.ts` — translates legacy `AgentEvent`s emitted by `spawnClaude(...)`'s
 * underlying `AgentSession` into ACP-shaped `SessionUpdate` notifications and
 * forwards them on an `AgentSideConnection`.
 *
 * The mapping mirrors `agent-harness/src/acp-session.ts` (which drives the
 * silvercode-internal canonical signal surface) but emits ACP wire-format
 * notifications rather than reactive signals. We deliberately use the
 * silvercode `SessionUpdate` shape as the intermediate form so we can route
 * everything through `silvercodeToAcp(...)` — that function is the **only**
 * place silvercode does ACP-spec churn translation, and we want
 * `@km/claude-acp` to inherit that discipline rather than re-derive it.
 *
 * Lifetime: `attachWire(...)` returns an unsubscribe function. Disposing it
 * detaches the legacy event subscription. The ACP `AgentSideConnection`
 * lifecycle is owned by the caller (see `server.ts`).
 *
 * Reference:
 * - `hub/silvery/future/ai-terminal/10-agent-router-landscape.md`
 *   § "Recommended path — internal-first, extract later"
 * - `apps/silvercode/packages/agent-harness/src/acp-session.ts`
 *   (the in-process equivalent — drains the same events into signals).
 */

import type * as acp from "@agentclientprotocol/sdk"
import type { AgentEvent, AgentSession } from "@km/agent-harness"
import { silvercodeToAcp } from "@km/agent-harness/acp-boundary"
import type {
  ContentBlock as ScContentBlock,
  Plan as ScPlan,
  PlanEntry as ScPlanEntry,
  PlanEntryStatus,
  SessionId as ScSessionId,
  SessionUpdate as ScSessionUpdate,
  ToolCallContent as ScToolCallContent,
  ToolCallId as ScToolCallId,
  ToolCallStatus,
} from "@km/agent-harness/acp-types"

/**
 * Resolution of one Claude prompt turn — settled by the `result` /
 * `session-end` / `turn-end` events from the underlying `AgentSession`.
 */
export interface PromptResolution {
  stopReason: acp.StopReason
}

/**
 * Drive a single ACP session end-to-end:
 *
 * - subscribe to the underlying `AgentSession`'s `AgentEvent` stream;
 * - translate each event to one or more ACP `SessionUpdate` notifications;
 * - emit them via `conn.sessionUpdate({ sessionId, update })`;
 * - track turn-end / session-end so the active `prompt(...)` can resolve.
 *
 * The function returns a `WireHandle` whose `awaitTurn()` waits for the next
 * `turn-end` (or `session-end` / `cancelled`) and resolves with a
 * `PromptResponse`. Multiple calls queue — this matches Claude Code's
 * single-turn discipline at the spawn level.
 */
export interface WireHandle {
  /** ACP session id this wire is bound to. */
  readonly sessionId: string
  /**
   * Wait for the next prompt turn to settle. Resolves with the final stop
   * reason. If the underlying session ends before a turn lands, resolves
   * with `stopReason: "cancelled"`.
   */
  awaitTurn(): Promise<acp.PromptResponse>
  /** Detach the wire (stops forwarding events). Idempotent. */
  detach(): void
}

export function attachWire(conn: acp.AgentSideConnection, agentSession: AgentSession, sessionId: string): WireHandle {
  let detached = false

  // Single waiter queue — Claude Code subprocesses are single-turn, so we
  // model this as one pending resolver at a time. If a second `awaitTurn()`
  // is requested before the first settles, queue it; both are settled in
  // FIFO order.
  const waiters: Array<(r: acp.PromptResponse) => void> = []

  function settleNext(stopReason: acp.StopReason): void {
    const w = waiters.shift()
    if (!w) return
    w({ stopReason })
  }

  function emit(update: ScSessionUpdate): void {
    if (detached) return
    const acpUpdate = silvercodeToAcp(update)
    // `sessionUpdate(...)` returns a Promise. We don't await — fire-and-
    // forget is the established pattern (matches `acp-client.ts` server-side
    // path). Errors surface via the connection's own error plumbing.
    void conn.sessionUpdate({
      sessionId: sessionId as acp.SessionId,
      update: acpUpdate,
    })
  }

  // Translate legacy AgentEvent → silvercode SessionUpdate(s).
  function applyEvent(event: AgentEvent): void {
    switch (event.kind) {
      case "user-message": {
        emit({
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text: event.text },
          messageId: null,
        })
        return
      }

      case "text-delta": {
        emit({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: event.text },
          messageId: null,
        })
        return
      }

      case "thinking-delta": {
        emit({
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: event.text },
          messageId: null,
        })
        return
      }

      case "tool-use": {
        emit({
          sessionUpdate: "tool_call",
          toolCallId: String(event.id) as ScToolCallId,
          title: event.name,
          status: "in_progress",
          rawInput: event.input,
        })
        // Claude's TodoWrite tool maps to ACP's `plan` SessionUpdate.
        if (event.name === "TodoWrite") {
          const plan = extractPlanFromTodos(event.input)
          if (plan) {
            emit({ sessionUpdate: "plan", entries: plan.entries })
          }
        }
        return
      }

      case "tool-result": {
        const status: ToolCallStatus = event.is_error ? "failed" : "completed"
        const content: ScToolCallContent[] = [
          {
            type: "content",
            content: { type: "text", text: stringifyOutput(event.output) },
          },
        ]
        emit({
          sessionUpdate: "tool_call_update",
          toolCallId: String(event.id) as ScToolCallId,
          status,
          rawOutput: event.output,
          content,
        })
        return
      }

      case "assistant-message": {
        // Final block aggregation — emit any text blocks that didn't already
        // surface as text-deltas (defensive — most agents stream deltas).
        for (const block of event.content) {
          if (block.type === "text") {
            const sc: ScContentBlock = { type: "text", text: block.text }
            // We don't know which deltas already arrived — emit nothing here
            // to avoid double-printing. Keeping this branch as a marker for
            // when we have ACP-shaped finalize semantics.
            void sc
          }
        }
        return
      }

      case "turn-end": {
        const reason = mapStopReason(event.stopReason)
        settleNext(reason)
        return
      }

      case "session-end": {
        const reason = mapStopReason(event.stopReason)
        // Drain all pending waiters with the final stop reason.
        while (waiters.length > 0) settleNext(reason)
        return
      }

      case "session-lifecycle": {
        if (event.state === "ended") {
          while (waiters.length > 0) settleNext("cancelled" as acp.StopReason)
        }
        return
      }

      case "session-init":
      case "turn-start":
      case "permission-request":
      case "permission-decision":
      case "status":
      case "error":
      case "handoff":
      case "km-reference":
        // Not directly mapped to a SessionUpdate variant. The information is
        // either irrelevant to the ACP surface (`session-init`'s rich
        // Claude-CLI-shaped metadata has no ACP slot) or arrives via a
        // separate channel (permissions go through `requestPermission`, not
        // `sessionUpdate`). Future work: surface `error` as an ACP error
        // notification once that's modelled in silvercode SessionUpdate.
        return
    }
  }

  const unsubscribe = agentSession.subscribe((e) => {
    try {
      applyEvent(e)
    } catch {
      // Defensive: don't let a translation bug tear down the wire. A real
      // production server would log; we keep silent at v1 to match the
      // boundary adapter's "lossy by design" stance.
    }
  })

  return {
    sessionId,
    awaitTurn(): Promise<acp.PromptResponse> {
      return new Promise<acp.PromptResponse>((resolve) => {
        if (detached || agentSession.closed) {
          resolve({ stopReason: "cancelled" as acp.StopReason })
          return
        }
        waiters.push(resolve)
      })
    },
    detach(): void {
      if (detached) return
      detached = true
      try {
        unsubscribe()
      } catch {
        // already gone
      }
      while (waiters.length > 0) settleNext("cancelled" as acp.StopReason)
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers (parallels `agent-harness/src/acp-session.ts` — kept inlined to
// keep this package self-contained against agent-harness internals).
// ---------------------------------------------------------------------------

function stringifyOutput(output: unknown): string {
  if (typeof output === "string") return output
  if (output == null) return ""
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function mapStopReason(legacy: string | undefined): acp.StopReason {
  switch (legacy) {
    case "end_turn":
    case "max_tokens":
    case "max_turn_requests":
    case "refusal":
    case "cancelled":
      return legacy as acp.StopReason
    default:
      return "end_turn" as acp.StopReason
  }
}

function extractPlanFromTodos(input: unknown): ScPlan | null {
  if (!input || typeof input !== "object") return null
  const maybe = (input as Record<string, unknown>).todos
  if (!Array.isArray(maybe)) return null
  const entries: ScPlanEntry[] = []
  for (const t of maybe) {
    if (!t || typeof t !== "object") continue
    const o = t as Record<string, unknown>
    const content = typeof o.content === "string" ? o.content : null
    if (!content) continue
    const rawStatus = typeof o.status === "string" ? o.status : "pending"
    const status: PlanEntryStatus = rawStatus === "in_progress" || rawStatus === "completed" ? rawStatus : "pending"
    entries.push({ content, status, priority: "medium" })
  }
  if (entries.length === 0) return null
  return { entries }
}

// Pre-declare in the export for `(typeof ScSessionId)` sourcing (avoid
// TS6196 "type X is declared but never used" if the file otherwise misses it).
export type _ScSessionIdMarker = ScSessionId
