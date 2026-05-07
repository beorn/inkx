import type { MessageEntry } from "@km/agent-harness"
import type { BackgroundTask } from "../controller.ts"
import type { NotificationStreamEntry } from "../notification-stream.ts"

export type ChatActivityCounts = {
  agentsRunning: number
  backgroundTasksRunning: number
  shellsRunning: number
}

export type ChatActivityStatus = "running" | "done"

type ActivityBase = {
  id: string
  label: string
  detail?: string
  status?: ChatActivityStatus
  matchKey?: string
  raw?: unknown
}

export type SubagentActivity = ActivityBase & {
  metadata?: {
    subagentType?: string
    prompt?: string
  }
}

export type BackgroundShellActivity = ActivityBase

export type ChatActivitySnapshot = {
  counts: ChatActivityCounts
  agents: readonly SubagentActivity[]
  shells: readonly BackgroundShellActivity[]
}

export type ChatActivitySnapshotOptions = {
  readonly notificationEntries?: readonly NotificationStreamEntry[]
  readonly sessionId?: string
}

export function chatActivitySnapshotFromMessages(
  messages: readonly MessageEntry[],
  backgroundTasks: readonly BackgroundTask[],
  options: ChatActivitySnapshotOptions = {},
): ChatActivitySnapshot {
  const agentsByKey = new Map<string, SubagentActivity>()
  const agentAliases = new Map<string, string>()
  const shells: BackgroundShellActivity[] = []
  const lastUserIndex = findLastMessageIndex(messages, (message) => message.role === "user")
  const currentMessages = lastUserIndex >= 0 ? messages.slice(lastUserIndex + 1) : messages
  const currentTurnStartedAt = lastUserIndex >= 0 ? messages[lastUserIndex]?.ts : undefined
  const upsertAgent = (agent: SubagentActivity): void => {
    const identity = agentIdentity(agent)
    const key =
      identity.primaryKeys.flatMap((candidate) => agentAliases.get(candidate) ?? []).at(0) ?? identity.primaryKeys[0]
    if (!key) return
    const existing = agentsByKey.get(key)
    if (!existing || (existing.status !== "done" && agent.status === "done")) {
      agentsByKey.set(key, agent)
    }
    for (const candidate of identity.aliases) agentAliases.set(candidate, key)
  }
  for (const message of currentMessages) {
    for (const call of message.toolCalls) {
      const result = message.toolResults.find((candidate) => candidate.id === call.id)
      const hasResult = result !== undefined
      if (call.name === "Task" || call.name === "Agent") {
        upsertAgent(
          subagentActivityFromTool(call.id, call.name, call.input, hasResult ? "done" : "running", {
            messageId: message.id,
            messageTs: message.ts,
            resultOutput: result?.output,
          }),
        )
        continue
      }
      if (hasResult) continue
      if (call.name === "Bash" && isBackgroundShellInput(call.input)) {
        shells.push(
          backgroundShellActivityFromTool(call.id, "Bash", call.input, {
            messageId: message.id,
            messageTs: message.ts,
          }),
        )
      }
    }
  }
  for (const entry of options.notificationEntries ?? []) {
    const agent = subagentActivityFromNotification(entry, {
      currentTurnStartedAt,
      sessionId: options.sessionId,
    })
    if (agent) upsertAgent(agent)
  }
  const agents = [...agentsByKey.values()]
  return {
    counts: {
      agentsRunning: agents.filter((agent) => agent.status !== "done").length,
      backgroundTasksRunning: backgroundTasks.filter((task) => task.status === "running").length,
      shellsRunning: shells.length,
    },
    agents,
    shells,
  }
}

export function chatActivityCountsFromMessages(
  messages: readonly MessageEntry[],
  backgroundTasks: readonly BackgroundTask[],
): ChatActivityCounts {
  return chatActivitySnapshotFromMessages(messages, backgroundTasks).counts
}

function findLastMessageIndex(
  messages: readonly MessageEntry[],
  predicate: (message: MessageEntry) => boolean,
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m === undefined) continue
    if (predicate(m)) return i
  }
  return -1
}

function isBackgroundShellInput(input: unknown): boolean {
  return typeof input === "object" && (input as Record<string, unknown>)?.run_in_background === true
}

