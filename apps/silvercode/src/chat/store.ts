import { computed, signal } from "alien-signals"
import type { AgentEvent, SessionStore } from "@km/agent-harness"
import { normalizeAgentEventsToChatEvents } from "./normalize-agent-event.ts"
import { projectChatTranscript, visibleChatLeaves } from "./project-transcript.ts"
import type {
  ChatChannelId,
  ChatChannelState,
  ChatEvent,
  ChatLeaf,
  ChatMessage,
  ChatMessageId,
  ChatMessagePart,
  ChatMessagePartId,
  ChatPermissionId,
  ChatPermissionRequest,
  ChatPlan,
  ChatQueue,
  ChatSession,
  ChatSessionId,
  ChatTool,
  ChatToolId,
  ChatTree,
} from "./types.ts"

export type ChatSessionProjectionStore = {
  readonly events: () => readonly ChatEvent[]
  readonly channels: () => Readonly<Record<ChatChannelId, ChatChannelState>>
  readonly tree: () => ChatTree
  readonly visibleLeaves: () => readonly ChatLeaf[]
  readonly session: () => ChatSession
  setChannelVisible(channelId: ChatChannelId, visible: boolean): void
  dispose(): void
}

export function createChatSessionProjectionStore(
  store: SessionStore,
  opts: { sessionId: string },
): ChatSessionProjectionStore {
  const sessionId = opts.sessionId as ChatSessionId
  const agentEvents = signal<readonly AgentEvent[]>(store.events.get())
  const channels = signal(defaultChatChannels())
  const unsubscribe = store.events.subscribe((events) => {
    agentEvents(events)
  })
  const events = computed(() => normalizeAgentEventsToChatEvents(agentEvents(), { sessionId }))
  const tree = computed(() => projectChatTranscript({ sessionId, events: events() }))
  const visible = computed(() => visibleChatLeaves(tree(), channels()))
  const session = computed(() => buildChatSession(sessionId, events(), tree(), channels()))

  return {
    events,
    channels,
    tree,
    visibleLeaves: visible,
    session,
    setChannelVisible(channelId, isVisible): void {
      const current = channels()
      const state = current[channelId]
      channels({
        ...current,
        [channelId]: { ...state, visible: isVisible, muted: !isVisible },
      })
    },
    dispose(): void {
      unsubscribe()
    },
  }
}

export function defaultChatChannels(): Record<ChatChannelId, ChatChannelState> {
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
  channels: Readonly<Record<ChatChannelId, ChatChannelState>>,
): ChatSession {
  const messages: Record<ChatMessageId, ChatMessage> = {}
  const messageParts: Record<ChatMessagePartId, ChatMessagePart> = {}
  const tools: Record<ChatToolId, ChatTool> = {}
  const permissionRequests: Record<ChatPermissionId, ChatPermissionRequest> = {}
  let plan = emptyPlan()
  let queue = emptyQueue()
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
          partIds: [],
          eventIds: [event.id],
        }
        break
      case "message.part.added": {
        const message = messages[event.payload.messageId]
        if (!message) {
          throw new Error(`message.part.added ${event.id} references unknown message ${event.payload.messageId}`)
        }
        if (messageParts[event.payload.partId]) {
          throw new Error(`message.part.added ${event.id} duplicates part ${event.payload.partId}`)
        }
        messageParts[event.payload.partId] = event.payload.part
        messages[event.payload.messageId] = {
          ...message,
          partIds: [...message.partIds, event.payload.partId],
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
        queue = event.payload.queue
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
    messageParts,
    tools,
    plan,
    queue,
    permissions: { requests: permissionRequests },
    tree,
    channels,
  }
}

function emptyPlan(): ChatPlan {
  return { tasks: [], eventIds: [] }
}

function emptyQueue(): ChatQueue {
  return { items: [], eventIds: [] }
}

function titlePriority(source: ChatEventPayloadTitleSource | undefined): number {
  if (source === "custom") return 3
  if (source === "agent") return 2
  if (source === "ai") return 1
  return 2
}

type ChatEventPayloadTitleSource = Extract<ChatEvent, { type: "session.updated" }>["payload"]["titleSource"]
