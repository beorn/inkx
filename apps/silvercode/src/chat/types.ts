export type Brand<T, Name extends string> = T & { readonly __brand: Name }

export type AgentEventId = Brand<string, "AgentEventId">
export type ChatEventId = Brand<string, "ChatEventId">
export type ChatSessionId = Brand<string, "ChatSessionId">
export type ChatNodeId = Brand<string, "ChatNodeId">
export type ChatMessageId = Brand<string, "ChatMessageId">
export type ChatBlockId = Brand<string, "ChatBlockId">
export type ChatToolId = Brand<string, "ChatToolId">
export type ChatSubagentActivityId = Brand<string, "ChatSubagentActivityId">
export type ChatPlanStepId = Brand<string, "ChatPlanStepId">
export type ChatPromptId = Brand<string, "ChatPromptId">
export type ChatPermissionId = Brand<string, "ChatPermissionId">

export const CHAT_CHANNELS = [
  "transcript",
  "activity",
  "notification",
  "debug",
  "permission",
  "plan",
  "queue",
  "status",
  "error",
] as const

export type ChatChannelId = (typeof CHAT_CHANNELS)[number]

export type ChatRole = "user" | "assistant" | "system"
export type ChatSeverity = "info" | "warning" | "error"
export type ChatStatus = "pending" | "running" | "done" | "failed" | "cancelled"
export type ChatDisclosure = "expanded" | "collapsed" | "adaptive"
export type ChatWidth = "prose" | "wide" | "full"
export type ChatDetailAccess = "expand" | "cmd-hover" | "side-panel"

export type ChatRawRef = {
  id: string
  source: "agent" | "adapter" | "local" | "replay" | "restore"
  label?: string
  raw?: unknown
}

export type ChatEventType =
  | "message.started"
  | "message.block.added"
  | "message.completed"
  | "tool.started"
  | "tool.updated"
  | "tool.completed"
  | "permission.requested"
  | "permission.resolved"
  | "plan.updated"
  | "queue.updated"
  | "notification.received"
  | "recap.recorded"
  | "session.updated"
  | "status.updated"
  | "error.raised"
  | "debug.recorded"

export type ChatEventPayloads = {
  "message.started": { messageId: ChatMessageId; role: ChatRole }
  "message.block.added": { messageId: ChatMessageId; blockId: ChatBlockId; block: ChatBlock }
  "message.completed": { messageId: ChatMessageId }
  "tool.started": { toolId: ChatToolId; name: string; input?: unknown }
  "tool.updated": { toolId: ChatToolId; status?: ChatStatus; outputDelta?: unknown }
  "tool.completed": {
    toolId: ChatToolId
    status: Extract<ChatStatus, "done" | "failed" | "cancelled">
    output?: unknown
  }
  "permission.requested": {
    permissionId: ChatPermissionId
    toolId?: ChatToolId
    prompt: string
    options: readonly string[]
  }
  "permission.resolved": { permissionId: ChatPermissionId; decision: "approved" | "rejected" | "cancelled" }
  "plan.updated": { plan: ChatPlan }
  "queue.updated": { promptQueue: ChatPromptQueue }
  "notification.received": ChatNotificationLeafProps
  "recap.recorded": { text: string; raw?: unknown }
  "session.updated": {
    title?: string
    titleSource?: "custom" | "ai" | "agent"
    model?: string
    mode?: string
    cwd?: string
  }
  "status.updated": { status: string; severity?: ChatSeverity }
  "error.raised": { message: string; severity?: ChatSeverity; raw?: unknown }
  "debug.recorded": { label: string; raw: unknown }
}

export type ChatEvent<T extends ChatEventType = ChatEventType> = {
  [Type in T]: {
    id: ChatEventId
    type: Type
    channel: ChatChannelId
    ts: number
    sessionId: ChatSessionId
    agentEventId?: AgentEventId
    payload: ChatEventPayloads[Type]
    rawRefs: readonly ChatRawRef[]
  }
}[T]

export type ChatMessage = {
  id: ChatMessageId
  role: ChatRole
  blockIds: readonly ChatBlockId[]
  eventIds: readonly ChatEventId[]
}

export type ChatBlock =
  | { id: ChatBlockId; type: "text"; text: string; eventIds: readonly ChatEventId[] }
  | { id: ChatBlockId; type: "reasoning"; text: string; eventIds: readonly ChatEventId[] }
  | { id: ChatBlockId; type: "attachment"; attachment: ChatAttachment; eventIds: readonly ChatEventId[] }
  | { id: ChatBlockId; type: "tool-ref"; toolId: ChatToolId; eventIds: readonly ChatEventId[] }

