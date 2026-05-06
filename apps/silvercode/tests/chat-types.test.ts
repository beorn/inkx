import { describe, expect, test } from "vitest"
import { CHAT_CHANNELS, isChatElement, isChatLeaf } from "../src/chat/types.ts"
import type {
  ChatChannelState,
  ChatChannelId,
  ChatEvent,
  ChatEventId,
  ChatMessage,
  ChatMessageId,
  ChatMessagePart,
  ChatMessagePartId,
  ChatNode,
  ChatNodeId,
  ChatSessionId,
  ChatState,
} from "../src/chat/types.ts"

function id<T>(value: string): T {
  return value as T
}

describe("chat transcript tree types", () => {
  test("model stores canonical data on session and projected state on tree", () => {
    const sessionId = id<ChatSessionId>("session-1")
    const eventId = id<ChatEventId>("event-1")
    const messageId = id<ChatMessageId>("message-1")
    const partId = id<ChatMessagePartId>("part-1")
    const rootId = id<ChatNodeId>("root")
    const messageNodeId = id<ChatNodeId>("node-message-1")
    const leafId = id<ChatNodeId>("leaf-user-1")

    const part = {
      id: partId,
      type: "text",
      text: "Review this screenshot",
      eventIds: [eventId],
    } satisfies ChatMessagePart

    const message = {
      id: messageId,
      role: "user",
      partIds: [partId],
      eventIds: [eventId],
    } satisfies ChatMessage

    const event = {
      id: eventId,
      type: "message.part.added",
      ts: 1,
      sessionId,
      payload: { messageId, partId, part },
      rawRefs: [{ id: "raw-1", source: "agent" }],
    } satisfies ChatEvent<"message.part.added">

    const nodes = {
      [rootId]: {
        id: rootId,
        type: "root",
        children: [messageNodeId],
        eventIds: [],
      },
      [messageNodeId]: {
        id: messageNodeId,
        type: "message",
        role: "user",
        messageId,
        children: [leafId],
        eventIds: [eventId],
      },
      [leafId]: {
        id: leafId,
        type: "user-text",
        channel: "transcript",
        eventIds: [eventId],
        messageIds: [messageId],
        partIds: [partId],
        width: "prose",
        defaultDisclosure: "expanded",
        detailAccess: ["cmd-hover"],
        rawRefs: event.rawRefs,
        props: { text: part.text },
      },
    } satisfies Record<ChatNodeId, ChatNode>

    const channels = Object.fromEntries(
      CHAT_CHANNELS.map((channel) => [
        channel,
        {
          id: channel,
          label: channel === "transcript" ? "Transcript" : channel,
          visible: true,
          muted: false,
        } satisfies ChatChannelState,
      ]),
    ) as Readonly<Record<ChatChannelId, ChatChannelState>>

    const state = {
      session: {
        id: sessionId,
        events: [event],
        messages: { [messageId]: message },
        messageParts: { [partId]: part },
        tools: {},
        plan: { tasks: [], eventIds: [] },
        queue: { items: [], eventIds: [] },
        permissions: { requests: {} },
        tree: {
          rootId,
          nodes,
          state: { disclosure: { [leafId]: "expanded" }, selectedNodeId: leafId },
        },
        channels,
      },
    } satisfies ChatState

    const root = state.session.tree.nodes[rootId]!
    const leaf = state.session.tree.nodes[leafId]!

    expect(isChatElement(root)).toBe(true)
    expect(isChatLeaf(leaf)).toBe(true)
    expect(state.session.messages[messageId]?.partIds).toEqual([partId])
    expect(state.session.tree.state.selectedNodeId).toBe(leafId)
  })

  test("channels are filter metadata, not tree node types", () => {
    expect(CHAT_CHANNELS).toEqual([
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
  })

  test("notifications are first-class leaves on the notification channel", () => {
    const sessionId = id<ChatSessionId>("session-1")
    const eventId = id<ChatEventId>("event-notification-1")
    const leafId = id<ChatNodeId>("leaf-notification-1")

    const event = {
      id: eventId,
      type: "notification.received",
      ts: 2,
      sessionId,
      payload: { source: "filewatch", title: "Changed files", body: "2 files changed" },
      rawRefs: [{ id: "raw-notification-1", source: "local" }],
    } satisfies ChatEvent<"notification.received">

    const leaf = {
      id: leafId,
      type: "notification",
      channel: "notification",
      eventIds: [eventId],
      width: "prose",
      defaultDisclosure: "collapsed",
      detailAccess: ["expand", "cmd-hover"],
      rawRefs: event.rawRefs,
      props: event.payload,
    } satisfies ChatNode

    expect(isChatLeaf(leaf)).toBe(true)
    expect(leaf).toMatchObject({
      type: "notification",
      channel: "notification",
      props: { source: "filewatch", title: "Changed files", body: "2 files changed" },
    })
  })
})
