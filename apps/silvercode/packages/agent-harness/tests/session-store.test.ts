/**
 * session-store ops-order tests — bead km-silvercode.codex-bundling-order.
 *
 * The session store builds a MessageEntry's `ops` array preserving the
 * agent's emission order. This was rewritten from the legacy `text` +
 * `toolCalls[]` flatten, which collapsed codex-shaped sequences (text →
 * tool → text → tool, repeated many times) into "all text first, all tools
 * after." That bug was reported with screenshots — many tool calls
 * appeared stacked under no/empty assistant text in the UI.
 *
 * These tests pin:
 *   1. Codex-shape interleave (text/tool/text/tool) → 4 ops in arrival order.
 *   2. Claude-shape coalesce (text×3 + tool×2) → 1 text op + 2 tool ops.
 *   3. tool-result on a later turn attaches to the originating tool op.
 *   4. Backward-compat: `.text` / `.toolCalls` / `.toolResults` projections
 *      still resolve correctly even with interleaving.
 */

import { describe, expect, test } from "vitest"
import { createSessionStore } from "../src/session-store.ts"
import type { AgentEvent, SessionId, ToolUseId, TurnId } from "../src/events.ts"

const sid = "s-test" as SessionId
const tid = (n: number) => `t${n}` as TurnId
const tu = (n: number) => `tu_${n}` as ToolUseId

/**
 * Build the events for one assistant turn: a `turn-start` plus the
 * supplied content events. Caller threads the per-event `ts` if order
 * matters at the timestamp level (it doesn't here — the store relies on
 * delivery order, not on timestamps).
 */
function turn(
  turnId: TurnId,
  steps: ReadonlyArray<{ kind: "text"; text: string } | { kind: "tool"; id: ToolUseId; name: string; input?: unknown }>,
): AgentEvent[] {
  const out: AgentEvent[] = [{ kind: "turn-start", sessionId: sid, turnId, role: "assistant", ts: 0 }]
  let blockIndex = 0
  for (const s of steps) {
    if (s.kind === "text") {
      out.push({
        kind: "text-delta",
        sessionId: sid,
        turnId,
        blockIndex: blockIndex++,
        text: s.text,
        ts: 0,
      })
    } else {
      out.push({
        kind: "tool-use",
        sessionId: sid,
        turnId,
        id: s.id,
        name: s.name,
        input: s.input ?? {},
        ts: 0,
      })
    }
  }
  return out
}

