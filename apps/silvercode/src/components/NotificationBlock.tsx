import React from "react"
import { Box, Muted, Text, useHover } from "silvery"
import type { MessageEntry } from "@km/agent-harness"
import type { BackgroundTask } from "../controller.ts"
import { Content } from "./Content.tsx"
import { BackgroundPane } from "./BackgroundPane.tsx"

export type NotificationBlockCounts = {
  agentsRunning: number
  backgroundTasksRunning: number
  shellsRunning: number
}

export type NotificationBlockWorkDetail = {
  id: string
  label: string
  detail?: string
}

export type NotificationBlockSnapshot = {
  counts: NotificationBlockCounts
  agents: readonly NotificationBlockWorkDetail[]
  shells: readonly NotificationBlockWorkDetail[]
}

type NotificationBlockDetail = "agents" | "background" | "shells"

export function notificationBlockSnapshotFromMessages(
  messages: readonly MessageEntry[],
  backgroundTasks: readonly BackgroundTask[],
): NotificationBlockSnapshot {
  const agents: NotificationBlockWorkDetail[] = []
  const shells: NotificationBlockWorkDetail[] = []
  for (const message of messages) {
    for (const call of message.toolCalls) {
      const hasResult = message.toolResults.some((result) => result.id === call.id)
      if (hasResult) continue
      if (call.name === "Task" || call.name === "Agent") agents.push(toolDetail(call.id, call.name, call.input))
      if (call.name === "Bash" && isBackgroundShellInput(call.input)) shells.push(toolDetail(call.id, "Bash", call.input))
    }
  }
  return {
    counts: {
      agentsRunning: agents.length,
      backgroundTasksRunning: backgroundTasks.filter((task) => task.status === "running").length,
      shellsRunning: shells.length,
    },
    agents,
    shells,
  }
}

export function notificationBlockCountsFromMessages(
  messages: readonly MessageEntry[],
  backgroundTasks: readonly BackgroundTask[],
): NotificationBlockCounts {
  return notificationBlockSnapshotFromMessages(messages, backgroundTasks).counts
}

function isBackgroundShellInput(input: unknown): boolean {
  return typeof input === "object" && input !== null && (input as Record<string, unknown>).run_in_background === true
}

function toolDetail(id: string, fallbackLabel: string, input: unknown): NotificationBlockWorkDetail {
  const obj = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {}
  const description = stringField(obj.description) ?? stringField(obj.subagent_type)
  const command = stringField(obj.command)
  return {
    id,
    label: description ?? command ?? fallbackLabel,
    detail: command && command !== description ? command : undefined,
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralLabel}`
}

function summaryParts(counts: NotificationBlockCounts): Array<{ detail: NotificationBlockDetail; text: string }> {
  const parts: Array<{ detail: NotificationBlockDetail; text: string }> = []
  if (counts.agentsRunning > 0) parts.push({ detail: "agents", text: `◇ ${plural(counts.agentsRunning, "agent")}` })
  if (counts.backgroundTasksRunning > 0)
    parts.push({ detail: "background", text: `▣ ${counts.backgroundTasksRunning} bg` })
  if (counts.shellsRunning > 0) parts.push({ detail: "shells", text: `$ ${plural(counts.shellsRunning, "shell")}` })
  return parts
}

function DetailBody({
  detail,
  counts,
  agents,
  shells,
  backgroundTasks,
  onCancelBackgroundTask,
  onForegroundBackgroundTask,
}: {
  detail: NotificationBlockDetail
  counts: NotificationBlockCounts
  agents: readonly NotificationBlockWorkDetail[]
  shells: readonly NotificationBlockWorkDetail[]
  backgroundTasks: readonly BackgroundTask[]
  onCancelBackgroundTask?: (taskId: string) => void
  onForegroundBackgroundTask?: (taskId: string) => void
}): React.ReactElement {
  if (detail === "background") {
    return (
      <BackgroundPane
        tasks={backgroundTasks}
        onCancel={(id) => onCancelBackgroundTask?.(id)}
        onForeground={(id) => onForegroundBackgroundTask?.(id)}
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
  backgroundTasks,
  onCancelBackgroundTask,
  onForegroundBackgroundTask,
}: {
  counts: NotificationBlockCounts
  agents?: readonly NotificationBlockWorkDetail[]
  shells?: readonly NotificationBlockWorkDetail[]
  backgroundTasks: readonly BackgroundTask[]
  onCancelBackgroundTask?: (taskId: string) => void
  onForegroundBackgroundTask?: (taskId: string) => void
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
                backgroundTasks={backgroundTasks}
                onCancelBackgroundTask={onCancelBackgroundTask}
                onForegroundBackgroundTask={onForegroundBackgroundTask}
              />
            </Box>
          ) : null}
        </Box>
      </Content.Body>
    </Content.Row>
  )
}
