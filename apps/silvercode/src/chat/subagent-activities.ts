import type { ChannelNotification } from "../notification-stream.ts"
import type { ChatEvent, ChatRawRef } from "./types.ts"

export type SubagentActivityStatus = "running" | "done" | "failed" | "cancelled"

export type SubagentActivity = {
  readonly id: string
  readonly label: string
  readonly status: SubagentActivityStatus
  readonly startedAt: number
  readonly completedAt?: number
  readonly toolId?: string
  readonly resultText?: string
  readonly output?: unknown
  readonly metadata?: {
    readonly subagentType?: string
    readonly prompt?: string
  }
  readonly eventIds: readonly string[]
  readonly rawRefs: readonly ChatRawRef[]
  readonly raw?: unknown
}

export type SubagentActivityRow = {
  readonly id: string
  readonly label: string
  readonly detail?: string
  readonly status?: "running" | "done"
  readonly matchKey?: string
  readonly metadata?: {
    readonly subagentType?: string
    readonly prompt?: string
  }
  readonly raw?: unknown
}

export type ProjectSubagentActivityOptions = {
  readonly sessionId?: string
  readonly notificationEntries?: readonly ChannelNotification[]
  readonly currentOnly?: boolean
}

type SubagentActivityCandidate = Omit<SubagentActivity, "eventIds" | "rawRefs"> & {
  readonly eventIds?: readonly string[]
  readonly rawRefs?: readonly ChatRawRef[]
}

const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set(["Task", "Agent"])

export function projectCurrentSubagentActivitiesFromChatEvents(
  events: readonly ChatEvent[],
  options: Omit<ProjectSubagentActivityOptions, "currentOnly"> = {},
): readonly SubagentActivity[] {
  return projectSubagentActivitiesFromChatEvents(events, { ...options, currentOnly: true })
}

export function projectSubagentActivitiesFromChatEvents(
  events: readonly ChatEvent[],
  options: ProjectSubagentActivityOptions = {},
): readonly SubagentActivity[] {
  const scopedEvents = options.sessionId ? events.filter((event) => event.sessionId === options.sessionId) : [...events]
  const orderedEvents = orderWithIndex(scopedEvents)
  const currentStartedAt = options.currentOnly === false ? undefined : latestUserMessageStartedAt(orderedEvents)
  const builder = new SubagentRunLedger()

  for (const { value: event } of orderedEvents) {
    if (currentStartedAt !== undefined && event.ts < currentStartedAt) continue
    switch (event.type) {
      case "tool.started":
        if (isSubagentToolName(event.payload.name)) {
          builder.upsert(subagentActivityFromToolStarted(event))
        }
        break
      case "tool.completed":
        builder.completeTool(
          event.payload.toolId,
          event.payload.status === "cancelled" ? "cancelled" : event.payload.status === "failed" ? "failed" : "done",
          {
            completedAt: event.ts,
            output: event.payload.output,
            resultText: resultText(event.payload.output),
            eventId: event.id,
            rawRefs: event.rawRefs,
          },
        )
        break
      default:
        break
    }
  }

  for (const entry of options.notificationEntries ?? []) {
    const activity = subagentActivityFromNotification(entry, {
      currentStartedAt,
      sessionId: options.sessionId,
    })
    if (activity) builder.upsert(activity)
  }

  return builder.activities()
}

export function representedSubagentNotificationIdsFromChatEvents(
  events: readonly ChatEvent[],
  entries: readonly ChannelNotification[],
  options: { readonly sessionId?: string } = {},
): ReadonlySet<string> {
  const builder = new SubagentRunLedger()
  const scopedEvents = options.sessionId ? events.filter((event) => event.sessionId === options.sessionId) : [...events]
  const orderedEvents = orderWithIndex(scopedEvents)
  const currentStartedAt = latestUserMessageStartedAt(orderedEvents)
  for (const activity of projectSubagentActivitiesFromChatEvents(events, {
    currentOnly: true,
    sessionId: options.sessionId,
  })) {
    builder.upsert(activity)
  }

  const hidden = new Set<string>()
  for (const entry of entries) {
    const activity = subagentActivityFromNotification(entry, {
      currentStartedAt,
      sessionId: options.sessionId,
    })
    if (!activity) continue
    if (activity.status === "running") continue
    if (builder.hasTerminalMatch(activity)) hidden.add(entry.id)
  }
  return hidden
}

export function subagentActivityRowsFromActivities(
  activities: readonly SubagentActivity[],
): readonly SubagentActivityRow[] {
  return activities.map((activity) => ({
    id: activity.toolId ?? activity.id,
    label: activity.label,
    detail: activity.resultText,
    status: activity.status === "running" ? "running" : "done",
    matchKey: activity.toolId ?? activity.label,
    metadata: activity.metadata,
    raw: activity.raw ?? activity,
  }))
}

