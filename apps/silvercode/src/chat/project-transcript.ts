import { chatEventHandlingFor, parseChatEvent } from "./event-handling.ts"
import type {
  ChatTrackState,
  ChatEvent,
  ChatEventId,
  ChatLeaf,
  ChatMessageId,
  ChatNode,
  ChatNodeId,
  ChatPermissionId,
  ChatPlan,
  ChatPromptQueue,
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
  throw new Error(`Unhandled ChatEventType in projectChatTree: ${String(type)}`)
}

function assertSameSession(expected: ChatSessionId, event: ChatEvent): void {
  if (event.sessionId !== expected) {
    throw new Error(`ChatEvent ${event.id} belongs to ${event.sessionId}, expected ${expected}`)
  }
}

type MessageProjectionState = {
  role: ChatRole
  completed: boolean
  blockIds: Set<string>
}

type ToolProjectionState = {
  completed: boolean
  name?: string
  input?: unknown
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
  event: ChatEvent<"message.block.added">,
): MessageProjectionState | null {
  const state = messages.get(event.payload.messageId)
  if (!state) {
    throw new Error(`message.block.added ${event.id} references unknown message ${event.payload.messageId}`)
  }
  if (state.completed) {
    // ACP servers can deliver a trailing text delta after Silvercode has
    // force-closed a turn so the user can submit a new prompt. Treat that as
    // stale stream data instead of crashing the projection.
    return null
  }
  if (event.payload.block.id !== event.payload.blockId) {
    throw new Error(`message.block.added ${event.id} payload block id does not match blockId`)
  }
  if (state.blockIds.has(event.payload.blockId)) {
    throw new Error(`message.block.added ${event.id} duplicates block ${event.payload.blockId}`)
  }
  assertEventIdsInclude(`message.block.added ${event.id} payload block`, event.id, event.payload.block.eventIds)
  state.blockIds.add(event.payload.blockId)
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
  for (const step of plan.steps) {
    if (ids.has(step.id)) {
      throw new Error(`plan.updated ${event.id} duplicates step ${step.id}`)
    }
    ids.add(step.id)
  }
  for (const step of plan.steps) {
    if (step.parentId && !ids.has(step.parentId)) {
      throw new Error(`plan.updated ${event.id} step ${step.id} references unknown parent ${step.parentId}`)
    }
  }
}

function assertPromptQueueConsistency(event: ChatEvent<"queue.updated">, promptQueue: ChatPromptQueue): void {
  assertEventIdsInclude(`queue.updated ${event.id} payload prompt queue`, event.id, promptQueue.eventIds)
  const ids = new Set<string>()
  for (const prompt of promptQueue.prompts) {
    if (ids.has(prompt.id)) {
      throw new Error(`queue.updated ${event.id} duplicates prompt ${prompt.id}`)
    }
    ids.add(prompt.id)
    assertEventIdsInclude(`queue.updated ${event.id} prompt ${prompt.id}`, event.id, prompt.eventIds)
  }
}

function leafBase(
  event: ChatEvent,
): Pick<ChatLeaf, "id" | "track" | "eventIds" | "width" | "defaultDisclosure" | "detailAccess" | "rawRefs"> {
  const handling = chatEventHandlingFor(event.type)
  return {
    id: nodeId(`leaf:${event.id}`),
    track: event.track,
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

export function projectChatTree({ sessionId, events }: ProjectArgs): ChatTree {
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
        messages.set(event.payload.messageId, { role: event.payload.role, completed: false, blockIds: new Set() })
        break
      }
      case "message.block.added": {
        const message = requireMessageState(messages, event)
        if (!message) break
        const block = event.payload.block
        if (block.type === "text") {
          pushLeaf({
            ...leafBase(event),
            type: "message",
            messageIds: [event.payload.messageId],
            blockIds: [event.payload.blockId],
            props: { role: message.role, text: block.text },
          })
        } else if (block.type === "thought") {
          pushLeaf({
            ...leafBase(event),
            type: "thought",
            messageIds: [event.payload.messageId],
            blockIds: [event.payload.blockId],
            props: { text: block.text },
          })
        } else if (block.type === "attachment") {
          pushLeaf({
            ...leafBase(event),
            type: "attachment",
            messageIds: [event.payload.messageId],
            blockIds: [event.payload.blockId],
            props: { attachment: block.attachment },
          })
        } else {
          const tool = tools.get(block.toolId)
          if (!tool) {
            throw new Error(`message.block.added ${event.id} references unknown tool ${block.toolId}`)
          }
          pushLeaf({
            ...leafBase(event),
            type: "tool",
            messageIds: [event.payload.messageId],
            blockIds: [event.payload.blockId],
            toolIds: [block.toolId],
            props: { name: tool.name ?? "tool-ref", input: tool.input },
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
        tools.set(event.payload.toolId, { completed: false, name: event.payload.name, input: event.payload.input })
        pushLeaf({
          ...leafBase(event),
          type: "tool",
          toolIds: [event.payload.toolId],
          props: { name: event.payload.name, input: event.payload.input },
        })
        break
      case "tool.updated":
        requireToolState(tools, event)
        if (event.track === "error") {
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
        const tool = requireToolState(tools, event)
        tool.completed = true
        pushLeaf({
          ...leafBase(event),
          type: "tool",
          toolIds: [event.payload.toolId],
          status: event.payload.status,
          props: { name: tool.name ?? "tool", input: tool.input, output: event.payload.output },
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
          props: { stepCount: event.payload.plan.steps.length },
        })
        break
      case "queue.updated":
        assertPromptQueueConsistency(event, event.payload.promptQueue)
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
        if (event.track === "status" || (event.track === "debug" && event.payload.mode !== undefined)) {
          pushLeaf({
            ...leafBase(event),
            type: "session-status",
            props: {
              label:
                event.track === "debug" && event.payload.mode !== undefined ? "Permission mode" : "Session updated",
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
  tracks: Readonly<Record<string, ChatTrackState | undefined>>,
): ChatLeaf[] {
  const root = tree.nodes[tree.rootId]
  if (!root || !("children" in root)) return []
  const leaves: ChatLeaf[] = []
  for (const id of root.children) {
    const node = tree.nodes[id]
    if (!node || "children" in node) continue
    const track = tracks[node.track]
    if (track?.visible && !track.muted) leaves.push(node)
  }
  return leaves
}
