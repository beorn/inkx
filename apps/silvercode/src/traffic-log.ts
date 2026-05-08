import { readFileSync } from "node:fs"
import { parseAgentEvent, type AgentEvent } from "@km/agent-harness"
import { defaultChatTracks } from "./chat/store.ts"
import { agentEventIdFor, normalizeAgentEventsToChatEvents } from "./chat/normalize-agent-event.ts"
import { projectChatTree, visibleChatLeaves } from "./chat/project-transcript.ts"
import type { ChatEvent, ChatLeaf, ChatSessionId, ChatTrackId, ChatTrackState } from "./chat/types.ts"

export type TrafficRawEvent = {
  readonly index: number
  readonly kind: AgentEvent["kind"]
  readonly ts: number
  readonly event: AgentEvent
}

export type TrafficProjectedLeaf = {
  readonly id: string
  readonly type: ChatLeaf["type"]
  readonly track: ChatLeaf["track"]
  readonly eventIds: readonly string[]
  readonly rawRefLabels: readonly string[]
  readonly props: ChatLeaf["props"]
}

export type TrafficReplayFrame = {
  readonly rawIndex: number
  readonly rawKind: AgentEvent["kind"]
  readonly rawTs: number
  readonly normalizedEventIds: readonly string[]
  readonly projectedLeafIds: readonly string[]
}

export type TrafficReplay = {
  readonly sourcePath?: string
  readonly sessionId: string
  readonly rawEvents: readonly TrafficRawEvent[]
  readonly normalizedEvents: readonly ChatEvent[]
  readonly projectedLeaves: readonly TrafficProjectedLeaf[]
  readonly frames: readonly TrafficReplayFrame[]
}

export type TrafficReplaySelector = {
  readonly rawFrom?: number
  readonly rawTo?: number
  readonly kind?: AgentEvent["kind"]
  readonly sessionId?: string
  readonly turnId?: string
  readonly track?: ChatTrackId
  readonly leafType?: ChatLeaf["type"]
  readonly toolId?: string
  readonly permissionId?: string
  readonly planStepId?: string
  readonly jobId?: string
  readonly subagentId?: string
}

export type TrafficReplaySpan = {
  readonly replay: TrafficReplay
  readonly selector: TrafficReplaySelector
  readonly rawEvents: readonly TrafficRawEvent[]
  readonly normalizedEvents: readonly ChatEvent[]
  readonly projectedLeaves: readonly TrafficProjectedLeaf[]
  readonly frames: readonly TrafficReplayFrame[]
}

export function readTrafficLogFile(path: string): AgentEvent[] {
  const text = readFileSync(path, "utf8")
  return text.split(/\r?\n/).flatMap((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return []
    try {
      return [parseAgentEvent(JSON.parse(trimmed))]
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`traffic log ${path}:${index + 1}: ${message}`)
    }
  })
}

export function replayTrafficLog(
  rawEvents: readonly AgentEvent[],
  opts: { readonly sourcePath?: string; readonly sessionId?: string } = {},
): TrafficReplay {
  const sessionId = (opts.sessionId ?? inferSessionId(rawEvents)) as ChatSessionId
  const normalizedEvents = normalizeAgentEventsToChatEvents(rawEvents, { sessionId })
  const tracks = allTracksVisible()
  const tree = projectChatTree({ sessionId, events: normalizedEvents })
  const leaves = visibleChatLeaves(tree, tracks)
  const projectedLeaves = leaves.map(projectLeaf)
  const frames = rawEvents.map((event, index) => {
    const rawAgentEventId = String(agentEventIdFor(event))
    const normalizedForRaw = normalizedEvents.filter(
      (chatEvent) =>
        chatEvent.agentEventId === rawAgentEventId ||
        chatEvent.rawRefs.some((ref) => String(ref.id) === rawAgentEventId),
    )
    const normalizedIds = new Set(normalizedForRaw.map((chatEvent) => String(chatEvent.id)))
    return {
      rawIndex: index,
      rawKind: event.kind,
      rawTs: event.ts,
      normalizedEventIds: [...normalizedIds],
      projectedLeafIds: projectedLeaves
        .filter((leaf) => leaf.eventIds.some((eventId) => normalizedIds.has(eventId)))
        .map((leaf) => leaf.id),
    }
  })

  return {
    sourcePath: opts.sourcePath,
    sessionId,
    rawEvents: rawEvents.map((event, index) => ({ index, kind: event.kind, ts: event.ts, event })),
    normalizedEvents,
    projectedLeaves,
    frames,
  }
}

export function replayTrafficLogFile(path: string, opts: { readonly sessionId?: string } = {}): TrafficReplay {
  return replayTrafficLog(readTrafficLogFile(path), { sourcePath: path, sessionId: opts.sessionId })
}

