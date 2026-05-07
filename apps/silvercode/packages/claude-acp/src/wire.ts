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
 * - `hub/silvercode/future/ai-terminal/10-agent-router-landscape.md`
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
import { createLogger } from "loggily"

const log = createLogger("silvercode:claude-acp:wire")

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
  /**
   * Synchronously translate and forward a single event through the same
   * pipeline used by the live subscribe. Used by the server's newSession
   * to replay events that were buffered between `spawnClaude` and
   * `attachWire` (the window where we awaited session-init to learn the
   * real sessionId before binding the wire). Idempotent on detached.
   */
  replayEvent(event: AgentEvent): void
  /** Detach the wire (stops forwarding events). Idempotent. */
  detach(): void
}

export type AttachWireOptions = {
  /**
   * Max time to wait for pending sessionUpdate writes before resolving a
   * prompt turn. Local stdio writes normally settle immediately; the cap is
   * a liveness guard so a bad write promise cannot keep the client-side
   * activity indicator in "thinking" forever after the answer is visible.
   */
  writeDrainTimeoutMs?: number
}

const DEFAULT_WRITE_DRAIN_TIMEOUT_MS = 1000

export class AcpWireWriteDrainTimeoutError extends Error {
  readonly sessionId: string
  readonly pendingWriteCount: number
  readonly timeoutMs: number

  constructor(args: { sessionId: string; pendingWriteCount: number; timeoutMs: number }) {
    super(
      `sessionUpdate write drain timed out for session ${args.sessionId}: ` +
        `${args.pendingWriteCount} write(s) still pending after ${args.timeoutMs}ms`,
    )
    this.name = "AcpWireWriteDrainTimeoutError"
    this.sessionId = args.sessionId
    this.pendingWriteCount = args.pendingWriteCount
    this.timeoutMs = args.timeoutMs
  }
}

type TurnWaiter = {
  resolve: (r: acp.PromptResponse) => void
  reject: (err: unknown) => void
}

type SettleOptions = {
  rejectOnDrainError?: boolean
}

