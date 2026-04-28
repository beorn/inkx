/**
 * <All> — every silvercode component, woven into one representative
 * conversation.
 *
 * Renders top-to-bottom:
 *   • Welcome banner
 *   • Exchange 1: user → assistant text → ToolCall (read, completed)
 *   • AmbientEventRow: tribe, ci, recall (between turns)
 *   • Exchange 2: user → assistant → ToolCall (execute, completed)
 *                                   → ToolCall (edit, with diff)
 *                                   → ApplyPatch
 *   • AmbientEventRow: filewatch, sub-agent, telegram
 *   • Exchange 3: user → assistant → ToolCall (failed) → SessionRetry
 *   • SubAgentExchange (Task tool with nested stream)
 *   • SessionExchangeDivider
 *   • ActivityIndicator (thinking)
 *   • RequestPermissionInbox (one pending Bash)
 *   • UsageMeter + UsageBreakdown + UsageMetrics
 *   • SessionPromptComposer (with-text)
 *
 * The whole thing is wrapped in <BoundedScroll maxRows={120}> — the
 * runner pane is finite, so scroll down to see the lower sections.
 *
 * Bead: km-silvercode.acp-storybook
 */
import React, { useState } from "react"
import { Box, Muted, Prose, Screen, Strong, Text } from "silvery"
import type { AmbientStreamEntry } from "../../src/components/AmbientEventRow.tsx"
import { AmbientEventRow } from "../../src/components/AmbientEventRow.tsx"
import { ActivityIndicator } from "../../src/components/ActivityIndicator.tsx"
import { ApplyPatch } from "../../src/components/ApplyPatch.tsx"
import { BoundedScroll } from "../../src/components/BoundedScroll.tsx"
import { LinkifiedText } from "../../src/components/LinkifiedText.tsx"
import { MarkdownView } from "../../src/components/MarkdownView.tsx"
import { RequestPermissionInbox } from "../../src/components/RequestPermissionInbox.tsx"
import { SessionExchangeDivider } from "../../src/components/SessionExchangeDivider.tsx"
import { SessionPromptComposer } from "../../src/components/SessionPromptComposer.tsx"
import { SessionRetry } from "../../src/components/SessionRetry.tsx"
import { SubAgentExchange } from "../../src/components/SubAgentExchange.tsx"
import { ToolCall } from "../../src/components/ToolCall.tsx"
import {
  StructuredAnswer,
  StructuredQuestion,
  UsageBreakdown,
  UsageMeter,
  UsageMetrics,
} from "../../src/components/UsageMeter.tsx"
import { Welcome } from "../../src/components/Welcome.tsx"
import { fakeSessionHandle } from "../support/fake-session-handle.ts"
import type { Story } from "../types.ts"
import type { ToolCallId, UsageUpdate } from "@km/agent-harness"

const id = (s: string) => s as ToolCallId

const NOW = 1_700_000_000_000
const at = (offsetSec: number): number => NOW + offsetSec * 1000

const usage: UsageUpdate = {
  size: 200_000,
  used: 144_000,
  cost: { amount: 0.0089, currency: "USD" },
}

const breakdownRows = [
  { label: "System prompt", tokens: 18_432 },
  { label: "Tool schemas", tokens: 6_400 },
  { label: "Conversation", tokens: 117_744 },
  { label: "Pending output", tokens: 1_424 },
]

function UserRow({ text }: { text: string }): React.ReactElement {
  // opencode-style ribbon: 1-col left accent border, subtle bg tint, no glyph.
  return (
    <Box
      flexDirection="row"
      backgroundColor="$bg-surface-subtle"
      borderStyle="single"
      borderColor="$accent"
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingX={1}
      paddingY={0}
    >
      <Prose flexGrow={1}>
        <LinkifiedText text={text} role="user" />
      </Prose>
    </Box>
  )
}

function AssistantRow({ text }: { text: string }): React.ReactElement {
  // opencode-style ribbon: 1-col left primary border, no glyph.
  return (
    <Box
      flexDirection="row"
      borderStyle="single"
      borderColor="$primary"
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingX={1}
    >
      <Prose flexGrow={1}>
        <MarkdownView source={text} />
      </Prose>
    </Box>
  )
}

function SectionLabel({ children }: { children: string }): React.ReactElement {
  return (
    <Box paddingTop={1} paddingBottom={0}>
      <Muted>── {children} ──────────────────────────────────────────</Muted>
    </Box>
  )
}

