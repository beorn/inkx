/**
 * MessageList — empty.
 *
 * Idle session, no messages. Demonstrates the empty-state row baseline
 * MessageList collapses to (no activity tail when status is "idle").
 */
import React from "react"
import { Box, Screen } from "silvery"
import { MessageList } from "../../src/components/MessageList.tsx"
import { EMPTY } from "../support/sample-messages.ts"
import type { Story } from "../types.ts"

export const messageListEmpty: Story = {
  id: "MessageList/empty",
  component: "MessageList",
  variant: "empty",
  description: "Idle session with no messages — empty-state baseline.",
  render() {
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" flexGrow={1} minHeight={0}>
          <MessageList
            messages={EMPTY}
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
