import { describe, expect, test } from "vitest"
import {
  CHAT_EVENT_HANDLING,
  chatEventHandlingFor,
  parseChatEvent,
  visibleChatEvents,
} from "../src/chat/event-handling.ts"
import type {
  ChatTrackState,
  ChatEvent,
  ChatEventId,
  ChatEventType,
  ChatMessageId,
  ChatPermissionId,
  ChatSessionId,
} from "../src/chat/types.ts"
import { CHAT_TRACKS } from "../src/chat/types.ts"

function id<T>(value: string): T {
  return value as T
}

const sessionId = id<ChatSessionId>("session-1")

function event<T extends ChatEventType>(init: Omit<ChatEvent<T>, "id" | "ts" | "sessionId" | "rawRefs">): ChatEvent<T> {
  return {
    id: id<ChatEventId>(`event-${init.type}`),
    ts: 1,
    sessionId,
    rawRefs: [{ id: `raw-${init.type}`, source: "agent" }],
    ...init,
  } as ChatEvent<T>
}

function tracks(debugVisible: boolean): Record<string, ChatTrackState> {
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

describe("ChatEvent handling contract", () => {
  test("every ChatEventType declares track, owner, and projection handling", () => {
    expect(CHAT_TRACKS).toEqual([
      "transcript",
      "activity",
      "notification",
      "debug",
      "permission",
      "plan",
      "queue",
      "status",
      "error",
    ])

    const types = Object.keys(CHAT_EVENT_HANDLING)
    expect(types).toEqual([
      "message.started",
      "message.block.added",
      "message.completed",
      "tool.started",
      "tool.updated",
      "tool.completed",
      "permission.requested",
      "permission.resolved",
      "plan.updated",
      "queue.updated",
      "notification.received",
      "recap.recorded",
      "session.updated",
      "status.updated",
      "error.raised",
      "debug.recorded",
    ] satisfies ChatEventType[])

    const handling = chatEventHandlingFor("debug.recorded")
    expect(handling.defaultTrack).toBe("debug")
    expect(handling.owner).toBe("debug")
    expect(handling.projection).toBe("debug-leaf")
  })

  test("visibleChatEvents filters only by projected event.track", () => {
    const transcript = event({
      type: "message.started",
      track: "transcript",
      payload: { messageId: id<ChatMessageId>("message-1"), role: "user" },
    })
    const debug = event({
      type: "debug.recorded",
      track: "debug",
      payload: { label: "Permission mode auto", raw: { permissionMode: "auto" } },
    })
    const rawLookingTranscript = {
      ...transcript,
      rawRefs: [{ id: "raw-looking", source: "local" as const, label: "raw" }],
    }

    expect(visibleChatEvents([rawLookingTranscript, debug], tracks(false))).toEqual([rawLookingTranscript])
    expect(visibleChatEvents([rawLookingTranscript, debug], tracks(true))).toEqual([rawLookingTranscript, debug])
  })

  test("strict ChatEvent parsing rejects unknown event types and properties", () => {
    const valid = event({
      type: "permission.requested",
      track: "permission",
      payload: {
        permissionId: id<ChatPermissionId>("perm-1"),
        prompt: "Run command?",
        options: ["approve", "deny"],
      },
    })

    expect(parseChatEvent(valid)).toMatchObject({ type: "permission.requested", track: "permission" })
    expect(() => parseChatEvent({ ...valid, extra: true })).toThrow(/Unrecognized key|unrecognized/i)
    expect(() =>
      parseChatEvent({
        ...valid,
        payload: { ...valid.payload, extra: true },
      }),
    ).toThrow(/Unrecognized key|unrecognized/i)
    expect(() => parseChatEvent({ ...valid, type: "permission.mode" })).toThrow(/invalid|unsupported|type/i)
    expect(() => parseChatEvent({ ...valid, track: "transcript" })).toThrow(/track/i)
  })
})
