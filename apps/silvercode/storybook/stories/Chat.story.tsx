import React from "react"
import { Box, Screen, Text } from "silvery"
import type { ToolCall as ToolCallType, ToolCallId } from "@km/agent-harness"
import { Chat } from "../../src/components/Chat.tsx"
import { SessionUpdateList } from "../../src/components/SessionUpdateList.tsx"
import type { TurnActivitySummaryItem } from "../../src/components/TurnActivitySummary.tsx"
import { BIG_TOOL_TURN, MULTI_TURN, TURN_ACTIVITY_AMBIENT, TURN_ACTIVITY_RICH } from "../support/sample-messages.ts"
import type { Story } from "../types.ts"

const id = (s: string) => s as ToolCallId

function tc(partial: Partial<ToolCallType> & Pick<ToolCallType, "toolCallId" | "title">): ToolCallType {
  return partial
}

const directActivityItems: TurnActivitySummaryItem[] = [
  {
    id: "read",
    toolCall: tc({
      toolCallId: id("chat-read"),
      title: "Read src/components/SessionUpdateList.tsx",
      kind: "read",
      status: "completed",
    }),
  },
  {
    id: "command",
    toolCall: tc({
      toolCallId: id("chat-command"),
      title: "bun vitest run apps/silvercode/tests/chat-model.test.ts",
      kind: "execute",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "Tests 2 passed" } }],
    }),
  },
]

export const chatTurnComponents: Story = {
  id: "Chat/turn-components",
  component: "Chat",
  variant: "turn-components",
  description: "Direct Chat.Turn.* hierarchy with prompt, narration, activity, summary, and stats.",
  render() {
    return (
      <Screen flexDirection="column">
        <Chat.Root>
          <Chat.Transcript>
            <Chat.Metadata>
              <Chat.Body width="prose">
                <Text color="$muted">Session resumed 019ddfc8…389f</Text>
              </Chat.Body>
            </Chat.Metadata>
            <Chat.Turn.Root>
              <Chat.Turn.Prompt
                text={"Can you refactor the transcript into Chat.*?\n\n- preserve stream order\n- keep layout generic"}
              />
              <Chat.Turn.Segment>
                <Chat.Turn.Narration text="I will add the semantic component family first, then migrate the list." />
                <Chat.Turn.Activity items={directActivityItems} />
              </Chat.Turn.Segment>
              <Chat.Turn.Summary>
                <Chat.Turn.Narration text="The transcript now renders through Chat.Turn.* while Content.* still owns lanes." />
                <Chat.Turn.Stats>2 tools · 1 test file · prose lane</Chat.Turn.Stats>
              </Chat.Turn.Summary>
            </Chat.Turn.Root>
          </Chat.Transcript>
        </Chat.Root>
      </Screen>
    )
  },
}

export const chatMultiTurn: Story = {
  id: "Chat/multi-turn",
  component: "Chat",
  variant: "multi-turn",
  description: "Production transcript path rendered through the Chat component layer.",
  render() {
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" flexGrow={1} minHeight={0}>
          <SessionUpdateList
            messages={MULTI_TURN}
            onApprove={() => {}}
            onDeny={() => {}}
            sessionId="story-chat-multi-turn"
            status="idle"
            turnStartedAt={null}
            inputTokens={1532}
            outputTokens={412}
            pendingPermissions={0}
            inFlightTool={null}
            follow={false}
          />
        </Box>
      </Screen>
    )
  },
}

export const chatTurnActivityRich: Story = {
  id: "Chat/turn-activity-rich",
  component: "Chat",
  variant: "turn-activity-rich",
  description: "Production transcript with dense activity, ambient notifications, and preserved turn order.",
  render() {
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" flexGrow={1} minHeight={0}>
          <SessionUpdateList
            messages={TURN_ACTIVITY_RICH}
            ambientEntries={TURN_ACTIVITY_AMBIENT}
            onApprove={() => {}}
            onDeny={() => {}}
            sessionId="story-chat-turn-activity"
            status="tool-running"
            turnStartedAt={Date.now() - 12_000}
            inputTokens={4200}
            outputTokens={980}
            pendingPermissions={1}
            inFlightTool="Bash"
            follow={false}
          />
        </Box>
      </Screen>
    )
  },
}

export const chatBigToolTurn: Story = {
  id: "Chat/big-tool-turn",
  component: "Chat",
  variant: "big-tool-turn",
  description: "Production transcript path for an 8+ tool turn: collapsed summary, expandable interleaved details.",
  render() {
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" flexGrow={1} minHeight={0}>
          <SessionUpdateList
            messages={BIG_TOOL_TURN}
            onApprove={() => {}}
            onDeny={() => {}}
            sessionId="story-chat-big-tool-turn"
            status="idle"
            turnStartedAt={null}
            inputTokens={0}
            outputTokens={0}
            pendingPermissions={0}
            inFlightTool={null}
            follow={false}
          />
        </Box>
      </Screen>
    )
  },
}
