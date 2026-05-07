import { parseAgentEvent, type AgentEvent } from "@km/agent-harness"
import { parseChatEvent } from "./event-handling.ts"
import type {
  AgentEventId,
  ChatChannelId,
  ChatEvent,
  ChatEventId,
  ChatEventPayloads,
  ChatEventType,
  ChatMessageId,
  ChatMessagePartId,
  ChatPermissionId,
  ChatPlanTaskId,
  ChatRawRef,
  ChatRole,
  ChatSessionId,
  ChatToolId,
} from "./types.ts"

type AgentEventProjection = {
  channel: ChatChannelId
  chatEventTypes: readonly ChatEventType[]
  keepsRaw: boolean
}

type MessageStartSource = "assistant-message" | "turn-start" | "user-message" | "other"
type SeenMessage = { role: ChatRole; source: MessageStartSource }
type AssistantContentBlock = Extract<AgentEvent, { kind: "assistant-message" }>["content"][number]

export const AGENT_EVENT_CHAT_PROJECTION = {
  "session-init": { channel: "status", chatEventTypes: ["session.updated", "debug.recorded"], keepsRaw: true },
  "turn-start": { channel: "transcript", chatEventTypes: ["message.started"], keepsRaw: true },
  "text-delta": { channel: "transcript", chatEventTypes: ["message.part.added"], keepsRaw: true },
  "thinking-delta": { channel: "transcript", chatEventTypes: ["message.part.added"], keepsRaw: true },
  "tool-use": { channel: "activity", chatEventTypes: ["tool.started"], keepsRaw: true },
  "tool-result": { channel: "activity", chatEventTypes: ["tool.completed"], keepsRaw: true },
  "permission-request": { channel: "permission", chatEventTypes: ["permission.requested"], keepsRaw: true },
  "permission-decision": { channel: "permission", chatEventTypes: ["permission.resolved"], keepsRaw: true },
  "liveness-check": { channel: "debug", chatEventTypes: ["status.updated"], keepsRaw: true },
  "turn-end": { channel: "transcript", chatEventTypes: ["message.completed", "debug.recorded"], keepsRaw: true },
  "assistant-message": {
    channel: "transcript",
    chatEventTypes: ["message.started", "message.part.added", "tool.started", "tool.completed", "debug.recorded"],
    keepsRaw: true,
  },
  "user-message": {
    channel: "transcript",
    chatEventTypes: ["message.started", "message.part.added", "debug.recorded", "message.completed"],
    keepsRaw: true,
  },
  "raw-transcript": {
    channel: "debug",
    chatEventTypes: ["debug.recorded", "queue.updated", "session.updated", "notification.received", "recap.recorded"],
    keepsRaw: true,
  },
  status: { channel: "status", chatEventTypes: ["status.updated"], keepsRaw: true },
  "plan-update": { channel: "plan", chatEventTypes: ["plan.updated"], keepsRaw: true },
  "slash-commands-update": { channel: "debug", chatEventTypes: ["debug.recorded"], keepsRaw: true },
  "session-end": { channel: "status", chatEventTypes: ["status.updated", "debug.recorded"], keepsRaw: true },
  handoff: { channel: "debug", chatEventTypes: ["debug.recorded"], keepsRaw: true },
  "km-reference": { channel: "debug", chatEventTypes: ["debug.recorded"], keepsRaw: true },
  "session-lifecycle": { channel: "status", chatEventTypes: ["status.updated"], keepsRaw: true },
  error: { channel: "error", chatEventTypes: ["error.raised"], keepsRaw: true },
} satisfies Record<AgentEvent["kind"], AgentEventProjection>

export type NormalizeAgentEventOptions = {
  /**
   * Sessionless local events such as `handoff` are emitted into more than one
   * transcript store. Pass the target store's session id to keep the projected
   * ChatEvent session-local.
   */
  sessionId?: string
}

export function normalizeAgentEventToChatEvents(input: unknown, options: NormalizeAgentEventOptions = {}): ChatEvent[] {
  const event = parseAgentEvent(input)
  return normalizeParsedAgentEvent(event, options).map((chatEvent) => parseChatEvent(chatEvent))
}

