/**
 * <ToolCall> — execute kind with terminal output content.
 *
 * Demonstrates an execute-kind tool call with text content (the more
 * common shape). The terminal-content placeholder branch is exercised
 * separately via tests; this story shows the typical `bun fix` style
 * shell invocation Claude Code emits.
 */
import React from "react"
import type { ToolCallId } from "@km/agent-harness"
import { ToolCall } from "../../src/components/ToolCall.tsx"
import type { Story } from "../types.ts"

const id = (s: string) => s as ToolCallId

export const toolCallExecute: Story = {
  id: "ToolCall/execute",
  component: "ToolCall",
  variant: "execute",
  description: "ACP execute-kind call (Bash) with text-content body.",
  render() {
    return (
      <ToolCall
        toolCall={{
          toolCallId: id("story-execute-1"),
          title: "bun fix && bun run test:fast",
          kind: "execute",
          status: "completed",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: ["✓ lint clean", "✓ format clean", "Test Files  124 passed", "Tests       1893 passed"].join(
                  "\n",
                ),
              },
            },
          ],
        }}
        defaultExpanded
      />
    )
  },
}
