/**
 * BackgroundPane — list of in-flight + recently completed background tasks
 * for one session.
 *
 * Rendered as a pop-over sibling of the SidePanel "Background N/M" row.
 * Each row shows the task's status, elapsed time, snippet, and offers a
 * cancel/foreground action when relevant. The pane is read-only when the
 * user is just hovering; clicks fire the controller methods.
 *
 * Design rule: this component does NOT own state — everything flows from
 * `controller.backgroundTasks(sessionId)` via `useBackgroundTasks`. The
 * component re-renders on every onBackgroundTasksChange tick.
 */

import React from "react"
import { Box, Muted, Small, Text } from "silvery"
import type { BackgroundTask } from "../controller.ts"

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`
  return `${Math.round(ms / 3600_000)}h`
}

function statusColor(status: BackgroundTask["status"]): string {
  switch (status) {
    case "running":
      return "$warning"
    case "completed":
      return "$success"
    case "cancelled":
      return "$muted"
    case "failed":
      return "$error"
  }
}

function statusLabel(status: BackgroundTask["status"]): string {
  switch (status) {
    case "running":
      return "running"
    case "completed":
      return "done"
    case "cancelled":
      return "cancelled"
    case "failed":
      return "failed"
  }
}

export function BackgroundPane({
  tasks,
  onCancel,
  onForeground,
}: {
  tasks: ReadonlyArray<BackgroundTask>
  onCancel: (taskId: string) => void
  onForeground: (taskId: string) => void
}): React.ReactElement {
  if (tasks.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Muted>No background tasks.</Muted>
      </Box>
    )
  }
  const now = Date.now()
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
      <Text bold>Background tasks</Text>
      <Muted>Backgrounded turns keep streaming; results land in the conversation.</Muted>
      <Box flexDirection="column">
        {tasks.map((t) => {
          const endedAt = t.completedAt ?? now
          const elapsed = formatElapsed(endedAt - t.startedAt)
          return (
            <Box key={t.id} flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Text color={statusColor(t.status)}>{statusLabel(t.status)}</Text>
                <Small color="$muted">· {elapsed}</Small>
              </Box>
              <Box flexDirection="row" paddingLeft={2}>
                <Text>{t.snippet}</Text>
              </Box>
              <Box flexDirection="row" gap={1} paddingLeft={2}>
                {t.status === "running" && (
                  <Box onClick={() => onCancel(t.id)}>
                    <Small color="$error">[cancel]</Small>
                  </Box>
                )}
                <Box onClick={() => onForeground(t.id)}>
                  <Small color="$muted">[foreground]</Small>
                </Box>
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
