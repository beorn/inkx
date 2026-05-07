import { chatEventHandlingFor, parseChatEvent } from "./event-handling.ts"
import type {
  ChatChannelState,
  ChatEvent,
  ChatEventId,
  ChatLeaf,
  ChatMessageId,
  ChatNode,
  ChatNodeId,
  ChatPermissionId,
  ChatPlan,
  ChatQueue,
  ChatRole,
  ChatSessionId,
  ChatToolId,
  ChatTree,
} from "./types.ts"

type ProjectArgs = {
  sessionId: ChatSessionId
  events: readonly ChatEvent[]
}

function nodeId(value: string): ChatNodeId {
  return value as ChatNodeId
}

function assertNeverEvent(event: never): never {
  const type = (event as { type?: unknown }).type
  throw new Error(`Unhandled ChatEventType in projectChatTranscript: ${String(type)}`)
}

function assertSameSession(expected: ChatSessionId, event: ChatEvent): void {
  if (event.sessionId !== expected) {
    throw new Error(`ChatEvent ${event.id} belongs to ${event.sessionId}, expected ${expected}`)
  }
}

type MessageProjectionState = {
  role: ChatRole
  completed: boolean
  partIds: Set<string>
}

type ToolProjectionState = {
  completed: boolean
}

type PermissionProjectionState = {
  resolved: boolean
}

function assertEventIdsInclude(owner: string, eventId: ChatEventId, eventIds: readonly ChatEventId[]): void {
  if (!eventIds.includes(eventId)) {
    throw new Error(`${owner} does not reference its source event ${eventId}`)
  }
}

function requireMessageState(
  messages: Map<ChatMessageId, MessageProjectionState>,
  event: ChatEvent<"message.part.added">,
): MessageProjectionState | null {
  const state = messages.get(event.payload.messageId)
  if (!state) {
    throw new Error(`message.part.added ${event.id} references unknown message ${event.payload.messageId}`)
  }
  if (state.completed) {
    // ACP servers can deliver a trailing text delta after Silvercode has
    // force-closed a turn so the user can submit a new prompt. Treat that as
    // stale stream data instead of crashing the projection.
    return null
  }
  if (event.payload.part.id !== event.payload.partId) {
    throw new Error(`message.part.added ${event.id} payload part id does not match partId`)
  }
  if (state.partIds.has(event.payload.partId)) {
    throw new Error(`message.part.added ${event.id} duplicates part ${event.payload.partId}`)
  }
  assertEventIdsInclude(`message.part.added ${event.id} payload part`, event.id, event.payload.part.eventIds)
  state.partIds.add(event.payload.partId)
  return state
}

function requireToolState(
  tools: Map<ChatToolId, ToolProjectionState>,
  event: ChatEvent<"tool.updated" | "tool.completed">,
): ToolProjectionState {
  const state = tools.get(event.payload.toolId)
  if (!state) {
    throw new Error(`${event.type} ${event.id} references unknown tool ${event.payload.toolId}`)
  }
  if (state.completed) {
    throw new Error(`${event.type} ${event.id} references completed tool ${event.payload.toolId}`)
  }
  return state
}

function requirePermissionState(
  permissions: Map<ChatPermissionId, PermissionProjectionState>,
  event: ChatEvent<"permission.resolved">,
): PermissionProjectionState {
  const state = permissions.get(event.payload.permissionId)
  if (!state) {
    throw new Error(`permission.resolved ${event.id} references unknown permission ${event.payload.permissionId}`)
  }
  if (state.resolved) {
    throw new Error(
      `permission.resolved ${event.id} duplicates resolution for permission ${event.payload.permissionId}`,
    )
  }
  return state
}

function assertPlanConsistency(event: ChatEvent<"plan.updated">, plan: ChatPlan): void {
  assertEventIdsInclude(`plan.updated ${event.id} payload plan`, event.id, plan.eventIds)
  const ids = new Set<string>()
  for (const task of plan.tasks) {
    if (ids.has(task.id)) {
      throw new Error(`plan.updated ${event.id} duplicates task ${task.id}`)
    }
    ids.add(task.id)
  }
  for (const task of plan.tasks) {
    if (task.parentId && !ids.has(task.parentId)) {
      throw new Error(`plan.updated ${event.id} task ${task.id} references unknown parent ${task.parentId}`)
    }
  }
}

function assertQueueConsistency(event: ChatEvent<"queue.updated">, queue: ChatQueue): void {
  assertEventIdsInclude(`queue.updated ${event.id} payload queue`, event.id, queue.eventIds)
  const ids = new Set<string>()
  for (const item of queue.items) {
    if (ids.has(item.id)) {
      throw new Error(`queue.updated ${event.id} duplicates item ${item.id}`)
    }
    ids.add(item.id)
    assertEventIdsInclude(`queue.updated ${event.id} item ${item.id}`, event.id, item.eventIds)
  }
}

