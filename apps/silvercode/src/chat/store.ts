import { computed, signal } from "alien-signals"
import type { AgentEvent, MessageEntry, SessionStore } from "@km/agent-harness"
import { normalizeAgentEventsToChatEvents } from "./normalize-agent-event.ts"
import { projectChatTree, visibleChatLeaves } from "./project-transcript.ts"
import { projectSubagentActivitiesFromChatEvents } from "./subagent-activities.ts"
import type {
  ChatBlock,
  ChatBlockId,
  ChatEventId,
  ChatTrackId,
  ChatTrackState,
  ChatEvent,
  ChatLeaf,
  ChatMessage,
  ChatMessageId,
  ChatPermissionId,
  ChatPermissionRequest,
  ChatPlan,
  ChatPromptQueue,
  ChatSession,
  ChatSessionId,
  ChatTool,
  ChatToolId,
  ChatTree,
} from "./types.ts"

export type ChatSessionProjectionStore = {
  readonly events: () => readonly ChatEvent[]
  readonly tracks: () => Readonly<Record<ChatTrackId, ChatTrackState>>
  readonly tree: () => ChatTree
  readonly visibleLeaves: () => readonly ChatLeaf[]
  readonly session: () => ChatSession
  setTrackVisible(trackId: ChatTrackId, visible: boolean): void
  dispose(): void
}

export function createChatSessionProjectionStore(
  store: SessionStore,
  opts: { sessionId: string },
): ChatSessionProjectionStore {
  const sessionId = opts.sessionId as ChatSessionId
  const agentEvents = signal<readonly AgentEvent[]>(store.events.get())
  const sessionState = signal(store.state.get())
  const tracks = signal(defaultChatTracks())
  const unsubscribeEvents = store.events.subscribe((events) => {
    agentEvents(events)
  })
  const unsubscribeState = store.state.subscribe((state) => {
    sessionState(state)
  })
  const events = computed(() => {
    const normalizedEvents = normalizeAgentEventsToChatEvents(agentEvents(), { sessionId })
    if (normalizedEvents.length > 0 || sessionState().messages.length === 0) return normalizedEvents
    return legacyMessageEntriesToChatEvents(sessionId, sessionState().messages)
  })
  const tree = computed(() => projectChatTree({ sessionId, events: events() }))
  const visible = computed(() => visibleChatLeaves(tree(), tracks()))
  const session = computed(() => buildChatSession(sessionId, events(), tree(), tracks()))

  return {
    events,
    tracks,
    tree,
    visibleLeaves: visible,
    session,
    setTrackVisible(trackId, isVisible): void {
      const current = tracks()
      const state = current[trackId]
      tracks({
        ...current,
        [trackId]: { ...state, visible: isVisible, muted: !isVisible },
      })
    },
    dispose(): void {
      unsubscribeEvents()
      unsubscribeState()
    },
  }
}

export function defaultChatTracks(): Record<ChatTrackId, ChatTrackState> {
  return {
    transcript: { id: "transcript", label: "Transcript", visible: true, muted: false },
    activity: { id: "activity", label: "Activity", visible: true, muted: false },
    notification: { id: "notification", label: "Notifications", visible: true, muted: false },
    debug: { id: "debug", label: "Debug", visible: false, muted: true },
    permission: { id: "permission", label: "Permissions", visible: true, muted: false },
    plan: { id: "plan", label: "Plan", visible: true, muted: false },
    queue: { id: "queue", label: "Queue", visible: true, muted: false },
    status: { id: "status", label: "Status", visible: true, muted: false },
    error: { id: "error", label: "Errors", visible: true, muted: false },
  }
}