class SubagentRunLedger {
  private readonly activitiesById = new Map<string, SubagentActivity>()
  private readonly order: string[] = []

  upsert(candidate: SubagentActivityCandidate): void {
    const activity = materializeCandidate(candidate)
    const existingId = this.findExistingId(activity)
    if (!existingId) {
      this.activitiesById.set(activity.id, activity)
      this.order.push(activity.id)
      return
    }
    const existing = this.activitiesById.get(existingId)
    if (!existing) return
    this.activitiesById.set(existingId, mergeActivities(existing, activity))
  }

  completeTool(
    toolId: string,
    status: Extract<SubagentActivityStatus, "done" | "failed" | "cancelled">,
    patch: {
      readonly completedAt: number
      readonly output?: unknown
      readonly resultText?: string
      readonly eventId: string
      readonly rawRefs: readonly ChatRawRef[]
    },
  ): void {
    const existingId = this.findByToolId(toolId)
    if (!existingId) return
    const existing = this.activitiesById.get(existingId)
    if (!existing) return
    this.activitiesById.set(existingId, {
      ...existing,
      status,
      completedAt: patch.completedAt,
      output: patch.output,
      resultText: patch.resultText ?? existing.resultText,
      eventIds: unique([...existing.eventIds, patch.eventId]),
      rawRefs: [...existing.rawRefs, ...patch.rawRefs],
    })
  }

  activities(): readonly SubagentActivity[] {
    return this.order.flatMap((id) => {
      const activity = this.activitiesById.get(id)
      return activity ? [activity] : []
    })
  }

  hasTerminalMatch(candidate: SubagentActivityCandidate): boolean {
    const activity = materializeCandidate(candidate)
    const existingId = this.findExistingId(activity)
    if (!existingId) return false
    const existing = this.activitiesById.get(existingId)
    return existing !== undefined && existing.status !== "running"
  }

  private findExistingId(activity: SubagentActivity): string | undefined {
    if (activity.toolId) {
      const byTool = this.findByToolId(activity.toolId)
      if (byTool) {
        const existing = this.activitiesById.get(byTool)
        if (existing && labelsCompatible(existing.label, activity.label)) return byTool
      }
    }
    const labelKey = meaningfulKey(activity.label)
    if (!labelKey) return this.activitiesById.has(activity.id) ? activity.id : undefined
    if (activity.toolId) {
      return this.activitiesById.has(activity.id) ? activity.id : undefined
    }
    let uniqueToolBackedLabelMatch: string | undefined
    let toolBackedLabelMatches = 0
    for (const id of this.order) {
      const existing = this.activitiesById.get(id)
      if (!existing) continue
      if (meaningfulKey(existing.label) !== labelKey) continue
      if (!existing.toolId) return id
      uniqueToolBackedLabelMatch = id
      toolBackedLabelMatches++
    }
    if (toolBackedLabelMatches === 1) return uniqueToolBackedLabelMatch
    return this.activitiesById.has(activity.id) ? activity.id : undefined
  }

  private findByToolId(toolId: string): string | undefined {
    for (const id of this.order) {
      const existing = this.activitiesById.get(id)
      if (existing?.toolId === toolId) return id
    }
    return undefined
  }
}

function materializeCandidate(candidate: SubagentActivityCandidate): SubagentActivity {
  return {
    ...candidate,
    eventIds: candidate.eventIds ?? [],
    rawRefs: candidate.rawRefs ?? [],
  }
}

function mergeActivities(existing: SubagentActivity, incoming: SubagentActivity): SubagentActivity {
  const terminalIncoming = incoming.status !== "running"
  const terminalExisting = existing.status !== "running"
  const status = terminalIncoming || !terminalExisting ? incoming.status : existing.status
  return {
    ...existing,
    label: preferLabel(existing.label, incoming.label),
    status,
    startedAt: Math.min(existing.startedAt, incoming.startedAt),
    completedAt: maxDefined(existing.completedAt, incoming.completedAt),
    toolId: existing.toolId ?? incoming.toolId,
    resultText: incoming.resultText ?? existing.resultText,
    output: incoming.output ?? existing.output,
    metadata: {
      ...existing.metadata,
      ...incoming.metadata,
    },
    eventIds: unique([...existing.eventIds, ...incoming.eventIds]),
    rawRefs: [...existing.rawRefs, ...incoming.rawRefs],
    raw: {
      kind: "subagent-activity-merged",
      existing: existing.raw ?? existing,
      incoming: incoming.raw ?? incoming,
    },
  }
}

function subagentActivityFromToolStarted(
  event: Extract<ChatEvent, { type: "tool.started" }>,
): SubagentActivityCandidate {
  const task = taskDetails(event.payload.name, event.payload.input)
  return {
    id: `tool:${event.payload.toolId}`,
    toolId: event.payload.toolId,
    label: task.label,
    status: "running",
    startedAt: event.ts,
    metadata: task.metadata,
    eventIds: [event.id],
    rawRefs: event.rawRefs,
    raw: {
      kind: "subagent-tool-started",
      event,
    },
  }
}

