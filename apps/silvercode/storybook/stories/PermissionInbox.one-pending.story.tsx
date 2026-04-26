/**
 * PermissionInbox — one pending permission.
 *
 * The inbox aggregates pending permission requests across sessions. We
 * synthesize one fake `SessionHandle` with a single permission queued in
 * its store snapshot.
 */
import React from "react"
import { PermissionInbox } from "../../src/components/PermissionInbox.tsx"
import { fakeSessionHandle } from "../support/fake-session-handle.ts"
import type { Story } from "../types.ts"

export const permissionInboxOnePending: Story = {
  id: "PermissionInbox/one-pending",
  component: "PermissionInbox",
  variant: "one-pending",
  description: "Inbox with one pending Bash request awaiting decision.",
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
    return <PermissionInbox sessions={[handle]} onApprove={() => {}} onDeny={() => {}} onClose={() => {}} />
  },
}
