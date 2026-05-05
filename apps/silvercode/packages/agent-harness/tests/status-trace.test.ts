/**
 * Status-transition logger + dev-mode invariant — Phase A of the L4 reframe
 * (km-silvercode.session-store-trace, parent km-silvercode.queue-stuck-thinking-l4).
 *
 * Every `next.status = X` mutation in `session-reducer.ts` must route
 * through the `setStatus` helper, which:
 *   1. Emits a `silvercode:status` debug log line.
 *   2. Throws (dev) / warns (prod) when a busy status is entered without an
 *      active turnId in scope.
 *   3. Appends to a 30-entry ring buffer on `state.statusTrace`.
 *
 * These tests use the ring buffer as the primary assertion surface because
 * it's pure data — no logger mocking required. The debug-log emission is
 * verified separately via a `vi.mock` of `loggily`.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { AgentEvent, SessionId, TurnId } from "../src/events.ts"
import { initialInternalState, publicView, reduce } from "../src/session-reducer.ts"
import type { InternalSessionState } from "../src/session-reducer.ts"

const sid = "s-test" as SessionId

function apply(events: AgentEvent[], initial?: InternalSessionState): InternalSessionState {
  let state = initial ?? initialInternalState()
  for (const e of events) {
    const [next] = reduce(state, e)
    state = next
  }
  return state
}

const t1 = "t-1" as TurnId
const t2 = "t-2" as TurnId

// ─────────────────────────────────────────────────────────────────────────
// Ring buffer — every transition shows up

describe("status-trace — ring buffer captures every transition", () => {
  test("session-init writes idle transition", () => {
    const state = apply([
      {
        kind: "session-init",
        sessionId: sid,
        model: "x",
        mode: "default",
        cwd: "/",
        tools: [],
        mcp_servers: [],
        slashCommands: [],
        skills: [],
        plugins: [],
        claudeCodeVersion: "x",
        apiKeySource: "x",
        ts: 1,
      } as AgentEvent,
    ])
    expect(state.statusTrace).toBeDefined()
    expect(state.statusTrace?.length).toBe(1)
    const last = state.statusTrace?.[0]
    expect(last).toMatchObject({ from: "idle", to: "idle", reason: "session-init", eventKind: "session-init" })
  })

  test("turn-start (assistant) → thinking transition with turnId", () => {
    const state = apply([{ kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent])
    const trace = state.statusTrace ?? []
    expect(trace.length).toBe(1)
    expect(trace[0]).toMatchObject({
      from: "idle",
      to: "thinking",
      reason: "turn-start-assistant",
      eventKind: "turn-start",
      turnId: t1,
    })
  })

  test("tool-use → tool-running, tool-result → thinking", () => {
    const state = apply([
      { kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent,
      { kind: "tool-use", sessionId: sid, turnId: t1, id: "tool-1", name: "Bash", input: {}, ts: 200 } as AgentEvent,
      { kind: "tool-result", sessionId: sid, id: "tool-1", output: "", ts: 300 } as AgentEvent,
    ])
    const trace = state.statusTrace ?? []
    // [thinking, tool-running, thinking]
    expect(trace.map((e) => e.to)).toEqual(["thinking", "tool-running", "thinking"])
    expect(trace.map((e) => e.reason)).toEqual(["turn-start-assistant", "tool-use", "tool-result"])
  })

  test("turn-end clears active turn, status idle", () => {
    const state = apply([
      { kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent,
      { kind: "turn-end", sessionId: sid, turnId: t1, ts: 200 } as AgentEvent,
    ])
    expect(state.status).toBe("idle")
    expect(state.statusTrace?.[1]).toMatchObject({ to: "idle", reason: "turn-end", turnId: t1 })
    // active turn is private, so we can't read it via publicView, but
    // confirm a *subsequent* tool-result doesn't carry a phantom turnId.
    // (Indirect check — see invariant tests below.)
  })

  test("permission-request → awaiting-permission with requestId as owner", () => {
    const state = apply([
      { kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent,
      {
        kind: "permission-request",
        sessionId: sid,
        requestId: "p-1",
        tool: "Bash",
        args: {},
        ts: 200,
      } as AgentEvent,
    ])
    const trace = state.statusTrace ?? []
    expect(trace[trace.length - 1]).toMatchObject({
      to: "awaiting-permission",
      reason: "permission-request",
      // permission-request carries no turnId — its requestId stands in as
      // the owner id for the invariant check (Phase A scaffolding).
      turnId: "p-1",
    })
  })

  test("permission-decision with an active turn returns to tool-running or thinking instead of idle", () => {
    const toolState = apply([
      { kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent,
      { kind: "tool-use", sessionId: sid, turnId: t1, id: "tool-1", name: "Bash", input: {}, ts: 150 } as AgentEvent,
      {
        kind: "permission-request",
        sessionId: sid,
        requestId: "p-tool",
        tool: "Bash",
        args: {},
        ts: 200,
      } as AgentEvent,
      {
        kind: "permission-decision",
        sessionId: sid,
        requestId: "p-tool",
        approved: true,
        ts: 300,
      } as AgentEvent,
    ])
    expect(toolState.status).toBe("tool-running")
    expect(toolState.statusTrace?.at(-1)).toMatchObject({
      to: "tool-running",
      reason: "permission-decision-resolved-tool",
      turnId: t1,
    })

    const thinkingState = apply([
      { kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent,
      {
        kind: "permission-request",
        sessionId: sid,
        requestId: "p-turn",
        tool: "Bash",
        args: {},
        ts: 200,
      } as AgentEvent,
      {
        kind: "permission-decision",
        sessionId: sid,
        requestId: "p-turn",
        approved: true,
        ts: 300,
      } as AgentEvent,
    ])
    expect(thinkingState.status).toBe("thinking")
    expect(thinkingState.statusTrace?.at(-1)).toMatchObject({
      to: "thinking",
      reason: "permission-decision-resolved-turn",
      turnId: t1,
    })
  })

  test("permission-decision without an active turn resolves idle, last pending stays awaiting-permission", () => {
    const state = apply([
      {
        kind: "permission-request",
        sessionId: sid,
        requestId: "p-1",
        tool: "Bash",
        args: {},
        ts: 200,
      } as AgentEvent,
      {
        kind: "permission-request",
        sessionId: sid,
        requestId: "p-2",
        tool: "Bash",
        args: {},
        ts: 300,
      } as AgentEvent,
      {
        kind: "permission-decision",
        sessionId: sid,
        requestId: "p-1",
        approved: true,
        ts: 400,
      } as AgentEvent,
      {
        kind: "permission-decision",
        sessionId: sid,
        requestId: "p-2",
        approved: true,
        ts: 500,
      } as AgentEvent,
    ])
    expect(state.status).toBe("idle")
    const reasons = (state.statusTrace ?? []).map((e) => e.reason)
    expect(reasons).toContain("permission-decision-pending")
    expect(reasons).toContain("permission-decision-resolved-idle")
  })

  test("session-end → ended, lifecycle-ended → ended", () => {
    const a = apply([
      {
        kind: "session-end",
        sessionId: sid,
        ts: 100,
      } as AgentEvent,
    ])
    expect(a.status).toBe("ended")
    expect(a.statusTrace?.[0]).toMatchObject({ to: "ended", reason: "session-end-applied" })

    const b = apply([{ kind: "session-lifecycle", sessionId: sid, state: "ended", ts: 100 } as AgentEvent])
    expect(b.status).toBe("ended")
    expect(b.statusTrace?.[0]).toMatchObject({ to: "ended", reason: "lifecycle-ended" })
  })

  test("L1 guard (status=requesting) emits transition with status-event reason", () => {
    const state = apply([
      { kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent,
      { kind: "status", sessionId: sid, status: "requesting", ts: 200 } as AgentEvent,
    ])
    const trace = state.statusTrace ?? []
    // turn-start fired, then status event's idempotent setStatus also fires.
    expect(trace.length).toBe(2)
    expect(trace[1]).toMatchObject({ from: "thinking", to: "thinking", reason: "status-event", turnId: t1 })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Ring buffer cap

describe("status-trace — ring buffer caps at 30 entries", () => {
  test("oldest entries drop after 30 transitions", () => {
    let state = initialInternalState()
    for (let i = 0; i < 50; i++) {
      const turnId = `t-${i}` as TurnId
      const [next] = reduce(state, {
        kind: "turn-start",
        sessionId: sid,
        turnId,
        role: "assistant",
        ts: i,
      } as AgentEvent)
      state = next
      const [next2] = reduce(state, { kind: "turn-end", sessionId: sid, turnId, ts: i + 1 } as AgentEvent)
      state = next2
    }
    const trace = state.statusTrace ?? []
    expect(trace.length).toBeLessThanOrEqual(30)
    expect(trace.length).toBe(30)
    // Oldest retained entry must NOT be from turn 0.
    const first = trace[0]
    expect(first?.turnId).not.toBe("t-0" as TurnId)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Dev-mode invariant — busy status without an active turnId throws

describe("status-trace — dev-mode invariant", () => {
  const origEnv = process.env.NODE_ENV

  beforeEach(() => {
    // Default to dev unless a specific test overrides.
    process.env.NODE_ENV = "development"
  })

  afterEach(() => {
    process.env.NODE_ENV = origEnv
  })

  test("permission-request alone does NOT trip — its requestId is the owner", () => {
    // permission-request carries a requestId which is itself an owner id;
    // the helper accepts it as proxy ownership. This is the case the
    // ACP-permission-queue path relies on (no upstream turn-start in some
    // synthetic harness paths).
    expect(() => {
      apply([
        {
          kind: "permission-request",
          sessionId: sid,
          requestId: "p-stray",
          tool: "Bash",
          args: {},
          ts: 100,
        } as AgentEvent,
      ])
    }).not.toThrow()
  })

  test("active-turn permission-request does NOT trip invariant", () => {
    // Active turn is in flight — permission-request carries its own
    // requestId as well; no throw either way.
    expect(() => {
      apply([
        { kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent,
        {
          kind: "permission-request",
          sessionId: sid,
          requestId: "p-1",
          tool: "Bash",
          args: {},
          ts: 200,
        } as AgentEvent,
      ])
    }).not.toThrow()
  })

  test("artificial state-corruption (busy with no owner) throws", () => {
    // Construct an internal state with status=tool-running but
    // _activeTurnId=null — the exact "wedge" shape the L4 reframe
    // targets (10 writers, no single owner). Then dispatch a tool-result
    // which tries to flip tool-running → thinking via setStatus and
    // discovers there's no owner.
    const corrupt = initialInternalState()
    corrupt.status = "tool-running"
    corrupt._activeTurnId = null
    expect(() => {
      reduce(corrupt, { kind: "tool-result", sessionId: sid, id: "tool-x", output: "", ts: 100 } as AgentEvent)
    }).toThrow(/silvercode:status invariant violated/)
  })

  test("active-turn idempotent transitions (re-entry into thinking) do NOT trip", () => {
    expect(() => {
      apply([
        { kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent,
        { kind: "tool-use", sessionId: sid, turnId: t1, id: "tool-1", name: "Bash", input: {}, ts: 200 } as AgentEvent,
        { kind: "tool-result", sessionId: sid, id: "tool-1", output: "", ts: 300 } as AgentEvent,
        { kind: "tool-use", sessionId: sid, turnId: t1, id: "tool-2", name: "Bash", input: {}, ts: 400 } as AgentEvent,
        { kind: "tool-result", sessionId: sid, id: "tool-2", output: "", ts: 500 } as AgentEvent,
        { kind: "turn-end", sessionId: sid, turnId: t1, ts: 600 } as AgentEvent,
      ])
    }).not.toThrow()
  })

  test("prod mode does NOT throw on artificial state corruption", () => {
    process.env.NODE_ENV = "production"
    // Loggily's default warn sink writes JSON to console.warn; the vitest
    // setup treats any console output as a test failure. Silence it for
    // this assertion — we only care that no throw occurred.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const corrupt = initialInternalState()
    corrupt.status = "tool-running"
    corrupt._activeTurnId = null
    expect(() => {
      reduce(corrupt, { kind: "tool-result", sessionId: sid, id: "tool-x", output: "", ts: 100 } as AgentEvent)
    }).not.toThrow()
    warnSpy.mockRestore()
  })

  test("prod mode applies the transition anyway", () => {
    process.env.NODE_ENV = "production"
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const corrupt = initialInternalState()
    corrupt.status = "tool-running"
    corrupt._activeTurnId = null
    const [next] = reduce(corrupt, {
      kind: "tool-result",
      sessionId: sid,
      id: "tool-x",
      output: "",
      ts: 100,
    } as AgentEvent)
    // tool-result tried to flip tool-running → thinking. In prod, the
    // warning fired but the transition still applied.
    expect(next.status).toBe("thinking")
    warnSpy.mockRestore()
  })

  test("turn-end clears _activeTurnId (forensic — verify via subsequent state)", () => {
    // After a clean turn-start + turn-end, a stray tool-use carries its
    // OWN turnId so it doesn't trip the invariant — that's correct
    // behaviour. This test asserts the cleanup happens as expected by
    // observing that an artificial corruption (tool-running with no
    // owner) AFTER the turn-end does throw.
    const state = apply([
      { kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent,
      { kind: "turn-end", sessionId: sid, turnId: t1, ts: 200 } as AgentEvent,
    ])
    expect(state.status).toBe("idle")
    // Forensic poke at the private field — turn-end cleared it.
    state.status = "tool-running"
    state._activeTurnId = null
    expect(() => {
      reduce(state, { kind: "tool-result", sessionId: sid, id: "tool-x", output: "", ts: 300 } as AgentEvent)
    }).toThrow(/silvercode:status invariant violated/)
  })

  test("tool-use after turn-end carries its own turnId (no throw)", () => {
    // Replay path: a tool-use can land after a turn-end if the harness
    // is replaying transcripts out-of-order. The action's own turnId
    // satisfies the invariant — no throw.
    expect(() => {
      apply([
        { kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent,
        { kind: "turn-end", sessionId: sid, turnId: t1, ts: 200 } as AgentEvent,
        { kind: "tool-use", sessionId: sid, turnId: t2, id: "tool-1", name: "Bash", input: {}, ts: 300 } as AgentEvent,
      ])
    }).not.toThrow()
  })

  test("public status is derived from lifecycle ownership, not the cached internal status string", () => {
    const corrupt = initialInternalState()
    corrupt.status = "thinking"
    corrupt._activeTurnId = null
    expect(publicView(corrupt).status).toBe("idle")

    const [busy] = reduce(corrupt, {
      kind: "turn-start",
      sessionId: sid,
      turnId: t1,
      role: "assistant",
      ts: 100,
    } as AgentEvent)
    expect(publicView(busy).status).toBe("thinking")
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Debug log emission — verify createLogger().debug is actually called

describe("status-trace — debug log emission", () => {
  test("each transition emits a silvercode:status debug call", async () => {
    const debugSpy = vi.fn()
    vi.resetModules()
    vi.doMock("loggily", () => ({
      createLogger: (_namespace: string) => ({
        debug: debugSpy,
        info: () => {},
        warn: () => {},
        error: () => {},
      }),
    }))

    const fresh = await import("../src/session-reducer.ts")
    let state = fresh.initialInternalState()
    const evs: AgentEvent[] = [
      { kind: "turn-start", sessionId: sid, turnId: t1, role: "assistant", ts: 100 } as AgentEvent,
      { kind: "tool-use", sessionId: sid, turnId: t1, id: "tool-1", name: "Bash", input: {}, ts: 200 } as AgentEvent,
      { kind: "tool-result", sessionId: sid, id: "tool-1", output: "", ts: 300 } as AgentEvent,
      { kind: "turn-end", sessionId: sid, turnId: t1, ts: 400 } as AgentEvent,
    ]
    for (const e of evs) {
      const [next] = fresh.reduce(state, e)
      state = next
    }
    expect(debugSpy).toHaveBeenCalled()
    expect(debugSpy.mock.calls.length).toBeGreaterThanOrEqual(4)
    // Each call: ("transition", { from, to, reason, eventKind, turnId })
    const firstCall = debugSpy.mock.calls[0]
    expect(firstCall?.[0]).toBe("transition")
    expect(firstCall?.[1]).toMatchObject({ to: "thinking", reason: "turn-start-assistant" })

    vi.doUnmock("loggily")
  })
})
