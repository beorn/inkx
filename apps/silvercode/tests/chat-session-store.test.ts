import {
  createSessionStore,
  type PermissionRequestId,
  type SessionId,
  type ToolUseId,
  type TurnId,
} from "@km/agent-harness"
import { describe, expect, test } from "vitest"
import { createChatSessionProjectionStore } from "../src/chat/store.ts"
import type { ChatMessageId, ChatMessagePartId } from "../src/chat/types.ts"

const sessionId = "session-1" as SessionId
const turnId = "turn-1" as TurnId
const toolId = "tool-1" as ToolUseId
const permissionId = "permission-1" as PermissionRequestId

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

    expect(chat.events().map((event) => [event.type, event.channel])).toEqual([
      ["message.started", "transcript"],
      ["message.part.added", "transcript"],
      ["debug.recorded", "debug"],
    ])
    const projectedEvents = chat.events()
    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["assistant-text"])

    chat.setChannelVisible("debug", true)

    expect(chat.events()).toBe(projectedEvents)
    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["assistant-text", "queue"])
    expect(chat.visibleLeaves()[1]?.rawRefs[0]?.raw).toMatchObject({ kind: "raw-transcript", label: "Queue operation" })

    chat.dispose()
  })

  test("duplicate assistant turn-start stays inspectable in Debug instead of crashing the projection", () => {
    const sessionStore = createSessionStore()
    const chat = createChatSessionProjectionStore(sessionStore, { sessionId })
    const duplicateTurnId = "msg_01GE15xRAqBbnxU9ihrxhHFk" as TurnId

    sessionStore.apply({ kind: "turn-start", sessionId, turnId: duplicateTurnId, role: "assistant", ts: 1 })
    sessionStore.apply({ kind: "text-delta", sessionId, turnId: duplicateTurnId, blockIndex: 0, text: "Done", ts: 2 })
    sessionStore.apply({ kind: "turn-start", sessionId, turnId: duplicateTurnId, role: "assistant", ts: 3 })

    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["assistant-text"])

    chat.setChannelVisible("debug", true)

    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["assistant-text", "unknown"])
    expect(chat.visibleLeaves()[1]).toMatchObject({
      props: { label: "Duplicate message start" },
      rawRefs: [{ raw: { kind: "turn-start", turnId: duplicateTurnId } }],
    })

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
    expect(userMessage).toMatchObject({ role: "user", partIds: ["user-1:user-text"] })
    expect(session.messageParts["user-1:user-text" as ChatMessagePartId]).toMatchObject({
      type: "text",
      text: "Run tests",
    })
    expect(session.tools[toolId]).toMatchObject({ name: "Bash", status: "done", output: "ok" })
    expect(session.permissions.requests[permissionId]).toMatchObject({
      status: "approved",
      prompt: "Bash permission requested",
    })
    expect(session.plan.tasks).toEqual([{ id: "task-1", content: "Check projection", status: "completed" }])

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
    expect(chat.events().map((event) => [event.type, event.channel])).toEqual([
      ["session.updated", "debug"],
      ["session.updated", "debug"],
      ["session.updated", "status"],
      ["session.updated", "debug"],
    ])
    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["session-status"])

    chat.setChannelVisible("debug", true)

    expect(chat.visibleLeaves().map((leaf) => leaf.type)).toEqual(["session-status"])

    chat.dispose()
  })
})
