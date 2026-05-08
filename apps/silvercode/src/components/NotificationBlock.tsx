import React from "react"
import { Box, Muted, Text, useHover } from "silvery"
import type { BackgroundJob } from "../controller.ts"
import type { BackgroundShellActivity, ChatActivityCounts, SubagentActivityRow } from "../chat/activity-snapshot.ts"
import { Content } from "./Content.tsx"
import { BackgroundJobsPane } from "./BackgroundJobsPane.tsx"

type NotificationBlockDetail = "agents" | "background" | "shells"

function plural(count: number, singular: string, pluralLabel = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralLabel}`
}

function summaryParts(counts: ChatActivityCounts): Array<{ detail: NotificationBlockDetail; text: string }> {
  const parts: Array<{ detail: NotificationBlockDetail; text: string }> = []
  if (counts.agentsRunning > 0) parts.push({ detail: "agents", text: `◇ ${plural(counts.agentsRunning, "agent")}` })
  if (counts.backgroundJobsRunning > 0) {
    parts.push({ detail: "background", text: `▣ ${counts.backgroundJobsRunning} bg` })
  }
  if (counts.shellsRunning > 0) parts.push({ detail: "shells", text: `$ ${plural(counts.shellsRunning, "shell")}` })
  return parts
}

function DetailBody({
  detail,
  counts,
  agents,
  shells,
  backgroundJobs,
  onCancelBackgroundJob,
  onShowBackgroundJob,
}: {
  detail: NotificationBlockDetail
  counts: ChatActivityCounts
  agents: readonly SubagentActivityRow[]
  shells: readonly BackgroundShellActivity[]
  backgroundJobs: readonly BackgroundJob[]
  onCancelBackgroundJob?: (jobId: string) => void
  onShowBackgroundJob?: (jobId: string) => void
}): React.ReactElement {
  if (detail === "background") {
    return (
      <BackgroundJobsPane
        jobs={backgroundJobs}
        onCancel={(id) => onCancelBackgroundJob?.(id)}
        onShow={(id) => onShowBackgroundJob?.(id)}
      />
    )
  }
  if (detail === "agents") {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text bold>Agents</Text>
        {agents.length > 0 ? (
          agents.map((agent) => (
            <Box key={agent.id} flexDirection="column" minWidth={0}>
              <Text wrap="wrap">{agent.label}</Text>
              {agent.detail ? (
                <Muted>
                  <Text wrap="wrap">{agent.detail}</Text>
                </Muted>
              ) : null}
            </Box>
          ))
        ) : (
          <Muted>{plural(counts.agentsRunning, "sub-agent")} running from Task/Agent tool calls.</Muted>
        )}
      </Box>
    )
  }
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text bold>Shells</Text>
      {shells.length > 0 ? (
        shells.map((shell) => (
          <Box key={shell.id} flexDirection="column" minWidth={0}>
            <Text wrap="wrap">{shell.label}</Text>
            {shell.detail ? (
              <Muted>
                <Text wrap="wrap">{shell.detail}</Text>
              </Muted>
            ) : null}
          </Box>
        ))
      ) : (
        <Muted>{plural(counts.shellsRunning, "background shell")} running from Bash run_in_background calls.</Muted>
      )}
    </Box>
  )
}

function NotificationChip({
  text,
  selected,
  onClick,
}: {
  text: string
  selected: boolean
  onClick: () => void
}): React.ReactElement {
  const hover = useHover()
  return (
    <Box
      flexDirection="row"
      onClick={onClick}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
      backgroundColor={hover.isHovered || selected ? "$bg-surface-hover" : undefined}
    >
      <Text color={selected ? "$fg" : "$muted"}>{text}</Text>
    </Box>
  )
}

export function NotificationBlock({
  counts,
  agents = [],
  shells = [],
  backgroundJobs,
  onCancelBackgroundJob,
  onShowBackgroundJob,
}: {
  counts: ChatActivityCounts
  agents?: readonly SubagentActivityRow[]
  shells?: readonly BackgroundShellActivity[]
  backgroundJobs: readonly BackgroundJob[]
  onCancelBackgroundJob?: (jobId: string) => void
  onShowBackgroundJob?: (jobId: string) => void
}): React.ReactElement | null {
  const parts = summaryParts(counts)
  const [expanded, setExpanded] = React.useState<NotificationBlockDetail | null>(null)
  React.useEffect(() => {
    if (expanded && !parts.some((part) => part.detail === expanded)) setExpanded(null)
  }, [expanded, parts])
  if (parts.length === 0) return null

  return (
    <Content.Row>
      <Content.Body width="prose">
        <Box flexDirection="column" minWidth={0}>
          <Box flexDirection="row" minWidth={0}>
            {parts.map((part, index) => (
              <React.Fragment key={part.detail}>
                {index > 0 ? <Text color="$muted"> · </Text> : null}
                <NotificationChip
                  text={part.text}
                  selected={expanded === part.detail}
                  onClick={() => setExpanded((current) => (current === part.detail ? null : part.detail))}
                />
              </React.Fragment>
            ))}
          </Box>
          {expanded ? (
            <Box flexDirection="column" paddingLeft={1} minWidth={0}>
              <DetailBody
                detail={expanded}
                counts={counts}
                agents={agents}
                shells={shells}
                backgroundJobs={backgroundJobs}
                onCancelBackgroundJob={onCancelBackgroundJob}
                onShowBackgroundJob={onShowBackgroundJob}
              />
            </Box>
          ) : null}
        </Box>
      </Content.Body>
    </Content.Row>
  )
}