function buildChatSession(
  sessionId: ChatSessionId,
  events: readonly ChatEvent[],
  tree: ChatTree,
  tracks: Readonly<Record<ChatTrackId, ChatTrackState>>,
): ChatSession {
  const messages: Record<ChatMessageId, ChatMessage> = {}
  const blocks: Record<ChatBlockId, ChatBlock> = {}
  const tools: Record<ChatToolId, ChatTool> = {}
  const permissionRequests: Record<ChatPermissionId, ChatPermissionRequest> = {}
  let plan = emptyPlan()
  let promptQueue = emptyPromptQueue()
  let title: string | undefined
  let titlePriorityValue = 0
  let model: string | undefined
  let mode: string | undefined
  let cwd: string | undefined
  let status: string | undefined

  for (const event of events) {
    switch (event.type) {
      case "message.started":
        if (messages[event.payload.messageId]) {
          throw new Error(`message.started ${event.id} duplicates message ${event.payload.messageId}`)
        }
        messages[event.payload.messageId] = {
          id: event.payload.messageId,
          role: event.payload.role,
          blockIds: [],
          eventIds: [event.id],
        }
        break
      case "message.block.added": {
        const message = messages[event.payload.messageId]
        if (!message) {
          throw new Error(`message.block.added ${event.id} references unknown message ${event.payload.messageId}`)
        }
        if (blocks[event.payload.blockId]) {
          throw new Error(`message.block.added ${event.id} duplicates block ${event.payload.blockId}`)
        }
        blocks[event.payload.blockId] = event.payload.block
        messages[event.payload.messageId] = {
          ...message,
          blockIds: [...message.blockIds, event.payload.blockId],
          eventIds: [...message.eventIds, event.id],
        }
        break
      }
      case "message.completed": {
        const message = messages[event.payload.messageId]
        if (!message) {
          throw new Error(`message.completed ${event.id} references unknown message ${event.payload.messageId}`)
        }
        messages[event.payload.messageId] = { ...message, eventIds: [...message.eventIds, event.id] }
        break
      }
      case "tool.started":
        if (tools[event.payload.toolId]) {
          throw new Error(`tool.started ${event.id} duplicates tool ${event.payload.toolId}`)
        }
        tools[event.payload.toolId] = {
          id: event.payload.toolId,
          name: event.payload.name,
          status: "running",
          input: event.payload.input,
          eventIds: [event.id],
          rawRefs: event.rawRefs,
        }
        break
      case "tool.updated": {
        const tool = tools[event.payload.toolId]
        if (!tool) {
          throw new Error(`tool.updated ${event.id} references unknown tool ${event.payload.toolId}`)
        }
        tools[event.payload.toolId] = {
          ...tool,
          status: event.payload.status ?? tool.status,
          output: event.payload.outputDelta ?? tool.output,
          eventIds: [...tool.eventIds, event.id],
          rawRefs: [...tool.rawRefs, ...event.rawRefs],
        }
        break
      }
      case "tool.completed": {
        const tool = tools[event.payload.toolId]
        if (!tool) {
          throw new Error(`tool.completed ${event.id} references unknown tool ${event.payload.toolId}`)
        }
        tools[event.payload.toolId] = {
          ...tool,
          status: event.payload.status,
          output: event.payload.output,
          eventIds: [...tool.eventIds, event.id],
          rawRefs: [...tool.rawRefs, ...event.rawRefs],
        }
        break
      }
      case "permission.requested":
        permissionRequests[event.payload.permissionId] = {
          id: event.payload.permissionId,
          status: "pending",
          prompt: event.payload.prompt,
          toolId: event.payload.toolId,
          eventIds: [event.id],
        }
        break
      case "permission.resolved": {
        const request = permissionRequests[event.payload.permissionId]
        if (!request) {
          throw new Error(`permission.resolved ${event.id} references unknown permission ${event.payload.permissionId}`)
        }
        permissionRequests[event.payload.permissionId] = {
          ...request,
          status: event.payload.decision,
          eventIds: [...request.eventIds, event.id],
        }
        break
      }
      case "plan.updated":
        plan = event.payload.plan
        break
      case "queue.updated":
        promptQueue = event.payload.promptQueue
        break
      case "session.updated":
        if (event.payload.title !== undefined) {
          const nextPriority = titlePriority(event.payload.titleSource)
          if (nextPriority >= titlePriorityValue) {
            title = event.payload.title
            titlePriorityValue = nextPriority
          }
        }
        model = event.payload.model ?? model
        mode = event.payload.mode ?? mode
        cwd = event.payload.cwd ?? cwd
        break
      case "status.updated":
        status = event.payload.status
        break
      case "notification.received":
      case "recap.recorded":
      case "error.raised":
      case "debug.recorded":
        break
      default: {
        const _exhaustive: never = event
        return _exhaustive
      }
    }
  }

  return {
    id: sessionId,
    title,
    model,
    mode,
    cwd,
    status,
    events,
    messages,
    blocks,
    tools,
    subagentActivities: projectSubagentActivitiesFromChatEvents(events, { sessionId, currentOnly: false }),
    plan,
    promptQueue,
    permissions: { requests: permissionRequests },
    tree,
    tracks,
  }
}

