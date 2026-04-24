import { describe, expect, test } from "vitest"
import {
  createSessionStore,
  createStreamJsonParser,
  type AgentEvent,
} from "@silvery/agent-harness"

/**
 * End-to-end M0 contract: feeding a realistic stream-json fixture into the
 * parser + session-store produces the state the UI renders (MessageList
 * iteration, TodoPanel projection, StatusLine token/cost counts).
 *
 * This is the M0 dogfood assertion expressed as a test so we don't rely on a
 * live `claude` subprocess in CI. The live-spawn path is exercised manually
 * per the M0 dogfood criterion.
 */

const FIXTURE: string[] = [
  JSON.stringify({
    type: "system",
    subtype: "init",
    cwd: "/work",
    session_id: "s-abc",
    tools: ["Bash", "Read"],
    mcp_servers: [],
    model: "claude-sonnet-4-6",
    permissionMode: "auto",
  }),
  JSON.stringify({
    type: "stream_event",
    event: {
      type: "message_start",
      message: { id: "msg-1", role: "assistant", content: [] },
    },
  }),
  JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  }),
  JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Reading " } },
  }),
  JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "the file…" } },
  }),
  JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_stop", index: 0 },
  }),
  JSON.stringify({
    type: "stream_event",
    event: {
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", id: "toolu-1", name: "Read", input: {} },
    },
  }),
  JSON.stringify({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '{"file_path":"a.ts"}' },
    },
  }),
  JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_stop", index: 1 },
  }),
  JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu-1", content: "contents of a.ts" }],
    },
  }),
  JSON.stringify({
    type: "stream_event",
    event: {
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
      usage: { input_tokens: 100, output_tokens: 20 },
    },
  }),
  JSON.stringify({
    type: "result",
    subtype: "success",
    session_id: "s-abc",
    total_cost_usd: 0.0025,
    duration_ms: 1234,
  }),
]

describe("silvercode M0 — parser + session-store integration", () => {
  test("a full turn with text + tool call renders into one MessageEntry", () => {
    const events: AgentEvent[] = []
    const parser = createStreamJsonParser((e) => events.push(e))
    for (const line of FIXTURE) parser.push(line)

    const store = createSessionStore()
    for (const e of events) store.apply(e)

    const state = store.state.get()
    expect(state.sessionId).toBe("s-abc")
    expect(state.model).toBe("claude-sonnet-4-6")
    expect(state.mode).toBe("auto")
    expect(state.messages).toHaveLength(1)
    const msg = state.messages[0]!
    expect(msg.role).toBe("assistant")
    expect(msg.text).toBe("Reading the file…")
    expect(msg.toolCalls).toHaveLength(1)
    expect(msg.toolCalls[0]).toMatchObject({ name: "Read", input: { file_path: "a.ts" } })
    expect(msg.toolResults).toHaveLength(1)
    expect(msg.toolResults[0]?.output).toBe("contents of a.ts")
    expect(state.cost.usd).toBeCloseTo(0.0025)
    expect(state.cost.inputTokens).toBeGreaterThan(0)
  })
})
