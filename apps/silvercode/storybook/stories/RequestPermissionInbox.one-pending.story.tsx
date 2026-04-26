/**
 * RequestPermissionInbox — one pending permission (binary allow/deny).
 *
 * The inbox aggregates pending permission requests across sessions. We
 * synthesize one fake `SessionHandle` with a single permission queued in
 * its store snapshot.
 *
 * Renamed from PermissionInbox (bead km-silvercode.acp-usage-and-permission).
 */
import React from "react"
import { RequestPermissionInbox } from "../../src/components/RequestPermissionInbox.tsx"
import { fakeSessionHandle } from "../support/fake-session-handle.ts"
import type { Story } from "../types.ts"

export const requestPermissionInboxOnePending: Story = {
  id: "RequestPermissionInbox/one-pending",
  component: "RequestPermissionInbox",
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
    return <RequestPermissionInbox sessions={[handle]} onApprove={() => {}} onDeny={() => {}} onClose={() => {}} />
  },
}