export type ChatAttachment = {
  kind: "file" | "image" | "url" | "resource"
  label: string
  uri?: string
  mimeType?: string
}

export type ChatTool = {
  id: ChatToolId
  name: string
  status: ChatStatus
  input?: unknown
  output?: unknown
  eventIds: readonly ChatEventId[]
  rawRefs: readonly ChatRawRef[]
}

export type ChatSubagentActivityStatus = "running" | "done" | "failed" | "cancelled"

export type ChatSubagentActivity = {
  id: ChatSubagentActivityId | string
  label: string
  status: ChatSubagentActivityStatus
  startedAt: number
  completedAt?: number
  toolId?: ChatToolId | string
  resultText?: string
  output?: unknown
  metadata?: {
    subagentType?: string
    prompt?: string
  }
  eventIds: readonly string[]
  rawRefs: readonly ChatRawRef[]
  raw?: unknown
}

export type ChatPlanStep = {
  id: ChatPlanStepId
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority?: "high" | "medium" | "low"
  parentId?: ChatPlanStepId
}

export type ChatPlan = {
  steps: readonly ChatPlanStep[]
  eventIds: readonly ChatEventId[]
}

export type ChatPrompt = {
  id: ChatPromptId
  label: string
  status: "queued" | "running" | "done" | "cancelled"
  eventIds: readonly ChatEventId[]
}

export type ChatPromptQueue = {
  prompts: readonly ChatPrompt[]
  eventIds: readonly ChatEventId[]
}

export type ChatPermissionRequest = {
  id: ChatPermissionId
  status: "pending" | "approved" | "rejected" | "cancelled"
  prompt: string
  toolId?: ChatToolId
  eventIds: readonly ChatEventId[]
}

export type ChatPermissions = {
  requests: Readonly<Record<ChatPermissionId, ChatPermissionRequest>>
}

export type ChatElementType = "root" | "turn" | "message" | "work" | "subtask"

export type ChatLeafType =
  | "user-text"
  | "assistant-text"
  | "reasoning"
  | "attachment"
  | "recap"
  | "read"
  | "search"
  | "patch"
  | "command"
  | "tool"
  | "permission"
  | "plan-update"
  | "queue"
  | "notification"
  | "session-status"
  | "file-snapshot"
  | "hook"
  | "mcp"
  | "usage"
  | "error"
  | "unknown"

export type ChatNode = ChatElement | ChatLeaf

type ChatElementBase<Type extends ChatElementType> = {
  id: ChatNodeId
  type: Type
  children: readonly ChatNodeId[]
  eventIds: readonly ChatEventId[]
  summary?: string
}

export type ChatElement =
  | ChatElementBase<"root">
  | ChatElementBase<"turn">
  | (ChatElementBase<"message"> & { messageId: ChatMessageId; role: ChatRole })
  | (ChatElementBase<"work"> & { workType: "read" | "search" | "patch" | "command" | "tool" | "mixed" })
  | (ChatElementBase<"subtask"> & { title: string; status: ChatStatus })

type ChatLeafBase<Type extends ChatLeafType, Props extends ChatLeafProps> = {
  id: ChatNodeId
  type: Type
  channel: ChatChannelId
  eventIds: readonly ChatEventId[]
  messageIds?: readonly ChatMessageId[]
  blockIds?: readonly ChatBlockId[]
  toolIds?: readonly ChatToolId[]
  summary?: string
  status?: ChatStatus
  severity?: ChatSeverity
  width: ChatWidth
  defaultDisclosure: ChatDisclosure
  detailAccess: readonly ChatDetailAccess[]
  rawRefs: readonly ChatRawRef[]
  props: Props
}

