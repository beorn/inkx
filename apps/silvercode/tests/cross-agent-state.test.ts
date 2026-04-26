/**
 * Tests for `apps/silvercode/src/cross-agent-state.ts`.
 *
 * Covers:
 *  - claim / release lifecycle, idempotency, advisory ⇄ exclusive semantics
 *  - conflict mediation: first exclusive claim wins
 *  - handoff propose / accept / reject
 *  - addSession / removeSession (and that removeSession releases claims)
 *  - recordBroadcast ring-buffer eviction at the cap
 *  - signal subscribers see fresh references on every change
 */

import { describe, expect, test } from "vitest"
import { effect } from "alien-signals"
import { createScope } from "@silvery/scope"
import { createCrossAgentState, type FileClaim, type Handoff, type SessionInfo } from "../src/cross-agent-state.ts"

function s(name: string): SessionInfo {
  return { sessionId: name, name, status: "idle", startedAt: 0 }
}

describe("cross-agent-state — claims", () => {
  test("first exclusive claim wins; subsequent same-path exclusive from different session conflicts", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    const a = state.claimFile({ sessionId: "s1", path: "/foo.ts", exclusive: true })
    expect(a.ok).toBe(true)

    const b = state.claimFile({ sessionId: "s2", path: "/foo.ts", exclusive: true })
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.conflictWith).toBe("s1")
  })

  test("re-claim by same session is idempotent (no signal churn)", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    let publishes = 0
    effect(() => {
      state.claims()
      publishes++
    })

    state.claimFile({ sessionId: "s1", path: "/foo.ts", exclusive: true })
    state.claimFile({ sessionId: "s1", path: "/foo.ts", exclusive: true })
    state.claimFile({ sessionId: "s1", path: "/foo.ts", exclusive: true })

    // 1 initial subscribe + 1 actual change = 2. The two redundant calls
    // must not republish (proves the idempotent shortcut is in place).
    expect(publishes).toBe(2)
  })

  test("advisory claims stack on the same path across sessions (no conflict)", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    const a = state.claimFile({ sessionId: "s1", path: "/foo.ts", exclusive: false })
    const b = state.claimFile({ sessionId: "s2", path: "/foo.ts", exclusive: false })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(state.claims()).toHaveLength(2)
  })

  test("upgrading advisory → exclusive succeeds when no other holder", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    state.claimFile({ sessionId: "s1", path: "/foo.ts", exclusive: false })
    const upgrade = state.claimFile({ sessionId: "s1", path: "/foo.ts", exclusive: true })
    expect(upgrade.ok).toBe(true)
    if (upgrade.ok) expect(upgrade.claim.exclusive).toBe(true)
    // Replaced — only one entry left (from s1, now exclusive).
    expect(state.claims().filter((c: FileClaim) => c.sessionId === "s1")).toHaveLength(1)
  })

  test("exclusive claim against existing advisory from different session conflicts", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    state.claimFile({ sessionId: "s1", path: "/foo.ts", exclusive: false })
    // Advisory holders should NOT block exclusive (advisory means "I might
    // read, fine if others read too"). The conflict policy is only on
    // exclusive ⇄ exclusive collisions per the doc.
    const ex = state.claimFile({ sessionId: "s2", path: "/foo.ts", exclusive: true })
    expect(ex.ok).toBe(true)
  })

  test("releaseFile removes only the matching (sessionId, path) pair", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    state.claimFile({ sessionId: "s1", path: "/a.ts" })
    state.claimFile({ sessionId: "s1", path: "/b.ts" })
    state.claimFile({ sessionId: "s2", path: "/c.ts" })

    state.releaseFile({ sessionId: "s1", path: "/a.ts" })
    const rest = state.claims()
    expect(rest).toHaveLength(2)
    expect(rest.find((c) => c.path === "/a.ts")).toBeUndefined()
  })

  test("releaseFile is a no-op for unknown (sessionId, path)", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    state.releaseFile({ sessionId: "s1", path: "/nope.ts" })
    expect(state.claims()).toHaveLength(0)
  })
})

