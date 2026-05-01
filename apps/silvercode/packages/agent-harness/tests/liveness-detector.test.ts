/**
 * Liveness detector for owned obligations.
 *
 * Bead: km-silvercode.liveness-deadlock-detector.
 */

import { describe, expect, test } from "vitest"
import type { AgentEvent, PermissionRequestId, SessionId, ToolUseId, TurnId } from "../src/events.ts"
import { initialInternalState, reduce } from "../src/session-reducer.ts"
import type { InternalSessionState } from "../src/session-reducer.ts"

const sid = "s-liveness" as SessionId
const turn = "turn-1" as TurnId

function apply(events: AgentEvent[], initial?: InternalSessionState): InternalSessionState {
  let state = initial ?? initialInternalState()
  for (const event of events) {
    const [next] = reduce(state, event)
    state = next
  }
  return state
}

describe("liveness detector", () => {
  test("stale permission request surfaces missing permission-decision", () => {
    const state = apply([
      {
        kind: "permission-request",
        sessionId: sid,
        requestId: "perm-1" as PermissionRequestId,
        tool: "Bash",
        args: { command: "sleep 10" },
        ts: 200,
      } as AgentEvent,
      { kind: "liveness-check", sessionId: sid, ts: 900, staleAfterMs: 500 } as AgentEvent,
    ])

    expect(state.lastError?.message).toContain("silvercode:liveness stalled")
    expect(state.lastError?.message).toContain('permission "perm-1"')
    expect(state.lastError?.message).toContain("missing=permission-decision(perm-1)")
  })

  test("closed permission request does not report stale work", () => {
    const state = apply([
      {
        kind: "permission-request",
        sessionId: sid,
        requestId: "perm-1" as PermissionRequestId,
        tool: "Bash",
        args: {},
        ts: 200,
      } as AgentEvent,
      {
        kind: "permission-decision",
        sessionId: sid,
        requestId: "perm-1" as PermissionRequestId,
        approved: true,
        ts: 300,
      } as AgentEvent,
      { kind: "liveness-check", sessionId: sid, ts: 900, staleAfterMs: 500 } as AgentEvent,
    ])

    expect(state.lastError).toBeNull()
  })

  test("stale tool use surfaces missing tool-result", () => {
    const state = apply([
      {
        kind: "tool-use",
        sessionId: sid,
        turnId: turn,
        id: "tool-1" as ToolUseId,
        name: "Bash",
        input: { command: "sleep 10" },
        ts: 200,
      } as AgentEvent,
      { kind: "liveness-check", sessionId: sid, ts: 900, staleAfterMs: 500 } as AgentEvent,
    ])

    expect(state.lastError?.message).toContain('tool "tool-1"')
    expect(state.lastError?.message).toContain("missing=tool-result(tool-1)")
  })

  test("stale assistant turn surfaces missing turn-end once", () => {
    const once = apply([
      { kind: "turn-start", sessionId: sid, turnId: turn, role: "assistant", ts: 100 } as AgentEvent,
      { kind: "liveness-check", sessionId: sid, ts: 900, staleAfterMs: 500 } as AgentEvent,
    ])
    expect(once.lastError?.message).toContain('turn "turn-1"')
    expect(once.lastError?.message).toContain("missing=turn-end(turn-1)")

    const twice = apply([{ kind: "liveness-check", sessionId: sid, ts: 1500, staleAfterMs: 500 } as AgentEvent], once)
    expect(twice.lastError?.count).toBe(1)
  })

  test("stale stored status with no pending permission is an invariant error", () => {
    const corrupt = initialInternalState()
    corrupt.status = "awaiting-permission"

    const state = apply([{ kind: "liveness-check", sessionId: sid, ts: 100, staleAfterMs: 0 } as AgentEvent], corrupt)

    expect(state.lastError?.message).toContain("status=awaiting-permission but no permissions pending")
  })
})