export type ChatLeaf =
  | ChatLeafBase<"user-text", ChatTextLeafProps>
  | ChatLeafBase<"assistant-text", ChatTextLeafProps>
  | ChatLeafBase<"reasoning", ChatTextLeafProps>
  | ChatLeafBase<"attachment", ChatAttachmentLeafProps>
  | ChatLeafBase<"recap", ChatTextLeafProps>
  | ChatLeafBase<"read", ChatPathLeafProps>
  | ChatLeafBase<"search", ChatSearchLeafProps>
  | ChatLeafBase<"patch", ChatPatchLeafProps>
  | ChatLeafBase<"command", ChatCommandLeafProps>
  | ChatLeafBase<"tool", ChatToolLeafProps>
  | ChatLeafBase<"permission", ChatPermissionLeafProps>
  | ChatLeafBase<"plan-update", ChatPlanUpdateLeafProps>
  | ChatLeafBase<"queue", ChatPromptQueueLeafProps>
  | ChatLeafBase<"notification", ChatNotificationLeafProps>
  | ChatLeafBase<"session-status", ChatStatusLeafProps>
  | ChatLeafBase<"file-snapshot", ChatFileSnapshotLeafProps>
  | ChatLeafBase<"hook", ChatDebugLeafProps>
  | ChatLeafBase<"mcp", ChatDebugLeafProps>
  | ChatLeafBase<"usage", ChatUsageLeafProps>
  | ChatLeafBase<"error", ChatErrorLeafProps>
  | ChatLeafBase<"unknown", ChatDebugLeafProps>

export type ChatLeafProps =
  | ChatTextLeafProps
  | ChatAttachmentLeafProps
  | ChatPathLeafProps
  | ChatSearchLeafProps
  | ChatPatchLeafProps
  | ChatCommandLeafProps
  | ChatToolLeafProps
  | ChatPermissionLeafProps
  | ChatPlanUpdateLeafProps
  | ChatPromptQueueLeafProps
  | ChatNotificationLeafProps
  | ChatStatusLeafProps
  | ChatFileSnapshotLeafProps
  | ChatUsageLeafProps
  | ChatErrorLeafProps
  | ChatDebugLeafProps

export type ChatTextLeafProps = { text: string }
export type ChatAttachmentLeafProps = { attachment: ChatAttachment }
export type ChatPathLeafProps = { path: string; preview?: string }
export type ChatSearchLeafProps = { query: string; matches?: number; path?: string }
export type ChatPatchLeafProps = {
  path: string
  operation: "create" | "update" | "delete"
  added?: number
  removed?: number
}
export type ChatCommandLeafProps = {
  command: string
  cwd?: string
  exitCode?: number
  stdout?: string
  stderr?: string
  durationMs?: number
}
export type ChatToolLeafProps = { name: string; input?: unknown; output?: unknown }
export type ChatPermissionLeafProps = { prompt: string; decision?: "approved" | "rejected" | "cancelled" }
export type ChatPlanUpdateLeafProps = { stepCount: number; changedStepIds?: readonly ChatPlanStepId[] }
export type ChatPromptQueueLeafProps = {
  promptId?: ChatPromptId
  action: "queued" | "started" | "finished" | "cancelled" | "updated"
}
export type ChatNotificationLeafProps = {
  source: string
  title?: string
  body: string
  actionable?: boolean
}
export type ChatStatusLeafProps = { label: string; value?: string }
export type ChatFileSnapshotLeafProps = { files: readonly string[] }
export type ChatUsageLeafProps = { inputTokens?: number; outputTokens?: number; costUsd?: number }
export type ChatErrorLeafProps = { message: string; raw?: unknown }
export type ChatDebugLeafProps = { label: string; raw: unknown }

export type ChatChannelState = {
  id: ChatChannelId
  label: string
  visible: boolean
  muted: boolean
}

export type ChatTree = {
  rootId: ChatNodeId
  nodes: Readonly<Record<ChatNodeId, ChatNode>>
  state: ChatTreeState
}

export type ChatTreeState = {
  disclosure: Readonly<Record<ChatNodeId, ChatDisclosure>>
  selectedNodeId?: ChatNodeId
  rawInspector?: { nodeId: ChatNodeId; rawRefId: string }
}

export type ChatState = {
  session: ChatSession
}

export type ChatSession = {
  id: ChatSessionId
  title?: string
  model?: string
  mode?: string
  cwd?: string
  status?: string
  events: readonly ChatEvent[]
  messages: Readonly<Record<ChatMessageId, ChatMessage>>
  blocks: Readonly<Record<ChatBlockId, ChatBlock>>
  tools: Readonly<Record<ChatToolId, ChatTool>>
  subagentActivities: readonly ChatSubagentActivity[]
  plan: ChatPlan
  promptQueue: ChatPromptQueue
  permissions: ChatPermissions
  tree: ChatTree
  channels: Readonly<Record<ChatChannelId, ChatChannelState>>
}

export function isChatElement(node: ChatNode): node is ChatElement {
  return "children" in node
}

export function isChatLeaf(node: ChatNode): node is ChatLeaf {
  return !isChatElement(node)
}
