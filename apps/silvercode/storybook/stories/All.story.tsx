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
import { Box, ListView, Muted, Prose, Screen, Small, Strong, Text, useKineticScroll } from "silvery"
import type { AmbientStreamEntry } from "../../src/components/AmbientEventRow.tsx"
import { AmbientEventRow } from "../../src/components/AmbientEventRow.tsx"
import { ActivityIndicator } from "../../src/components/ActivityIndicator.tsx"
import { ApplyPatch } from "../../src/components/ApplyPatch.tsx"
import { InlinePermissionPrompt } from "../../src/components/InlinePermissionPrompt.tsx"
import { InlineAskUserQuestionPrompt } from "../../src/components/InlineAskUserQuestionPrompt.tsx"
import { LinkifiedText } from "../../src/components/LinkifiedText.tsx"
import { MarkdownView } from "../../src/components/MarkdownView.tsx"
import { SessionExchangeDivider } from "../../src/components/SessionExchangeDivider.tsx"
import { SessionPromptComposer } from "../../src/components/SessionPromptComposer.tsx"
import { SessionRetry } from "../../src/components/SessionRetry.tsx"
import { SessionUpdateList } from "../../src/components/SessionUpdateList.tsx"
import { SubAgentExchange } from "../../src/components/SubAgentExchange.tsx"
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
import { ToolCall } from "../../src/components/ToolCall.tsx"
import { Welcome } from "../../src/components/Welcome.tsx"
import { AvailableCommandsPalette } from "../../src/components/AvailableCommandsPalette.tsx"
import { SidePanel } from "../../src/components/SidePanel.tsx"
import { fakeSessionHandle } from "../support/fake-session-handle.ts"
import { LONG_TOOL_SESSION, MULTI_TURN } from "../support/sample-messages.ts"
import type { Story } from "../types.ts"
import type { ToolCallId } from "@km/agent-harness"
import type { Controller } from "../../src/controller.ts"

const id = (s: string) => s as ToolCallId

const NOW = 1_700_000_000_000
const at = (offsetSec: number): number => NOW + offsetSec * 1000

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

function fakeController(): Controller {
  const muted = new Set<string>()
  return {
    ambientMuteState: {
      muted: () => muted,
      subscribe: () => () => {},
      toggle: (source: string) => {
        if (muted.has(source)) muted.delete(source)
        else muted.add(source)
      },
    },
    ambientStream: {
      entries: () => [],
      subscribe: () => () => {},
    },
    backgroundTasks: () => [],
    onBackgroundTasksChange: () => () => {},
    cancelBackgroundTask: () => {},
    foregroundTask: () => {},
  } as unknown as Controller
}

