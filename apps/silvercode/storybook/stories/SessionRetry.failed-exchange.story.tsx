/**
 * <SessionRetry> — failed exchange with retry affordance.
 *
 * Shows the left-border retry strip below a simulated error message. The
 * `lastPrompt` is truncated by the component when space is tight. A knob
 * exercises the no-prompt variant (bare ↻ retry label).
 */
import React from "react"
import { Box, Screen, Text } from "silvery"
import { SessionRetry } from "../../src/components/SessionRetry.tsx"
import type { Story } from "../types.ts"

export const sessionRetryFailedExchange: Story = {
  id: "SessionRetry/failed-exchange",
  component: "SessionRetry",
  variant: "failed-exchange",
  description: "Failed exchange — last prompt shown truncated + ↻ retry affordance.",
  knobs: [
    {
      kind: "toggle",
      id: "showLastPrompt",
      label: "Show last prompt",
      default: true,
    },
  ],
  render(knobs) {
    const showLastPrompt = knobs.showLastPrompt as boolean
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" padding={1} gap={1}>
          {/* Simulated failed agent response */}
          <Box flexDirection="column" gap={0}>
            <Text bold color="$accent">
              Claude
            </Text>
            <Text color="$error">Request failed: ECONNRESET — connection to Anthropic API dropped.</Text>
          </Box>
          {/* Retry affordance */}
          <SessionRetry
            lastPrompt={
              showLastPrompt
                ? "Refactor the SessionUpdateList to use the new ACP-shaped message surface and update all imports."
                : undefined
            }
            onRetry={() => {}}
          />
        </Box>
      </Screen>
    )
  },
}
