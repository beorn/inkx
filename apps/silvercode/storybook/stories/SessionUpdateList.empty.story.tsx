/**
 * SessionUpdateList — empty session.
 *
 * Renders an empty message list (idle status). No activity tail when idle.
 *
 */
import React from "react"
import { Box, Screen } from "silvery"
import { SessionUpdateList } from "../../src/components/SessionUpdateList.tsx"
import type { Story } from "../types.ts"

export const sessionUpdateListEmpty: Story = {
  id: "SessionUpdateList/empty",
  component: "SessionUpdateList",
  variant: "empty",
  description: "Empty session — no messages, idle status.",
  render() {
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" flexGrow={1} minHeight={0}>
          <SessionUpdateList
            messages={[]}
            onApprove={() => {}}
            onDeny={() => {}}
            sessionId="story-empty"
            status="idle"
            turnStartedAt={null}
            inputTokens={0}
            outputTokens={0}
            pendingPermissions={0}
            inFlightTool={null}
          />
        </Box>
      </Screen>
    )
  },
}
