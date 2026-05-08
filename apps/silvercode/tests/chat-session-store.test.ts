import {
  createSessionStore,
  type PermissionRequestId,
  type SessionId,
  type ToolUseId,
  type TurnId,
} from "@km/agent-harness"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createChatSessionProjectionStore } from "../src/chat/store.ts"
import type { ChatBlockId, ChatMessageId, ChatPermissionId, ChatToolId } from "../src/chat/types.ts"

const sessionId = "session-1" as SessionId
const turnId = "turn-1" as TurnId
const toolId = "tool-1" as ToolUseId
const subagentToolId = "subagent-1" as ToolUseId
const permissionId = "permission-1" as PermissionRequestId
let debugSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => {
  debugSpy.mockRestore()
})

describe("ChatSession projection store", () => {
  test("reactively projects AgentEvents and filters Debug without mutating retained ChatEvents", () => {
    const sessionStore = createSessionStore()
    const chat = createChatSessionProjectionStore(sessionStore, { sessionId })

    sessionStore.apply({ kind: "turn-start", sessionId, turnId, role: "assistant", ts: 1 })
    sessionStore.apply({ kind: "text-delta", sessionId, turnId, blockIndex: 0, text: "Done", ts: 2 })
    sessionStore.apply({
      kind: "raw-transcript",
      sessionId,
      turnId,
      label: "Queue operation",
      raw: { op: "enqueue", text: "next prompt" },
      ts: 3,
    })

    expect(chat.events().map((event) => [event.type, event.track])).toEqual([
      ["message.started", "transcript"],
      ["message.block.added", "transcript"],
      ["debug.recorded", "debug"],
    ])
    const projectedEvents = chat.events()
    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["message"])

    chat.setTrackVisible("debug", true)

    expect(chat.events()).toBe(projectedEvents)
    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["message", "queue"])
    expect(chat.visibleLeaves()[1]?.rawRefs[0]?.raw).toMatchObject({ kind: "raw-transcript", label: "Queue operation" })

    chat.dispose()
  })

  test("handles duplicate assistant message shapes without crashing the projection", () => {
    const sessionStore = createSessionStore()
    const chat = createChatSessionProjectionStore(sessionStore, { sessionId })
    const duplicateTurnId = "msg_01GE15xRAqBbnxU9ihrxhHFk" as TurnId

    sessionStore.apply({ kind: "turn-start", sessionId, turnId: duplicateTurnId, role: "assistant", ts: 1 })
    sessionStore.apply({ kind: "text-delta", sessionId, turnId: duplicateTurnId, blockIndex: 0, text: "Done", ts: 2 })
    sessionStore.apply({ kind: "turn-start", sessionId, turnId: duplicateTurnId, role: "assistant", ts: 3 })

    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["message"])

    chat.setTrackVisible("debug", true)

    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["message", "unknown"])
    expect(chat.visibleLeaves()[1]).toMatchObject({
      props: { label: "Duplicate message start" },
      rawRefs: [{ raw: { kind: "turn-start", turnId: duplicateTurnId } }],
    })

    chat.dispose()

    const providerSessionId = "f9eb64dc-d982-4a46-9a8e-da5fd882ac5f" as SessionId
    const projectedSessionId = `claude:${providerSessionId}`
    const splitMessageId = "msg_01GE15xRAqBbnxU9ihrxhHFk" as TurnId
    const replayToolId = "toolu_split_1" as ToolUseId
    const replayStore = createSessionStore()
    const replayChat = createChatSessionProjectionStore(replayStore, { sessionId: projectedSessionId })

    replayStore.apply({
      kind: "assistant-message",
      sessionId: providerSessionId,
      turnId: splitMessageId,
      content: [{ type: "thinking", text: "" }],
      ts: 1,
    })
    replayStore.apply({
      kind: "turn-end",
      sessionId: providerSessionId,
      turnId: splitMessageId,
      stopReason: "end_turn",
      ts: 2,
    })
    replayStore.apply({
      kind: "assistant-message",
      sessionId: providerSessionId,
      turnId: splitMessageId,
      content: [{ type: "text", text: "Picking up the suggested agenda." }],
      ts: 3,
    })
    replayStore.apply({
      kind: "turn-end",
      sessionId: providerSessionId,
      turnId: splitMessageId,
      stopReason: "end_turn",
      ts: 4,
    })
    replayStore.apply({
      kind: "tool-result",
      sessionId: providerSessionId,
      id: replayToolId,
      output: "File has not been read yet.",
      is_error: true,
      ts: 5,
    })
    replayStore.apply({
      kind: "assistant-message",
      sessionId: providerSessionId,
      turnId: splitMessageId,
      content: [{ type: "tool_use", id: replayToolId, name: "Read", input: { file_path: "a.ts" } }],
      ts: 6,
    })
    replayStore.apply({
      kind: "turn-end",
      sessionId: providerSessionId,
      turnId: splitMessageId,
      stopReason: "end_turn",
      ts: 7,
    })

    expect(replayChat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["thought", "message", "tool", "tool", "tool"])
    expect(replayChat.session().messages[splitMessageId as unknown as ChatMessageId]?.blockIds).toHaveLength(3)
    expect(replayChat.session().tools[replayToolId as unknown as ChatToolId]).toMatchObject({
      name: "Read",
      status: "failed",
      output: "File has not been read yet.",
    })

    replayChat.dispose()
  })

  test("handles same-millisecond ACP text chunks without duplicate block crashes", () => {
    const sessionStore = createSessionStore()
    const chat = createChatSessionProjectionStore(sessionStore, { sessionId })
    const acpTurnId = "acp-turn-1778204055987" as TurnId

    sessionStore.apply({ kind: "turn-start", sessionId, turnId: acpTurnId, role: "assistant", ts: 1 })
    sessionStore.apply({ kind: "text-delta", sessionId, turnId: acpTurnId, blockIndex: 0, text: "Hello", ts: 2 })
    sessionStore.apply({ kind: "text-delta", sessionId, turnId: acpTurnId, blockIndex: 0, text: " world", ts: 2 })

    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["message"])
    expect(chat.visibleLeaves().map((leaf) => ("text" in leaf.props ? leaf.props.text : undefined))).toEqual([
      "Hello world",
    ])
    expect(chat.session().messages[acpTurnId as unknown as ChatMessageId]?.blockIds).toHaveLength(1)

    chat.dispose()
  })

  test("accumulates ChatSession state from the same canonical ChatEvents that feed the tree", () => {
    const sessionStore = createSessionStore()
    const chat = createChatSessionProjectionStore(sessionStore, { sessionId })

    sessionStore.apply({
      kind: "session-init",
      sessionId,
      cwd: "/repo",
      model: "claude-sonnet",
      mode: "auto",
      tools: ["Bash"],
      mcp_servers: [],
      slashCommands: [],
      skills: [],
      plugins: [],
      claudeCodeVersion: "2.1.119",
      apiKeySource: "OAuth",
      ts: 1,
    })
    sessionStore.apply({ kind: "user-message", sessionId, turnId: "user-1" as TurnId, text: "Run tests", ts: 2 })
    sessionStore.apply({ kind: "turn-start", sessionId, turnId, role: "assistant", ts: 3 })
    sessionStore.apply({
      kind: "tool-use",
      sessionId,
      turnId,
      id: toolId,
      name: "Bash",
      input: { command: "pwd" },
      ts: 4,
    })
    sessionStore.apply({ kind: "tool-result", sessionId, id: toolId, output: "ok", ts: 5 })
    sessionStore.apply({
      kind: "tool-use",
      sessionId,
      turnId,
      id: subagentToolId,
      name: "Agent",
      input: { description: "Sleep 20s #1", subagent_type: "general-purpose" },
      ts: 5.1,
    })
    sessionStore.apply({
      kind: "tool-result",
      sessionId,
      id: subagentToolId,
      output: "agent 1: done sleeping 20s",
      ts: 5.2,
    })
    sessionStore.apply({
      kind: "permission-request",
      sessionId,
      requestId: permissionId,
      tool: "Bash",
      args: { command: "pwd" },
      ts: 6,
    })
    sessionStore.apply({ kind: "permission-decision", sessionId, requestId: permissionId, approved: true, ts: 7 })
    sessionStore.apply({
      kind: "plan-update",
      sessionId,
      source: "codex-plan",
      entries: [{ id: "task-1", content: "Check projection", status: "completed" }],
      ts: 8,
    })
    sessionStore.apply({
      kind: "raw-transcript",
      sessionId,
      turnId,
      label: "Title: Projected session",
      raw: { type: "custom-title", customTitle: "Projected session" },
      ts: 9,
    })

    const session = chat.session()
    const userMessage = session.messages["user-1" as ChatMessageId]

    expect(session).toMatchObject({
      title: "Projected session",
      model: "claude-sonnet",
      mode: "auto",
      cwd: "/repo",
    })
    expect(userMessage).toMatchObject({ role: "user", blockIds: ["user-1:text"] })
    expect(session.blocks["user-1:text" as ChatBlockId]).toMatchObject({
      type: "text",
      text: "Run tests",
    })
    expect(session.tools[toolId as unknown as ChatToolId]).toMatchObject({ name: "Bash", status: "done", output: "ok" })
    expect(session.subagentActivities).toMatchObject([
      {
        toolId: subagentToolId,
        label: "Sleep 20s #1",
        status: "done",
        resultText: "agent 1: done sleeping 20s",
      },
    ])
    expect(session.permissions.requests[permissionId as unknown as ChatPermissionId]).toMatchObject({
      status: "approved",
      prompt: "Bash permission requested",
    })
    expect(session.plan.steps).toEqual([{ id: "task-1", content: "Check projection", status: "completed" }])

    chat.dispose()
  })

  test("routes control metadata into state without default transcript noise", () => {
    const sessionStore = createSessionStore()
    const chat = createChatSessionProjectionStore(sessionStore, { sessionId })

    sessionStore.apply({
      kind: "raw-transcript",
      sessionId,
      turnId,
      label: "Agent: claude-session-path",
      raw: { type: "agent-name", agentName: "claude-session-path" },
      ts: 1,
    })
    sessionStore.apply({
      kind: "raw-transcript",
      sessionId,
      turnId,
      label: "AI title: inferred name",
      raw: { type: "ai-title", aiTitle: "inferred name" },
      ts: 2,
    })
    sessionStore.apply({
      kind: "raw-transcript",
      sessionId,
      turnId,
      label: "Title: custom name",
      raw: { type: "custom-title", customTitle: "custom name" },
      ts: 3,
    })
    sessionStore.apply({
      kind: "raw-transcript",
      sessionId,
      turnId,
      label: "Permission mode: auto",
      raw: { type: "permission-mode", permissionMode: "auto" },
      ts: 4,
    })

    expect(chat.session()).toMatchObject({ title: "custom name", mode: "auto" })
    expect(chat.events().map((event) => [event.type, event.track])).toEqual([
      ["session.updated", "debug"],
      ["session.updated", "debug"],
      ["session.updated", "status"],
      ["session.updated", "debug"],
    ])
    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["session-status"])

    chat.setTrackVisible("debug", true)

    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["session-status", "session-status"])
    expect(chat.visibleLeaves().at(-1)).toMatchObject({
      type: "session-status",
      props: { label: "Permission mode", value: "auto" },
    })

    chat.dispose()
  })
})