describe("cross-agent-state — handoffs", () => {
  test("propose → accept lifecycle", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    const id = state.proposeHandoff({ fromSessionId: "s1", toSessionId: "s2", content: "take this" })
    let snap = state.handoffs()
    expect(snap).toHaveLength(1)
    expect(snap[0]?.status).toBe("pending")

    state.acceptHandoff(id)
    snap = state.handoffs()
    expect(snap[0]?.status).toBe("accepted")
    expect(snap[0]?.resolvedAt).toBeDefined()
  })

  test("propose → reject lifecycle", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    const id = state.proposeHandoff({ fromSessionId: "s1", toSessionId: "s2", content: "x" })
    state.rejectHandoff(id)
    expect(state.handoffs()[0]?.status).toBe("rejected")
  })

  test("accept/reject after resolution is no-op", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    const id = state.proposeHandoff({ fromSessionId: "s1", toSessionId: "s2", content: "x" })
    state.acceptHandoff(id)
    state.rejectHandoff(id) // no-op — already accepted
    const h = state.handoffs()[0] as Handoff
    expect(h.status).toBe("accepted")
  })
})

describe("cross-agent-state — sessions", () => {
  test("addSession is idempotent; updates name/model on re-add but preserves startedAt", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope, { now: () => 100 })

    state.addSession({ sessionId: "s1", name: "alpha", status: "idle", startedAt: 100 })
    state.addSession({ sessionId: "s1", name: "alpha-renamed", status: "thinking", startedAt: 999, model: "opus" })

    const list = state.activeSessions()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe("alpha-renamed")
    expect(list[0]?.startedAt).toBe(100) // preserved
    expect(list[0]?.model).toBe("opus")
    expect(list[0]?.status).toBe("thinking")
  })

  test("removeSession drops the session AND releases its claims", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    state.addSession(s("s1"))
    state.addSession(s("s2"))
    state.claimFile({ sessionId: "s1", path: "/a.ts" })
    state.claimFile({ sessionId: "s2", path: "/b.ts" })

    state.removeSession("s1")
    expect(state.activeSessions()).toHaveLength(1)
    expect(state.activeSessions()[0]?.sessionId).toBe("s2")
    expect(state.claims()).toHaveLength(1)
    expect(state.claims()[0]?.sessionId).toBe("s2")
  })

  test("updateSessionStatus only republishes when status actually changes", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    state.addSession(s("s1"))
    let publishes = 0
    effect(() => {
      state.activeSessions()
      publishes++
    })

    state.updateSessionStatus("s1", "idle") // no change — was idle already
    expect(publishes).toBe(1)
    state.updateSessionStatus("s1", "thinking")
    expect(publishes).toBe(2)
    state.updateSessionStatus("s1", "thinking") // no change
    expect(publishes).toBe(2)
  })
})

describe("cross-agent-state — broadcasts (ring buffer)", () => {
  test("recordBroadcast appends in insertion order", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    state.recordBroadcast({ id: "1", source: "tribe", content: "a", timestamp: 1 })
    state.recordBroadcast({ id: "2", source: "tribe", content: "b", timestamp: 2 })
    expect(state.recentBroadcasts().map((b) => b.content)).toEqual(["a", "b"])
  })

  test("recordBroadcast evicts oldest when over cap", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope, { broadcastCap: 3 })
    for (let i = 0; i < 5; i++) {
      state.recordBroadcast({ id: `${i}`, source: "tribe", content: `m${i}`, timestamp: i })
    }
    const final = state.recentBroadcasts()
    expect(final).toHaveLength(3)
    expect(final.map((b) => b.content)).toEqual(["m2", "m3", "m4"])
  })
})

describe("cross-agent-state — disposal", () => {
  test("disposing scope clears all state and prevents further mutation", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    state.claimFile({ sessionId: "s1", path: "/a.ts" })
    state.addSession(s("s1"))
    state.recordBroadcast({ id: "x", source: "tribe", content: "y", timestamp: 0 })

    await scope[Symbol.asyncDispose]()

    expect(state.claims()).toHaveLength(0)
    expect(state.activeSessions()).toHaveLength(0)
    expect(state.recentBroadcasts()).toHaveLength(0)

    // Post-dispose mutations are no-ops.
    state.claimFile({ sessionId: "s1", path: "/b.ts" })
    expect(state.claims()).toHaveLength(0)
  })
})

describe("cross-agent-state — signal references", () => {
  test("each mutation publishes a fresh array reference", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)

    const refs: ReadonlyArray<FileClaim>[] = []
    effect(() => {
      refs.push(state.claims())
    })

    state.claimFile({ sessionId: "s1", path: "/a.ts" })
    state.claimFile({ sessionId: "s2", path: "/b.ts" })

    expect(refs.length).toBeGreaterThanOrEqual(3)
    // Each captured reference should be a distinct array (===).
    for (let i = 1; i < refs.length; i++) {
      expect(refs[i]).not.toBe(refs[i - 1])
    }
  })
})