function UserRow({ text }: { text: string }): React.ReactElement {
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
    <Box paddingTop={1} paddingBottom={0} width="100%">
      <Box width="100%" backgroundColor="$fg-muted" paddingX={1}>
        <Text color="$bg" wrap="truncate">
          {children}
        </Text>
      </Box>
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
    <Box flexDirection="column" paddingX={1} paddingY={1} gap={0}>
      {/* Sessions */}
      <Text bold color="$primary">Sessions</Text>
      {sessions.map((s) => (
        <Text key={s.id} color={s.id === "s1" ? undefined : "$muted"}>{s.id === "s1" ? "▸ " : ""}{s.label}</Text>
      ))}

      <Box flexShrink={0} height={1} />

      {/* Todos */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="$primary">Todos</Text>
        <Text color="$muted">{todos.length}</Text>
      </Box>

      <Box flexShrink={0} height={1} />

      {/* Agents */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="$primary">Agents</Text>
        <Text color="$muted">0/2</Text>
      </Box>

      <Box flexShrink={0} height={1} />

      {/* Shells */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="$primary">Shells</Text>
        <Text color="$muted">0/0</Text>
      </Box>

      <Box flexShrink={0} height={1} />

      {/* Ambient */}
      <Text bold color="$primary">Ambient</Text>
      {ambientSources.map((s) => (
        <Box key={s.id} flexDirection="row" gap={1}>
          <Text color={s.muted ? "$muted" : "$fg"}>{s.muted ? "☐" : "☑"}</Text>
          <Text color={s.muted ? "$muted" : "$fg"}>{s.label}</Text>
        </Box>
      ))}

      <Box flexShrink={0} height={1} />

      {/* Background tasks */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="$primary">Background</Text>
        <Text color="$muted">0/1</Text>
      </Box>

      <Box flexGrow={1} />

      {/* Account / quotas */}
      <Box flexDirection="column" gap={0}>
        <Text color="$fg">Pro (monthly)</Text>
        <Muted>bjorn@stabell.org</Muted>
        {quotas.map((q) => (
          <Box key={q.name} flexDirection="row" gap={1}>
            <Box flexBasis={4}><Muted>{q.name}</Muted></Box>
            <Text color={q.utilization >= 70 ? "$warning" : "$fg-muted"}>{"█".repeat(Math.round(q.utilization / 5))}{"░".repeat(20 - Math.round(q.utilization / 5))}</Text>
            <Small>{q.utilization}%</Small>
          </Box>
        ))}
        <Box flexShrink={0} height={1} />
        <Text bold>Session</Text>
        <Box flexDirection="row" gap={1}>
          <Muted>context</Muted>
          <Text>{totalTokens.toLocaleString()} / {window.toLocaleString()} ({pct}%)</Text>
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
            <Text bold color="$fg">Silver</Text>
            <Text color="$fg"> Code v0.1.0 </Text>
            <Small>on</Small>
          </Box>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color="$fg">✻</Text>
          <Box flexDirection="row">
            <Text bold color="$fg">Claude Code</Text>
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
          <Text color={MODE_COLORS[mode] ?? "$muted"} bold>{MODE_ICONS[mode]}</Text>
          <Text color={MODE_COLORS[mode] ?? "$muted"} bold>{MODE_LABELS[mode]}</Text>
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (eid: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(eid)) next.delete(eid)
      else next.add(eid)
      return next
    })
  }

  const handle = fakeSessionHandle({
    id: "story-all",
    name: "All-in-one",
    state: sidePanelSessionJson as any,
  })

  const controller = fakeController()
  const mainItems: Array<{ key: string; node: React.ReactNode }> = [
    {
      key: "welcome",
      node: (
        <Box flexDirection="column" paddingTop={1} gap={1}>
          <SectionLabel>Welcome</SectionLabel>
          <Welcome
            handle={fakeSessionHandle()}
            agent="codex"
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
            bitmapBanner={false}
            centerVertically={false}
          />
        </>
      ),
    },
    {
      key: "normal-session",
      node: (
        <>
          <SectionLabel>Session — normal transcript with ambient events</SectionLabel>
          <Box flexDirection="column" paddingX={2} paddingY={1}>
            <SessionUpdateList
              messages={LONG_TOOL_SESSION}
              ambientEntries={allAmbientEntries}
              onApprove={() => {}}
              onDeny={() => {}}
              sessionId="story-normal-session"
              status="idle"
              turnStartedAt={null}
              inputTokens={9456}
              outputTokens={4000}
              pendingPermissions={0}
              inFlightTool={null}
              agentLabel="Codex"
              agentVersion="0.1.0"
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
          <SectionLabel>Session — active turn</SectionLabel>
          <Box flexDirection="column" paddingX={2} paddingY={1}>
            <SessionUpdateList
              messages={MULTI_TURN.slice(0, 2)}
              onApprove={() => {}}
              onDeny={() => {}}
              sessionId="story-active-session"
              status="thinking"
              turnStartedAt={Date.now() - 3000}
              inputTokens={1200}
              outputTokens={320}
              pendingPermissions={0}
              inFlightTool="Bash"
              agentLabel="Codex"
              agentVersion="0.1.0"
              follow={false}
            />
          </Box>
        </>
      ),
    },
    {
      key: "bottom-surfaces",
      node: (
        <>
          <SectionLabel>InlinePermissionPrompt — one pending Bash</SectionLabel>
          <InlinePermissionPrompt focused={handle} sessions={[handle]} onApprove={() => {}} onDeny={() => {}} />

          <SectionLabel>InlineAskUserQuestionPrompt — multi-option form</SectionLabel>
          <InlineAskUserQuestionPrompt focused={handle} sessions={[handle]} onAnswer={() => {}} onCancel={() => {}} />

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
          <Box width={1} flexShrink={0} backgroundColor="$border" />
          <ListView
            items={mainItems}
            getKey={(item) => item.key}
            gap={1}
            maxRendered={20}
            renderItem={(item) => (
              <Box flexDirection="column" paddingLeft={2} paddingRight={1} paddingTop={item.key === "welcome" ? 1 : 0}>
                {item.node}
              </Box>
            )}
          />
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
            focused={handle}
            sessions={[handle]}
            focusedSessionId={handle.id}
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
  render() {
    return <AllStoryBody />
  },
}