export function attachWire(
  conn: acp.AgentSideConnection,
  agentSession: AgentSession,
  sessionId: string,
  opts: AttachWireOptions = {},
): WireHandle {
  let detached = false
  const writeDrainTimeoutMs = opts.writeDrainTimeoutMs ?? DEFAULT_WRITE_DRAIN_TIMEOUT_MS

  // Single waiter queue — Claude Code subprocesses are single-turn, so we
  // model this as one pending resolver at a time. If a second `awaitTurn()`
  // is requested before the first settles, queue it; both are settled in
  // FIFO order.
  const waiters: TurnWaiter[] = []

  // In-flight sessionUpdate write tracker. Each `emit(...)` registers its
  // Promise here; `settleNext(...)` drains them all before resolving any
  // awaiting `awaitTurn()` waiter, so the JSON-RPC write order is
  // (notifications first, response after) — even when the underlying
  // AgentSession dispatches multiple events synchronously in one
  // subscribe-callback frame and then fires `turn-end`. Without this
  // ordering, the prompt RPC response can land on the wire BEFORE a late
  // tool_call_update notification, and the consumer side updates state
  // out-of-order ("stuck thinking" was the canonical user-visible
  // symptom). Bead: km-silvercode.acp-wire-write-ordering.
  const pendingWrites = new Set<Promise<unknown>>()

  function trackWrite(p: Promise<unknown>): void {
    pendingWrites.add(p)
    void p.catch((err) => {
      log.error?.(toError(err, "sessionUpdate write failed"), "sessionUpdate write failed", { sessionId })
    })
    void p
      .finally(() => pendingWrites.delete(p))
      .catch(() => {
        // The separate catch above logs the write failure; this branch only
        // preserves cleanup liveness.
      })
  }

  async function drainPendingWrites(): Promise<void> {
    // Snapshot — Promise.allSettled doesn't await writes that arrive
    // AFTER it starts. The contract is "drain everything queued up to
    // this point"; subsequent emits get their own drain on the next
    // settle.
    const writes = [...pendingWrites]
    if (writes.length === 0) return

    const drain = Promise.allSettled(writes).then((results) => {
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected")
      if (rejected) {
        throw toError(rejected.reason, "sessionUpdate write failed while draining")
      }
      return "drained" as const
    })
    if (writeDrainTimeoutMs <= 0) {
      await drain
      return
    }

    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), writeDrainTimeoutMs)
      ;(timer as unknown as { unref?: () => void }).unref?.()
    })
    const result = await Promise.race([drain, timeout])
    if (timer) clearTimeout(timer)
    if (result === "timeout") {
      for (const write of writes) pendingWrites.delete(write)
      const err = new AcpWireWriteDrainTimeoutError({
        sessionId,
        pendingWriteCount: writes.length,
        timeoutMs: writeDrainTimeoutMs,
      })
      log.error?.(err, "sessionUpdate write drain timed out", {
        sessionId,
        pendingWriteCount: writes.length,
        writeDrainTimeoutMs,
      })
      throw err
    }
  }

  function settleNext(stopReason: acp.StopReason, options: SettleOptions = {}): void {
    const waiter = waiters.shift()
    if (!waiter) return
    const rejectOnDrainError = options.rejectOnDrainError ?? true
    // Drain pending sessionUpdate writes BEFORE resolving the waiter so
    // the prompt RPC response can't overtake any outstanding notification
    // on the wire. Drain failures are abnormal for completed turns, so fail
    // the prompt unless the caller is settling a normal cancellation path.
    void drainPendingWrites().then(
      () => waiter.resolve({ stopReason }),
      (err) => {
        if (rejectOnDrainError) {
          waiter.reject(err)
          return
        }
        waiter.resolve({ stopReason })
      },
    )
  }

  function emit(update: ScSessionUpdate): void {
    if (detached) return
    const acpUpdate = silvercodeToAcp(update)
    // Track the write so settleNext() can drain pending writes before
    // resolving the prompt RPC response. Errors surface via the
    // connection's own error plumbing — we still un-track on rejection.
    trackWrite(
      conn.sessionUpdate({
        sessionId: sessionId as acp.SessionId,
        update: acpUpdate,
      }),
    )
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

      case "permission-request": {
        const options: acp.PermissionOption[] = [
          { optionId: "allow_once" as acp.PermissionOptionId, name: "Allow", kind: "allow_once" as const },
          { optionId: "reject_once" as acp.PermissionOptionId, name: "Reject", kind: "reject_once" as const },
        ]
        void conn
          .requestPermission({
            sessionId: sessionId as acp.SessionId,
            toolCall: {
              toolCallId: String(event.requestId) as acp.ToolCallId,
              title: event.tool || String(event.requestId),
              status: "pending",
              rawInput: event.args,
            },
            options,
          })
          .then((response) => {
            const outcome = response.outcome
            const approved =
              outcome.outcome === "selected" &&
              options.some(
                (option) =>
                  option.optionId === outcome.optionId &&
                  (option.kind === "allow_once" || option.kind === "allow_always"),
              )
            agentSession.respondToPermission(event.requestId, approved)
            return
          })
          .catch((err) => {
            log.error?.(toError(err, "permission request failed"), "permission request failed", {
              sessionId,
              requestId: String(event.requestId),
              tool: event.tool,
            })
            agentSession.respondToPermission(event.requestId, false)
          })
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
          while (waiters.length > 0) settleNext("cancelled" as acp.StopReason, { rejectOnDrainError: false })
        }
        return
      }

      case "session-init": {
        // Surface vault-local + plugin slash commands the underlying claude
        // subprocess discovered. Without this, silvercode's autocomplete
        // dropdown only ever shows static (silvercode-local + well-known)
        // commands — `.claude/commands/<name>.md` files in the workspace
        // are silently invisible. ACP's `available_commands_update` is the
        // canonical slot; downstream consumers (silvercode-side acp-client
        // → session-store → AvailableCommandsPalette) already speak that
        // shape. Bead: km-silvercode.slash-command-vault-discovery.
        //
        // Empty list → no emit. Don't pollute the wire when there's nothing
        // to advertise (e.g. acp-client's synthetic post-newSession init).
        if (event.slashCommands.length > 0) {
          emit({
            sessionUpdate: "available_commands_update",
            availableCommands: event.slashCommands.map((name) => ({
              // ACP's AvailableCommand.name is bare (no leading slash);
              // silvercode normalizes when rendering. Mirror Claude's raw
              // shape verbatim — every other ACP server we connect to
              // (codex, gemini, claude via @agentclientprotocol) emits
              // bare names too.
              name,
              description: "",
              input: null,
            })),
          })
        }
        return
      }
      case "turn-start":
      case "permission-decision":
      case "status":
      case "error":
      case "handoff":
      case "km-reference":
        // Not directly mapped to a SessionUpdate variant. The information is
        // either irrelevant to the ACP surface or arrives via a separate
        // channel (permissions go through `requestPermission`, not
        // `sessionUpdate`). Future work: surface `error` as an ACP error
        // notification once that's modelled in silvercode SessionUpdate.
        return
    }
  }

  const unsubscribe = agentSession.subscribe((e) => {
    try {
      applyEvent(e)
    } catch (err) {
      // Defensive: don't let a translation bug tear down the wire. A real
      // production server would log; this boundary is lossy by design, but
      // lossy must still be observable.
      log.error?.(toError(err, "event translation failed"), "event translation failed", {
        sessionId,
        eventKind: e.kind,
      })
    }
  })

  return {
    sessionId,
    awaitTurn(): Promise<acp.PromptResponse> {
      return new Promise<acp.PromptResponse>((resolve, reject) => {
        if (detached || agentSession.closed) {
          resolve({ stopReason: "cancelled" as acp.StopReason })
          return
        }
        waiters.push({ resolve, reject })
      })
    },
    replayEvent(event: AgentEvent): void {
      if (detached) return
      try {
        applyEvent(event)
      } catch (err) {
        // Mirror the live subscribe's defensive try/catch: a translation
        // bug in one event must not abort the replay loop.
        log.error?.(toError(err, "replay event translation failed"), "replay event translation failed", {
          sessionId,
          eventKind: event.kind,
        })
      }
    },
    detach(): void {
      if (detached) return
      detached = true
      try {
        unsubscribe()
      } catch {
        // already gone
      }
      while (waiters.length > 0) settleNext("cancelled" as acp.StopReason, { rejectOnDrainError: false })
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

function toError(err: unknown, fallbackMessage: string): Error {
  if (err instanceof Error) return err
  const suffix = err == null ? "" : `: ${String(err)}`
  return new Error(`${fallbackMessage}${suffix}`)
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