export function normalizeAgentEventsToChatEvents(
  inputs: readonly unknown[],
  options: NormalizeAgentEventOptions = {},
): ChatEvent[] {
  const events = inputs.map((input) => parseAgentEvent(input))
  const latestToolUseIndex = new Map<string, number>()
  const latestAssistantMessageIndex = new Map<string, number>()
  const firstMessageSourceByKey = new Map<string, MessageStartSource>()
  events.forEach((event, index) => {
    if (event.kind === "tool-use") latestToolUseIndex.set(`${event.sessionId}:${event.id}`, index)
    if (event.kind === "assistant-message" || event.kind === "turn-start" || event.kind === "user-message") {
      const key = messageKey(chatSessionIdFor(event, options), chatMessageId(event.turnId))
      firstMessageSourceByKey.set(key, firstMessageSourceByKey.get(key) ?? messageStartSource(event))
      if (event.kind === "assistant-message") latestAssistantMessageIndex.set(key, index)
    }
  })

  const seenMessages = new Map<string, SeenMessage>()
  const seenTools = new Set<string>()
  const pendingToolCompletions = new Map<string, ChatEvent<"tool.completed">[]>()
  const out: ChatEvent[] = []
  const pushChatEvent = (chatEvent: ChatEvent): void => {
    if (chatEvent.type === "tool.completed") {
      const key = toolKey(chatEvent.sessionId, chatEvent.payload.toolId)
      if (!seenTools.has(key)) {
        pendingToolCompletions.set(key, [...(pendingToolCompletions.get(key) ?? []), chatEvent])
        return
      }
    }
    out.push(chatEvent)
    if (chatEvent.type === "tool.started") {
      seenTools.add(toolKey(chatEvent.sessionId, chatEvent.payload.toolId))
    }
  }
  const flushPendingToolCompletions = (): void => {
    for (const [key, completions] of pendingToolCompletions) {
      if (!seenTools.has(key)) continue
      out.push(...completions)
      pendingToolCompletions.delete(key)
    }
  }
  events.forEach((event, index) => {
    if (event.kind === "tool-use" && latestToolUseIndex.get(`${event.sessionId}:${event.id}`) !== index) {
      return
    }
    if (event.kind === "turn-end") {
      const key = messageKey(chatSessionIdFor(event, options), chatMessageId(event.turnId))
      if (
        firstMessageSourceByKey.get(key) === "assistant-message" &&
        (latestAssistantMessageIndex.get(key) ?? -1) > index
      ) {
        return
      }
    }
    if (event.kind === "assistant-message") {
      const key = messageKey(chatSessionIdFor(event, options), chatMessageId(event.turnId))
      const previous = seenMessages.get(key)
      if (previous) {
        if (previous.source === "assistant-message") {
          for (const chatEvent of normalizeParsedAgentEvent(event, options)) {
            if (chatEvent.type !== "message.started") pushChatEvent(chatEvent)
          }
          flushPendingToolCompletions()
          return
        }
        if (previous.source === "turn-start" && previous.role === "assistant") {
          pushChatEvent(
            debugEventFromAgentEvent(event, options, "Assistant message aggregate", "assistant-message-aggregate"),
          )
          flushPendingToolCompletions()
          return
        }
        throw new Error(`normalizeAgentEventsToChatEvents duplicate message ${event.turnId}`)
      }
    }
    for (const chatEvent of normalizeParsedAgentEvent(event, options)) {
      if (chatEvent.type === "message.started") {
        const key = messageKey(chatEvent.sessionId, chatEvent.payload.messageId)
        const previous = seenMessages.get(key)
        if (previous !== undefined) {
          if (event.kind === "turn-start" && previous.role === chatEvent.payload.role) {
            pushChatEvent(
              debugEventFromAgentEvent(event, options, "Duplicate message start", "duplicate-message-start"),
            )
            continue
          }
          throw new Error(`normalizeAgentEventsToChatEvents duplicate message ${chatEvent.payload.messageId}`)
        }
        seenMessages.set(key, { role: chatEvent.payload.role, source: messageStartSource(event) })
      }
      pushChatEvent(chatEvent)
    }
    flushPendingToolCompletions()
  })
  for (const completions of pendingToolCompletions.values()) {
    for (const completion of completions) out.push(orphanToolCompletionDebugEvent(completion))
  }
  return out.map((chatEvent) => parseChatEvent(chatEvent))
}

function messageKey(sessionId: ChatSessionId, messageId: ChatMessageId): string {
  return `${sessionId}:${messageId}`
}

function toolKey(sessionId: ChatSessionId, toolId: ChatToolId): string {
  return `${sessionId}:${toolId}`
}

function messageStartSource(event: AgentEvent): MessageStartSource {
  if (event.kind === "assistant-message" || event.kind === "turn-start" || event.kind === "user-message") {
    return event.kind
  }
  return "other"
}

