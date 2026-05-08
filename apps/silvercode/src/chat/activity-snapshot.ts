import type { BackgroundJob } from "../controller.ts"
import type { ChannelNotification } from "../notification-stream.ts"
import type { ChatEvent, ChatToolId } from "./types.ts"
import {
  projectCurrentSubagentActivitiesFromChatEvents,
  subagentActivityRowsFromActivities,
  type SubagentActivityRow,
} from "./subagent-activities.ts"

export type { SubagentActivityRow } from "./subagent-activities.ts"

export type ChatActivityCounts = {
  agentsRunning: number
  backgroundJobsRunning: number
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
  readonly notificationEntries?: readonly ChannelNotification[]
  readonly sessionId?: string
  readonly agents?: readonly SubagentActivityRow[]
}

export function chatActivitySnapshotFromChatEvents(
  events: readonly ChatEvent[],
  backgroundJobs: readonly BackgroundJob[],
  options: ChatActivitySnapshotOptions = {},
): ChatActivitySnapshot {
  const shells: BackgroundShellActivity[] = []
  const agents =
    options.agents ??
    subagentActivityRowsFromActivities(
      projectCurrentSubagentActivitiesFromChatEvents(events, {
        notificationEntries: options.notificationEntries,
        sessionId: options.sessionId,
      }),
    )
  const currentEvents = eventsSinceLastUserMessage(events)
  const completedToolIds = new Set<ChatToolId>()
  for (const event of currentEvents) {
    if (event.type === "tool.completed") completedToolIds.add(event.payload.toolId)
  }
  for (const event of currentEvents) {
    if (event.type !== "tool.started") continue
    const { toolId, name, input } = event.payload
    if (name === "Task" || name === "Agent") continue
    if (completedToolIds.has(toolId)) continue
    if (name === "Bash" && isBackgroundShellInput(input)) {
      shells.push(
        backgroundShellActivityFromTool(toolId, "Bash", input, {
          messageId: event.id,
          messageTs: event.ts,
        }),
      )
    }
  }
  return {
    counts: {
      agentsRunning: agents.filter((agent) => agent.status !== "done").length,
      backgroundJobsRunning: backgroundJobs.filter((job) => job.status === "running").length,
      shellsRunning: shells.length,
    },
    agents,
    shells,
  }
}

function eventsSinceLastUserMessage(events: readonly ChatEvent[]): readonly ChatEvent[] {
  const lastUserIndex = findLastEventIndex(
    events,
    (event) => event.type === "message.started" && event.payload.role === "user",
  )
  return lastUserIndex >= 0 ? events.slice(lastUserIndex + 1) : events
}

function findLastEventIndex(events: readonly ChatEvent[], predicate: (event: ChatEvent) => boolean): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event === undefined) continue
    if (predicate(event)) return i
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
