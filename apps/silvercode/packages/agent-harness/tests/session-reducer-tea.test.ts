/**
 * TEA-discipline invariants for the session reducer.
 *
 * These tests pin the *class* of bug that motivated the refactor
 * (km-silvercode.session-store-tea-refactor): in the legacy imperative
 * `apply()`, the `user-message` case had two independent concerns
 * (optimistic-echo dedup re-key + prompt-echo strip arming) sharing a
 * single switch case. The dedup branch's early `break` skipped the
 * strip-arm, regressing km-silvercode.prompt-concat-into-reply.
 *
 * In the TEA shape (`(state, action) → [state, Effect[]]`), the strip-arm
 * is computed unconditionally from the action *before* the data branching.
 * The pure-data branching cannot accidentally skip it. These tests assert
 * that invariant directly against the reducer's internal state, plus a
 * couple of always-true properties about the reducer:
 *
 *   1. Reducer is pure — same input ⇒ same output (deep-equal).
 *   2. Reducer never mutates the input state.
 *   3. `user-message` with non-empty text MUST arm the strip for the next
 *      assistant turn, regardless of whether a dedup re-key fires or a
 *      fresh upsert fires.
 *   4. Dedup re-key path and fresh upsert path produce structurally
 *      equivalent strip runtimes (both arm `pending = action.text`).
 *   5. `assistant-message` on a turn with no prior streaming events arms
 *      the strip on first encounter (replay path).
 *
 * Bead: km-silvercode.session-store-tea-refactor.
 */

import { describe, expect, test } from "vitest"
import { type InternalSessionState, initialInternalState, publicView, reduce } from "../src/session-reducer.ts"
import type { AgentEvent, SessionId, TurnId } from "../src/events.ts"

const sid = "s-test" as SessionId
const tid = (s: string) => s as TurnId

function snapshot<T>(v: T): T {
  // structuredClone retains the strip Map intact; deep-clones everything
  // for mutation-detection assertions.
  return structuredClone(v)
}