function normalizeParsedAgentEvent(event: AgentEvent, options: NormalizeAgentEventOptions): ChatEvent[] {
  const sessionId = chatSessionIdFor(event, options)
  const agentEventId = agentEventIdFor(event)
  const rawRefs: ChatRawRef[] = [{ id: agentEventId, source: "agent", label: event.kind, raw: event }]

  function make<T extends ChatEventType>(
    type: T,
    channel: ChatChannelId,
    payload: ChatEventPayloads[T],
    suffix: string = type,
  ): ChatEvent<T> {
    return {
      id: chatEventId(`${agentEventId}:${suffix}`),
      type,
      channel,
      ts: event.ts,
      sessionId,
      agentEventId,
      payload,
      rawRefs,
    } as ChatEvent<T>
  }

  function messagePart(
    messageId: ChatMessageId,
    partId: ChatMessagePartId,
    part: ChatEventPayloads["message.part.added"]["part"],
    suffix: string,
  ): ChatEvent<"message.part.added"> {
    return make<"message.part.added">("message.part.added", "transcript", { messageId, partId, part }, suffix)
  }

  switch (event.kind) {
    case "session-init":
      return [
        make("session.updated", "status", { model: event.model, mode: event.mode, cwd: event.cwd }, "session"),
        make(
          "debug.recorded",
          "debug",
          {
            label: "Session init",
            raw: {
              tools: event.tools,
              mcp_servers: event.mcp_servers,
              slashCommands: event.slashCommands,
              skills: event.skills,
              plugins: event.plugins,
              claudeCodeVersion: event.claudeCodeVersion,
              apiKeySource: event.apiKeySource,
            },
          },
          "debug",
        ),
      ]
    case "turn-start":
      return [
        make(
          "message.started",
          "transcript",
          { messageId: chatMessageId(event.turnId), role: event.role },
          "message-started",
        ),
      ]
    case "text-delta": {
      const partId = chatMessagePartId(`${event.turnId}:text:${event.blockIndex}:${event.ts}`)
      const eventId = chatEventId(`${agentEventId}:text`)
      return [
        {
          id: eventId,
          type: "message.part.added",
          channel: "transcript",
          ts: event.ts,
          sessionId,
          agentEventId,
          payload: {
            messageId: chatMessageId(event.turnId),
            partId,
            part: { id: partId, type: "text", text: event.text, eventIds: [eventId] },
          },
          rawRefs,
        },
      ]
    }
    case "thinking-delta": {
      const partId = chatMessagePartId(`${event.turnId}:thinking:${event.blockIndex}:${event.ts}`)
      const eventId = chatEventId(`${agentEventId}:thinking`)
      return [
        {
          id: eventId,
          type: "message.part.added",
          channel: "transcript",
          ts: event.ts,
          sessionId,
          agentEventId,
          payload: {
            messageId: chatMessageId(event.turnId),
            partId,
            part: { id: partId, type: "reasoning", text: event.text, eventIds: [eventId] },
          },
          rawRefs,
        },
      ]
    }
    case "tool-use":
      return [
        make(
          "tool.started",
          "activity",
          { toolId: chatToolId(event.id), name: event.name, input: event.input },
          "tool-started",
        ),
      ]
    case "tool-result":
      return [
        make(
          "tool.completed",
          event.is_error ? "error" : "activity",
          { toolId: chatToolId(event.id), status: event.is_error ? "failed" : "done", output: event.output },
          "tool-completed",
        ),
      ]
    case "permission-request":
      return [
        make(
          "permission.requested",
          "permission",
          {
            permissionId: chatPermissionId(event.requestId),
            prompt: `${event.tool} permission requested`,
            options: event.options?.map((option) => option.name) ?? ["Approve", "Reject"],
          },
          "permission-requested",
        ),
      ]
    case "permission-decision":
      return [
        make(
          "permission.resolved",
          "permission",
          { permissionId: chatPermissionId(event.requestId), decision: event.approved ? "approved" : "rejected" },
          "permission-resolved",
        ),
      ]
    case "liveness-check":
      return [
        make(
          "status.updated",
          "debug",
          { status: `Liveness check${event.staleAfterMs === undefined ? "" : ` (${event.staleAfterMs}ms)`}` },
          "liveness",
        ),
      ]
    case "turn-end": {
      const out: ChatEvent[] = [
        make("message.completed", "transcript", { messageId: chatMessageId(event.turnId) }, "message-completed"),
      ]
      if (event.stopReason !== undefined || event.usage !== undefined) {
        out.push(
          make(
            "debug.recorded",
            "debug",
            { label: "Turn end", raw: { stopReason: event.stopReason, usage: event.usage } },
            "debug",
          ),
        )
      }
      return out
    }
    case "assistant-message":
      return normalizeAssistantMessage(event, make, messagePart)
    case "user-message": {
      const messageId = chatMessageId(event.turnId)
      const textPartId = chatMessagePartId(`${event.turnId}:user-text`)
      const textEventId = chatEventId(`${agentEventId}:user-text`)
      const out: ChatEvent[] = [
        make("message.started", "transcript", { messageId, role: "user" }, "message-started"),
        {
          id: textEventId,
          type: "message.part.added",
          channel: "transcript",
          ts: event.ts,
          sessionId,
          agentEventId,
          payload: {
            messageId,
            partId: textPartId,
            part: { id: textPartId, type: "text", text: event.text, eventIds: [textEventId] },
          },
          rawRefs,
        },
      ]
      if (event.additionalContext !== undefined) {
        out.push(
          make(
            "debug.recorded",
            "debug",
            { label: "User message additional context", raw: event.additionalContext },
            "additional-context",
          ),
        )
      }
      out.push(make("message.completed", "transcript", { messageId }, "message-completed"))
      return out
    }
    case "raw-transcript":
      return normalizeRawTranscriptEvent(event, make)
    case "status":
      return [make("status.updated", "status", { status: event.status }, "status")]
    case "plan-update":
      return [
        make(
          "plan.updated",
          "plan",
          {
            plan: {
              tasks: event.entries.map((entry, index) => ({
                id: chatPlanTaskId(entry.id ?? entry.providerEntryId ?? `${event.source}:${index}`),
                content: entry.content,
                status: entry.status,
                priority: entry.priority,
                parentId: entry.parentId === undefined ? undefined : chatPlanTaskId(entry.parentId),
              })),
              eventIds: [chatEventId(`${agentEventId}:plan`)],
            },
          },
          "plan",
        ),
      ]
    case "slash-commands-update":
      return [
        make(
          "debug.recorded",
          "debug",
          { label: "Slash commands updated", raw: { slashCommands: event.slashCommands } },
          "slash-commands",
        ),
      ]
    case "session-end": {
      const out: ChatEvent[] = [
        make(
          "status.updated",
          "status",
          { status: event.stopReason ? `Session ended: ${event.stopReason}` : "Session ended" },
          "session-end",
        ),
      ]
      if (event.usage !== undefined || event.costUsd !== undefined || event.durationMs !== undefined) {
        out.push(
          make(
            "debug.recorded",
            "debug",
            {
              label: "Session usage",
              raw: { usage: event.usage, costUsd: event.costUsd, durationMs: event.durationMs },
            },
            "usage",
          ),
        )
      }
      return out
    }
    case "handoff":
      return [
        make(
          "debug.recorded",
          "debug",
          { label: "Handoff", raw: { from: event.from, to: event.to, context: event.context } },
          "handoff",
        ),
      ]
    case "km-reference":
      return [
        make(
          "debug.recorded",
          "debug",
          { label: "KM reference", raw: { nodeId: event.nodeId, relation: event.relation } },
          "km-reference",
        ),
      ]
    case "session-lifecycle":
      return [make("status.updated", "status", { status: `Session ${event.state}` }, "session-lifecycle")]
    case "error":
      return [make("error.raised", "error", { message: event.message, raw: event.raw }, "error")]
    default:
      return assertNeverAgentEvent(event)
  }
}