export function selectTrafficReplaySpan(
  replay: TrafficReplay,
  selector: TrafficReplaySelector = {},
): TrafficReplaySpan {
  const normalizedById = new Map(replay.normalizedEvents.map((event) => [String(event.id), event]))
  const leafById = new Map(replay.projectedLeaves.map((leaf) => [leaf.id, leaf]))

  const frames = replay.frames.filter((frame) => {
    const raw = replay.rawEvents[frame.rawIndex]
    if (!raw) return false
    if (selector.rawFrom !== undefined && frame.rawIndex < selector.rawFrom) return false
    if (selector.rawTo !== undefined && frame.rawIndex > selector.rawTo) return false
    if (selector.kind !== undefined && raw.kind !== selector.kind) return false
    if (
      selector.sessionId !== undefined &&
      !rawOrProjectionMatches(frame, raw, normalizedById, leafById, ["sessionId"], selector.sessionId)
    ) {
      return false
    }
    if (
      selector.turnId !== undefined &&
      !rawOrProjectionMatches(frame, raw, normalizedById, leafById, ["turnId", "providerTurnId"], selector.turnId)
    ) {
      return false
    }
    if (
      selector.toolId !== undefined &&
      !rawOrProjectionMatches(
        frame,
        raw,
        normalizedById,
        leafById,
        ["id", "toolId", "toolUseId", "toolCallId", "tool_use_id"],
        selector.toolId,
      )
    ) {
      return false
    }
    if (
      selector.permissionId !== undefined &&
      !rawOrProjectionMatches(
        frame,
        raw,
        normalizedById,
        leafById,
        ["requestId", "permissionId"],
        selector.permissionId,
      )
    ) {
      return false
    }
    if (
      selector.planStepId !== undefined &&
      !rawOrProjectionMatches(
        frame,
        raw,
        normalizedById,
        leafById,
        ["id", "providerEntryId", "planStepId", "stepId"],
        selector.planStepId,
      )
    ) {
      return false
    }
    if (
      selector.jobId !== undefined &&
      !rawOrProjectionMatches(frame, raw, normalizedById, leafById, ["jobId", "backgroundJobId"], selector.jobId)
    ) {
      return false
    }
    if (
      selector.subagentId !== undefined &&
      !rawOrProjectionMatches(
        frame,
        raw,
        normalizedById,
        leafById,
        ["subagentId", "subagentRunId", "subagentSessionId", "childSessionId"],
        selector.subagentId,
      )
    ) {
      return false
    }
    if (selector.track !== undefined && !frameMatchesTrack(frame, normalizedById, leafById, selector.track)) {
      return false
    }
    if (
      selector.leafType !== undefined &&
      !frame.projectedLeafIds.some((id) => leafById.get(id)?.type === selector.leafType)
    ) {
      return false
    }
    return true
  })

  const normalizedIds = new Set(frames.flatMap((frame) => frame.normalizedEventIds))
  const leafIds = new Set(frames.flatMap((frame) => frame.projectedLeafIds))

  return {
    replay,
    selector,
    rawEvents: frames.flatMap((frame) => replay.rawEvents[frame.rawIndex] ?? []),
    normalizedEvents: replay.normalizedEvents.filter((event) => normalizedIds.has(String(event.id))),
    projectedLeaves: replay.projectedLeaves.filter((leaf) => leafIds.has(leaf.id)),
    frames,
  }
}

export function exportTrafficReplaySpanJsonl(span: TrafficReplaySpan): string {
  if (span.rawEvents.length === 0) return ""
  return `${span.rawEvents.map((raw) => JSON.stringify(raw.event)).join("\n")}\n`
}

export function renderTrafficReplaySummary(replay: TrafficReplay): string {
  const lines = [
    `traffic replay ${replay.sourcePath ?? "(memory)"}`,
    `session ${replay.sessionId}`,
    `raw events ${replay.rawEvents.length}`,
    `normalized events ${replay.normalizedEvents.length}`,
    `projected leaves ${replay.projectedLeaves.length}`,
    "",
  ]
  for (const frame of replay.frames) {
    lines.push(
      `${frame.rawIndex.toString().padStart(4, " ")} ${frame.rawKind} -> ` +
        `${frame.normalizedEventIds.length} events, ${frame.projectedLeafIds.length} leaves`,
    )
  }
  return `${lines.join("\n")}\n`
}