function subagentActivityFromTool(
  id: string,
  fallbackLabel: string,
  input: unknown,
  status: ChatActivityStatus,
  context?: { messageId: string; messageTs: number; resultOutput?: unknown },
): SubagentActivity {
  const obj = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {}
  const description = stringField(obj.description) ?? stringField(obj.subagent_type)
  const command = stringField(obj.command)
  const subagentType = stringField(obj.subagent_type) ?? stringField(obj.agent)
  const prompt = stringField(obj.prompt)
  const stableLabel = description ?? command
  return {
    id,
    label: stableLabel ?? fallbackLabel,
    detail: command && command !== description ? command : undefined,
    status,
    matchKey: stableLabel,
    metadata: {
      ...(subagentType && subagentType !== description ? { subagentType } : {}),
      ...(prompt ? { prompt } : {}),
    },
    raw: {
      kind: "tool-call-agent",
      id,
      name: fallbackLabel,
      input,
      status,
      ...context,
    },
  }
}

function backgroundShellActivityFromTool(
  id: string,
  fallbackLabel: string,
  input: unknown,
  context: { messageId: string; messageTs: number },
): BackgroundShellActivity {
  const obj = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {}
  const command = stringField(obj.command)
  return {
    id,
    label: command ?? fallbackLabel,
    status: "running",
    raw: {
      kind: "tool-call-background-shell",
      id,
      name: fallbackLabel,
      input,
      status: "running",
      ...context,
    },
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function normalizedAgentKey(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized && normalized.length > 0 ? normalized : null
}

function meaningfulAgentLabelKey(value: string | undefined): string | null {
  const normalized = normalizedAgentKey(value)
  if (!normalized) return null
  if (normalized === "agent" || normalized === "task" || normalized === "general-purpose") return null
  if (normalized === "(no description)") return null
  return normalized
}

function fallbackAgentKeys(agent: SubagentActivity): string[] {
  const keys = [agent.id, agent.matchKey].flatMap((value) => {
    const normalized = normalizedAgentKey(value)
    return normalized ? [normalized] : []
  })
  return [...new Set(keys)]
}

function agentIdentity(agent: SubagentActivity): { primaryKeys: string[]; aliases: string[] } {
  const labelKey = meaningfulAgentLabelKey(agent.label)
  if (labelKey) return { primaryKeys: [labelKey], aliases: [labelKey] }
  const keys = fallbackAgentKeys(agent)
  return { primaryKeys: keys, aliases: keys }
}

function subagentActivityFromNotification(
  entry: NotificationStreamEntry,
  opts: { currentTurnStartedAt?: number; sessionId?: string },
): SubagentActivity | null {
  if (entry.source !== "subagent" && entry.source !== "sub-agent") return null
  const timestamp = entry.ts ?? entry.timestamp ?? 0
  if (opts.currentTurnStartedAt !== undefined && timestamp < opts.currentTurnStartedAt) return null
  const fromSessionId = typeof entry.meta?.fromSessionId === "string" ? entry.meta.fromSessionId : undefined
  if (opts.sessionId && fromSessionId && fromSessionId !== opts.sessionId) return null
  const parsed = parseSubagentNotificationContent(entry.content)
  if (!parsed) return null
  const metaDescription = stringField(entry.meta?.description)
  const description = metaDescription ?? parsed.description
  if (!isMeaningfulSubagentDescription(description)) return null
  const toolUseId = stringField(entry.meta?.toolUseId)
  return {
    id: entry.id,
    label: description,
    status: parsed.status,
    matchKey: toolUseId ?? description,
    raw: {
      kind: "subagent-notification",
      entry,
    },
  }
}

function parseSubagentNotificationContent(
  content: string,
): { description: string; label: string; status: ChatActivityStatus } | null {
  const match = content.match(
    /^\[subagent\s+[^\]]+\]\s+(started|completed|failed|stopped|progress|in progress):\s*([\s\S]*)$/i,
  )
  if (!match) return null
  const statusText = (match[1] ?? "").toLowerCase()
  const body = cleanSubagentNotificationBody(match[2] ?? "")
  if (!body) return null
  const [description = "", result] = body.split(/\s+—\s+/, 2)
  const trimmedDescription = description.trim()
  const done = statusText === "completed" || statusText === "failed" || statusText === "stopped"
  return {
    description: trimmedDescription,
    label: done ? result?.trim() || trimmedDescription : trimmedDescription,
    status: done ? "done" : "running",
  }
}

function cleanSubagentNotificationBody(value: string): string {
  return value
    .replace(/\s*<usage>[\s\S]*?<\/usage>\s*$/i, " ")
    .replace(/\s*\(use SendMessage with to:\s*'[^']+'\s*to continue this agent\)\s*/i, " ")
    .replace(/\s*\bagentId:\s*[A-Za-z0-9_-]+\s*/i, " ")
    .replace(/\s+—\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isMeaningfulSubagentDescription(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase()
  return normalized.length > 0 && normalized !== "(no description)"
}
