import { readFileSync } from "node:fs"
import { parseAgentEvent, type AgentEvent } from "@km/agent-harness"
import { defaultChatTracks } from "./chat/store.ts"
import { agentEventIdFor, normalizeAgentEventsToChatEvents } from "./chat/normalize-agent-event.ts"
import { projectChatTree, visibleChatLeaves } from "./chat/project-transcript.ts"
import type { ChatEvent, ChatLeaf, ChatSessionId, ChatTrackState } from "./chat/types.ts"

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

export function readTrafficLogFile(path: string): AgentEvent[] {
  const text = readFileSync(path, "utf8")
  return text
    .split(/\r?\n/)
    .flatMap((line, index) => {
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
    const normalizedForRaw = normalizedEvents.filter((chatEvent) =>
      chatEvent.agentEventId === rawAgentEventId || chatEvent.rawRefs.some((ref) => String(ref.id) === rawAgentEventId),
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

export function replayTrafficLogFile(
  path: string,
  opts: { readonly sessionId?: string } = {},
): TrafficReplay {
  return replayTrafficLog(readTrafficLogFile(path), { sourcePath: path, sessionId: opts.sessionId })
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
