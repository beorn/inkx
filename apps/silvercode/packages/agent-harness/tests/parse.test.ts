import { describe, expect, test } from "vitest"
import {
  type AgentEvent,
  createLineSplitter,
  createSessionStore,
  createStreamJsonParser,
} from "../src/index.ts"

function collect(lines: string[]): AgentEvent[] {
  const events: AgentEvent[] = []
  const p = createStreamJsonParser((e) => events.push(e))
  for (const l of lines) p.push(l)
  return events
}

describe("stream-json parser — M0 fixtures", () => {
  test("system init emits session-init with model + tools", () => {
    const events = collect([
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "sess-1",
        tools: ["Bash", "Edit"],
        mcp_servers: [],
        model: "claude-sonnet-4-6",
        permissionMode: "auto",
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: "session-init",
      sessionId: "sess-1",
      model: "claude-sonnet-4-6",
      mode: "auto",
      cwd: "/work",
      tools: ["Bash", "Edit"],
    })
  })

  test("assistant text stream emits turn-start + deltas + turn-end", () => {
    const events = collect([
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg-1", role: "assistant", content: [] },
        },
        session_id: "sess-1",
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "!" } },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_stop", index: 0 },
      }),
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { input_tokens: 5, output_tokens: 2 },
        },
      }),
    ])

    const kinds = events.map((e) => e.kind)
    expect(kinds).toEqual([
      "turn-start",
      "text-delta",
      "text-delta",
      "turn-end",
    ])
    expect(events[0]).toMatchObject({ kind: "turn-start", role: "assistant", turnId: "msg-1" })
    expect(events[1]).toMatchObject({ kind: "text-delta", text: "Hi" })
    expect(events[3]).toMatchObject({ kind: "turn-end", stopReason: "end_turn" })
  })

  test("tool_use input_json_delta accumulates into parsed input", () => {
    const events = collect([
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg-tool", role: "assistant", content: [] },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "toolu-1", name: "Bash", input: {} },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"cmd"' } },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: ':"ls"}' } },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_stop", index: 0 },
      }),
    ])
    // Expect an initial tool-use + a finalized one with parsed input.
    const toolEvents = events.filter((e) => e.kind === "tool-use") as Array<
      Extract<AgentEvent, { kind: "tool-use" }>
    >
    expect(toolEvents).toHaveLength(2)
    const last = toolEvents[toolEvents.length - 1]!
    expect(last.name).toBe("Bash")
    expect(last.input).toEqual({ cmd: "ls" })
  })

  test("result event emits session-end with cost + usage", () => {
    const events = collect([
      JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: "sess-1",
        total_cost_usd: 0.0087,
        duration_ms: 1441,
        usage: { input_tokens: 3, output_tokens: 8 },
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: "session-end",
      sessionId: "sess-1",
      costUsd: 0.0087,
      durationMs: 1441,
    })
  })

  test("line splitter handles partial chunks and multi-line batches", () => {
    const received: string[] = []
    const split = createLineSplitter((l) => received.push(l))
    split.push('{"a":1}\n{"b":')
    expect(received).toEqual(['{"a":1}'])
    split.push("2}\n")
    expect(received).toEqual(['{"a":1}', '{"b":2}'])
  })

  test("parse error is surfaced, not thrown", () => {
    const events = collect(["not-json"])
    expect(events[0]?.kind).toBe("error")
  })
})

describe("session-store — event folding", () => {
  test("builds a message from turn-start + text-delta + turn-end", () => {
    const store = createSessionStore()
    const now = Date.now()
    store.apply({
      kind: "session-init",
      sessionId: "s" as never,
      cwd: "/",
      model: "m",
      mode: "auto",
      tools: [],
      mcp_servers: [],
      ts: now,
    })
    store.apply({ kind: "turn-start", sessionId: "s" as never, turnId: "t1" as never, role: "assistant", ts: now })
    store.apply({
      kind: "text-delta",
      sessionId: "s" as never,
      turnId: "t1" as never,
      blockIndex: 0,
      text: "Hello",
      ts: now,
    })
    store.apply({
      kind: "text-delta",
      sessionId: "s" as never,
      turnId: "t1" as never,
      blockIndex: 0,
      text: ", world",
      ts: now,
    })
    store.apply({ kind: "turn-end", sessionId: "s" as never, turnId: "t1" as never, stopReason: "end_turn", ts: now })
    const state = store.state.get()
    expect(state.model).toBe("m")
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]!.role).toBe("assistant")
    expect(state.messages[0]!.text).toBe("Hello, world")
    expect(state.messages[0]!.stopReason).toBe("end_turn")
    expect(state.status).toBe("idle")
  })

  test("TodoWrite tool-use updates todos", () => {
    const store = createSessionStore()
    const now = Date.now()
    store.apply({ kind: "turn-start", sessionId: "s" as never, turnId: "t1" as never, role: "assistant", ts: now })
    store.apply({
      kind: "tool-use",
      sessionId: "s" as never,
      turnId: "t1" as never,
      id: "tool-1" as never,
      name: "TodoWrite",
      input: { todos: [{ content: "first", status: "in_progress", activeForm: "Doing first" }] },
      ts: now,
    })
    const state = store.state.get()
    expect(state.todos).toEqual([
      { content: "first", status: "in_progress", activeForm: "Doing first" },
    ])
    expect(state.status).toBe("tool-running")
  })

  test("tool-result attaches to the originating call", () => {
    const store = createSessionStore()
    const now = Date.now()
    store.apply({ kind: "turn-start", sessionId: "s" as never, turnId: "t1" as never, role: "assistant", ts: now })
    store.apply({
      kind: "tool-use",
      sessionId: "s" as never,
      turnId: "t1" as never,
      id: "tool-1" as never,
      name: "Bash",
      input: { command: "ls" },
      ts: now,
    })
    store.apply({
      kind: "tool-result",
      sessionId: "s" as never,
      id: "tool-1" as never,
      output: "README.md",
      ts: now,
    })
    const msg = store.state.get().messages[0]!
    expect(msg.toolResults).toEqual([{ id: "tool-1", output: "README.md", is_error: undefined }])
  })
})
