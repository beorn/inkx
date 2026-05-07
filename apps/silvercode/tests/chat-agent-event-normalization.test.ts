import type { AgentEvent, PermissionRequestId, SessionId, ToolUseId, TurnId } from "@km/agent-harness"
import { parseAgentEvent } from "@km/agent-harness"
import { describe, expect, test } from "vitest"
import { parseChatEvent } from "../src/chat/event-handling.ts"
import {
  AGENT_EVENT_CHAT_PROJECTION,
  normalizeAgentEventsToChatEvents,
  normalizeAgentEventToChatEvents,
} from "../src/chat/normalize-agent-event.ts"
import type { ChatEvent, ChatEventType } from "../src/chat/types.ts"

function id<T>(value: string): T {
  return value as T
}

function isMessagePartAdded(event: ChatEvent): event is ChatEvent<"message.part.added"> {
  return event.type === "message.part.added"
}

function isToolStarted(event: ChatEvent): event is ChatEvent<"tool.started"> {
  return event.type === "tool.started"
}

const sessionId = id<SessionId>("session-1")
const turnId = id<TurnId>("turn-1")
const toolId = id<ToolUseId>("tool-1")
const permissionId = id<PermissionRequestId>("permission-1")

const events = [
  {
    kind: "session-init",
    sessionId,
    cwd: "/repo",
    model: "claude-sonnet",
    mode: "auto",
    tools: ["Read", "Bash"],
    mcp_servers: ["km"],
    slashCommands: ["/handoff"],
    skills: ["tdd"],
    plugins: ["Browser Use"],
    claudeCodeVersion: "2.1.119",
    apiKeySource: "OAuth",
    ts: 1,
  },
  { kind: "turn-start", sessionId, turnId, role: "assistant", ts: 2 },
  { kind: "text-delta", sessionId, turnId, blockIndex: 0, text: "Done", ts: 3 },
  { kind: "thinking-delta", sessionId, turnId, blockIndex: 1, text: "Checking", ts: 4 },
  { kind: "tool-use", sessionId, turnId, id: toolId, name: "Bash", input: { command: "pwd" }, ts: 5 },
  { kind: "tool-result", sessionId, id: toolId, output: "ok", ts: 6 },
  {
    kind: "permission-request",
    sessionId,
    requestId: permissionId,
    tool: "Bash",
    args: { command: "rm -rf tmp" },
    options: [{ optionId: "allow" as never, name: "Allow", kind: "allow_once" }],
    ts: 7,
  },
  { kind: "permission-decision", sessionId, requestId: permissionId, approved: true, ts: 8 },
  { kind: "liveness-check", sessionId, staleAfterMs: 5000, ts: 9 },
  { kind: "turn-end", sessionId, turnId, stopReason: "stop", usage: { input_tokens: 1, output_tokens: 2 }, ts: 10 },
  {
    kind: "assistant-message",
    sessionId,
    turnId: "turn-2" as TurnId,
    content: [{ type: "text", text: "hello" }],
    ts: 11,
  },
  { kind: "user-message", sessionId, turnId: "turn-3" as TurnId, text: "hi", ts: 12 },
  { kind: "raw-transcript", sessionId, turnId, label: "Queue operation", raw: { op: "enqueue" }, ts: 13 },
  { kind: "status", sessionId, status: "requesting", ts: 14 },
  {
    kind: "plan-update",
    sessionId,
    source: "codex-plan",
    entries: [{ id: "task-1", content: "Implement", status: "in_progress" }],
    ts: 15,
  },
  { kind: "slash-commands-update", sessionId, slashCommands: ["/handoff", "/fork"], ts: 16 },
  { kind: "session-end", sessionId, stopReason: "complete", durationMs: 42, ts: 17 },
  {
    kind: "handoff",
    from: "session-1" as SessionId,
    to: "session-2" as SessionId,
    context: { prompt: "continue" },
    ts: 18,
  },
  { kind: "km-reference", sessionId, nodeId: "node-1", relation: "context", ts: 19 },
  { kind: "session-lifecycle", sessionId, state: "ended", ts: 20 },
  { kind: "error", sessionId, message: "boom", raw: { code: 1 }, ts: 21 },
] satisfies AgentEvent[]