describe("session-store — ops-order preservation (codex bundling fix)", () => {
  test("codex-shape interleave: text → tool → text → tool produces 4 ops in order", () => {
    const store = createSessionStore()
    const t = tid(1)
    for (const e of turn(t, [
      { kind: "text", text: "Reading config…" },
      { kind: "tool", id: tu(1), name: "Read", input: { file_path: "a.ts" } },
      { kind: "text", text: "Now searching…" },
      { kind: "tool", id: tu(2), name: "Grep", input: { pattern: "TODO" } },
    ])) {
      store.apply(e)
    }

    const msg = store.state.get().messages[0]!
    expect(msg.ops).toHaveLength(4)
    expect(msg.ops[0]).toEqual({ kind: "text", text: "Reading config…" })
    expect(msg.ops[1]).toMatchObject({ kind: "tool", toolCall: { id: tu(1), name: "Read" } })
    expect(msg.ops[2]).toEqual({ kind: "text", text: "Now searching…" })
    expect(msg.ops[3]).toMatchObject({ kind: "tool", toolCall: { id: tu(2), name: "Grep" } })

    // Backward-compat projections still expose the legacy shape — text is
    // ALL text concatenated; toolCalls keeps original arrival order.
    expect(msg.text).toBe("Reading config…Now searching…")
    expect(msg.toolCalls.map((c) => c.name)).toEqual(["Read", "Grep"])
  })

  test("claude-shape coalesce: text×3 + tool×2 → 1 text op + 2 tool ops", () => {
    // Multi-chunk streaming text from Claude — typical "model emits one
    // paragraph then both tool calls at once." Three text deltas should
    // coalesce into one `text` op since no tool-use intervenes.
    const store = createSessionStore()
    const t = tid(1)
    for (const e of turn(t, [
      { kind: "text", text: "I'll " },
      { kind: "text", text: "read the file " },
      { kind: "text", text: "and grep for TODOs." },
      { kind: "tool", id: tu(1), name: "Read", input: { file_path: "a.ts" } },
      { kind: "tool", id: tu(2), name: "Grep", input: { pattern: "TODO" } },
    ])) {
      store.apply(e)
    }

    const msg = store.state.get().messages[0]!
    expect(msg.ops).toHaveLength(3)
    expect(msg.ops[0]).toEqual({
      kind: "text",
      text: "I'll read the file and grep for TODOs.",
    })
    expect(msg.ops[1]).toMatchObject({ kind: "tool", toolCall: { id: tu(1), name: "Read" } })
    expect(msg.ops[2]).toMatchObject({ kind: "tool", toolCall: { id: tu(2), name: "Grep" } })
  })

  test("tool-result on a later turn attaches to its originating tool op", () => {
    const store = createSessionStore()
    const t1 = tid(1)
    const t2 = tid(2)

    // Turn 1 emits a tool-use; result arrives in turn 2's window.
    for (const e of turn(t1, [
      { kind: "text", text: "Reading…" },
      { kind: "tool", id: tu(7), name: "Read", input: { file_path: "x.ts" } },
    ])) {
      store.apply(e)
    }

    // Tool result lands on a later turn (cross-turn delivery is the
    // normal codex/claude shape: model emits use, then the harness
    // delivers result mid- or post-next-prompt).
    store.apply({
      kind: "tool-result",
      sessionId: sid,
      id: tu(7),
      output: "contents of x.ts",
      is_error: false,
      ts: 0,
    })

    // A subsequent assistant turn begins.
    for (const e of turn(t2, [{ kind: "text", text: "Got it." }])) store.apply(e)

    const messages = store.state.get().messages
    expect(messages).toHaveLength(2)
    const first = messages[0]!
    const toolOp = first.ops.find((op) => op.kind === "tool")
    expect(toolOp).toBeDefined()
    if (toolOp?.kind === "tool") {
      expect(toolOp.result).toBeDefined()
      expect(toolOp.result?.output).toBe("contents of x.ts")
      expect(toolOp.result?.is_error).toBe(false)
    }

    // Backward-compat projection — toolResults still resolves the result
    // through the legacy getter API.
    expect(first.toolResults).toHaveLength(1)
    expect(first.toolResults[0]?.output).toBe("contents of x.ts")
  })

  test("tool-result attaches even when many text/tool ops sit between use and result", () => {
    // Codex-shape stress: many text+tool transitions inside one turn,
    // result arrives last. The matcher in the reducer must scan ALL
    // messages' ops, not just trailing ones.
    const store = createSessionStore()
    const t = tid(1)
    for (const e of turn(t, [
      { kind: "text", text: "step 1" },
      { kind: "tool", id: tu(1), name: "Read", input: { file_path: "a" } },
      { kind: "text", text: "step 2" },
      { kind: "tool", id: tu(2), name: "Read", input: { file_path: "b" } },
      { kind: "text", text: "step 3" },
      { kind: "tool", id: tu(3), name: "Read", input: { file_path: "c" } },
    ])) {
      store.apply(e)
    }

    // Result arrives for the FIRST tool-use, not the last.
    store.apply({
      kind: "tool-result",
      sessionId: sid,
      id: tu(1),
      output: "contents of a",
      ts: 0,
    })

    const msg = store.state.get().messages[0]!
    const firstToolOp = msg.ops.find((op) => op.kind === "tool" && op.toolCall.id === tu(1))
    if (firstToolOp?.kind !== "tool") throw new Error("expected tool op")
    expect(firstToolOp.result?.output).toBe("contents of a")
    // Other tool ops remain unattached.
    const otherToolOps = msg.ops.filter((op) => op.kind === "tool" && op.toolCall.id !== tu(1))
    for (const op of otherToolOps) {
      if (op.kind === "tool") expect(op.result).toBeUndefined()
    }
  })

  test("resumed transcript: assistant-message with interleaved blocks derives ops in order", () => {
    // Replay path — `--resume` skips streaming events and only fires
    // `assistant-message` with the final blocks. Order in the blocks
    // array must be preserved as ops order (text and tool_use blocks
    // can be interleaved, just like live).
    const store = createSessionStore()
    const t = tid(1)
    store.apply({
      kind: "assistant-message",
      sessionId: sid,
      turnId: t,
      content: [
        { type: "text", text: "First, reading…" },
        { type: "tool_use", id: tu(1), name: "Read", input: { file_path: "a" } },
        { type: "text", text: "Then grep:" },
        { type: "tool_use", id: tu(2), name: "Grep", input: { pattern: "x" } },
      ],
      ts: 0,
    })

    const msg = store.state.get().messages[0]!
    expect(msg.ops).toHaveLength(4)
    expect(msg.ops[0]).toEqual({ kind: "text", text: "First, reading…" })
    expect(msg.ops[1]).toMatchObject({ kind: "tool", toolCall: { id: tu(1), name: "Read" } })
    expect(msg.ops[2]).toEqual({ kind: "text", text: "Then grep:" })
    expect(msg.ops[3]).toMatchObject({ kind: "tool", toolCall: { id: tu(2), name: "Grep" } })
  })
})

