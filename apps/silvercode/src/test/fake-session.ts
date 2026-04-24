/**
 * ScriptedFakeSession — a test-only AgentSession implementation for Layer 3
 * tests (controller + harness with a faked LLM).
 *
 * Shape-compatible with the real AgentSession returned by spawnClaude /
 * spawnSdk / spawnCodex so the controller can't tell the difference. Tests
 * wire a fake in via `Controller.opts.spawnFactory` and drive it with
 * `session.emit(event)` to simulate streaming agent events, or
 * `session.script([...events])` to replay a prebuilt scenario.
 *
 * What this replaces
 * ------------------
 * Before this helper, controller/queue/useDispose behaviour could only be
 * tested against the real `spawnClaude` subprocess — which requires a TTY, a
 * live API key, and has 100ms+ startup. ScriptedFakeSession is synchronous,
 * deterministic, and zero-cost, so we can write 50+ Layer 3 regression tests
 * without hitting a real LLM.
 *
 * What it records
 * ---------------
 * Every `send(text)` and `respondToPermission(id, approved)` call is captured
 * in the `sent` array (in order, with timestamps). Tests assert the controller
 * wrote exactly what they expected — e.g. "three send()s collapsed into one"
 * for queue batching, "never called close()" for useDispose, etc.
 *
 * What it doesn't do
 * ------------------
 * No subprocess spawning. No stream-json parsing. No event log. The caller
 * drives events via emit/script. That's by design — Layer 3 is about wiring
 * between the controller and an AgentSession, not about the parser. The
 * parser has its own tests (harness.test.ts).
 */

import type { AgentEvent, AgentSession, PermissionRequestId, SessionId } from "@km/agent-harness"

export type FakeSentEntry =
  | { type: "user"; payload: string; ts: number }
  | { type: "permission-response"; payload: { id: PermissionRequestId; approved: boolean }; ts: number }

export type ScriptedFakeSession = AgentSession & {
  /** Synchronously dispatch one event to every subscriber. */
  emit(event: AgentEvent): void
  /**
   * Replay a prerecorded scenario. Each event is dispatched via setTimeout
   * at `intervalMs` spacing (default 10) so streaming deltas interleave
   * with any microtask-scheduled controller work. Pass `intervalMs: 0` for
   * a tight synchronous-looking flush (still off-tick by one macrotask).
   */
  script(events: ReadonlyArray<AgentEvent>, intervalMs?: number): void
  /** Mark the session as closed and emit a session-end event. */
  injectSessionEnd(stopReason?: string): void
  /** Surface an error without ending the session. */
  injectError(message: string): void
  /** Everything the consumer wrote to this session. */
  readonly sent: ReadonlyArray<FakeSentEntry>
  /** Number of times `close()` has been called. Load-bearing for the useDispose regression test. */
  readonly closeCount: number
}

export type CreateFakeSessionOptions = {
  /** Initial session id. Overwritten by the first session-init event. */
  sessionId?: SessionId
}

export function createFakeSession(opts: CreateFakeSessionOptions = {}): ScriptedFakeSession {
  const handlers = new Set<(event: AgentEvent) => void>()
  const sent: FakeSentEntry[] = []
  let sessionId = opts.sessionId ?? ("pending" as SessionId)
  let closed = false
  let closeCount = 0

  function emit(event: AgentEvent): void {
    if (event.kind === "session-init") sessionId = event.sessionId
    // Copy the set before iterating so a handler that subscribes or
    // unsubscribes mid-dispatch doesn't break the iteration.
    for (const h of [...handlers]) h(event)
  }

  const fake: ScriptedFakeSession = {
    get sessionId() {
      return sessionId
    },
    get closed() {
      return closed
    },
    get closeCount() {
      return closeCount
    },
    get sent() {
      return sent
    },
    send(text: string): void {
      sent.push({ type: "user", payload: text, ts: Date.now() })
    },
    respondToPermission(requestId: PermissionRequestId, approved: boolean): void {
      sent.push({ type: "permission-response", payload: { id: requestId, approved }, ts: Date.now() })
    },
    subscribe(handler: (event: AgentEvent) => void): () => void {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    close(): void {
      closeCount++
      closed = true
    },
    emit,
    script(events: ReadonlyArray<AgentEvent>, intervalMs = 10): void {
      for (let i = 0; i < events.length; i++) {
        const ev = events[i]!
        if (intervalMs <= 0) {
          // Still off-tick — a macrotask — so controllers that schedule
          // their own microtasks in response observe streaming ordering.
          queueMicrotask(() => emit(ev))
        } else {
          setTimeout(() => emit(ev), i * intervalMs)
        }
      }
    },
    injectSessionEnd(stopReason?: string): void {
      emit({
        kind: "session-end",
        sessionId,
        stopReason,
        ts: Date.now(),
      })
      closed = true
    },
    injectError(message: string): void {
      emit({
        kind: "error",
        sessionId,
        message,
        ts: Date.now(),
      })
    },
  }
  return fake
}