function leafBase(
  event: ChatEvent,
): Pick<ChatLeaf, "id" | "channel" | "eventIds" | "width" | "defaultDisclosure" | "detailAccess" | "rawRefs"> {
  const handling = chatEventHandlingFor(event.type)
  return {
    id: nodeId(`leaf:${event.id}`),
    channel: event.channel,
    eventIds: [event.id],
    width: handling.width,
    defaultDisclosure: handling.defaultDisclosure,
    detailAccess: handling.detailAccess,
    rawRefs: event.rawRefs,
  }
}

function stringArrayField(value: unknown, key: string): string[] {
  if (!value || typeof value !== "object") return []
  const field = (value as Record<string, unknown>)[key]
  if (!Array.isArray(field)) return []
  return field.flatMap((item) => (typeof item === "string" ? [item] : []))
}

function fileSnapshotFiles(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return []
  const files = stringArrayField(raw, "files")
  if (files.length > 0) return files
  const tracked = (raw as Record<string, unknown>).trackedFileBackups
  if (!Array.isArray(tracked)) return []
  return tracked.flatMap((item) => {
    if (typeof item === "string") return [item]
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const path = record.filePath ?? record.path ?? record.filename
    return typeof path === "string" ? [path] : []
  })
}

function debugLeafFor(event: ChatEvent<"debug.recorded">): ChatLeaf {
  const base = leafBase(event)
  const label = event.payload.label
  const raw = event.payload.raw
  if (label.startsWith("File history snapshot")) {
    return { ...base, type: "file-snapshot", props: { files: fileSnapshotFiles(raw) } }
  }
  if (label.startsWith("Hook") || label.startsWith("PreToolUse") || label.startsWith("PostToolUse")) {
    return { ...base, type: "hook", props: { label, raw } }
  }
  if (label.startsWith("MCP instructions")) {
    return { ...base, type: "mcp", props: { label, raw } }
  }
  if (label === "Session usage" || label === "Turn end") {
    const usage = raw && typeof raw === "object" ? (raw as { usage?: unknown })["usage"] : undefined
    const usageRecord = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {}
    return {
      ...base,
      type: "usage",
      props: {
        inputTokens: typeof usageRecord.input_tokens === "number" ? usageRecord.input_tokens : undefined,
        outputTokens: typeof usageRecord.output_tokens === "number" ? usageRecord.output_tokens : undefined,
        costUsd: typeof usageRecord.total_cost_usd === "number" ? usageRecord.total_cost_usd : undefined,
      },
    }
  }
  if (label.startsWith("Queue") || label.startsWith("Queued")) {
    return { ...base, type: "queue", props: { action: "updated" } }
  }
  return {
    ...base,
    type: "unknown",
    props: { label, raw },
  }
}

