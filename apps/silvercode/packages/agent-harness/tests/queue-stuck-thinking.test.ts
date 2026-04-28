/**
 * Regression test for km-silvercode.queue-stuck-thinking.
 *
 * The bug: a stray `status: requesting` event arriving when no turn is
 * active flipped session.status from `idle` to `thinking`. Because
 * controller.send() only flushes its outgoing queue when status is
 * `idle` or `ended`, every prompt the user sent after that point got
 * queued forever. The queue never drained because no turn-end ever
 * came (no turn was actually running) — wedged session.
 *
 * The fix: gate the `case "status"` arm to only honour `requesting`
 * when status is already a running state (`thinking` or `tool-running`).
 * Drop the event if status is idle/ended/awaiting-permission/spawning —
 * a `requesting` annotation has nothing to apply to without an active
 * turn.
 *
 * See session-reducer.ts case "status" for the guard implementation.
 */

import { describe, expect, test } from "vitest"
import type { AgentEvent } from "../src/events.ts"
import { initialInternalState, reduce } from "../src/session-reducer.ts"

function apply(events: AgentEvent[]) {
  let state = initialInternalState()
  for (const e of events) {
    const [next] = reduce(state, e)
    state = next
  }
  return state
}

describe("queue-stuck-thinking — stray requesting event must not flip idle to thinking", () => {
  test("idle session ignores stray requesting event", () => {
    const state = apply([{ kind: "status", status: "requesting", ts: 1000 } as AgentEvent])
    expect(state.status).toBe("idle")
  })

  test("session after turn-end ignores stray requesting", () => {
    const state = apply([
      { kind: "turn-start", turnId: "t-1", role: "assistant", ts: 1000 } as AgentEvent,
      { kind: "turn-end", turnId: "t-1", ts: 2000 } as AgentEvent,
      { kind: "status", status: "requesting", ts: 3000 } as AgentEvent,
    ])
    expect(state.status).toBe("idle")
  })

  test("ended session ignores stray requesting", () => {
    const state = apply([
      { kind: "session-lifecycle", state: "ended", ts: 1000 } as AgentEvent,
      { kind: "status", status: "requesting", ts: 2000 } as AgentEvent,
    ])
    expect(state.status).toBe("ended")
  })

  test("awaiting-permission ignores stray requesting (permission state must not be overridden)", () => {
    const state = apply([
      { kind: "turn-start", turnId: "t-1", role: "assistant", ts: 1000 } as AgentEvent,
      {
        kind: "permission-request",
        requestId: "p-1",
        tool: "Bash",
        args: {},
        ts: 1500,
      } as AgentEvent,
      { kind: "status", status: "requesting", ts: 2000 } as AgentEvent,
    ])
    expect(state.status).toBe("awaiting-permission")
  })

  test("active turn (status=thinking) accepts requesting (no-op idempotent)", () => {
    const state = apply([
      { kind: "turn-start", turnId: "t-1", role: "assistant", ts: 1000 } as AgentEvent,
      { kind: "status", status: "requesting", ts: 1500 } as AgentEvent,
    ])
    expect(state.status).toBe("thinking")
  })
})
