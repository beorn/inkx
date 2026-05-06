/**
 * TurnActivitySummary — rich grouped turn examples.
 *
 * Covers the bead acceptance fixtures: active turn with reads/writes/commands,
 * long bash output, failed command, file edit diff, todo changes, permission
 * prompt adjacency, notifications, and collapsed vs expanded states.
 */

import React from "react"
import { Box, Screen } from "silvery"
import type { ToolCall as ToolCallType, ToolCallId } from "@km/agent-harness"
import { SessionUpdateList } from "../../src/components/SessionUpdateList.tsx"
import { InlinePermissionPrompt } from "../../src/components/InlinePermissionPrompt.tsx"
import { TurnActivitySummary, type TurnActivitySummaryItem } from "../../src/components/TurnActivitySummary.tsx"
import { TURN_ACTIVITY_NOTIFICATION, TURN_ACTIVITY_RICH } from "../support/sample-messages.ts"
import { withActivitySpan } from "../support/activity-summary.ts"
import { fakeSessionHandle } from "../support/fake-session-handle.ts"
import type { Story } from "../types.ts"

const id = (s: string) => s as ToolCallId

function tc(partial: Partial<ToolCallType> & Pick<ToolCallType, "toolCallId" | "title">): ToolCallType {
  return partial
}

const directItems: TurnActivitySummaryItem[] = [
  {
    id: "read",
    toolCall: tc({
      toolCallId: id("story-read"),
      title: "Read apps/silvercode/src/components/SessionUpdateList.tsx",
      kind: "read",
      status: "completed",
      content: [
        { type: "content", content: { type: "text", text: "ExchangeItem groups ordered tool ops into runs." } },
      ],
    }),
  },
  {
    id: "edit",
    toolCall: tc({
      toolCallId: id("story-edit"),
      title: "Edited apps/silvercode/src/components/SessionUpdateList.tsx",
      kind: "edit",
      status: "completed",
      content: [
        {
          type: "diff",
          path: "apps/silvercode/src/components/SessionUpdateList.tsx",
          oldText: "ToolCall",
          newText: "TurnActivitySummary",
        },
      ],
    }),
  },
  {
    id: "command",
    toolCall: tc({
      toolCallId: id("story-command"),
      title: "bun vitest run apps/silvercode/tests/turn-activity-summary.test.tsx",
      kind: "execute",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text:
              "RUN v4.1.4\n" +
              "✓ collapsed row hides long output\n" +
              "✓ expanded row restores details\n" +
              "✓ backend labels stay out of primary display\n" +
              "Test Files 1 passed\n" +
              "Tests 3 passed\n",
          },
        },
      ],
    }),
  },
  {
    id: "todo",
    toolCall: tc({
      toolCallId: id("story-todo"),
      title: "Todos updated 3 items",
      kind: "think",
      status: "completed",
      content: [
        { type: "content", content: { type: "text", text: "completed tests; in progress storybook; pending tsc" } },
      ],
    }),
  },
  {
    id: "failed",
    toolCall: tc({
      toolCallId: id("story-failed"),
      title: "bun vitest run apps/silvercode/tests/missing.test.tsx",
      kind: "execute",
      status: "failed",
      content: [{ type: "content", content: { type: "text", text: "No test files found, exiting with code 1" } }],
    }),
    errorMessage: "No test files found, exiting with code 1",
  },
].map(withActivitySpan)

export const turnActivitySummaryRich: Story = {
  id: "TurnActivitySummary/rich",
  component: "TurnActivitySummary",
  variant: "rich",
  description: "Grouped turn activity with collapsed and expanded detail states.",
  knobs: [
    {
      kind: "select",
      id: "state",
      label: "State",
      options: ["collapsed", "expanded"],
      default: "collapsed",
    },
  ],
  render(knobs) {
    return <TurnActivitySummary items={directItems} defaultExpanded={knobs.state === "expanded"} />
  },
}

export const sessionUpdateListTurnActivityRich: Story = {
  id: "SessionUpdateList/turn-activity-rich",
  component: "SessionUpdateList",
  variant: "turn-activity-rich",
  description: "Active turn with grouped activity, notification rows, and adjacent permission prompt.",
  render() {
    const focused = fakeSessionHandle({
      id: "story-turn-activity",
      name: "Claude",
      state: {
        status: "awaiting-permission",
        permissions: [
          {
            requestId: "perm-story",
            tool: "Bash",
            args: { command: "bun run test:fast" },
          },
        ] as never,
      },
    })
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" flexGrow={1} minHeight={0}>
          <SessionUpdateList
            messages={TURN_ACTIVITY_RICH}
            notificationEntries={TURN_ACTIVITY_NOTIFICATION}
            onApprove={() => {}}
            onDeny={() => {}}
            sessionId="story-turn-activity"
            status="tool-running"
            turnStartedAt={Date.now() - 12_000}
            inputTokens={4200}
            outputTokens={980}
            pendingPermissions={1}
            inFlightTool="Bash"
            follow={false}
          />
        </Box>
        <InlinePermissionPrompt
          focused={focused}
          sessions={[focused]}
          onApprove={() => {}}
          onDeny={() => {}}
          onSelectOption={() => {}}
        />
      </Screen>
    )
  },
}
