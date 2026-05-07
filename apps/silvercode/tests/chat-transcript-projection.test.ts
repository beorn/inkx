import { describe, expect, test } from "vitest"
import { projectChatTranscript, visibleChatLeaves } from "../src/chat/project-transcript.ts"
import { isChatElement, isChatLeaf } from "../src/chat/types.ts"
import type {
  ChatChannelState,
  ChatEvent,
  ChatEventId,
  ChatMessageId,
  ChatMessagePartId,
  ChatNodeId,
  ChatPermissionId,
  ChatSessionId,
} from "../src/chat/types.ts"

function id<T>(value: string): T {
  return value as T
}

function channels(debugVisible: boolean): Record<string, ChatChannelState> {
  return {
    transcript: { id: "transcript", label: "Transcript", visible: true, muted: false },
    activity: { id: "activity", label: "Activity", visible: true, muted: false },
    notification: { id: "notification", label: "Notifications", visible: true, muted: false },
    debug: { id: "debug", label: "Debug", visible: debugVisible, muted: !debugVisible },
    permission: { id: "permission", label: "Permissions", visible: true, muted: false },
    plan: { id: "plan", label: "Plan", visible: true, muted: false },
    queue: { id: "queue", label: "Queue", visible: true, muted: false },
    status: { id: "status", label: "Status", visible: true, muted: false },
    error: { id: "error", label: "Errors", visible: true, muted: false },
  }
}

