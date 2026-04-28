/**
 * InlinePermissionPrompt — one pending permission (binary allow/deny).
 *
 * The inline prompt renders the FIRST pending permission for the focused
 * session as a single bar above the SessionPromptComposer. We synthesize
 * one fake `SessionHandle` with a single permission queued in its store
 * snapshot.
 *
 * Bead: km-silvercode.permission-inline-prompt.
 */
import React from "react"
import { InlinePermissionPrompt } from "../../src/components/InlinePermissionPrompt.tsx"
import { fakeSessionHandle } from "../support/fake-session-handle.ts"
import type { Story } from "../types.ts"

export const inlinePermissionPromptOnePending: Story = {
  id: "InlinePermissionPrompt/one-pending",
  component: "InlinePermissionPrompt",
  variant: "one-pending",
  description: "Inline permission prompt with one pending Bash request awaiting decision.",
  knobs: [
    {
      kind: "select",
      id: "tool",
      label: "Tool",
      options: ["Bash", "Edit", "Write"],
      default: "Bash",
    },
  ],
  render(knobs) {
    const tool = knobs.tool as string
    const args =
      tool === "Bash"
        ? { command: "rm -rf node_modules" }
        : tool === "Edit"
          ? { file_path: "/Users/test/repo/src/index.ts" }
          : { file_path: "/Users/test/repo/scratch.md", content: "(new file)" }
    const handle = fakeSessionHandle({
      id: "story-permission",
      name: "Story Session",
      state: {
        status: "awaiting-permission",
        permissions: [{ requestId: "req-1", tool, args }],
      },
    })
    return <InlinePermissionPrompt focused={handle} sessions={[handle]} onApprove={() => {}} onDeny={() => {}} />
  },
}
