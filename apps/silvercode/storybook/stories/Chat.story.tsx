import React from "react"
import { Box, Screen, Text } from "silvery"
import type { AgentPlan, ToolCall as ToolCallType, ToolCallId } from "@km/agent-harness"
import { Chat } from "../../src/components/Chat.tsx"
import type { SessionInfo } from "../../src/cross-agent-state.ts"
import { SessionUpdateList } from "../../src/components/SessionUpdateList.tsx"
import type { TurnActivitySummaryItem } from "../../src/components/TurnActivitySummary.tsx"
import { withActivitySpan } from "../support/activity-summary.ts"
import {
  BIG_TOOL_TURN,
  METADATA_NOTIFICATIONS,
  MULTI_TURN,
  TURN_ACTIVITY_AMBIENT,
  TURN_ACTIVITY_RICH,
} from "../support/sample-messages.ts"
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
].map(withActivitySpan)

const denseActivityItems: TurnActivitySummaryItem[] = Array.from({ length: 9 }, (_, i) =>
  withActivitySpan(
    {
      id: `dense-${i}`,
      toolCall: tc({
        toolCallId: id(`chat-dense-${i}`),
        title: `Read src/file-${i}.ts`,
        kind: "read",
        status: "completed",
      }),
    },
    i,
  ),
)

const activePlan: AgentPlan = {
  id: "story-plan",
  sessionId: "story-chat-plan" as AgentPlan["sessionId"],
  scope: { sessionId: "story-chat-plan" as AgentPlan["sessionId"], toolCallId: "todo-1" },
  source: "claude-todowrite",
  version: 1,
  status: "active",
  updatedAt: Date.now(),
  entries: [
    { id: "plan-1", content: "Audit chat model", status: "completed", order: 0 },
    {
      id: "plan-2",
      content: "Implement session-scoped plan drawer",
      activeForm: "Implementing plan drawer",
      status: "in_progress",
      order: 1,
    },
    { id: "plan-3", content: "Update architecture docs", status: "pending", order: 2 },
  ],
}

const activeAgents: SessionInfo[] = [
  {
    sessionId: "claude:f9eb64dc-d982-4a46-9a8e-da5fd882ac5f",
    name: "Claude Code",
    model: "claude-sonnet-4-6",
    status: "thinking",
    startedAt: Date.now() - 120_000,
  },
  {
    sessionId: "codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f",
    name: "Codex",
    model: "gpt-5.5",
    status: "idle",
    startedAt: Date.now() - 60_000,
  },
]

function StorySection({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="column" gap={0}>
      <Text color="$muted">{label}</Text>
      {children}
    </Box>
  )
}

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

export const chatStateVariants: Story = {
  id: "Chat/state-variants",
  component: "Chat",
  variant: "state-variants",
  description:
    "Chat session states: prompt, narration, activity, dense activity, queued prompt, notification, plan, summary, and stats.",
  render() {
    return (
      <Screen flexDirection="column">
        <Chat.Root>
          <Chat.Transcript>
            <Chat.Turn.Root>
              <StorySection label="prompt-only">
                <Chat.Turn.Prompt text="Review the chat projection model." />
              </StorySection>
              <StorySection label="narration-only">
                <Chat.Turn.Segment>
                  <Chat.Turn.Narration text="I am tracing the session state before changing components." />
                </Chat.Turn.Segment>
              </StorySection>
              <StorySection label="narration-activity-narration">
                <Chat.Turn.Segment>
                  <Chat.Turn.Narration text="First I inspect the model." />
                  <Chat.Turn.Activity items={directActivityItems} />
                  <Chat.Turn.Narration text="Then I update the projection." />
                </Chat.Turn.Segment>
              </StorySection>
              <StorySection label="dense-activity">
                <Chat.Turn.Activity items={denseActivityItems} />
              </StorySection>
              <StorySection label="queued-prompt">
                <Chat.Turn.Prompt text="Also update Storybook with all variants." />
              </StorySection>
              <StorySection label="notification">
                <Chat.Notification>
                  <Chat.Body width="prose">
                    <Text color="$muted">CI failed Workers builds: km-website</Text>
                  </Chat.Body>
                </Chat.Notification>
              </StorySection>
              <StorySection label="plan-update">
                <Chat.Composer>
                  <Chat.PlanDrawer plan={activePlan} defaultExpanded />
                </Chat.Composer>
              </StorySection>
              <StorySection label="summary-stats">
                <Chat.Turn.Summary>
                  <Chat.Turn.Narration text="The projection now treats turns as idle-delimited UI groups." />
                  <Chat.Turn.Stats>2 prompts · 11 tools · 4.2s · 3.1k tokens</Chat.Turn.Stats>
                </Chat.Turn.Summary>
              </StorySection>
            </Chat.Turn.Root>
          </Chat.Transcript>
        </Chat.Root>
      </Screen>
    )
  },
}

