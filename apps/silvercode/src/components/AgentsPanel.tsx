import React from "react"
import type { MessageEntry } from "@km/agent-harness"
import { Box, Muted, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"

/**
 * List of sub-agents the focused session has spawned via Claude's Task tool.
 *
 * Task tool_use events carry a `{ description, subagent_type, prompt }`
 * payload; each becomes a row. A matching tool-result means the sub-agent
 * finished (we don't parse the result body — the ToolCallBlock already
 * renders it). Without a result yet, the agent is in-flight.
 */

type AgentRow = {
  id: string
  description: string
  subagentType: string
  running: boolean
}

function scanAgents(messages: MessageEntry[]): AgentRow[] {
  const rows: AgentRow[] = []
  for (const m of messages) {
    for (const c of m.toolCalls) {
      if (c.name !== "Task" && c.name !== "Agent") continue
      const input = (c.input as Record<string, unknown> | undefined) ?? {}
      const description = typeof input.description === "string" ? (input.description as string) : "(no description)"
      const subagentType = typeof input.subagent_type === "string" ? (input.subagent_type as string) : "general-purpose"
      const running = !m.toolResults.some((r) => r.id === c.id)
      rows.push({ id: c.id, description, subagentType, running })
    }
  }
  return rows
}

export function AgentsPanel({ handle }: { handle: SessionHandle }): React.ReactElement {
  const state = useStoreSignal(handle.store)
  const rows = scanAgents(state.messages)
  const running = rows.filter((r) => r.running).length
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text bold color="$accent">
          Agents
        </Text>
        <Muted>
          ({running} running / {rows.length} total)
        </Muted>
      </Box>
      {rows.length === 0 ? (
        <Muted>No sub-agents spawned. Claude uses the Task tool to delegate research / parallel work.</Muted>
      ) : (
        rows.map((r) => (
          <Box key={r.id} flexDirection="row" gap={1}>
            <Text color={r.running ? "$accent" : "$success"}>{r.running ? "▸" : "✓"}</Text>
            <Box flexDirection="column" flexGrow={1}>
              <Text color={r.running ? undefined : "$muted"}>{r.description}</Text>
              <Muted>({r.subagentType})</Muted>
            </Box>
          </Box>
        ))
      )}
    </Box>
  )
}