function emptyPlan(): ChatPlan {
  return { steps: [], eventIds: [] }
}

function emptyPromptQueue(): ChatPromptQueue {
  return { prompts: [], eventIds: [] }
}

function legacyMessageEntriesToChatEvents(sessionId: ChatSessionId, messages: readonly MessageEntry[]): ChatEvent[] {
  const events: ChatEvent[] = []
  for (const [messageIndex, message] of messages.entries()) {
    const messageId = String(message.id) as ChatMessageId
    const baseId = `legacy:${message.id || messageIndex}`
    events.push(
      legacyChatEvent(sessionId, `${baseId}:started`, message.ts, "message.started", "transcript", {
        messageId,
        role: message.role,
      }),
    )

    let textBlockCount = 0
    for (const [opIndex, op] of message.ops.entries()) {
      if (op.kind !== "text" && op.kind !== "thinking") continue
      if (op.text.trim().length === 0) continue
      const eventId = `${baseId}:block:${opIndex}` as ChatEventId
      const blockId = `${baseId}:${op.kind}:${opIndex}` as ChatBlockId
      events.push(
        legacyChatEvent(sessionId, eventId, message.ts, "message.block.added", "transcript", {
          messageId,
          blockId,
          block: {
            id: blockId,
            type: op.kind === "thinking" ? "thought" : "text",
            text: op.text,
            eventIds: [eventId],
          },
        }),
      )
      textBlockCount++
    }

    if (textBlockCount === 0 && message.text.trim().length > 0) {
      const eventId = `${baseId}:block:text` as ChatEventId
      const blockId = `${baseId}:text` as ChatBlockId
      events.push(
        legacyChatEvent(sessionId, eventId, message.ts, "message.block.added", "transcript", {
          messageId,
          blockId,
          block: {
            id: blockId,
            type: "text",
            text: message.text,
            eventIds: [eventId],
          },
        }),
      )
    }

    events.push(
      legacyChatEvent(sessionId, `${baseId}:completed`, message.ts, "message.completed", "transcript", { messageId }),
    )
  }
  return events
}

function legacyChatEvent<T extends ChatEvent["type"]>(
  sessionId: ChatSessionId,
  id: string,
  ts: number,
  type: T,
  track: ChatTrackId,
  payload: Extract<ChatEvent, { type: T }>["payload"],
): ChatEvent<T> {
  return {
    id: id as ChatEventId,
    type,
    track,
    ts,
    sessionId,
    payload,
    rawRefs: [{ id, source: "restore", label: "Legacy MessageEntry" }],
  } as unknown as ChatEvent<T>
}

function titlePriority(source: ChatEventPayloadTitleSource | undefined): number {
  if (source === "custom") return 3
  if (source === "agent") return 2
  if (source === "ai") return 1
  return 2
}

type ChatEventPayloadTitleSource = Extract<ChatEvent, { type: "session.updated" }>["payload"]["titleSource"]
