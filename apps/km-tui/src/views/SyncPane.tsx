/**
 * Sync Activity Pane
 *
 * Bottom panel showing per-file sync events with timestamps.
 * Toggleable with S keybinding. Shows a scrollable log of watcher
 * state transitions and sync operations.
 */
import React from "react"
import { Box, Text, Small } from "@silvery/ag-react"
import type { SyncEvent } from "../state/ui-reducer.ts"
import type { WatcherStatus } from "@km/fs-mount"

const PANE_HEIGHT = 6

interface SyncPaneProps {
  events: SyncEvent[]
  watcherStatus: WatcherStatus | null
  width: number
}

/** Format a timestamp as HH:MM:SS */
function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
}

/** Icon for sync event type */
function eventIcon(type: SyncEvent["type"]): string {
  switch (type) {
    case "sync-start":
      return "⟳"
    case "sync-complete":
      return "✓"
    case "error":
    case "write-error":
      return "✗"
    case "state-change":
      return "•"
    case "write-complete":
      return "✓"
  }
}

/** Color for sync event type */
function eventColor(type: SyncEvent["type"]): string | undefined {
  switch (type) {
    case "sync-complete":
    case "write-complete":
      return "$fg-success"
    case "error":
    case "write-error":
      return "$fg-error"
    case "sync-start":
      return "$fg-accent"
    default:
      return undefined
  }
}

export function SyncPane({ events, watcherStatus, width }: SyncPaneProps): React.ReactElement {
  // Show most recent events that fit in the pane (minus header line)
  const visibleCount = PANE_HEIGHT - 1
  const visibleEvents = events.slice(0, visibleCount)

  // Header: current state summary
  const stateLabel = watcherStatus ? `${watcherStatus.state} · ${watcherStatus.watchedPaths ?? 0} files` : "no watcher"

  return (
    <Box
      flexDirection="column"
      width={width}
      height={PANE_HEIGHT}
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      backgroundColor={"$bg-surface-default"}
      flexShrink={0}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold> Sync Activity</Text>
        <Small>{stateLabel} · S to close </Small>
      </Box>
      {visibleEvents.length === 0 ? (
        <Small> No sync events yet</Small>
      ) : (
        visibleEvents.map((ev, i) => (
          <Box key={i} flexDirection="row" overflow="hidden">
            <Small> {formatTime(ev.timestamp)} </Small>
            <Text color={eventColor(ev.type)}>{eventIcon(ev.type)} </Text>
            <Small wrap="truncate">{ev.message}</Small>
          </Box>
        ))
      )}
    </Box>
  )
}

/** One-line summary shown in bottom bar when sync pane is hidden */
export function SyncPaneSummary({ events }: { events: SyncEvent[] }): React.ReactElement | null {
  if (events.length === 0) return null
  const last = events[0]
  if (!last) return null
  const errorCount = events.filter((e) => e.type === "error" || e.type === "write-error").length
  if (errorCount > 0) {
    return (
      <Text color={"$fg-warning"}>
        {" "}
        ⚠{errorCount} sync error{errorCount !== 1 ? "s" : ""}
      </Text>
    )
  }
  return (
    <Small>
      {" "}
      {eventIcon(last.type)} {last.message}
    </Small>
  )
}
