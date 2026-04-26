/**
 * ActivityIndicator — thinking + tool-running variants.
 */
import React from "react"
import { ActivityIndicator, type ActivityStatus } from "../../src/components/ActivityIndicator.tsx"
import type { Story } from "../types.ts"

const TURN_STARTED = Date.now() - 5_000

export const activityIndicatorThinking: Story = {
  id: "ActivityIndicator/thinking",
  component: "ActivityIndicator",
  variant: "thinking",
  description: "Live activity tail: status, in-flight tool, token meter.",
  knobs: [
    {
      kind: "select",
      id: "status",
      label: "Status",
      options: ["thinking", "tool-running", "awaiting-permission"],
      default: "thinking",
    },
    {
      kind: "toggle",
      id: "withTool",
      label: "With in-flight tool",
      default: false,
    },
  ],
  render(knobs) {
    const status = knobs.status as ActivityStatus
    return (
      <ActivityIndicator
        status={status}
        pendingPermissions={status === "awaiting-permission" ? 1 : 0}
        inFlightTool={knobs.withTool ? "Bash" : null}
        turnStartedAt={TURN_STARTED}
        inputTokens={1242}
        outputTokens={387}
      />
    )
  },
}