function normalizeRawTranscriptEvent(
  event: Extract<AgentEvent, { kind: "raw-transcript" }>,
  make: <T extends ChatEventType>(
    type: T,
    channel: ChatChannelId,
    payload: ChatEventPayloads[T],
    suffix?: string,
  ) => ChatEvent<T>,
): ChatEvent[] {
  const raw = event.raw
  const rawType = raw && typeof raw === "object" ? (raw as { type?: unknown }).type : undefined
  if (typeof rawType === "string") {
    if (rawType === "permission-mode") {
      const mode = stringField(raw, "permissionMode") ?? stringField(raw, "mode")
      if (mode) return [make("session.updated", "debug", { mode }, "permission-mode")]
    }
    if (rawType === "queue-operation") {
      return [
        make(
          "queue.updated",
          "queue",
          { queue: { items: [], eventIds: [chatEventId(`${agentEventIdFor(event)}:queue`)] } },
          "queue",
        ),
      ]
    }
    if (rawType === "agent-name" || rawType === "custom-title" || rawType === "ai-title") {
      const title =
        stringField(raw, "customTitle") ??
        stringField(raw, "aiTitle") ??
        stringField(raw, "agentName") ??
        event.label.replace(/^(Title|AI title|Agent):\s*/, "").trim()
      if (title.length > 0) {
        const titleSource = rawType === "custom-title" ? "custom" : rawType === "ai-title" ? "ai" : "agent"
        const channel = rawType === "custom-title" ? "status" : "debug"
        return [make("session.updated", channel, { title, titleSource }, rawType)]
      }
    }
  }

  if (event.label === "RECAP" || event.label.startsWith("RECAP ·")) {
    return [make("recap.recorded", "notification", { text: event.label, raw: event.raw }, "recap")]
  }
  if (event.label === "Compact summary") {
    return [make("recap.recorded", "notification", { text: "Compact summary", raw: event.raw }, "compact-summary")]
  }
  if (event.label.startsWith("Task ") || event.label.startsWith("Task notification")) {
    return [
      make(
        "notification.received",
        "notification",
        { source: "agent", title: event.label, body: typeof event.raw === "string" ? event.raw : event.label },
        "task-notification",
      ),
    ]
  }

  return [make("debug.recorded", "debug", { label: event.label, raw: event.raw }, "raw-transcript")]
}

function stringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === "string" && field.trim().length > 0 ? field : undefined
}

function debugEventFromAgentEvent(
  event: AgentEvent,
  options: NormalizeAgentEventOptions,
  label: string,
  suffix: string,
): ChatEvent<"debug.recorded"> {
  const sessionId = chatSessionIdFor(event, options)
  const agentEventId = agentEventIdFor(event)
  return {
    id: chatEventId(`${agentEventId}:${suffix}`),
    type: "debug.recorded",
    channel: "debug",
    ts: event.ts,
    sessionId,
    agentEventId,
    payload: { label, raw: event },
    rawRefs: [{ id: agentEventId, source: "agent", label: event.kind, raw: event }],
  }
}

function orphanToolCompletionDebugEvent(event: ChatEvent<"tool.completed">): ChatEvent<"debug.recorded"> {
  return {
    id: chatEventId(`${event.id}:orphan-tool-result`),
    type: "debug.recorded",
    channel: "debug",
    ts: event.ts,
    sessionId: event.sessionId,
    agentEventId: event.agentEventId,
    payload: {
      label: "Orphan tool result",
      raw: {
        toolId: event.payload.toolId,
        status: event.payload.status,
        output: event.payload.output,
      },
    },
    rawRefs: event.rawRefs,
  }
}

function normalizeAssistantMessage(
  event: Extract<AgentEvent, { kind: "assistant-message" }>,
  make: <T extends ChatEventType>(
    type: T,
    channel: ChatChannelId,
    payload: ChatEventPayloads[T],
    suffix?: string,
  ) => ChatEvent<T>,
  messagePart: (
    messageId: ChatMessageId,
    partId: ChatMessagePartId,
    part: ChatEventPayloads["message.part.added"]["part"],
    suffix: string,
  ) => ChatEvent<"message.part.added">,
): ChatEvent[] {
  const messageId = chatMessageId(event.turnId)
  const out: ChatEvent[] = [make("message.started", "transcript", { messageId, role: "assistant" }, "message-started")]

  event.content.forEach((block, index) => {
    const suffix = `block-${index}`
    const blockKey = assistantBlockKey(event, index, block)
    switch (block.type) {
      case "text": {
        const partId = chatMessagePartId(`${event.turnId}:text:${blockKey}`)
        const partEventId = chatEventId(`${agentEventIdFor(event)}:${suffix}:text`)
        out.push(
          messagePart(
            messageId,
            partId,
            { id: partId, type: "text", text: block.text, eventIds: [partEventId] },
            `${suffix}:text`,
          ),
        )
        break
      }
      case "thinking": {
        const partId = chatMessagePartId(`${event.turnId}:thinking:${blockKey}`)
        const partEventId = chatEventId(`${agentEventIdFor(event)}:${suffix}:thinking`)
        out.push(
          messagePart(
            messageId,
            partId,
            { id: partId, type: "reasoning", text: block.text, eventIds: [partEventId] },
            `${suffix}:thinking`,
          ),
        )
        break
      }
      case "image": {
        const partId = chatMessagePartId(`${event.turnId}:image:${blockKey}`)
        const partEventId = chatEventId(`${agentEventIdFor(event)}:${suffix}:image`)
        out.push(
          messagePart(
            messageId,
            partId,
            {
              id: partId,
              type: "attachment",
              attachment: { kind: "image", label: `Image (${block.mediaType})`, mimeType: block.mediaType },
              eventIds: [partEventId],
            },
            `${suffix}:image`,
          ),
        )
        break
      }
      case "tool_use": {
        const toolId = chatToolId(block.id)
        const partId = chatMessagePartId(`${event.turnId}:tool:${block.id}`)
        const partEventId = chatEventId(`${agentEventIdFor(event)}:${suffix}:tool-ref`)
        out.push(
          make("tool.started", "activity", { toolId, name: block.name, input: block.input }, `${suffix}:tool-started`),
        )
        out.push(
          messagePart(
            messageId,
            partId,
            { id: partId, type: "tool-ref", toolId, eventIds: [partEventId] },
            `${suffix}:tool-ref`,
          ),
        )
        break
      }
      case "tool_result":
        out.push(
          make(
            "tool.completed",
            block.is_error ? "error" : "activity",
            { toolId: chatToolId(block.tool_use_id), status: block.is_error ? "failed" : "done", output: block.output },
            `${suffix}:tool-completed`,
          ),
        )
        break
      case "raw":
        out.push(make("debug.recorded", "debug", { label: block.label, raw: block.raw }, `${suffix}:raw`))
        break
      default:
        assertNeverContentBlock(block)
    }
  })

  return out
}