export const chatIdleDelimitedTurn: Story = {
  id: "Chat/idle-delimited-turn",
  component: "Chat",
  variant: "idle-delimited-turn",
  description: "A Silvercode turn as an idle-delimited burst with multiple prompts and activities.",
  render() {
    return (
      <Screen flexDirection="column">
        <Chat.Root>
          <Chat.Transcript>
            <Chat.Turn.Root>
              <Chat.Turn.Prompt text="Start the refactor." />
              <Chat.Turn.Segment>
                <Chat.Turn.Narration text="I am updating the model first." />
                <Chat.Turn.Activity items={directActivityItems.slice(0, 1)} />
              </Chat.Turn.Segment>
              <Chat.Turn.Prompt text="Also update the docs and Storybook." />
              <Chat.Turn.Segment>
                <Chat.Turn.Narration text="I will keep that prompt inside the same active turn until both sides go idle." />
                <Chat.Turn.Activity items={directActivityItems.slice(1)} />
              </Chat.Turn.Segment>
              <Chat.Turn.Summary>
                <Chat.Turn.Stats>2 prompts · 2 tools · one idle-delimited turn</Chat.Turn.Stats>
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

export const chatPlanDrawer: Story = {
  id: "Chat/plan-drawer",
  component: "Chat",
  variant: "plan-drawer",
  description: "Session-scoped plan drawer states above the composer.",
  render() {
    const completedPlan: AgentPlan = {
      ...activePlan,
      id: "story-plan-completed",
      status: "completed",
      entries: activePlan.entries.map((entry) => ({ ...entry, status: "completed" })),
    }
    const cancelledPlan: AgentPlan = {
      ...activePlan,
      id: "story-plan-cancelled",
      status: "abandoned",
      entries: [
        { id: "plan-cancel-1", content: "Cancelled migration", status: "cancelled", order: 0 },
        { id: "plan-cancel-2", content: "Follow-up cleanup", status: "pending", order: 1 },
      ],
    }
    return (
      <Screen flexDirection="column">
        <Chat.Root>
          <Chat.Transcript>
            <Box flexDirection="column" flexGrow={1} justifyContent="flex-end">
              <Chat.Composer>
                <Box flexDirection="column" gap={1} width="100%" minWidth={0}>
                  <Chat.PlanDrawer plan={activePlan} />
                  <Chat.AgentsDrawer sessions={activeAgents} selfSessionId={activeAgents[0]!.sessionId} />
                  <Chat.AgentsDrawer
                    sessions={activeAgents}
                    selfSessionId={activeAgents[0]!.sessionId}
                    defaultExpanded
                  />
                  <Chat.PlanDrawer plan={activePlan} defaultExpanded />
                  <Chat.PlanDrawer plan={completedPlan} />
                  <Chat.PlanDrawer plan={cancelledPlan} defaultExpanded />
                  <Box backgroundColor="$bg-surface-raised" paddingX={1}>
                    <Text color="$muted">composer</Text>
                  </Box>
                </Box>
              </Chat.Composer>
            </Box>
          </Chat.Transcript>
        </Chat.Root>
      </Screen>
    )
  },
}

export const chatMetadataNotifications: Story = {
  id: "Chat/metadata-notifications",
  component: "Chat",
  variant: "metadata-notifications",
  description: "Claude transcript metadata rendered as concise inspectable notification rows.",
  render() {
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" flexGrow={1} minHeight={0}>
          <SessionUpdateList
            messages={METADATA_NOTIFICATIONS}
            onApprove={() => {}}
            onDeny={() => {}}
            sessionId="story-chat-metadata-notifications"
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