function subagentActivityFromNotification(
  entry: ChannelNotification,
  opts: { readonly currentStartedAt?: number; readonly sessionId?: string },
): SubagentActivityCandidate | null {
  if (entry.source !== "subagent" && entry.source !== "sub-agent") return null
  const timestamp = entry.ts ?? entry.timestamp ?? 0
  if (opts.currentStartedAt !== undefined && timestamp < opts.currentStartedAt) return null
  const fromSessionId = typeof entry.meta?.fromSessionId === "string" ? entry.meta.fromSessionId : undefined
  if (opts.sessionId && fromSessionId && fromSessionId !== opts.sessionId) return null
  const parsed = parseSubagentNotificationContent(entry.content)
  if (!parsed) return null
  const metaDescription = stringField(entry.meta?.description)
  const description = metaDescription ?? parsed.description
  if (!isMeaningfulSubagentDescription(description)) return null
  const toolUseId = stringField(entry.meta?.toolUseId)
  const status = notificationStatus(parsed.status)
  return {
    id: `notification:${entry.id}`,
    toolId: toolUseId,
    label: description,
    status,
    startedAt: timestamp,
    completedAt: status === "running" ? undefined : timestamp,
    resultText: parsed.resultText,
    eventIds: [entry.id],
    rawRefs: [{ id: entry.id, source: "local", label: "subagent notification", raw: entry }],
    raw: {
      kind: "subagent-notification",
      entry,
    },
  }
}

function taskDetails(
  fallbackLabel: string,
  input: unknown,
): { readonly label: string; readonly metadata?: SubagentActivity["metadata"] } {
  const obj = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {}
  const description = stringField(obj.description)
  const prompt = stringField(obj.prompt)
  const command = stringField(obj.command)
  const subagentType = stringField(obj.subagent_type) ?? stringField(obj.agent)
  const label = description ?? command ?? prompt ?? subagentType ?? fallbackLabel
  return {
    label,
    metadata: {
      ...(subagentType && subagentType !== description ? { subagentType } : {}),
      ...(prompt ? { prompt } : {}),
    },
  }
}

function parseSubagentNotificationContent(content: string): {
  readonly description: string
  readonly resultText?: string
  readonly status: string
} | null {
  const match = content.match(
    /^\[subagent\s+[^\]]+\]\s+(started|completed|failed|stopped|progress|in progress):\s*([\s\S]*)$/i,
  )
  if (!match) return null
  const status = (match[1] ?? "").toLowerCase()
  const body = cleanSubagentNotificationBody(match[2] ?? "")
  if (!body) return null
  const [description = "", resultText] = body.split(/\s+—\s+/, 2)
  const trimmedDescription = description.trim()
  return {
    description: trimmedDescription,
    resultText: resultText?.trim() || undefined,
    status,
  }
}

function notificationStatus(status: string): SubagentActivityStatus {
  switch (status) {
    case "completed":
      return "done"
    case "failed":
      return "failed"
    case "stopped":
      return "cancelled"
    default:
      return "running"
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

function latestUserMessageStartedAt(events: readonly { readonly value: ChatEvent }[]): number | undefined {
  let latest: number | undefined
  for (const { value: event } of events) {
    if (event.type === "message.started" && event.payload.role === "user") latest = event.ts
  }
  return latest
}

function orderWithIndex<T extends { readonly ts: number }>(
  values: readonly T[],
): readonly { value: T; index: number }[] {
  return values.map((value, index) => ({ value, index })).sort((a, b) => a.value.ts - b.value.ts || a.index - b.index)
}

function isSubagentToolName(name: string): boolean {
  return SUBAGENT_TOOL_NAMES.has(name)
}

function resultText(output: unknown): string | undefined {
  if (typeof output === "string") return output.trim() || undefined
  if (output === undefined || output === null) return undefined
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function isMeaningfulSubagentDescription(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase()
  return normalized.length > 0 && normalized !== "(no description)"
}

function meaningfulKey(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === "agent" || normalized === "task" || normalized === "general-purpose") return undefined
  if (normalized === "(no description)") return undefined
  return normalized
}

function labelsCompatible(a: string, b: string): boolean {
  const aKey = meaningfulKey(a)
  const bKey = meaningfulKey(b)
  if (!aKey || !bKey) return true
  return aKey === bKey
}

function preferLabel(existing: string, incoming: string): string {
  const existingKey = meaningfulKey(existing)
  const incomingKey = meaningfulKey(incoming)
  if (!existingKey && incomingKey) return incoming
  return existing
}

function maxDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.max(a, b)
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}