describe("session-reducer — TEA discipline (action → effects, pure)", () => {
  test("reducer is pure: same input ⇒ deep-equal output", () => {
    const a: AgentEvent = {
      kind: "user-message",
      sessionId: sid,
      turnId: tid("u-1"),
      text: "hello",
      ts: 1000,
    }
    const s0 = initialInternalState()
    const before = snapshot(s0)
    const [s1, e1] = reduce(s0, a)
    const [s2, e2] = reduce(s0, a)
    // Same output (modulo Map identity — compare via publicView + Map contents).
    expect(publicView(s1)).toEqual(publicView(s2))
    expect(s1._strip.pending).toBe(s2._strip.pending)
    expect([...s1._strip.byTurn.entries()]).toEqual([...s2._strip.byTurn.entries()])
    expect(e1).toEqual(e2)
    // Input state was not mutated.
    expect(s0).toEqual(before)
  })

  test("reducer does not mutate input state on any AgentEvent variant", () => {
    const events: AgentEvent[] = [
      {
        kind: "session-init",
        sessionId: sid,
        cwd: "/x",
        model: "m",
        mode: "auto",
        tools: [],
        mcp_servers: [],
        slashCommands: [],
        skills: [],
        plugins: [],
        claudeCodeVersion: "2.x",
        apiKeySource: "env",
        ts: 1,
      },
      { kind: "turn-start", sessionId: sid, turnId: tid("u-1"), role: "user", ts: 2 },
      { kind: "user-message", sessionId: sid, turnId: tid("u-1"), text: "hi", ts: 3 },
      { kind: "turn-start", sessionId: sid, turnId: tid("a-1"), role: "assistant", ts: 4 },
      { kind: "text-delta", sessionId: sid, turnId: tid("a-1"), blockIndex: 0, text: "hi", ts: 5 },
      { kind: "text-delta", sessionId: sid, turnId: tid("a-1"), blockIndex: 0, text: "world", ts: 6 },
      { kind: "turn-end", sessionId: sid, turnId: tid("a-1"), stopReason: "end_turn", ts: 7 },
    ]
    let s: InternalSessionState = initialInternalState()
    for (const a of events) {
      const before = snapshot(s)
      const [next] = reduce(s, a)
      // Original wasn't mutated.
      expect(s).toEqual(before)
      s = next
    }
  })

  // ──────────────────────────────────────────────────────────────────────
  // The pinned regression: strip-arm must fire regardless of which data-
  // branch runs in `user-message`.
  // ──────────────────────────────────────────────────────────────────────

  test("user-message with non-empty text ALWAYS arms the strip (fresh upsert path)", () => {
    const s0 = initialInternalState()
    const [s1] = reduce(s0, {
      kind: "user-message",
      sessionId: sid,
      turnId: tid("uuid-fresh"),
      text: "what repo is this?",
      ts: 100,
    })
    expect(s1._strip.pending).toBe("what repo is this?")
    expect(s1.messages).toHaveLength(1)
    expect(s1.messages[0]!.id).toBe("uuid-fresh")
  })

  test("user-message with non-empty text ALWAYS arms the strip (optimistic-dedup re-key path)", () => {
    // Step 1: optimistic apply with `u-<ts>` turnId — no echo yet.
    let s: InternalSessionState = initialInternalState()
    ;[s] = reduce(s, {
      kind: "user-message",
      sessionId: sid,
      turnId: tid("u-1700000000000"),
      text: "what repo is this?",
      ts: 1_700_000_000_000,
    })
    // After optimistic apply the strip is armed pointing to the prompt
    // (the next assistant turn will consume it on turn-start).
    expect(s._strip.pending).toBe("what repo is this?")

    // Step 2: agent echo with canonical turnId — the dedup branch fires.
    // The legacy imperative shape's `break` after re-key skipped the
    // strip-arm assignment; the TEA reducer computes strip-arm BEFORE the
    // data branch, so this assertion catches any future regression that
    // moves strip-arm back inside the branch.
    ;[s] = reduce(s, {
      kind: "user-message",
      sessionId: sid,
      turnId: tid("uuid-canonical"),
      text: "what repo is this?",
      ts: 1_700_000_000_100,
    })
    // INVARIANT: strip is still armed with the prompt — re-key path
    // didn't lose the arming.
    expect(s._strip.pending).toBe("what repo is this?")
    // INVARIANT: dedup collapsed the messages — only one user entry,
    // re-keyed onto the canonical turnId.
    expect(s.messages).toHaveLength(1)
    expect(s.messages[0]!.id).toBe("uuid-canonical")
  })

  test("user-message paths converge: dedup re-key and fresh upsert produce equal strip state", () => {
    // Both paths start from the same prompt; the resulting strip runtime
    // (the part that matters for the next assistant turn) MUST be
    // structurally equal — that's the point of the TEA refactor.
    const prompt = "compare paths"

    // Path A: fresh upsert (no prior optimistic entry).
    let sA = initialInternalState()
    ;[sA] = reduce(sA, {
      kind: "user-message",
      sessionId: sid,
      turnId: tid("uuid-A"),
      text: prompt,
      ts: 100,
    })

    // Path B: optimistic + canonical (dedup re-key fires).
    let sB = initialInternalState()
    ;[sB] = reduce(sB, {
      kind: "user-message",
      sessionId: sid,
      turnId: tid("u-100"),
      text: prompt,
      ts: 100,
    })
    ;[sB] = reduce(sB, {
      kind: "user-message",
      sessionId: sid,
      turnId: tid("uuid-B"),
      text: prompt,
      ts: 200,
    })

    // INVARIANT (the refactor's structural promise): both paths arm
    // strip identically.
    expect(sA._strip.pending).toBe(sB._strip.pending)
    expect(sA._strip.pending).toBe(prompt)
  })

  // ──────────────────────────────────────────────────────────────────────
  // End-to-end: the regression itself, against publicView (what subscribers see).
  // ──────────────────────────────────────────────────────────────────────

  test("regression: optimistic-dedup path strips echoed prompt from assistant text-delta", () => {
    // The exact bug shape km-silvercode.prompt-concat-into-reply fixed,
    // re-pinned at the reducer level. A regression here implies the
    // strip-arm was skipped on the dedup re-key path.
    const prompt = "what repo is this?"
    const reply = "Vault — Knowledge Machine"
    const ts = 1_700_000_000_000
    let s: InternalSessionState = initialInternalState()
    const events: AgentEvent[] = [
      { kind: "user-message", sessionId: sid, turnId: tid(`u-${ts}`), text: prompt, ts },
      { kind: "user-message", sessionId: sid, turnId: tid("uuid-canonical-1234"), text: prompt, ts: ts + 100 },
      { kind: "turn-start", sessionId: sid, turnId: tid("msg_xyz"), role: "assistant", ts: ts + 200 },
      {
        kind: "text-delta",
        sessionId: sid,
        turnId: tid("msg_xyz"),
        blockIndex: 0,
        text: prompt + reply,
        ts: ts + 300,
      },
    ]
    for (const a of events) [s] = reduce(s, a)
    const view = publicView(s)
    expect(view.messages).toHaveLength(2)
    expect(view.messages[1]!.role).toBe("assistant")
    expect(view.messages[1]!.text).toBe(reply)
    expect(view.messages[1]!.text.startsWith(prompt)).toBe(false)
  })

  // ──────────────────────────────────────────────────────────────────────
  // Replay path: assistant-message arms strip on first encounter.
  // ──────────────────────────────────────────────────────────────────────

  test("assistant-message on resume path arms strip when no streaming preceded", () => {
    const prompt = "what repo is this?"
    const reply = "km."
    let s: InternalSessionState = initialInternalState()
    ;[s] = reduce(s, { kind: "user-message", sessionId: sid, turnId: tid("u-1"), text: prompt, ts: 1 })
    // Strip armed; pending populated.
    expect(s._strip.pending).toBe(prompt)
    ;[s] = reduce(s, {
      kind: "assistant-message",
      sessionId: sid,
      turnId: tid("a-1"),
      content: [{ type: "text", text: prompt + reply }],
      ts: 2,
    })
    // INVARIANT: assistant-message moved the pending prompt into the per-
    // turn strip map and consumed it from the content blocks. The visible
    // text is the post-prompt suffix only.
    expect(s._strip.pending).toBe("")
    expect(s._strip.byTurn.has(tid("a-1"))).toBe(true)
    const view = publicView(s)
    expect(view.messages[1]!.text).toBe(reply)
  })

  // ──────────────────────────────────────────────────────────────────────
  // publicView projects away private state.
  // ──────────────────────────────────────────────────────────────────────

  test("publicView omits the private _strip field", () => {
    let s: InternalSessionState = initialInternalState()
    ;[s] = reduce(s, { kind: "user-message", sessionId: sid, turnId: tid("u-1"), text: "x", ts: 1 })
    const view = publicView(s)
    expect((view as Record<string, unknown>)._strip).toBeUndefined()
    // But internal state still has it (sanity check the projection isn't
    // doing the wrong direction).
    expect(s._strip.pending).toBe("x")
  })

  test("effects array is currently empty for every AgentEvent variant", () => {
    // Documents the current state of the Effect union — it's `never`.
    // When future variants are added, this test will need updating, and
    // the `Effect` type's compile-time exhaustiveness will surface
    // missing handlers in `runEffect`.
    const events: AgentEvent[] = [
      {
        kind: "session-init",
        sessionId: sid,
        cwd: "",
        model: "",
        mode: "",
        tools: [],
        mcp_servers: [],
        slashCommands: [],
        skills: [],
        plugins: [],
        claudeCodeVersion: "",
        apiKeySource: "",
        ts: 1,
      },
      { kind: "turn-start", sessionId: sid, turnId: tid("a"), role: "assistant", ts: 1 },
      { kind: "user-message", sessionId: sid, turnId: tid("u"), text: "x", ts: 1 },
      { kind: "text-delta", sessionId: sid, turnId: tid("a"), blockIndex: 0, text: "x", ts: 1 },
      { kind: "thinking-delta", sessionId: sid, turnId: tid("a"), blockIndex: 0, text: "x", ts: 1 },
      { kind: "turn-end", sessionId: sid, turnId: tid("a"), ts: 1 },
    ]
    let s: InternalSessionState = initialInternalState()
    for (const a of events) {
      const [next, effects] = reduce(s, a)
      expect(effects).toEqual([])
      s = next
    }
  })
})
