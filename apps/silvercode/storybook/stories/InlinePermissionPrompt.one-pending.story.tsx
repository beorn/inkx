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
import type { PermissionOptionId } from "@km/agent-harness"
import { Box } from "silvery"
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

export const inlinePermissionPromptCodexEscalatedCommand: Story = {
  id: "InlinePermissionPrompt/codex-escalated-command",
  component: "InlinePermissionPrompt",
  variant: "codex-escalated-command",
  description: "Codex-style escalated command permission with reason, long command, and multi-option choices.",
  render() {
    const command =
      'SILVERY_STRICT=1 bun vitest run --project vendor vendor/silvery/tests/runtime/size.test.ts --testNamePattern "zero"'
    const handle = fakeSessionHandle({
      id: "story-codex-escalated-permission",
      name: "Codex permission",
      state: {
        status: "awaiting-permission",
        permissions: [
          {
            requestId: "codex-escalated-1",
            tool: "exec_command",
            args: {
              cmd: command,
              sandbox_permissions: "require_escalated",
              justification:
                "Run the Silvery regression test from the repo root; Vitest writes its temp config under root node_modules outside the current writable sandbox.",
            },
            options: [
              { optionId: "codex-yes" as PermissionOptionId, name: "Yes, proceed (y)", kind: "allow_once" },
              {
                optionId: "codex-yes-prefix" as PermissionOptionId,
                name: `Yes, and don't ask again for commands that start with \`${command}\` (p)`,
                kind: "allow_always",
              },
              {
                optionId: "codex-no-feedback" as PermissionOptionId,
                name: "No, and tell Codex what to do differently (esc)",
                kind: "reject_once",
              },
            ],
          } as unknown as { requestId: string; tool: string; args: unknown },
        ],
      },
    })
    return (
      <Box flexDirection="column" width="100%" paddingX={1}>
        <InlinePermissionPrompt
          focused={handle}
          sessions={[handle]}
          onApprove={() => {}}
          onDeny={() => {}}
          onSelectOption={() => {}}
        />
      </Box>
    )
  },
}