function AmbientStack({ entries }: { entries: AmbientStreamEntry[] }): React.ReactElement {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (eid: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(eid)) next.delete(eid)
      else next.add(eid)
      return next
    })
  }
  return (
    <Box flexDirection="column" gap={0}>
      {entries.map((e) => (
        <AmbientEventRow key={e.id} entry={e} expanded={expanded.has(e.id)} onToggleExpand={() => toggle(e.id)} />
      ))}
    </Box>
  )
}

const tribeAndCiAndRecall: AmbientStreamEntry[] = [
  {
    kind: "ambient",
    id: "amb-tribe-1",
    source: "tribe",
    timestamp: at(0),
    content: "peer alice opened PR #42 in DZ/decker — review requested on the auth refactor",
  },
  {
    kind: "ambient",
    id: "amb-ci-1",
    source: "ci",
    timestamp: at(45),
    content: "CI passed: 245 tests, 0 failures, run took 3m 12s on main",
  },
  {
    kind: "ambient",
    id: "amb-recall-1",
    source: "recall",
    timestamp: at(90),
    content: "recall hit: feedback-quiet-tribe-ack — relevance 0.82",
  },
]

const filewatchAndSubAgentAndTelegram: AmbientStreamEntry[] = [
  {
    kind: "ambient",
    id: "amb-filewatch-1",
    source: "file-watch",
    timestamp: at(180),
    content: "file-watch: apps/silvercode/src/controller.ts changed (saved by editor)",
  },
  {
    kind: "ambient",
    id: "amb-subagent-1",
    source: "sub-agent",
    timestamp: at(210),
    content: "sub-agent finished: 3 files searched, 12 matches in apps/silvercode",
  },
  {
    kind: "ambient",
    id: "amb-telegram-1",
    source: "telegram",
    timestamp: at(240),
    content: "telegram message from approved channel: weekly digest ready for review",
  },
]

