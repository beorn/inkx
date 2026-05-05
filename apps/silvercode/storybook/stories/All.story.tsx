/**
 * <All> — every silvercode component, woven into one representative
 * 2-panel conversation.
 *
 * Layout (storybook runner pane):
 *   ┌──────────────────────────────────────────┬───────────────┐
 *   │ Main content                             │ Side panel    │
 *   │ (scrollable)                             │ (scrollable)  │
 *   └──────────────────────────────────────────┴───────────────┘
 *
 * Each panel scrolls independently via the pane-level scroll container.
 *
 * Main content (top to bottom):
 *   • Welcome screen variants (bitmap-capable + text-only)
 *   • Exchange 1: user text → assistant text → ToolCall (read)
 *   • AmbientEventRow: all 6 sources merged into one block
 *   • Exchange 2: user → assistant → ToolCall (execute) → assistant →
 *     ToolCall (edit) → ApplyPatch
 *   • Exchange 3: user → assistant → ToolCall (failed) → SessionRetry
 *   • SubAgentExchange (Task tool with nested stream)
 *   • SessionExchangeDivider
 *   • ActivityIndicator (thinking)
 *   • Bottom area: InlinePermissionPrompt, SessionPromptComposer,
 *     AvailableCommandsPalette
 *
 * Side panel shows every section that can appear:
 *   Sessions, Todos, Agents, Ambient, Background, Account quotas,
 *   Version block (Silver Code / Claude Code / Model / Thinking / Mode)
 *
 * Bead: km-silvercode.acp-storybook
 */
import React, { useState } from "react"
import { Box, ListView, Muted, Small, Text, useKineticScroll } from "silvery"
import type { AmbientStreamEntry } from "../../src/components/AmbientEventRow.tsx"
import { InlinePermissionPrompt } from "../../src/components/InlinePermissionPrompt.tsx"
import { InlineAskUserQuestionPrompt } from "../../src/components/InlineAskUserQuestionPrompt.tsx"
import { SessionPromptComposer } from "../../src/components/SessionPromptComposer.tsx"
import {
  MODE_COLORS,
  MODE_ICONS,
  MODE_LABELS,
  THINKING_ICONS,
  THINKING_LABELS,
} from "../../src/components/SidePanel.tsx"
import {
  contextUtilizationColor,
  contextUtilizationLevel,
  contextUtilizationPercent,
  contextWindowFor,
  modelLabel,
} from "../../src/context-windows.ts"
import { Welcome } from "../../src/components/Welcome.tsx"
import { AvailableCommandsPalette } from "../../src/components/AvailableCommandsPalette.tsx"
import { SidePanel } from "../../src/components/SidePanel.tsx"
import { fakeSessionHandle } from "../support/fake-session-handle.ts"
import { LONG_TOOL_SESSION, TURN_ACTIVITY_AMBIENT, TURN_ACTIVITY_RICH } from "../support/sample-messages.ts"
import type { Story } from "../types.ts"
import type {
  MessageEntry,
  MessageOp,
  PermissionOptionId,
  ToolCallEntry,
  ToolResultEntry,
  ToolUseId,
} from "@km/agent-harness"
import type { Controller } from "../../src/controller.ts"
import { Content } from "../../src/components/Content.tsx"
import { SessionUpdateList } from "../../src/components/SessionUpdateList.tsx"
import { Chat } from "../../src/components/Chat.tsx"

const NOW = 1_700_000_000_000
const at = (offsetSec: number): number => NOW + offsetSec * 1000
const mid = (n: number) => `all-${n}` as MessageEntry["id"]
const toolId = (s: string) => s as ToolUseId

