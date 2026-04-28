/**
 * Bug: km-silvercode.prompt-concat-into-reply.
 *
 * Some agent paths emit the assistant turn's first text-delta with the
 * user prompt prepended to the model's reply, no separator. Renders as
 * `● what repo is this?km — Knowledge Machine ...` — the user's prompt
 * is glued to the start of the assistant text. This is adjacent to the
 * already-fixed two-row duplicate (km-silvercode.duplicate-prompt) but
 * lands as a single concatenated row instead.
 *
 * Defence: when the first text op of an assistant turn opens with the
 * most-recent user prompt verbatim, strip the prefix at the store layer.
 * Same shape as the duplicate-prompt dedup — guard the rendered surface
 * regardless of which agent emitted the bad shape.
 */

import { describe, expect, test } from "vitest"
import { createSessionStore } from "../src/session-store.ts"
import type { AgentEvent, SessionId, TurnId } from "../src/events.ts"

const sid = "s-test" as SessionId
const u = (id: string) => id as TurnId
const a = (id: string) => id as TurnId

describe("session-store — strip echoed prompt from assistant turn", () => {
  test("text-delta whose text starts with the user prompt has the prefix stripped", () => {
    const store = createSessionStore()
    const userTurn = u("u-uuid")
    const asstTurn = a("msg_xyz")
    const prompt = "what repo is this?"
    const reply = "km — Knowledge Machine (~/Code/pim/km/). TypeScript, Bun, Silvery TUI, SQLite."

    const events: AgentEvent[] = [
      { kind: "user-message", sessionId: sid, turnId: userTurn, text: prompt, ts: 1 },
      { kind: "turn-start", sessionId: sid, turnId: asstTurn, role: "assistant", ts: 2 },
      // The echoed-prompt-prefixed delta — what the screenshot reproduced.
      { kind: "text-delta", sessionId: sid, turnId: asstTurn, blockIndex: 0, text: prompt + reply, ts: 3 },
    ]
    for (const e of events) store.apply(e)

    const msgs = store.state.get().messages
    expect(msgs).toHaveLength(2)
    const userMsg = msgs[0]!
    const asstMsg = msgs[1]!
    expect(userMsg.role).toBe("user")
    expect(userMsg.text).toBe(prompt)
    expect(asstMsg.role).toBe("assistant")
    expect(asstMsg.text).toBe(reply)
    expect(asstMsg.text.startsWith(prompt)).toBe(false)
  })

  test("split deltas: prompt arrives in delta 1, reply in delta 2 — prompt still stripped", () => {
    const store = createSessionStore()
    const userTurn = u("u-uuid")
    const asstTurn = a("msg_xyz")
    const prompt = "what repo is this?"
    const reply = "km — Knowledge Machine."

    const events: AgentEvent[] = [
      { kind: "user-message", sessionId: sid, turnId: userTurn, text: prompt, ts: 1 },
      { kind: "turn-start", sessionId: sid, turnId: asstTurn, role: "assistant", ts: 2 },
      { kind: "text-delta", sessionId: sid, turnId: asstTurn, blockIndex: 0, text: prompt, ts: 3 },
      { kind: "text-delta", sessionId: sid, turnId: asstTurn, blockIndex: 0, text: reply, ts: 4 },
    ]
    for (const e of events) store.apply(e)

    const asstMsg = store.state.get().messages[1]!
    expect(asstMsg.role).toBe("assistant")
    expect(asstMsg.text).toBe(reply)
  })

  test("assistant-message aggregate: first text block opens with prompt → stripped", () => {
    // Replay path / non-streaming agents emit the aggregate only.
    const store = createSessionStore()
    const userTurn = u("u-uuid")
    const asstTurn = a("msg_xyz")
    const prompt = "what repo is this?"
    const reply = "km — Knowledge Machine."

    const events: AgentEvent[] = [
      { kind: "user-message", sessionId: sid, turnId: userTurn, text: prompt, ts: 1 },
      {
        kind: "assistant-message",
        sessionId: sid,
        turnId: asstTurn,
        content: [{ type: "text", text: prompt + reply }],
        ts: 2,
      },
    ]
    for (const e of events) store.apply(e)

    const asstMsg = store.state.get().messages[1]!
    expect(asstMsg.role).toBe("assistant")
    expect(asstMsg.text).toBe(reply)
  })

  test("assistant text that legitimately contains the prompt mid-reply is untouched", () => {
    // Defensive: only strip when the text *opens* with the prompt verbatim.
    // A reply that quotes the question later in the body must pass through.
    const store = createSessionStore()
    const userTurn = u("u-uuid")
    const asstTurn = a("msg_xyz")
    const prompt = "what repo is this?"
    const reply = `Sure — to answer "${prompt}": km — Knowledge Machine.`

    const events: AgentEvent[] = [
      { kind: "user-message", sessionId: sid, turnId: userTurn, text: prompt, ts: 1 },
      { kind: "turn-start", sessionId: sid, turnId: asstTurn, role: "assistant", ts: 2 },
      { kind: "text-delta", sessionId: sid, turnId: asstTurn, blockIndex: 0, text: reply, ts: 3 },
    ]
    for (const e of events) store.apply(e)

    const asstMsg = store.state.get().messages[1]!
    expect(asstMsg.text).toBe(reply)
  })

  test("empty user prompt — no stripping", () => {
    const store = createSessionStore()
    const asstTurn = a("msg_xyz")
    const reply = "Hello!"
    // No user-message at all (e.g. fresh session, agent greets).
    const events: AgentEvent[] = [
      { kind: "turn-start", sessionId: sid, turnId: asstTurn, role: "assistant", ts: 1 },
      { kind: "text-delta", sessionId: sid, turnId: asstTurn, blockIndex: 0, text: reply, ts: 2 },
    ]
    for (const e of events) store.apply(e)
    const asstMsg = store.state.get().messages[0]!
    expect(asstMsg.text).toBe(reply)
  })
})