export function renderTrafficReplayInspector(replay: TrafficReplay, selector: TrafficReplaySelector = {}): string {
  const span = selectTrafficReplaySpan(replay, selector)
  const normalizedById = new Map(replay.normalizedEvents.map((event) => [String(event.id), event]))
  const leafById = new Map(replay.projectedLeaves.map((leaf) => [leaf.id, leaf]))
  const lines = [
    `traffic viewer ${replay.sourcePath ?? "(memory)"}`,
    `session ${replay.sessionId}`,
    `selector ${selectorSummary(selector)}`,
    `selected raw events ${span.rawEvents.length}/${replay.rawEvents.length}`,
    `selected normalized events ${span.normalizedEvents.length}/${replay.normalizedEvents.length}`,
    `selected projected leaves ${span.projectedLeaves.length}/${replay.projectedLeaves.length}`,
    "",
    "frames",
  ]

  for (const frame of span.frames) {
    const eventTypes = frame.normalizedEventIds.flatMap((id) => {
      const event = normalizedById.get(id)
      return event ? [event.type] : []
    })
    const leaves = frame.projectedLeafIds.flatMap((id) => {
      const leaf = leafById.get(id)
      return leaf ? [`${leaf.id}(${leaf.type}/${leaf.track})`] : []
    })
    lines.push(
      `${frame.rawIndex.toString().padStart(4, " ")} ${frame.rawKind} ts=${frame.rawTs} -> ` +
        `${eventTypes.join(",") || "-"} -> ${leaves.join(",") || "-"}`,
    )
  }

  if (span.projectedLeaves.length > 0) {
    lines.push("", "leaves")
    for (const leaf of span.projectedLeaves) {
      lines.push(`- ${leaf.id} ${leaf.type}/${leaf.track} ${compactJson(leaf.props)}`)
    }
  }

  return `${lines.join("\n")}\n`
}

function inferSessionId(events: readonly AgentEvent[]): string {
  for (const event of events) {
    if ("sessionId" in event && typeof event.sessionId === "string") return event.sessionId
  }
  return "traffic-replay"
}

function allTracksVisible(): Record<string, ChatTrackState> {
  const tracks = defaultChatTracks()
  const out: Record<string, ChatTrackState> = {}
  for (const [trackId, track] of Object.entries(tracks)) {
    out[trackId] = { ...track, visible: true, muted: false }
  }
  return out
}

function projectLeaf(leaf: ChatLeaf): TrafficProjectedLeaf {
  return {
    id: String(leaf.id),
    type: leaf.type,
    track: leaf.track,
    eventIds: leaf.eventIds.map(String),
    rawRefLabels: leaf.rawRefs.flatMap((ref) => (ref.label ? [ref.label] : [])),
    props: leaf.props,
  }
}

function frameMatchesTrack(
  frame: TrafficReplayFrame,
  normalizedById: ReadonlyMap<string, ChatEvent>,
  leafById: ReadonlyMap<string, TrafficProjectedLeaf>,
  track: ChatTrackId,
): boolean {
  return (
    frame.normalizedEventIds.some((id) => normalizedById.get(id)?.track === track) ||
    frame.projectedLeafIds.some((id) => leafById.get(id)?.track === track)
  )
}

function rawOrProjectionMatches(
  frame: TrafficReplayFrame,
  raw: TrafficRawEvent,
  normalizedById: ReadonlyMap<string, ChatEvent>,
  leafById: ReadonlyMap<string, TrafficProjectedLeaf>,
  fieldNames: readonly string[],
  expected: string,
): boolean {
  if (objectContainsFieldValue(raw.event, fieldNames, expected)) return true
  for (const id of frame.normalizedEventIds) {
    const event = normalizedById.get(id)
    if (event && objectContainsFieldValue(event, fieldNames, expected)) return true
  }
  for (const id of frame.projectedLeafIds) {
    const leaf = leafById.get(id)
    if (leaf && objectContainsFieldValue(leaf, fieldNames, expected)) return true
  }
  return false
}

function objectContainsFieldValue(value: unknown, fieldNames: readonly string[], expected: string): boolean {
  if (!value || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some((item) => objectContainsFieldValue(item, fieldNames, expected))
  for (const [key, field] of Object.entries(value)) {
    if (fieldNames.includes(key) && String(field) === expected) return true
    if (field && typeof field === "object" && objectContainsFieldValue(field, fieldNames, expected)) return true
  }
  return false
}

function selectorSummary(selector: TrafficReplaySelector): string {
  const parts: string[] = []
  if (selector.rawFrom !== undefined || selector.rawTo !== undefined) {
    parts.push(`raw=${selector.rawFrom ?? "start"}..${selector.rawTo ?? "end"}`)
  }
  if (selector.kind) parts.push(`kind=${selector.kind}`)
  if (selector.sessionId) parts.push(`session=${selector.sessionId}`)
  if (selector.turnId) parts.push(`turn=${selector.turnId}`)
  if (selector.track) parts.push(`track=${selector.track}`)
  if (selector.leafType) parts.push(`leaf=${selector.leafType}`)
  if (selector.toolId) parts.push(`tool=${selector.toolId}`)
  if (selector.permissionId) parts.push(`permission=${selector.permissionId}`)
  if (selector.planStepId) parts.push(`plan-step=${selector.planStepId}`)
  if (selector.jobId) parts.push(`job=${selector.jobId}`)
  if (selector.subagentId) parts.push(`subagent=${selector.subagentId}`)
  return parts.length > 0 ? parts.join(" ") : "all"
}

function compactJson(value: unknown): string {
  const text = JSON.stringify(value)
  if (text === undefined) return ""
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}