describe("normalizeAgentEventToChatEvents", () => {
  test("strictly maps every AgentEvent kind to parsed ChatEvents with raw detail", () => {
    expect(Object.keys(AGENT_EVENT_CHAT_PROJECTION)).toEqual(events.map((event) => event.kind))

    const observed: Record<string, ChatEventType[]> = {}
    for (const event of events) {
      const normalized = normalizeAgentEventToChatEvents(event, { sessionId })
      expect(normalized.length).toBeGreaterThan(0)
      observed[event.kind] = normalized.map((chatEvent) => chatEvent.type)
      for (const chatEvent of normalized) {
        expect(parseChatEvent(chatEvent)).toEqual(chatEvent)
        expect(chatEvent.rawRefs[0]).toMatchObject({ source: "agent", label: event.kind, raw: event })
      }
    }

    expect(observed).toEqual({
      "session-init": ["session.updated", "debug.recorded"],
      "turn-start": ["message.started"],
      "text-delta": ["message.part.added"],
      "thinking-delta": ["message.part.added"],
      "tool-use": ["tool.started"],
      "tool-result": ["tool.completed"],
      "permission-request": ["permission.requested"],
      "permission-decision": ["permission.resolved"],
      "liveness-check": ["status.updated"],
      "turn-end": ["message.completed", "debug.recorded"],
      "assistant-message": ["message.started", "message.part.added"],
      "user-message": ["message.started", "message.part.added", "message.completed"],
      "raw-transcript": ["debug.recorded"],
      status: ["status.updated"],
      "plan-update": ["plan.updated"],
      "slash-commands-update": ["debug.recorded"],
      "session-end": ["status.updated", "debug.recorded"],
      handoff: ["debug.recorded"],
      "km-reference": ["debug.recorded"],
      "session-lifecycle": ["status.updated"],
      error: ["error.raised"],
    })
  })

  test("rejects unknown AgentEvent kinds, unknown properties, and malformed nested blocks", () => {
    const valid = events[0]

    expect(parseAgentEvent(valid)).toMatchObject({ kind: "session-init" })
    expect(() => normalizeAgentEventToChatEvents({ ...valid, extra: true })).toThrow(/Unrecognized key|unrecognized/i)
    expect(() => normalizeAgentEventToChatEvents({ ...valid, ts: undefined })).toThrow(/invalid|expected/i)
    expect(() => normalizeAgentEventToChatEvents({ kind: "permission-mode", sessionId, ts: 1 })).toThrow(
      /invalid|kind/i,
    )
    expect(() =>
      normalizeAgentEventToChatEvents({
        kind: "assistant-message",
        sessionId,
        turnId,
        content: [{ type: "text", text: "hello", extra: true }],
        ts: 1,
      }),
    ).toThrow(/Unrecognized key|unrecognized/i)
  })

  test("promotes known raw transcript control records into semantic ChatEvents", () => {
    const rawEvents: AgentEvent[] = [
      {
        kind: "raw-transcript",
        sessionId,
        turnId,
        label: "Permission mode: auto",
        raw: { type: "permission-mode", permissionMode: "auto" },
        ts: 1,
      },
      {
        kind: "raw-transcript",
        sessionId,
        turnId,
        label: "Queue enqueue",
        raw: { type: "queue-operation", operation: "enqueue" },
        ts: 2,
      },
      {
        kind: "raw-transcript",
        sessionId,
        turnId,
        label: "RECAP · previous work summary",
        raw: { subtype: "away_summary", content: "previous work summary" },
        ts: 3,
      },
      {
        kind: "raw-transcript",
        sessionId,
        turnId,
        label: "Title: typed name",
        raw: { type: "custom-title", customTitle: "typed name" },
        ts: 4,
      },
    ]

    expect(rawEvents.map((event) => normalizeAgentEventToChatEvents(event, { sessionId })[0]?.type)).toEqual([
      "session.updated",
      "queue.updated",
      "recap.recorded",
      "session.updated",
    ])
    expect(normalizeAgentEventToChatEvents(rawEvents[0]!, { sessionId })[0]).toMatchObject({
      channel: "debug",
      payload: { mode: "auto" },
    })
    expect(normalizeAgentEventToChatEvents(rawEvents[1]!, { sessionId })[0]).toMatchObject({
      channel: "queue",
      payload: { queue: { items: [] } },
    })
    expect(normalizeAgentEventToChatEvents(rawEvents[2]!, { sessionId })[0]).toMatchObject({
      channel: "notification",
      payload: { text: "RECAP · previous work summary" },
    })
    expect(normalizeAgentEventToChatEvents(rawEvents[3]!, { sessionId })[0]).toMatchObject({
      channel: "status",
      payload: { title: "typed name", titleSource: "custom" },
    })
  })

  test("coalesces duplicate assistant turn starts into Debug instead of crashing projected transcripts", () => {
    const duplicateTurnId = "msg_01GE15xRAqBbnxU9ihrxhHFk" as TurnId

    const normalized = normalizeAgentEventsToChatEvents(
      [
        { kind: "turn-start", sessionId, turnId: duplicateTurnId, role: "assistant", ts: 1 },
        { kind: "text-delta", sessionId, turnId: duplicateTurnId, blockIndex: 0, text: "Done", ts: 2 },
        { kind: "turn-start", sessionId, turnId: duplicateTurnId, role: "assistant", ts: 3 },
      ] satisfies AgentEvent[],
      { sessionId },
    )

    expect(normalized.map((event) => [event.type, event.channel])).toEqual([
      ["message.started", "transcript"],
      ["message.part.added", "transcript"],
      ["debug.recorded", "debug"],
    ])
    expect(normalized[2]).toMatchObject({
      payload: { label: "Duplicate message start" },
      rawRefs: [{ raw: { kind: "turn-start", turnId: duplicateTurnId } }],
    })
  })

  test("coalesces split assistant aggregates when projected session id differs from provider session id", () => {
    const providerSessionId = "f9eb64dc-d982-4a46-9a8e-da5fd882ac5f" as SessionId
    const projectedSessionId = `claude:${providerSessionId}`
    const splitMessageId = "msg_01GE15xRAqBbnxU9ihrxhHFk" as TurnId

    const normalized = normalizeAgentEventsToChatEvents(
      [
        {
          kind: "assistant-message",
          sessionId: providerSessionId,
          turnId: splitMessageId,
          content: [{ type: "thinking", text: "" }],
          ts: 1,
        },
        { kind: "turn-end", sessionId: providerSessionId, turnId: splitMessageId, stopReason: "end_turn", ts: 2 },
        {
          kind: "assistant-message",
          sessionId: providerSessionId,
          turnId: splitMessageId,
          content: [{ type: "text", text: "Picking up the suggested agenda." }],
          ts: 3,
        },
        { kind: "turn-end", sessionId: providerSessionId, turnId: splitMessageId, stopReason: "end_turn", ts: 4 },
        {
          kind: "tool-result",
          sessionId: providerSessionId,
          id: "toolu_split_1" as ToolUseId,
          output: "File has not been read yet.",
          is_error: true,
          ts: 5,
        },
        {
          kind: "assistant-message",
          sessionId: providerSessionId,
          turnId: splitMessageId,
          content: [{ type: "tool_use", id: "toolu_split_1" as ToolUseId, name: "Read", input: { file_path: "a.ts" } }],
          ts: 6,
        },
        { kind: "turn-end", sessionId: providerSessionId, turnId: splitMessageId, stopReason: "end_turn", ts: 7 },
        {
          kind: "assistant-message",
          sessionId: providerSessionId,
          turnId: splitMessageId,
          content: [{ type: "tool_use", id: "toolu_split_2" as ToolUseId, name: "Bash", input: { command: "pwd" } }],
          ts: 8,
        },
        { kind: "turn-end", sessionId: providerSessionId, turnId: splitMessageId, stopReason: "end_turn", ts: 9 },
      ] satisfies AgentEvent[],
      { sessionId: projectedSessionId },
    )

    expect(normalized.map((event) => [event.type, event.channel])).toEqual([
      ["message.started", "transcript"],
      ["message.part.added", "transcript"],
      ["message.part.added", "transcript"],
      ["tool.started", "activity"],
      ["message.part.added", "transcript"],
      ["tool.completed", "error"],
      ["tool.started", "activity"],
      ["message.part.added", "transcript"],
      ["message.completed", "transcript"],
      ["debug.recorded", "debug"],
    ])
    expect(normalized.every((event) => event.sessionId === projectedSessionId)).toBe(true)
    const partIds = normalized.filter(isMessagePartAdded).map((event) => event.payload.partId)
    expect(new Set(partIds).size).toBe(partIds.length)
    expect(normalized.filter(isToolStarted).map((event) => event.payload.name)).toEqual(["Read", "Bash"])
    expect(normalized.filter((event) => event.type === "message.completed")).toHaveLength(1)
    expect(normalized[2]).toMatchObject({
      type: "message.part.added",
      payload: { part: { type: "text", text: "Picking up the suggested agenda." } },
      rawRefs: [{ raw: { kind: "assistant-message", turnId: splitMessageId } }],
    })
    expect(() =>
      normalizeAgentEventsToChatEvents(
        [
          { kind: "user-message", sessionId, turnId: splitMessageId, text: "same id", ts: 1 },
          {
            kind: "assistant-message",
            sessionId,
            turnId: splitMessageId,
            content: [{ type: "text", text: "conflict" }],
            ts: 2,
          },
        ] satisfies AgentEvent[],
        { sessionId },
      ),
    ).toThrow(/duplicate message/)
  })
})
