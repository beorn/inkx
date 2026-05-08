/**
 * BackgroundJobsPane — list of in-flight + recently completed background jobs
 * for one session.
 *
 * Rendered as a pop-over sibling of the SidePanel "Background N/M" row.
 * Each row shows the job's status, elapsed time, snippet, and offers a
 * cancel/show action when relevant. The pane is read-only when the
 * user is just hovering; clicks fire the controller methods.
 *
 * Design rule: this component does NOT own state — everything flows from
 * `controller.backgroundJobs(sessionId)` via `useBackgroundJobs`. The
 * component re-renders on every onBackgroundJobsChange tick.
 */

import React from "react"
import { Box, Muted, Small, Text } from "silvery"
import type { BackgroundJob } from "../controller.ts"

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`
  return `${Math.round(ms / 3600_000)}h`
}

function statusColor(status: BackgroundJob["status"]): string {
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

function statusLabel(status: BackgroundJob["status"]): string {
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

export function BackgroundJobsPane({
  jobs,
  onCancel,
  onShow,
}: {
  jobs: ReadonlyArray<BackgroundJob>
  onCancel: (jobId: string) => void
  onShow: (jobId: string) => void
}): React.ReactElement {
  if (jobs.length === 0) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Muted>No background jobs.</Muted>
      </Box>
    )
  }
  const now = Date.now()
  return (
    <Box flexDirection="column" paddingY={1} gap={1}>
      <Text bold>Background jobs</Text>
      <Muted>Background jobs keep streaming; results land in the conversation.</Muted>
      <Box flexDirection="column">
        {jobs.map((job) => {
          const endedAt = job.completedAt ?? now
          const elapsed = formatElapsed(endedAt - job.startedAt)
          return (
            <Box key={job.id} flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Text color={statusColor(job.status)}>{statusLabel(job.status)}</Text>
                <Small color="$muted">· {elapsed}</Small>
              </Box>
              <Box flexDirection="row">
                <Text>{job.snippet}</Text>
              </Box>
              <Box flexDirection="row" gap={1}>
                {job.status === "running" && (
                  <Box onClick={() => onCancel(job.id)}>
                    <Small color="$error">[cancel]</Small>
                  </Box>
                )}
                <Box onClick={() => onShow(job.id)}>
                  <Small color="$muted">[show]</Small>
                </Box>
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
