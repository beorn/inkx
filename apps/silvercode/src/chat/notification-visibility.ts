import type { MessageEntry } from "@km/agent-harness"
import type { NotificationStreamEntry } from "../notification-stream.ts"

export function filterVisibleNotificationEntries(
  entries: readonly NotificationStreamEntry[],
  showDebug: boolean,
  selfSessionId: string,
  messages: readonly MessageEntry[] = [],
): readonly NotificationStreamEntry[] {
  if (showDebug) return entries
  const completedTools = completedSubagentToolMatches(messages)
  return entries.filter((entry) => !isHiddenSubagentNotification(entry, selfSessionId, completedTools))
}

function isHiddenSubagentNotification(
  entry: NotificationStreamEntry,
  selfSessionId: string,
  completedTools: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (!isSubagentNotification(entry)) return false
  if (isNonTerminalSubagentNotification(entry)) return true
  if (!isSameSessionSubagentNotification(entry, selfSessionId)) return false
  const toolUseId = typeof entry.meta?.toolUseId === "string" ? entry.meta.toolUseId : undefined
  if (toolUseId === undefined) return false
  const completedLabels = completedTools.get(toolUseId)
  if (!completedLabels) return false
  if (completedLabels.size === 0) return true
  const notificationLabel = subagentNotificationLabelKey(entry)
  return notificationLabel === null || completedLabels.has(notificationLabel)
}

function isSubagentNotification(entry: NotificationStreamEntry): boolean {
  return entry.source === "subagent" || entry.source === "sub-agent"
}

function isSameSessionSubagentNotification(entry: NotificationStreamEntry, selfSessionId: string): boolean {
  const fromSessionId = typeof entry.meta?.fromSessionId === "string" ? entry.meta.fromSessionId : undefined
  return fromSessionId !== undefined && fromSessionId === selfSessionId
}

function isNonTerminalSubagentNotification(entry: NotificationStreamEntry): boolean {
  if (!isSubagentNotification(entry)) return false
  const status = typeof entry.meta?.status === "string" ? entry.meta.status : undefined
  if (status) return status === "started" || status === "progress"
  return /^\[subagent\s+[^\]]+\]\s+(started|progress):/i.test(entry.content)
}

function completedSubagentToolMatches(messages: readonly MessageEntry[]): ReadonlyMap<string, ReadonlySet<string>> {
  const tools = new Map<string, Set<string>>()
  const add = (id: unknown, input: unknown): void => {
    const key = String(id)
    const labels = tools.get(key) ?? new Set<string>()
    const label = subagentToolInputLabelKey(input)
    if (label) labels.add(label)
    tools.set(key, labels)
  }
  for (const message of messages) {
    for (const call of message.toolCalls) {
      if (call.name !== "Agent" && call.name !== "Task") continue
      if (!message.toolResults.some((result) => result.id === call.id)) continue
      add(call.id, call.input)
    }
    for (const op of message.ops) {
      if (op.kind !== "tool") continue
      if (op.toolCall.name !== "Agent" && op.toolCall.name !== "Task") continue
      if (!op.result) continue
      add(op.toolCall.id, op.toolCall.input)
    }
  }
  return tools
}

function subagentToolInputLabelKey(input: unknown): string | null {
  const obj = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {}
  return meaningfulSubagentLabelKey(
    stringField(obj.description) ??
      stringField(obj.command) ??
      stringField(obj.prompt) ??
      stringField(obj.subagent_type),
  )
}

function subagentNotificationLabelKey(entry: NotificationStreamEntry): string | null {
  return meaningfulSubagentLabelKey(
    stringField(entry.meta?.description) ?? parseSubagentNotificationDescription(entry.content),
  )
}

function parseSubagentNotificationDescription(content: string): string | undefined {
  const match = content.match(/^\[subagent\s+[^\]]+\]\s+(?:completed|failed|stopped):\s*([\s\S]*)$/i)
  if (!match) return undefined
  const body = (match[1] ?? "")
    .replace(/\s*<usage>[\s\S]*?<\/usage>\s*$/i, " ")
    .replace(/\s*\(use SendMessage with to:\s*'[^']+'\s*to continue this agent\)\s*/i, " ")
    .replace(/\s*\bagentId:\s*[A-Za-z0-9_-]+\s*/i, " ")
    .replace(/\s+/g, " ")
    .trim()
  const [description = ""] = body.split(/\s+—\s+/, 2)
  return description.trim() || undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function meaningfulSubagentLabelKey(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === "agent" || normalized === "task" || normalized === "general-purpose") return null
  if (normalized === "(no description)") return null
  return normalized
}
