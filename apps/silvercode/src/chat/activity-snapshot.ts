import type { MessageEntry } from "@km/agent-harness"
import type { BackgroundTask } from "../controller.ts"
import type { NotificationStreamEntry } from "../notification-stream.ts"
import {
  projectCurrentSubagentActivitiesFromMessages,
  subagentActivityRowsFromActivities,
  type SubagentActivityRow,
} from "./subagent-activities.ts"

export type { SubagentActivityRow } from "./subagent-activities.ts"

export type ChatActivityCounts = {
  agentsRunning: number
  backgroundTasksRunning: number
  shellsRunning: number
}

export type ActivityRunStatus = "running" | "done"

type ActivityBase = {
  id: string
  label: string
  detail?: string
  status?: ActivityRunStatus
  raw?: unknown
}

export type BackgroundShellActivity = ActivityBase

export type ChatActivitySnapshot = {
  counts: ChatActivityCounts
  agents: readonly SubagentActivityRow[]
  shells: readonly BackgroundShellActivity[]
}

export type ChatActivitySnapshotOptions = {
  readonly notificationEntries?: readonly NotificationStreamEntry[]
  readonly sessionId?: string
  readonly agents?: readonly SubagentActivityRow[]
}

export function chatActivitySnapshotFromMessages(
  messages: readonly MessageEntry[],
  backgroundTasks: readonly BackgroundTask[],
  options: ChatActivitySnapshotOptions = {},
): ChatActivitySnapshot {
  const shells: BackgroundShellActivity[] = []
  const agents =
    options.agents ??
    subagentActivityRowsFromActivities(
      projectCurrentSubagentActivitiesFromMessages(messages, {
        notificationEntries: options.notificationEntries,
        sessionId: options.sessionId,
      }).activities,
    )
  const lastUserIndex = findLastMessageIndex(messages, (message) => message.role === "user")
  const currentMessages = lastUserIndex >= 0 ? messages.slice(lastUserIndex + 1) : messages
  for (const message of currentMessages) {
    for (const call of message.toolCalls) {
      const result = message.toolResults.find((candidate) => candidate.id === call.id)
      const hasResult = result !== undefined
      if (call.name === "Task" || call.name === "Agent") continue
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
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}