describe("user-message — optimistic + echo dedup", () => {
  test("optimistic apply + agent echo with different turnId → ONE entry, not two", () => {
    // Repro for the screenshot reported on 2026-04-27. The controller
    // flushes a user prompt with an optimistic turnId `u-${Date.now()}`
    // for instant feedback, then `s.session.send(text)` ships the prompt
    // to Claude. Claude writes it to its JSONL transcript, and parse.ts
    // emits a *second* `user-message` event with a JSONL-uuid turnId.
    // Without dedup, the user sees their prompt rendered twice.
    const store = createSessionStore()
    const text = "can you fix the bug"
    const ts = 1_700_000_000_000
    // Step 1: controller's optimistic apply.
    store.apply({
      kind: "user-message",
      sessionId: sid,
      turnId: "u-1700000000000" as TurnId,
      text,
      ts,
    })
    // Step 2: Claude echoes the same prompt back via stream-json with
    // its own JSONL uuid as the turnId — arrives ~50-200ms later.
    store.apply({
      kind: "user-message",
      sessionId: sid,
      turnId: "uuid-deadbeef-1234" as TurnId,
      text,
      ts: ts + 150,
    })
    const messages = store.state.get().messages
    expect(messages).toHaveLength(1)
    // The single surviving entry MUST be re-keyed to the canonical
    // (uuid-shaped) turnId so subsequent `tool-result` lookups, scroll
    // anchors, and turn-end attaches resolve correctly.
    expect(messages[0]!.id).toBe("uuid-deadbeef-1234")
    expect(messages[0]!.role).toBe("user")
    expect(messages[0]!.text).toBe(text)
  })

  test("two distinct prompts with the same text DO render as two entries", () => {
    // Dedup is a near-window heuristic, not a content equality. If the
    // user sends "ok" twice across separate turns, both must appear.
    const store = createSessionStore()
    const text = "ok"
    store.apply({
      kind: "user-message",
      sessionId: sid,
      turnId: "u-100" as TurnId,
      text,
      ts: 100,
    })
    store.apply({
      kind: "user-message",
      sessionId: sid,
      turnId: "uuid-aaa" as TurnId,
      text,
      ts: 250, // within 5s window — echo collapses
    })
    expect(store.state.get().messages).toHaveLength(1)
    // Outside the window — second prompt must NOT collapse.
    store.apply({
      kind: "user-message",
      sessionId: sid,
      turnId: "u-99999999" as TurnId,
      text,
      ts: 300_000,
    })
    expect(store.state.get().messages).toHaveLength(2)
  })

  test("optimistic with empty text + echo with empty text doesn't crash", () => {
    // Edge case: meta-only entries (additionalContext only) skip dedup
    // because there's no text to match on.
    const store = createSessionStore()
    store.apply({
      kind: "user-message",
      sessionId: sid,
      turnId: "u-1" as TurnId,
      text: "",
      additionalContext: "[isMeta]\nhook output",
      ts: 1,
    })
    expect(store.state.get().messages).toHaveLength(1)
  })
})