function assistantBlockKey(
  event: Extract<AgentEvent, { kind: "assistant-message" }>,
  index: number,
  block: AssistantContentBlock,
): string {
  if (block.type === "tool_use") return block.id
  if (block.type === "tool_result") return block.tool_use_id
  return `${event.ts}:${index}:${hashString(JSON.stringify(block))}`
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function chatSessionIdFor(event: AgentEvent, options: NormalizeAgentEventOptions): ChatSessionId {
  // Prefer the projector's explicit sessionId (the SessionHandle.id, e.g.
  // "s1") over the event's raw sessionId (the agent's session, e.g.
  // "fake-md-rich"). The chat projection store is owned by a SessionHandle,
  // so all events projected through it must carry the handle's id —
  // otherwise assertSameSession (project-transcript.ts) throws on the
  // first event whose raw agent sessionId doesn't match the handle.
  // Bead: @km/silvercode/chat-stability-scid-race.
  if (options.sessionId !== undefined) return chatSessionId(options.sessionId)
  if ("sessionId" in event) return chatSessionId(event.sessionId)
  if (event.kind === "handoff") return chatSessionId(event.to)
  return assertNeverAgentEvent(event)
}

function agentEventIdFor(event: AgentEvent): AgentEventId {
  const parts: string[] = [event.kind, String(event.ts)]
  if ("sessionId" in event) parts.push(event.sessionId)
  if ("turnId" in event) parts.push(event.turnId)
  if ("blockIndex" in event) parts.push(String(event.blockIndex))
  if ("id" in event) parts.push(event.id)
  if ("requestId" in event) parts.push(event.requestId)
  if ("source" in event) parts.push(event.source)
  if (event.kind === "handoff") parts.push(event.from, event.to)
  return parts.join(":") as AgentEventId
}

function chatEventId(value: string): ChatEventId {
  return value as ChatEventId
}

function chatSessionId(value: string): ChatSessionId {
  return value as ChatSessionId
}

function chatMessageId(value: string): ChatMessageId {
  return value as ChatMessageId
}

function chatMessagePartId(value: string): ChatMessagePartId {
  return value as ChatMessagePartId
}

function chatToolId(value: string): ChatToolId {
  return value as ChatToolId
}

function chatPermissionId(value: string): ChatPermissionId {
  return value as ChatPermissionId
}

function chatPlanTaskId(value: string): ChatPlanTaskId {
  return value as ChatPlanTaskId
}

function assertNeverAgentEvent(event: never): never {
  const kind = (event as { kind?: unknown }).kind
  throw new Error(`Unhandled AgentEvent kind in normalizeAgentEventToChatEvents: ${String(kind)}`)
}

function assertNeverContentBlock(block: never): never {
  const type = (block as AssistantContentBlock).type
  throw new Error(`Unhandled assistant content block type: ${String(type)}`)
}