export function projectChatTranscript({ sessionId, events }: ProjectArgs): ChatTree {
  const rootId = nodeId("root")
  const root = {
    id: rootId,
    type: "root",
    children: [] as ChatNodeId[],
    eventIds: events.map((event) => event.id),
  } satisfies ChatNode
  const nodes: Record<ChatNodeId, ChatNode> = { [rootId]: root }
  const messages = new Map<ChatMessageId, MessageProjectionState>()
  const tools = new Map<ChatToolId, ToolProjectionState>()
  const permissions = new Map<ChatPermissionId, PermissionProjectionState>()

  const pushLeaf = (leaf: ChatLeaf): void => {
    nodes[leaf.id] = leaf
    root.children.push(leaf.id)
  }

  for (const input of events) {
    const event = parseChatEvent(input)
    assertSameSession(sessionId, event)
    switch (event.type) {
      case "message.started": {
        if (messages.has(event.payload.messageId)) {
          throw new Error(`message.started ${event.id} duplicates message ${event.payload.messageId}`)
        }
        messages.set(event.payload.messageId, { role: event.payload.role, completed: false, partIds: new Set() })
        break
      }
      case "message.part.added": {
        const message = requireMessageState(messages, event)
        if (!message) break
        const part = event.payload.part
        if (part.type === "text") {
          pushLeaf({
            ...leafBase(event),
            type: message.role === "user" ? "user-text" : "assistant-text",
            messageIds: [event.payload.messageId],
            partIds: [event.payload.partId],
            props: { text: part.text },
          })
        } else if (part.type === "reasoning") {
          pushLeaf({
            ...leafBase(event),
            type: "reasoning",
            messageIds: [event.payload.messageId],
            partIds: [event.payload.partId],
            props: { text: part.text },
          })
        } else if (part.type === "attachment") {
          pushLeaf({
            ...leafBase(event),
            type: "attachment",
            messageIds: [event.payload.messageId],
            partIds: [event.payload.partId],
            props: { attachment: part.attachment },
          })
        } else {
          if (!tools.has(part.toolId)) {
            throw new Error(`message.part.added ${event.id} references unknown tool ${part.toolId}`)
          }
          pushLeaf({
            ...leafBase(event),
            type: "tool",
            messageIds: [event.payload.messageId],
            partIds: [event.payload.partId],
            toolIds: [part.toolId],
            props: { name: "tool-ref" },
          })
        }
        break
      }
      case "message.completed": {
        const message = messages.get(event.payload.messageId)
        if (!message) {
          throw new Error(`message.completed ${event.id} references unknown message ${event.payload.messageId}`)
        }
        // Idempotent so replay/stream boundary duplicates do not crash, while
        // requireMessageState still prevents appending to a completed message.
        message.completed = true
        break
      }
      case "tool.started":
        if (tools.has(event.payload.toolId)) {
          throw new Error(`tool.started ${event.id} duplicates tool ${event.payload.toolId}`)
        }
        tools.set(event.payload.toolId, { completed: false })
        pushLeaf({
          ...leafBase(event),
          type: "tool",
          toolIds: [event.payload.toolId],
          props: { name: event.payload.name, input: event.payload.input },
        })
        break
      case "tool.updated":
        requireToolState(tools, event)
        if (event.channel === "error") {
          pushLeaf({
            ...leafBase(event),
            type: "error",
            toolIds: [event.payload.toolId],
            status: event.payload.status,
            props: { message: "Tool update failed", raw: event.payload.outputDelta },
          })
        }
        break
      case "tool.completed":
        requireToolState(tools, event).completed = true
        pushLeaf({
          ...leafBase(event),
          type: "tool",
          toolIds: [event.payload.toolId],
          status: event.payload.status,
          props: { name: "tool", output: event.payload.output },
        })
        break
      case "permission.requested":
        if (permissions.has(event.payload.permissionId)) {
          throw new Error(`permission.requested ${event.id} duplicates permission ${event.payload.permissionId}`)
        }
        permissions.set(event.payload.permissionId, { resolved: false })
        pushLeaf({
          ...leafBase(event),
          type: "permission",
          status: "pending",
          props: { prompt: event.payload.prompt },
        })
        break
      case "permission.resolved":
        requirePermissionState(permissions, event).resolved = true
        break
      case "plan.updated":
        assertPlanConsistency(event, event.payload.plan)
        pushLeaf({
          ...leafBase(event),
          type: "plan-update",
          props: { taskCount: event.payload.plan.tasks.length },
        })
        break
      case "queue.updated":
        assertQueueConsistency(event, event.payload.queue)
        pushLeaf({
          ...leafBase(event),
          type: "queue",
          props: { action: "updated" },
        })
        break
      case "notification.received":
        pushLeaf({ ...leafBase(event), type: "notification", props: event.payload })
        break
      case "recap.recorded":
        pushLeaf({
          ...leafBase(event),
          type: "recap",
          props: { text: event.payload.text },
        })
        break
      case "session.updated":
        if (event.channel === "status") {
          pushLeaf({
            ...leafBase(event),
            type: "session-status",
            props: {
              label: "Session updated",
              value: event.payload.title ?? event.payload.model ?? event.payload.mode ?? event.payload.cwd,
            },
          })
        }
        break
      case "status.updated":
        pushLeaf({
          ...leafBase(event),
          type: "session-status",
          severity: event.payload.severity,
          props: { label: event.payload.status },
        })
        break
      case "error.raised":
        pushLeaf({
          ...leafBase(event),
          type: "error",
          severity: event.payload.severity,
          props: { message: event.payload.message, raw: event.payload.raw },
        })
        break
      case "debug.recorded":
        pushLeaf(debugLeafFor(event))
        break
      default:
        assertNeverEvent(event)
    }
  }

  return {
    rootId,
    nodes,
    state: { disclosure: {} },
  }
}

export function visibleChatLeaves(
  tree: ChatTree,
  channels: Readonly<Record<string, ChatChannelState | undefined>>,
): ChatLeaf[] {
  const root = tree.nodes[tree.rootId]
  if (!root || !("children" in root)) return []
  const leaves: ChatLeaf[] = []
  for (const id of root.children) {
    const node = tree.nodes[id]
    if (!node || "children" in node) continue
    const channel = channels[node.channel]
    if (channel?.visible && !channel.muted) leaves.push(node)
  }
  return leaves
}
