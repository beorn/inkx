/**
 * SessionUpdateList — multi-turn conversation with tool call + result.
 *
 * Exercises the row variants the chat surface most often shows back-to-
 * back: user prompt → assistant text + tool call → tool result → assistant
 * follow-up.
 *
 * Tool calls render via `<ToolCall>` (ACP-canonical).
 */
import React from "react"
import { Box, Screen } from "silvery"
import { SessionUpdateList } from "../../src/components/SessionUpdateList.tsx"
import { MULTI_TURN } from "../support/sample-messages.ts"
import type { Story } from "../types.ts"

export const sessionUpdateListMultiTurn: Story = {
  id: "SessionUpdateList/multi-turn",
  component: "SessionUpdateList",
  variant: "multi-turn",
  description: "User → assistant + tool call → result → assistant follow-up.",
  knobs: [
    {
      kind: "select",
      id: "status",
      label: "Status",
      options: ["idle", "thinking", "tool-running"],
      default: "idle",
    },
  ],
  render(knobs) {
    const status = knobs.status as "idle" | "thinking" | "tool-running"
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" flexGrow={1} minHeight={0}>
          <SessionUpdateList
            messages={MULTI_TURN}
            onApprove={() => {}}
            onDeny={() => {}}
            sessionId="story-multi-turn"
            status={status}
            turnStartedAt={status === "idle" ? null : Date.now() - 3_000}
            inputTokens={1532}
            outputTokens={412}
            pendingPermissions={0}
            inFlightTool={status === "tool-running" ? "Bash" : null}
          />
        </Box>
      </Screen>
    )
  },
}