function AllStoryBody(): React.ReactElement {
  const [composerInput, setComposerInput] = useState("Now run the test suite and confirm everything passes")
  const handle = fakeSessionHandle({
    id: "story-all",
    name: "All-in-one",
    state: {
      status: "awaiting-permission",
      permissions: [{ requestId: "req-bash-1", tool: "Bash", args: { command: "rm -rf node_modules" } }],
    },
  })

  return (
    <Screen flexDirection="column">
      <BoundedScroll maxRows={120}>
        <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
          <Strong>Silvercode — every component, in one conversation</Strong>
          <Muted>Scroll with the mouse wheel; this story is a piecewise tour of the surface.</Muted>

          <SectionLabel>Welcome</SectionLabel>
          <Welcome handle={fakeSessionHandle()} />

          <SectionLabel>Exchange 1 — user prompt + assistant text + ToolCall (read)</SectionLabel>
          <UserRow text="Show me the SessionCard component." />
          <AssistantRow text="Reading `src/components/SessionCard.tsx`." />
          <ToolCall
            toolCall={{
              toolCallId: id("all-read-1"),
              title: "src/components/SessionCard.tsx",
              kind: "read",
              status: "completed",
              locations: [{ path: "src/components/SessionCard.tsx", line: 42 }],
              content: [
                {
                  type: "content",
                  content: {
                    type: "text",
                    text:
                      "import React from 'react'\n" +
                      "\n" +
                      "export function SessionCard() {\n" +
                      "  return <Box>session</Box>\n" +
                      "}\n",
                  },
                },
              ],
            }}
            defaultExpanded
          />

          <SectionLabel>AmbientEventRow — tribe / ci / recall (between turns)</SectionLabel>
          <AmbientStack entries={tribeAndCiAndRecall} />

          <SectionLabel>Exchange 2 — execute + edit + ApplyPatch</SectionLabel>
          <UserRow text="Add a `key` prop and run the tests." />
          <AssistantRow text="On it — running the test suite first to capture the baseline." />
          <ToolCall
            toolCall={{
              toolCallId: id("all-execute-1"),
              title: "bun run test:fast apps/silvercode/tests/session-card.test.tsx",
              kind: "execute",
              status: "completed",
              content: [
                {
                  type: "content",
                  content: {
                    type: "text",
                    text: "✓ session-card renders title  (4ms)\n✓ session-card forwards onClick  (3ms)\n2 tests passed",
                  },
                },
              ],
            }}
            defaultExpanded
          />
          <AssistantRow text="Tests are green. Patching the component to add the `key` prop." />
          <ToolCall
            toolCall={{
              toolCallId: id("all-edit-1"),
              title: "src/components/SessionCard.tsx",
              kind: "edit",
              status: "completed",
              locations: [{ path: "src/components/SessionCard.tsx" }],
              content: [
                {
                  type: "diff",
                  path: "src/components/SessionCard.tsx",
                  oldText: "export function SessionCard() {",
                  newText: "export function SessionCard({ key }: { key: string }) {",
                },
              ],
            }}
            defaultExpanded
          />
          <ApplyPatch
            filePath="src/components/SessionCard.tsx"
            hunks={[
              {
                search: ["export function SessionCard() {", "  return <Box>session</Box>", "}"],
                replace: [
                  "export function SessionCard({ key }: { key: string }) {",
                  "  return <Box key={key}>session</Box>",
                  "}",
                ],
              },
            ]}
          />

          <SectionLabel>AmbientEventRow — filewatch / sub-agent / telegram</SectionLabel>
          <AmbientStack entries={filewatchAndSubAgentAndTelegram} />

          <SectionLabel>Exchange 3 — failed tool call + SessionRetry</SectionLabel>
          <UserRow text="Read the missing config." />
          <AssistantRow text="Trying to read `config/missing.json`." />
          <ToolCall
            toolCall={{
              toolCallId: id("all-failed-1"),
              title: "config/missing.json",
              kind: "read",
              status: "failed",
              locations: [{ path: "config/missing.json" }],
            }}
            errorMessage={
              "ENOENT: no such file or directory, open '/Users/foo/repo/config/missing.json'\n" +
              "    at Object.openSync (node:fs:582:3)\n" +
              "    at Object.readFileSync (node:fs:454:35)"
            }
            onRetry={() => {}}
          />
          <SessionRetry onRetry={() => {}} />

          <SectionLabel>SubAgentExchange — Task tool with nested stream</SectionLabel>
          <SubAgentExchange
            description="Run bun run test:fast and fix all failing tests in apps/silvercode/"
            failed={false}
          >
            <Box flexDirection="column" gap={0}>
              <Text color="$muted">Running bun run test:fast…</Text>
              <Text color="$muted"> ✓ storybook/registry.test.ts (12 tests)</Text>
              <Text color="$muted"> ✗ storybook/render.test.ts (2 failing)</Text>
              <Text color="$muted">Editing apps/silvercode/storybook/stories/ToolCall.read.story.tsx…</Text>
              <Text color="$success">All tests pass after fix.</Text>
            </Box>
          </SubAgentExchange>

          <SessionExchangeDivider />

          <SectionLabel>ActivityIndicator — thinking spinner</SectionLabel>
          <ActivityIndicator status="thinking" />

          <SectionLabel>RequestPermissionInbox — one pending Bash</SectionLabel>
          <RequestPermissionInbox sessions={[handle]} onApprove={() => {}} onDeny={() => {}} onClose={() => {}} />

          <SectionLabel>
            UsageMeter + UsageBreakdown + UsageMetrics + StructuredQuestion + StructuredAnswer
          </SectionLabel>
          <Box flexDirection="column" gap={1}>
            <UsageMeter usage={usage} width={24} />
            <UsageBreakdown usage={usage} rows={breakdownRows} defaultExpanded />
            <UsageMetrics usage={usage} latencyMs={1_420} />
            <StructuredQuestion
              question="The test file uses a deprecated API. How should I proceed?"
              options={[
                { id: "approve", label: "Approve once", description: "Allow this single invocation" },
                { id: "approve-all", label: "Approve for session", description: "Skip future prompts this session" },
                { id: "deny", label: "Deny", description: "Block the tool call" },
              ]}
              highlightedIndex={0}
            />
            <StructuredAnswer
              question="The test file uses a deprecated API. How should I proceed?"
              answer="Approve once"
            />
          </Box>

          <SectionLabel>SessionPromptComposer — bottom of screen</SectionLabel>
          <SessionPromptComposer
            queueText=""
            onQueueChange={() => {}}
            onQueueSubmit={() => {}}
            inputValue={composerInput}
            onInputChange={setComposerInput}
            inputDisabled={false}
            onSubmit={() => {}}
            onExit={() => {}}
            focusedRegion="command"
            onFocusRegion={() => {}}
          />
        </Box>
      </BoundedScroll>
    </Screen>
  )
}

export const allTogether: Story = {
  id: "All/together",
  component: "All",
  variant: "together",
  description: "Every silvercode component woven into one representative conversation. Scroll to see the full surface.",
  render() {
    return <AllStoryBody />
  },
}