describe("projectChatTranscript", () => {
  test("projects events into ChatTree leaves and filters visible leaves by event.channel", () => {
    const sessionId = id<ChatSessionId>("session-1")
    const messageId = id<ChatMessageId>("message-1")
    const partId = id<ChatMessagePartId>("part-1")
    const textEventId = id<ChatEventId>("event-text")
    const debugEventId = id<ChatEventId>("event-debug")
    const permissionEventId = id<ChatEventId>("event-permission")
    const notificationEventId = id<ChatEventId>("event-notification")
    const recapEventId = id<ChatEventId>("event-recap")
    const events: ChatEvent[] = [
      {
        id: id<ChatEventId>("event-start"),
        type: "message.started",
        channel: "transcript",
        ts: 1,
        sessionId,
        payload: { messageId, role: "user" },
        rawRefs: [],
      },
      {
        id: textEventId,
        type: "message.part.added",
        channel: "transcript",
        ts: 2,
        sessionId,
        payload: {
          messageId,
          partId,
          part: { id: partId, type: "text", text: "Run tests", eventIds: [textEventId] },
        },
        rawRefs: [{ id: "raw-text", source: "agent" }],
      },
      {
        id: debugEventId,
        type: "debug.recorded",
        channel: "debug",
        ts: 3,
        sessionId,
        payload: { label: "Permission mode auto", raw: { permissionMode: "auto" } },
        rawRefs: [{ id: "raw-debug", source: "agent" }],
      },
      {
        id: permissionEventId,
        type: "permission.requested",
        channel: "permission",
        ts: 4,
        sessionId,
        payload: {
          permissionId: id<ChatPermissionId>("perm-1"),
          prompt: "Run command?",
          options: ["approve", "deny"],
        },
        rawRefs: [{ id: "raw-permission", source: "agent" }],
      },
      {
        id: notificationEventId,
        type: "notification.received",
        channel: "notification",
        ts: 5,
        sessionId,
        payload: { source: "agent", body: "Task completed" },
        rawRefs: [{ id: "raw-notification", source: "agent" }],
      },
      {
        id: recapEventId,
        type: "recap.recorded",
        channel: "notification",
        ts: 6,
        sessionId,
        payload: { text: "RECAP · previous work" },
        rawRefs: [{ id: "raw-recap", source: "agent" }],
      },
    ]

    const tree = projectChatTranscript({ sessionId, events })
    expect(isChatElement(tree.nodes[tree.rootId]!)).toBe(true)
    const leaves = Object.values(tree.nodes).filter(isChatLeaf)
    expect(leaves.length).toBeGreaterThan(0)

    expect(leaves.map((leaf) => leaf.type)).toEqual(["user-text", "unknown", "permission", "notification", "recap"])
    expect(leaves.map((leaf) => leaf.channel)).toEqual([
      "transcript",
      "debug",
      "permission",
      "notification",
      "notification",
    ])
    expect(visibleChatLeaves(tree, channels(false)).map((leaf) => leaf.id)).toEqual([
      id<ChatNodeId>("leaf:event-text"),
      id<ChatNodeId>("leaf:event-permission"),
      id<ChatNodeId>("leaf:event-notification"),
      id<ChatNodeId>("leaf:event-recap"),
    ])
    expect(visibleChatLeaves(tree, channels(true)).map((leaf) => leaf.id)).toEqual([
      id<ChatNodeId>("leaf:event-text"),
      id<ChatNodeId>("leaf:event-debug"),
      id<ChatNodeId>("leaf:event-permission"),
      id<ChatNodeId>("leaf:event-notification"),
      id<ChatNodeId>("leaf:event-recap"),
    ])
  })

  test("projects labeled Debug payloads into typed Debug blocks", () => {
    const sessionId = id<ChatSessionId>("session-1")
    const fileEventId = id<ChatEventId>("event-file-history")
    const hookEventId = id<ChatEventId>("event-hook")
    const tree = projectChatTranscript({
      sessionId,
      events: [
        {
          id: fileEventId,
          type: "debug.recorded",
          channel: "debug",
          ts: 1,
          sessionId,
          payload: {
            label: "File history snapshot: 1 files",
            raw: { trackedFileBackups: [{ filePath: "src/app.ts" }] },
          },
          rawRefs: [{ id: "raw-file-history", source: "agent" }],
        },
        {
          id: hookEventId,
          type: "debug.recorded",
          channel: "debug",
          ts: 2,
          sessionId,
          payload: { label: "Hook context: SessionStart", raw: { ok: true } },
          rawRefs: [{ id: "raw-hook", source: "agent" }],
        },
      ],
    })

    const leaves = visibleChatLeaves(tree, channels(true))
    expect(leaves.map((leaf) => leaf.type)).toEqual(["file-snapshot", "hook"])
    expect(leaves[0]).toMatchObject({ props: { files: ["src/app.ts"] } })
    expect(visibleChatLeaves(tree, channels(false))).toEqual([])
  })

  test("ignores late message parts that arrive after a forced message completion", () => {
    const sessionId = id<ChatSessionId>("session-1")
    const messageId = id<ChatMessageId>("acp-turn-1")
    const firstPartId = id<ChatMessagePartId>("part-1")
    const latePartId = id<ChatMessagePartId>("part-late")
    const firstEventId = id<ChatEventId>("text-delta:1")
    const lateEventId = id<ChatEventId>("text-delta:late")
    const tree = projectChatTranscript({
      sessionId,
      events: [
        {
          id: id<ChatEventId>("message-start"),
          type: "message.started",
          channel: "transcript",
          ts: 1,
          sessionId,
          payload: { messageId, role: "assistant" },
          rawRefs: [],
        },
        {
          id: firstEventId,
          type: "message.part.added",
          channel: "transcript",
          ts: 2,
          sessionId,
          payload: {
            messageId,
            partId: firstPartId,
            part: { id: firstPartId, type: "text", text: "first chunk", eventIds: [firstEventId] },
          },
          rawRefs: [],
        },
        {
          id: id<ChatEventId>("message-complete"),
          type: "message.completed",
          channel: "transcript",
          ts: 3,
          sessionId,
          payload: { messageId },
          rawRefs: [],
        },
        {
          id: lateEventId,
          type: "message.part.added",
          channel: "transcript",
          ts: 4,
          sessionId,
          payload: {
            messageId,
            partId: latePartId,
            part: { id: latePartId, type: "text", text: "late chunk", eventIds: [lateEventId] },
          },
          rawRefs: [],
        },
      ],
    })

    const leaves = visibleChatLeaves(tree, channels(true))
    expect(leaves.map((leaf) => leaf.props)).toContainEqual({ text: "first chunk" })
    expect(leaves.map((leaf) => leaf.props)).not.toContainEqual({ text: "late chunk" })
  })

  test("throws if an unknown ChatEventType reaches projection", () => {
    const sessionId = id<ChatSessionId>("session-1")
    const bad = {
      id: id<ChatEventId>("event-bad"),
      type: "surprise.event",
      channel: "debug",
      ts: 1,
      sessionId,
      payload: {},
      rawRefs: [],
    } as unknown as ChatEvent

    expect(() => projectChatTranscript({ sessionId, events: [bad] })).toThrow(/invalid|type/i)
  })
})
