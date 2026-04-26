/**
 * Tests for `createFakeAcpSession` (Layer 1 of `km-silvercode.acp-fake`).
 *
 * Strategy: prefer the manual driver for deterministic fixture-replay tests.
 * Use `vi.useFakeTimers()` only where async timing semantics are themselves
 * the thing under test (delayMs, scheduler interaction).
 */

import { afterEach, describe, expect, test, vi } from "vitest"
import type { AgentEvent, PermissionRequestId, SessionId } from "../src/events.ts"
import {
  type FakeFixtureName,
  type ManualFakeSession,
  type ScriptStep,
  createFakeAcpSession,
  loadFixture,
} from "../src/fake.ts"

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Fixture replay
// ---------------------------------------------------------------------------

const FIXTURES: FakeFixtureName[] = [
  "minimal-prompt",
  "tool-call-with-permission",
  "multi-tool-with-fs",
  "rejection-flow",
  "error-flow",
  "streaming-text",
]

describe("fixture replay (manual driver)", () => {
  for (const name of FIXTURES) {
    test(`fixture "${name}" replays cleanly`, () => {
      const script = loadFixture(name)
      expect(script.length).toBeGreaterThan(0)

      const events: AgentEvent[] = []
      const session = createFakeAcpSession({ script, manual: true })
      const unsubscribe = session.subscribe((e) => events.push(e))

      session.drain()
      unsubscribe()

      // Every scripted event was emitted, in order.
      expect(events.length).toBeGreaterThanOrEqual(script.length)
      for (let i = 0; i < script.length; i += 1) {
        expect(events[i]).toEqual(script[i]!.event)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Subscription lifecycle
// ---------------------------------------------------------------------------

describe("subscribe / unsubscribe", () => {
  test("unsubscribe stops further events", () => {
    const script: ScriptStep[] = [
      { event: makeTextDelta("a") },
      { event: makeTextDelta("b") },
      { event: makeTextDelta("c") },
    ]
    const events: AgentEvent[] = []
    const session = createFakeAcpSession({ script, manual: true })
    const unsubscribe = session.subscribe((e) => events.push(e))

    session.tick() // emit "a"
    unsubscribe()
    session.drain() // emits "b" and "c", but no subscribers

    expect(events).toHaveLength(1)
    expect((events[0] as Extract<AgentEvent, { kind: "text-delta" }>).text).toBe("a")
  })

  test("multiple subscribers each receive events", () => {
    const script: ScriptStep[] = [{ event: makeTextDelta("x") }]
    const a: AgentEvent[] = []
    const b: AgentEvent[] = []
    const session = createFakeAcpSession({ script, manual: true })
    session.subscribe((e) => a.push(e))
    session.subscribe((e) => b.push(e))
    session.drain()
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// close()
// ---------------------------------------------------------------------------

describe("close()", () => {
  test("close() sets closed=true and stops further events", () => {
    const script: ScriptStep[] = [{ event: makeTextDelta("a") }, { event: makeTextDelta("b") }]
    const events: AgentEvent[] = []
    const session = createFakeAcpSession({ script, manual: true })
    session.subscribe((e) => events.push(e))

    expect(session.closed).toBe(false)
    session.tick()
    session.close()
    expect(session.closed).toBe(true)

    // Further ticks/drains do nothing.
    session.tick()
    session.drain()
    expect(events).toHaveLength(1)
  })

  test("close() is idempotent", () => {
    const session = createFakeAcpSession({ script: [], manual: true })
    session.close()
    session.close()
    expect(session.closed).toBe(true)
  })

  test("close() clears pending async timers", () => {
    vi.useFakeTimers()
    const script: ScriptStep[] = [
      { delayMs: 100, event: makeTextDelta("a") },
      { delayMs: 100, event: makeTextDelta("b") },
    ]
    const events: AgentEvent[] = []
    const session = createFakeAcpSession({ script })
    session.subscribe((e) => events.push(e))

    vi.advanceTimersByTime(50)
    session.close()
    vi.advanceTimersByTime(1000)

    expect(events).toHaveLength(0)
    expect(session.closed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Permission policy
// ---------------------------------------------------------------------------

describe("permissionPolicy", () => {
  test("auto-approve emits approved=true after every permission-request", () => {
    const script: ScriptStep[] = [
      { event: makePermissionRequest("perm-1", "Edit") },
      { event: makePermissionRequest("perm-2", "Bash") },
    ]
    const events: AgentEvent[] = []
    const session = createFakeAcpSession({ script, permissionPolicy: "auto-approve", manual: true })
    session.subscribe((e) => events.push(e))
    session.drain()

    const decisions = events.filter((e) => e.kind === "permission-decision")
    expect(decisions).toHaveLength(2)
    expect(decisions.every((d) => (d as Extract<AgentEvent, { kind: "permission-decision" }>).approved)).toBe(true)
  })

  test("always-deny emits approved=false", () => {
    const script: ScriptStep[] = [{ event: makePermissionRequest("perm-1", "Bash") }]
    const events: AgentEvent[] = []
    const session = createFakeAcpSession({ script, permissionPolicy: "always-deny", manual: true })
    session.subscribe((e) => events.push(e))
    session.drain()

    const decision = events.find((e) => e.kind === "permission-decision") as
      | Extract<AgentEvent, { kind: "permission-decision" }>
      | undefined
    expect(decision).toBeDefined()
    expect(decision?.approved).toBe(false)
  })

  test("scripted decisions map per requestId", () => {
    const script: ScriptStep[] = [
      { event: makePermissionRequest("ok", "Read") },
      { event: makePermissionRequest("nope", "Bash") },
      { event: makePermissionRequest("missing", "Edit") },
    ]
    const events: AgentEvent[] = []
    const session = createFakeAcpSession({
      script,
      permissionPolicy: { decisions: { ok: true, nope: false } },
      manual: true,
    })
    session.subscribe((e) => events.push(e))
    session.drain()

    const decisions = events.filter(
      (e): e is Extract<AgentEvent, { kind: "permission-decision" }> => e.kind === "permission-decision",
    )
    expect(decisions).toHaveLength(3)
    expect(decisions[0]!.approved).toBe(true)
    expect(decisions[1]!.approved).toBe(false)
    // unknown requestId defaults to false.
    expect(decisions[2]!.approved).toBe(false)
  })

  test("policy function receives requestId/tool/args and may approve/deny", () => {
    const seen: Array<{ requestId: string; tool: string }> = []
    const script: ScriptStep[] = [
      { event: makePermissionRequest("perm-1", "Edit") },
      { event: makePermissionRequest("perm-2", "Bash") },
    ]
    const events: AgentEvent[] = []
    const session = createFakeAcpSession({
      script,
      permissionPolicy: (req) => {
        seen.push({ requestId: req.requestId as unknown as string, tool: req.tool })
        return req.tool === "Edit"
      },
      manual: true,
    })
    session.subscribe((e) => events.push(e))
    session.drain()

    expect(seen).toHaveLength(2)
    const decisions = events.filter(
      (e): e is Extract<AgentEvent, { kind: "permission-decision" }> => e.kind === "permission-decision",
    )
    expect(decisions[0]!.approved).toBe(true) // Edit
    expect(decisions[1]!.approved).toBe(false) // Bash
  })

  test("no policy = no auto-decision", () => {
    const script: ScriptStep[] = [{ event: makePermissionRequest("perm-1", "Edit") }]
    const events: AgentEvent[] = []
    const session = createFakeAcpSession({ script, manual: true })
    session.subscribe((e) => events.push(e))
    session.drain()

    expect(events.filter((e) => e.kind === "permission-decision")).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Async / delayMs timing
// ---------------------------------------------------------------------------

describe("async timing (delayMs)", () => {
  test("events fire on the wall clock honoring delayMs", () => {
    vi.useFakeTimers()
    const script: ScriptStep[] = [
      { delayMs: 100, event: makeTextDelta("a") },
      { delayMs: 200, event: makeTextDelta("b") },
      { delayMs: 50, event: makeTextDelta("c") },
    ]
    const events: AgentEvent[] = []
    const session = createFakeAcpSession({ script })
    session.subscribe((e) => events.push(e))

    // Before any time passes — nothing fired.
    expect(events).toHaveLength(0)

    vi.advanceTimersByTime(99)
    expect(events).toHaveLength(0)

    vi.advanceTimersByTime(1) // total 100
    expect(events).toHaveLength(1)

    vi.advanceTimersByTime(199) // total 299, second waits 200 from event A
    expect(events).toHaveLength(1)

    vi.advanceTimersByTime(1) // total 300
    expect(events).toHaveLength(2)

    vi.advanceTimersByTime(50) // total 350
    expect(events).toHaveLength(3)

    session.close()
  })

  test("async drains in order even with zero delays", () => {
    vi.useFakeTimers()
    const script: ScriptStep[] = [
      { delayMs: 0, event: makeTextDelta("a") },
      { delayMs: 0, event: makeTextDelta("b") },
      { delayMs: 0, event: makeTextDelta("c") },
    ]
    const events: AgentEvent[] = []
    const session = createFakeAcpSession({ script })
    session.subscribe((e) => events.push(e))

    vi.runAllTimers()

    expect(events.map((e) => (e as Extract<AgentEvent, { kind: "text-delta" }>).text)).toEqual(["a", "b", "c"])
    session.close()
  })
})

// ---------------------------------------------------------------------------
// send() and respondToPermission()
// ---------------------------------------------------------------------------

describe("input methods", () => {
  test("send() appends a user-message event", () => {
    const session = createFakeAcpSession({ script: [], manual: true })
    const events: AgentEvent[] = []
    session.subscribe((e) => events.push(e))

    session.send("hello")

    expect(events).toHaveLength(1)
    const e = events[0]!
    expect(e.kind).toBe("user-message")
    if (e.kind === "user-message") {
      expect(e.text).toBe("hello")
      expect(e.sessionId).toBe(session.sessionId)
    }
  })

  test("respondToPermission() emits permission-decision", () => {
    const session = createFakeAcpSession({ script: [], manual: true })
    const events: AgentEvent[] = []
    session.subscribe((e) => events.push(e))

    session.respondToPermission("perm-x" as PermissionRequestId, true)

    expect(events).toHaveLength(1)
    const e = events[0]!
    expect(e.kind).toBe("permission-decision")
    if (e.kind === "permission-decision") {
      expect(e.approved).toBe(true)
      expect(e.requestId).toBe("perm-x")
    }
  })

  test("send() and respondToPermission() are no-ops after close()", () => {
    const session = createFakeAcpSession({ script: [], manual: true })
    const events: AgentEvent[] = []
    session.subscribe((e) => events.push(e))

    session.close()
    session.send("ignored")
    session.respondToPermission("perm" as PermissionRequestId, true)

    expect(events).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// sessionId override
// ---------------------------------------------------------------------------

describe("sessionId", () => {
  test("uses default if not specified", () => {
    const session = createFakeAcpSession({ script: [], manual: true })
    expect(session.sessionId).toBe("fake-session")
  })

  test("uses override when provided", () => {
    const session = createFakeAcpSession({
      script: [],
      manual: true,
      sessionId: "custom-id" as SessionId,
    })
    expect(session.sessionId).toBe("custom-id")
  })
})

// ---------------------------------------------------------------------------
// Manual driver semantics
// ---------------------------------------------------------------------------

describe("manual driver", () => {
  test("tick() returns true while events remain, false when drained", () => {
    const script: ScriptStep[] = [{ event: makeTextDelta("a") }, { event: makeTextDelta("b") }]
    const session = createFakeAcpSession({ script, manual: true })
    expect(session.tick()).toBe(true) // 1 fired, 1 remains
    expect(session.tick()).toBe(false) // 1 fired, 0 remain
    expect(session.tick()).toBe(false) // empty, no work
  })

  test("drain() fires all remaining events synchronously", () => {
    const script: ScriptStep[] = [
      { event: makeTextDelta("a") },
      { event: makeTextDelta("b") },
      { event: makeTextDelta("c") },
    ]
    const events: AgentEvent[] = []
    const session: ManualFakeSession = createFakeAcpSession({ script, manual: true })
    session.subscribe((e) => events.push(e))
    session.drain()
    expect(events).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTextDelta(text: string): AgentEvent {
  return {
    kind: "text-delta",
    sessionId: "fake-session" as SessionId,
    turnId: "t1" as Extract<AgentEvent, { kind: "text-delta" }>["turnId"],
    blockIndex: 0,
    text,
    ts: 0,
  }
}

function makePermissionRequest(requestId: string, tool: string): AgentEvent {
  return {
    kind: "permission-request",
    sessionId: "fake-session" as SessionId,
    requestId: requestId as PermissionRequestId,
    tool,
    args: {},
    ts: 0,
  }
}
