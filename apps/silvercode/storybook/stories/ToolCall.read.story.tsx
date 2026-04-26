/**
 * <ToolCall> — read kind, status variants.
 *
 * Shows the canonical ACP `<ToolCall>` rendering across the four
 * `ToolCallStatus` values for a `kind: "read"` tool. Header morphs
 * from "src/foo.ts" (pending) → "Reading…" (in_progress) → "Read
 * src/foo.ts" (completed) → "Read failed" (failed).
 */
import React from "react"
import type { ToolCallId, ToolCallStatus } from "@km/agent-harness"
import { ToolCall } from "../../src/components/ToolCall.tsx"
import type { Story } from "../types.ts"

const id = (s: string) => s as ToolCallId

export const toolCallRead: Story = {
  id: "ToolCall/read",
  component: "ToolCall",
  variant: "read",
  description: "ACP read-kind tool call across pending → in_progress → completed → failed.",
  knobs: [
    {
      kind: "select",
      id: "status",
      label: "Status",
      options: ["pending", "in_progress", "completed", "failed"],
      default: "in_progress",
    },
  ],
  render(knobs) {
    const status = knobs.status as ToolCallStatus
    return (
      <ToolCall
        toolCall={{
          toolCallId: id("story-read-1"),
          title: "src/components/SessionCard.tsx",
          kind: "read",
          status,
          locations: [{ path: "src/components/SessionCard.tsx", line: 42 }],
          content:
            status === "completed" || status === "in_progress"
              ? [
                  {
                    type: "content",
                    content: {
                      type: "text",
                      text: "import React from 'react'\n\nexport function SessionCard() { ... }",
                    },
                  },
                ]
              : undefined,
        }}
        errorMessage={status === "failed" ? "ENOENT: no such file or directory" : undefined}
      />
    )
  },
}
