/**
 * <ToolCall> — failed status, unified card.
 *
 * Demonstrates the failed-status card: one header (✗ glyph + "Read failed"),
 * one inline error message body — no separate envelope, no second "Error"
 * header line. Default-expanded: errors hide nothing.
 */
import React from "react"
import type { ToolCallId } from "@km/agent-harness"
import { ToolCall } from "../../src/components/ToolCall.tsx"
import type { Story } from "../types.ts"

const id = (s: string) => s as ToolCallId

export const toolCallFailed: Story = {
  id: "ToolCall/failed",
  component: "ToolCall",
  variant: "failed",
  description:
    "ACP tool call with status=failed — unified card with ✗ glyph, failure header, and inline error message.",
  knobs: [
    {
      kind: "toggle",
      id: "retry",
      label: "Show retry affordance",
      default: true,
    },
  ],
  render(knobs) {
    return (
      <ToolCall
        toolCall={{
          toolCallId: id("story-failed-1"),
          title: "config/missing.json",
          kind: "read",
          status: "failed",
          locations: [{ path: "config/missing.json" }],
        }}
        errorMessage="ENOENT: no such file or directory, open '/Users/foo/repo/config/missing.json'\n    at Object.openSync (node:fs:582:3)\n    at Object.readFileSync (node:fs:454:35)"
        onRetry={knobs.retry ? () => {} : undefined}
      />
    )
  },
}
