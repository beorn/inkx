import React from "react"
import { Box, Text } from "silvery"
import { useSignal } from "@silvery/ag-react"
import type { CrossAgentState } from "../cross-agent-state.ts"

/**
 * Bare-bones data binding for cross-agent activity. Visual polish is a
 * downstream component bead — this exists so the wiring is exercised in
 * tests + the app, not as a finished design.
 *
 * Subscribes to `state.activeSessions` and `state.claims` via `useSignal`;
 * re-renders on every mutation. Self-row gets a tag so users can spot it
 * at a glance.
 *
 * Bead: `km-silvercode.acp-multi-agent` — see `docs/multi-agent.md`.
 */
export type CrossAgentSidebarProps = {
  readonly state: CrossAgentState
  readonly selfSessionId?: string
}

export function CrossAgentSidebar({ state, selfSessionId }: CrossAgentSidebarProps): React.ReactElement {
  const sessions = useSignal(state.activeSessions) ?? []
  const claims = useSignal(state.claims) ?? []

  return (
    <Box flexDirection="column">
      <Text bold>Sessions</Text>
      {sessions.length === 0 ? (
        <Text color="$muted">(no active sessions)</Text>
      ) : (
        sessions.map((s) => {
          const tag = s.sessionId === selfSessionId ? " (you)" : ""
          return (
            <Text key={s.sessionId}>
              {s.name} [{s.status}]{tag}
            </Text>
          )
        })
      )}
      <Text> </Text>
      <Text bold>File claims</Text>
      {claims.length === 0 ? (
        <Text color="$muted">(none)</Text>
      ) : (
        claims.map((c) => (
          <Text key={`${c.sessionId}:${c.path}`}>
            {c.path} ({c.exclusive ? "exclusive" : "advisory"} — {c.sessionId})
          </Text>
        ))
      )}
    </Box>
  )
}
