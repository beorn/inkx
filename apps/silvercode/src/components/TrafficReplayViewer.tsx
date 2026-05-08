import React from "react"
import { Box, Text, useApp, useInput } from "silvery"
import {
  selectTrafficReplaySpan,
  type TrafficReplay,
  type TrafficReplayFrame,
  type TrafficReplaySelector,
} from "../traffic-log.ts"

export type TrafficReplayViewerProps = {
  readonly replay: TrafficReplay
  readonly selector?: TrafficReplaySelector
}

export function TrafficReplayViewer({ replay, selector = {} }: TrafficReplayViewerProps): React.ReactElement {
  const span = React.useMemo(() => selectTrafficReplaySpan(replay, selector), [replay, selector])
  const [cursor, setCursor] = React.useState(0)
  const app = useApp()
  const selected = span.frames[Math.min(cursor, Math.max(0, span.frames.length - 1))]

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      app.exit()
      return
    }
    if (key.upArrow || input === "k") setCursor((value) => Math.max(0, value - 1))
    if (key.downArrow || input === "j") setCursor((value) => Math.min(Math.max(0, span.frames.length - 1), value + 1))
  })

  return (
    <Box flexDirection="column" width="100%" height="100%" minWidth={0} minHeight={0}>
      <Box flexDirection="column" paddingX={1} paddingY={1} backgroundColor="$bg-surface-raised">
        <Text bold>traffic viewer</Text>
        <Text color="$muted">
          {replay.sourcePath ?? "(memory)"} · session {replay.sessionId}
        </Text>
        <Text color="$muted">
          raw {span.rawEvents.length}/{replay.rawEvents.length} · normalized {span.normalizedEvents.length}/
          {replay.normalizedEvents.length} · leaves {span.projectedLeaves.length}/{replay.projectedLeaves.length}
        </Text>
      </Box>
      <Box flexDirection="row" flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
        <Box flexDirection="column" width={42} flexShrink={0} paddingX={1} paddingY={1} minHeight={0}>
          <Text bold>Frames</Text>
          {span.frames.length === 0 ? (
            <Text color="$muted">No matching frames</Text>
          ) : (
            span.frames.map((frame, index) => (
              <FrameRow key={`${frame.rawIndex}:${frame.rawKind}`} frame={frame} selected={index === cursor} />
            ))
          )}
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} paddingX={1} paddingY={1}>
          <Text bold>Provenance</Text>
          {selected ? (
            <FrameDetails replay={replay} frame={selected} />
          ) : (
            <Text color="$muted">Select a frame to inspect raw, normalized, and projected ids.</Text>
          )}
        </Box>
      </Box>
    </Box>
  )
}

function FrameRow({ frame, selected }: { frame: TrafficReplayFrame; selected: boolean }): React.ReactElement {
  return (
    <Text color={selected ? "$accent" : undefined} wrap="truncate">
      {selected ? ">" : " "} {String(frame.rawIndex).padStart(3, " ")} {frame.rawKind}
    </Text>
  )
}

function FrameDetails({ replay, frame }: { replay: TrafficReplay; frame: TrafficReplayFrame }): React.ReactElement {
  const raw = replay.rawEvents[frame.rawIndex]
  const normalized = replay.normalizedEvents.filter((event) => frame.normalizedEventIds.includes(String(event.id)))
  const leaves = replay.projectedLeaves.filter((leaf) => frame.projectedLeafIds.includes(leaf.id))

  return (
    <Box flexDirection="column" minWidth={0}>
      <Text>raw #{frame.rawIndex}</Text>
      <Text color="$muted" wrap="wrap">
        {raw ? compactJson(raw.event) : "(missing raw event)"}
      </Text>
      <Text>normalized</Text>
      {normalized.length === 0 ? (
        <Text color="$muted">none</Text>
      ) : (
        normalized.map((event) => (
          <Text key={String(event.id)} color="$muted" wrap="wrap">
            {event.type} · {String(event.id)}
          </Text>
        ))
      )}
      <Text>projected leaves</Text>
      {leaves.length === 0 ? (
        <Text color="$muted">none</Text>
      ) : (
        leaves.map((leaf) => (
          <Text key={leaf.id} color="$muted" wrap="wrap">
            {leaf.type}/{leaf.track} · {leaf.id}
          </Text>
        ))
      )}
    </Box>
  )
}

function compactJson(value: unknown): string {
  const text = JSON.stringify(value)
  if (text === undefined) return ""
  return text.length > 220 ? `${text.slice(0, 217)}...` : text
}