function makeEntry(init: {
  id: MessageEntry["id"]
  role: MessageEntry["role"]
  ops: MessageOp[]
  ts: number
}): MessageEntry {
  const out: Record<string, unknown> = { ...init }
  Object.defineProperty(out, "text", {
    get() {
      return init.ops.flatMap((op) => (op.kind === "text" ? [op.text] : [])).join("")
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolCalls", {
    get() {
      return init.ops.flatMap((op) => (op.kind === "tool" ? [op.toolCall] : [])) as ToolCallEntry[]
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolResults", {
    get() {
      return init.ops.flatMap((op) => (op.kind === "tool" && op.result ? [op.result] : [])) as ToolResultEntry[]
    },
    enumerable: true,
    configurable: true,
  })
  return out as unknown as MessageEntry
}

const MARKDOWN_AND_CODE: MessageEntry[] = [
  makeEntry({
    id: mid(1),
    role: "user",
    ops: [
      {
        kind: "text",
        text:
          "Can you review this layout?\n\n" +
          "- keep prose readable\n" +
          "- let code and tables use more room\n" +
          "- show metadata without crowding the transcript",
      },
    ],
    ts: at(10),
  }),
  makeEntry({
    id: mid(2),
    role: "assistant",
    ops: [
      {
        kind: "text",
        text:
          "The transcript should use the prose lane by default, then widen only when the content asks for it.\n\n" +
          "> Metadata belongs near the line it describes, but it should not become the main reading column.\n\n" +
          "```tsx\n" +
          "<Content.Row>\n" +
          '  <Content.Body width="prose">\n' +
          "    <MarkdownView source={message} />\n" +
          "  </Content.Body>\n" +
          "</Content.Row>\n" +
          "```\n\n" +
          "| Surface | Lane | Notes |\n" +
          "| --- | --- | --- |\n" +
          "| Assistant prose | prose | readable line length |\n" +
          "| Tool output | auto | prose first, wide/full if needed |\n" +
          "| Tables | wide | preserve columns when possible |",
      },
    ],
    ts: at(20),
  }),
]

const SMALL_TOOL_RESULT: MessageEntry[] = [
  makeEntry({
    id: mid(3),
    role: "user",
    ops: [{ kind: "text", text: "Check the Content docs and summarize the files you touched." }],
    ts: at(30),
  }),
  makeEntry({
    id: mid(4),
    role: "assistant",
    ops: [
      { kind: "thinking", text: "I’m checking the layout docs and then reading the current transcript component." },
      {
        kind: "tool",
        toolCall: {
          id: toolId("all-read-content"),
          name: "Read",
          input: { file_path: "apps/silvercode/src/components/Content.tsx" },
        },
        result: {
          id: toolId("all-read-content"),
          output: "export const Content = { Layout, Row, Body, Prose, Wide, Full, Table }",
          is_error: false,
        },
      },
      { kind: "text", text: "Content exposes the lane family we need for transcript rows." },
    ],
    ts: at(40),
  }),
]

const LARGE_TOOL_RESULT: MessageEntry[] = [
  makeEntry({
    id: mid(5),
    role: "assistant",
    ops: [
      { kind: "text", text: "Now I’ll run the focused visual tests and keep the output attached to the command." },
      {
        kind: "tool",
        toolCall: {
          id: toolId("all-test-fast"),
          name: "Bash",
          input: { command: "bun vitest run apps/silvercode/tests/content-layout.test.tsx" },
        },
        result: {
          id: toolId("all-test-fast"),
          output:
            "RUN  v4.1.4 /Users/beorn/Code/pim/km\n\n" +
            "✓ user prompt bubble right edge lands on the prose lane edge\n" +
            "✓ assistant markdown code blocks stay inside the prose lane by default\n" +
            "✓ responsive markdown table expands rows into key-value cards\n" +
            "✓ loaded-session metadata is its own row and does not overwrite preceding prose\n" +
            "✓ thinking rows align to the same prose lane as assistant prose\n\n" +
            "Test Files 1 passed\n" +
            "Tests 28 passed\n" +
            "Duration 2.1s\n",
          is_error: false,
        },
      },
      {
        kind: "tool",
        toolCall: {
          id: toolId("all-failed-command"),
          name: "Bash",
          input: { command: "bun vitest run apps/silvercode/tests/does-not-exist.test.tsx" },
        },
        result: {
          id: toolId("all-failed-command"),
          output: "No test files found, exiting with code 1\n",
          is_error: true,
        },
      },
      {
        kind: "text",
        text: "The first run passed. The second command is intentionally shown as a failed tool result.",
      },
    ],
    ts: at(50),
  }),
]

const ALL_TRANSCRIPT_MESSAGES: MessageEntry[] = [
  ...MARKDOWN_AND_CODE,
  ...SMALL_TOOL_RESULT,
  ...LARGE_TOOL_RESULT,
  ...LONG_TOOL_SESSION.slice(1, 5),
  ...TURN_ACTIVITY_RICH,
]

// ──────────────────────────── Layout helpers ────────────────────────────

const SIDE_WIDTH = 40

function PanelScroll({ children }: { children: React.ReactNode }): React.ReactElement {
  const { scrollOffset, onWheel } = useKineticScroll({})
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      overflow="scroll"
      scrollOffset={scrollOffset}
      onWheel={onWheel}
    >
      {children}
    </Box>
  )
}

function fakeController(ambientBySession: ReadonlyMap<string, readonly AmbientStreamEntry[]> = new Map()): Controller {
  const muted = new Set<string>()
  const streamSubscribers = new Set<(sessionId: string, entry: AmbientStreamEntry) => void>()
  const muteSubscribers = new Set<(muted: ReadonlySet<string>) => void>()
  return {
    ambientMuteState: {
      muted: () => muted,
      subscribe: (fn: (muted: ReadonlySet<string>) => void) => {
        muteSubscribers.add(fn)
        return () => muteSubscribers.delete(fn)
      },
      toggle: (source: string) => {
        if (muted.has(source)) muted.delete(source)
        else muted.add(source)
        for (const fn of muteSubscribers) fn(muted)
      },
    },
    ambientStream: {
      entries: (sessionId: string) => ambientBySession.get(sessionId) ?? [],
      subscribe: (fn: (sessionId: string, entry: AmbientStreamEntry) => void) => {
        streamSubscribers.add(fn)
        return () => streamSubscribers.delete(fn)
      },
    },
    backgroundTasks: () => [],
    onBackgroundTasksChange: () => () => {},
    cancelBackgroundTask: () => {},
    foregroundTask: () => {},
  } as unknown as Controller
}

function StoryWelcomeComposer({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}): React.ReactElement {
  return (
    <SessionPromptComposer
      queueText=""
      onQueueChange={() => {}}
      onQueueSubmit={() => {}}
      inputValue={value}
      onInputChange={onChange}
      inputDisabled={false}
      onSubmit={() => {}}
      onExit={() => {}}
      focusedRegion="command"
      onFocusRegion={() => {}}
    />
  )
}

function SectionLabel({ children }: { children: string }): React.ReactElement {
  return (
    <Content.Row>
      <Content.Body width="prose">
        <Box paddingBottom={0} width="100%">
          <Box width="100%" backgroundColor="$fg-muted">
            <Text color="$bg" wrap="truncate">
              {children}
            </Text>
          </Box>
        </Box>
      </Content.Body>
    </Content.Row>
  )
}

// ──────────────────────────── Side panel stub ────────────────────────────

function SidePanelStub(): React.ReactElement {
  const model = "claude-opus-4-7"
  const window = contextWindowFor(model)
  const totalTokens = 13_456
  const pct = contextUtilizationPercent(totalTokens, window)
  const ctxColor = contextUtilizationColor(contextUtilizationLevel(pct))
  const ctxValue = Math.max(0, Math.min(1, totalTokens / window))

  const sessions = [
    { id: "s1", label: "s1" },
    { id: "s2", label: "s2" },
  ]

  const todos = [
    { content: "Review auth refactor PR", status: "in_progress" as const },
    { content: "Fix failing tests", status: "completed" as const },
  ]

  const ambientSources = [
    { id: "tribe", label: "tribe", muted: false },
    { id: "ci", label: "CI", muted: false },
    { id: "recall", label: "recall", muted: true },
    { id: "sub-agent", label: "sub-agent", muted: false },
    { id: "file-watch", label: "file-watch", muted: false },
    { id: "telegram", label: "telegram", muted: false },
  ]

  const quotas = [
    { name: "5-hour", utilization: 45 },
    { name: "7-day", utilization: 12 },
    { name: "Xtra", utilization: 0 },
  ]

  const mode = "accept-edits" as string
  const thinking = "normal" as string

  return (
    <Box flexDirection="column" paddingY={1} gap={0}>
      {/* Sessions */}
      <Text bold color="$primary">
        Sessions
      </Text>
      {sessions.map((s) => (
        <Text key={s.id} color={s.id === "s1" ? undefined : "$muted"}>
          {s.id === "s1" ? "▸ " : ""}
          {s.label}
        </Text>
      ))}

      <Box flexShrink={0} height={1} />

      {/* Todos */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="$primary">
          Todos
        </Text>
        <Text color="$muted">{todos.length}</Text>
      </Box>

      <Box flexShrink={0} height={1} />

      {/* Agents */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="$primary">
          Agents
        </Text>
        <Text color="$muted">0/2</Text>
      </Box>

      <Box flexShrink={0} height={1} />

      {/* Shells */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="$primary">
          Shells
        </Text>
        <Text color="$muted">0/0</Text>
      </Box>

      <Box flexShrink={0} height={1} />

      {/* Ambient */}
      <Text bold color="$primary">
        Ambient
      </Text>
      {ambientSources.map((s) => (
        <Box key={s.id} flexDirection="row" gap={1}>
          <Text color={s.muted ? "$muted" : "$fg"}>{s.muted ? "☐" : "☑︎"}</Text>
          <Text color={s.muted ? "$muted" : "$fg"}>{s.label}</Text>
        </Box>
      ))}

      <Box flexShrink={0} height={1} />

      {/* Background tasks */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="$primary">
          Background
        </Text>
        <Text color="$muted">0/1</Text>
      </Box>

      <Box flexGrow={1} />

      {/* Account / quotas */}
      <Box flexDirection="column" gap={0}>
        <Text color="$fg">Pro (monthly)</Text>
        <Muted>bjorn@stabell.org</Muted>
        {quotas.map((q) => (
          <Box key={q.name} flexDirection="row" gap={1}>
            <Box flexBasis={4}>
              <Muted>{q.name}</Muted>
            </Box>
            <Text color={q.utilization >= 70 ? "$warning" : "$fg-muted"}>
              {"█".repeat(Math.round(q.utilization / 5))}
              {"░".repeat(20 - Math.round(q.utilization / 5))}
            </Text>
            <Small>{q.utilization}%</Small>
          </Box>
        ))}
        <Box flexShrink={0} height={1} />
        <Text bold>Session</Text>
        <Box flexDirection="row" gap={1}>
          <Muted>context</Muted>
          <Text>
            {totalTokens.toLocaleString()} / {window.toLocaleString()} ({pct}%)
          </Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Muted>cost</Muted>
          <Text>$0.0089</Text>
        </Box>
      </Box>

      <Box flexShrink={0} height={1} />

      {/* Version block */}
      <Box flexDirection="column" gap={0}>
        <Box flexDirection="row" gap={1}>
          <Text color="$fg">◈</Text>
          <Box flexDirection="row">
            <Text bold color="$fg">
              Silver
            </Text>
            <Text color="$fg"> Code v0.1.0 </Text>
            <Small>on</Small>
          </Box>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color="$fg">✻</Text>
          <Box flexDirection="row">
            <Text bold color="$fg">
              Claude Code
            </Text>
            <Text color="$fg"> v2.1.119</Text>
          </Box>
        </Box>
        <Text color="$fg">{modelLabel(model)}</Text>
        {/* Thinking */}
        <Box flexDirection="row" gap={1}>
          <Text color="$muted">{THINKING_ICONS[thinking]}</Text>
          <Text color="$muted">{THINKING_LABELS[thinking]}</Text>
        </Box>
        {/* Mode */}
        <Box flexDirection="row" gap={1}>
          <Text color={MODE_COLORS[mode] ?? "$muted"} bold>
            {MODE_ICONS[mode]}
          </Text>
          <Text color={MODE_COLORS[mode] ?? "$muted"} bold>
            {MODE_LABELS[mode]}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

// ──────────────────────────── All story ────────────────────────────

const allAmbientEntries: AmbientStreamEntry[] = [
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
  {
    kind: "ambient",
    id: "amb-subagent-1",
    source: "sub-agent",
    timestamp: at(180),
    content: "sub-agent finished: 3 files searched, 12 matches in apps/silvercode",
    actionable: false,
  },
  {
    kind: "ambient",
    id: "amb-filewatch-1",
    source: "file-watch",
    timestamp: at(240),
    content: "file-watch: apps/silvercode/src/controller.ts changed (saved by editor)",
  },
  {
    kind: "ambient",
    id: "amb-telegram-1",
    source: "telegram",
    timestamp: at(300),
    content: "telegram message from approved channel: weekly digest ready for review",
  },
]

const sidePanelSessionJson = {
  status: "awaiting-permission",
  permissions: [{ requestId: "req-bash-1", tool: "Bash", args: { command: "rm -rf node_modules" } }],
  todos: [
    { content: "Review auth refactor PR", status: "in_progress" },
    { content: "Fix failing tests", status: "completed" },
  ],
  messages: [
    {
      role: "assistant",
      id: "m-1",
      timestamp: at(0),
      text: "Here's what I can see...",
      thinking: "",
      toolCalls: [
        { id: "tc-1", name: "Task", input: {} },
        { id: "tc-2", name: "Bash", input: { run_in_background: true } },
      ],
      toolResults: [{ id: "tc-1" }],
      blocks: [],
    },
  ],
  cost: { usd: 0.0089, inputTokens: 9456, outputTokens: 4000 },
  model: "gpt-5.5",
} as const

function AllStoryBody(): React.ReactElement {
  const [composerInput, setComposerInput] = useState("Now run the test suite and confirm everything passes")

  const claudePermissionHandle = fakeSessionHandle({
    id: "story-all",
    name: "Claude permission",
    state: sidePanelSessionJson as any,
  })
  const codexPermissionHandle = fakeSessionHandle({
    id: "story-codex-permission",
    name: "Codex permission",
    state: {
      status: "awaiting-permission",
      permissions: [
        {
          requestId: "codex-perm-1",
          tool: "exec_command",
          args: {
            cmd: "sed -n '1,220p' apps/silvercode/src/components/SessionUpdateList.tsx",
            sandbox_permissions: "require_escalated",
            justification: "Allow reading the local transcript component for this story fixture.",
          },
          options: [
            { optionId: "codex-allow-once" as PermissionOptionId, name: "Allow once", kind: "allow_once" },
            { optionId: "codex-allow-session" as PermissionOptionId, name: "Allow for session", kind: "allow_always" },
            { optionId: "codex-reject" as PermissionOptionId, name: "Reject", kind: "reject_once" },
          ],
        } as unknown as { requestId: string; tool: string; args: unknown },
      ],
    },
  })

  const normalSessionId = "story-normal-session"
  const activeSessionId = "story-active-session"
  const controller = fakeController(new Map([[normalSessionId, [...allAmbientEntries, ...TURN_ACTIVITY_AMBIENT]]]))
  const normalHandle = fakeSessionHandle({
    id: normalSessionId,
    name: "Normal transcript",
    state: {
      messages: ALL_TRANSCRIPT_MESSAGES,
      status: "idle",
      cost: { usd: 0.0089, inputTokens: 9456, outputTokens: 4000 },
      claudeCodeVersion: "0.1.0",
    },
  })
  const activeHandle = fakeSessionHandle({
    id: activeSessionId,
    name: "Active turn",
    state: {
      messages: TURN_ACTIVITY_RICH,
      status: "tool-running",
      cost: { usd: 0.0021, inputTokens: 1200, outputTokens: 320 },
      claudeCodeVersion: "0.1.0",
    },
  })
  const mainItems: Array<{ key: string; node: React.ReactNode }> = [
    {
      key: "welcome",
      node: (
        <Box flexDirection="column" gap={1}>
          <SectionLabel>Welcome</SectionLabel>
          <Welcome
            handle={fakeSessionHandle()}
            agent="codex"
            model="gpt-5.4"
            composerSlot={<StoryWelcomeComposer value={composerInput} onChange={setComposerInput} />}
            centerVertically={false}
          />
        </Box>
      ),
    },
    {
      key: "welcome-loading",
      node: (
        <>
          <SectionLabel>Welcome — loading resumed session</SectionLabel>
          <Welcome
            handle={fakeSessionHandle({ resumeId: "019ddb63-6e8d-7141-a603-f7c86c135be6" })}
            agent="codex"
            model="gpt-5.4"
            centerVertically={false}
          />
        </>
      ),
    },
    {
      key: "normal-session",
      node: (
        <>
          <SectionLabel>Chat — resumed transcript, markdown, code, tables, tools</SectionLabel>
          <Box flexDirection="column" minHeight={0}>
            <SessionUpdateList
              messages={ALL_TRANSCRIPT_MESSAGES}
              ambientEntries={[...allAmbientEntries, ...TURN_ACTIVITY_AMBIENT]}
              onApprove={() => {}}
              onDeny={() => {}}
              sessionId={normalSessionId}
              status="idle"
              turnStartedAt={null}
              inputTokens={9456}
              outputTokens={4000}
              pendingPermissions={0}
              inFlightTool={null}
              sessionMetadata={{
                agent: "codex",
                cwd: "/Users/test/repo",
                model: "gpt-5.5",
                account: "bjorn@stabell.org",
                resumeId: "codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f",
                transcriptPath:
                  "/Users/beorn/.codex/sessions/2026/04/30/rollout-2026-04-30T16-00-00-019ddfc8-0749-7da1-b892-b2e1c6bc389f.jsonl",
                spawnedAt: at(-120),
                replayStartedAt: at(-40),
                replayCompletedAt: at(-10),
                replayMessageCount: 6,
                replayBoundaryMessageId: ALL_TRANSCRIPT_MESSAGES[5]?.id,
              }}
              follow={false}
            />
          </Box>
        </>
      ),
    },
    {
      key: "active-session",
      node: (
        <>
          <SectionLabel>Chat — active activity summary</SectionLabel>
          <Box flexDirection="column" minHeight={0}>
            <SessionUpdateList
              messages={TURN_ACTIVITY_RICH}
              ambientEntries={TURN_ACTIVITY_AMBIENT}
              onApprove={() => {}}
              onDeny={() => {}}
              sessionId={activeSessionId}
              status="tool-running"
              turnStartedAt={Date.now() - 18_000}
              inputTokens={4200}
              outputTokens={980}
              pendingPermissions={1}
              inFlightTool="Bash"
              follow={false}
            />
          </Box>
        </>
      ),
    },
    {
      key: "chat-components",
      node: (
        <>
          <SectionLabel>Chat.Turn.* — direct component hierarchy</SectionLabel>
          <Chat.Root>
            <Chat.Transcript>
              <Chat.Metadata>
                <Chat.Body width="prose">
                  <Text color="$muted">Session resumed 019ddfc8…389f</Text>
                </Chat.Body>
              </Chat.Metadata>
              <Chat.Turn.Root>
                <Chat.Turn.Prompt
                  text={"Review the transcript system.\n\n- preserve prose lanes\n- keep activity grouped"}
                />
                <Chat.Turn.Segment>
                  <Chat.Turn.Narration text="I will keep Content.* responsible for layout and move chat semantics into Chat.*." />
                  <Chat.Turn.Activity items={[]} />
                </Chat.Turn.Segment>
                <Chat.Turn.Summary>
                  <Chat.Turn.Stats>metadata · prompt · narration · activity · summary</Chat.Turn.Stats>
                </Chat.Turn.Summary>
              </Chat.Turn.Root>
            </Chat.Transcript>
          </Chat.Root>
        </>
      ),
    },
    {
      key: "bottom-surfaces",
      node: (
        <>
          <SectionLabel>InlinePermissionPrompt — Claude Code legacy Bash</SectionLabel>
          <InlinePermissionPrompt
            focused={claudePermissionHandle}
            sessions={[claudePermissionHandle]}
            onApprove={() => {}}
            onDeny={() => {}}
          />

          <SectionLabel>InlinePermissionPrompt — Codex ACP multi-option</SectionLabel>
          <InlinePermissionPrompt
            focused={codexPermissionHandle}
            sessions={[codexPermissionHandle]}
            onApprove={() => {}}
            onDeny={() => {}}
            onSelectOption={() => {}}
          />

          <SectionLabel>InlineAskUserQuestionPrompt — multi-option form</SectionLabel>
          <InlineAskUserQuestionPrompt
            focused={claudePermissionHandle}
            sessions={[claudePermissionHandle]}
            onAnswer={() => {}}
            onCancel={() => {}}
          />

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

          <SectionLabel>AvailableCommandsPalette — slash command picker</SectionLabel>
          <AvailableCommandsPalette
            query=""
            remoteCommands={["/panel", "/history", "/mode", "/handoff", "/fork", "/spawn"]}
            remoteSkills={[]}
            onSubmit={() => {}}
            onClose={() => {}}
          />
        </>
      ),
    },
  ]

  return (
    <Box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} overflow="hidden">
      {/* ── Main content ── */}
      <Box
        id="all-main-panel"
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        flexBasis={0}
        minHeight={0}
        minWidth={0}
        overflow="hidden"
      >
        <Box flexDirection="row" flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
          <Content.Layout>
            <ListView
              items={mainItems}
              getKey={(item) => item.key}
              gap={1}
              maxRendered={20}
              renderItem={(item) => <Box flexDirection="column">{item.node}</Box>}
            />
          </Content.Layout>
        </Box>
      </Box>

      {/* ── Divider between main and side ── */}
      <Box flexDirection="column" width={1} flexGrow={0} flexShrink={0} backgroundColor="$border">
        <Text color="$border">│</Text>
      </Box>

      {/* ── Side panel (right) ── */}
      <Box id="all-side-panel" flexDirection="column" width={SIDE_WIDTH} flexGrow={0} flexShrink={0} minHeight={0}>
        <PanelScroll>
          <SidePanel
            focused={normalHandle}
            sessions={[normalHandle, activeHandle, claudePermissionHandle, codexPermissionHandle]}
            focusedSessionId={normalHandle.id}
            onFocusSession={() => {}}
            mode="accept-edits"
            onCycleMode={() => {}}
            cwd="/Users/test/repo"
            controller={controller}
            thinking="normal"
            onCycleThinking={() => {}}
            agent="codex"
            defaultModel="gpt-5.5"
          />
        </PanelScroll>
      </Box>
    </Box>
  )
}

export const allTogether: Story = {
  id: "All/together",
  component: "All",
  variant: "together",
  description: "Representative 2-panel app layout.",
  ownsScroll: true,
  render() {
    return <AllStoryBody />
  },
}
