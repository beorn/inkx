import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, PopoverProvider } from "silvery"
import { Chat } from "../src/components/Chat.tsx"
import {
  filterVisibleNotificationEntries,
  filterVisibleNotificationEntriesFromChatEvents,
} from "../src/chat/notification-visibility.ts"
import { NotificationBlock } from "../src/components/NotificationBlock.tsx"
import {
  chatActivityCountsFromMessages,
  chatActivitySnapshotFromChatEvents,
  chatActivitySnapshotFromMessages,
} from "../src/chat/activity-snapshot.ts"
import type { ChannelNotification } from "../src/notification-stream.ts"
import type { BackgroundJob } from "../src/controller.ts"
import type { MessageEntry } from "@km/agent-harness"
import type { ChatEvent, ChatEventType } from "../src/chat/types.ts"

const LEFT_SUPER_PRESS = "\x1b[57444;9:1u"

function runningJob(id = "bg-1"): BackgroundJob {
  return {
    id,
    turnId: `turn-${id}`,
    startedAt: Date.now() - 5_000,
    status: "running",
    events: [],
    snippet: "reviewing transcript display",
  }
}

function renderBlock(element: React.ReactElement) {
  const render = createRenderer({ cols: 100, rows: 12 })
  return render(
    <Box width={100} height={12} flexDirection="column">
      {element}
    </Box>,
  )
}

function messageWithTools(opts: {
  toolCalls: Array<{ id: string; name: string; input?: unknown }>
  toolResults?: Array<{ id: string; output?: unknown }>
  role?: "assistant" | "user"
  ts?: number
}): MessageEntry {
  return {
    id: "m-1",
    role: opts.role ?? "assistant",
    ops: [],
    ts: opts.ts ?? Date.now(),
    text: "",
    toolCalls: opts.toolCalls,
    toolResults: opts.toolResults ?? [],
  } as unknown as MessageEntry
}

function userMessage(id: string, text: string, ts: number): MessageEntry {
  return {
    id,
    role: "user",
    ops: [],
    ts,
    text,
    toolCalls: [],
    toolResults: [],
  } as unknown as MessageEntry
}

function chatEvent(type: ChatEventType, ts: number, payload: unknown): ChatEvent {
  return {
    id: `event-${ts}`,
    type,
    track: "activity",
    ts,
    sessionId: "s1",
    payload,
    rawRefs: [],
  } as unknown as ChatEvent
}

function notificationEntry(opts: {
  id: string
  source?: string
  content: string
  ts?: number
  fromSessionId?: string
  status?: string
  toolUseId?: string
}): ChannelNotification {
  return {
    kind: "notification",
    id: opts.id,
    source: opts.source ?? "subagent",
    ts: opts.ts ?? 1,
    timestamp: opts.ts ?? 1,
    content: opts.content,
    meta: {
      kind: "subagent-status",
      status: opts.status,
      fromSessionId: opts.fromSessionId,
      toolUseId: opts.toolUseId,
    },
  }
}

describe("NotificationBlock", () => {
  test("renders nothing when there is no notification work", () => {
    const app = renderBlock(
      <NotificationBlock
        counts={{ agentsRunning: 0, backgroundJobsRunning: 0, shellsRunning: 0 }}
        backgroundJobs={[]}
      />,
    )

    expect(app.text.trim()).toBe("")
  })

  test("renders compact running counts", () => {
    const app = renderBlock(
      <NotificationBlock
        counts={{ agentsRunning: 2, backgroundJobsRunning: 1, shellsRunning: 0 }}
        backgroundJobs={[runningJob()]}
      />,
    )

    expect(app.text).toContain("◇ 2 agents · ▣ 1 bg")
  })

  test("counts running sub-agents, background jobs, and shells from session state", () => {
    const messages = [
      messageWithTools({
        toolCalls: [
          { id: "task-1", name: "Task" },
          { id: "agent-1", name: "Agent" },
          { id: "bash-1", name: "Bash", input: { run_in_background: true } },
          { id: "done-task", name: "Task" },
        ],
        toolResults: [{ id: "done-task" }],
      }),
    ]

    expect(chatActivityCountsFromMessages(messages, [runningJob()])).toEqual({
      agentsRunning: 2,
      backgroundJobsRunning: 1,
      shellsRunning: 1,
    })
    expect(chatActivitySnapshotFromMessages(messages, []).agents.map((agent) => `${agent.id}:${agent.status}`)).toEqual(
      ["task-1:running", "agent-1:running", "done-task:done"],
    )
  })

  test("counts current-turn shell activity from canonical chat events", () => {
    const events = [
      chatEvent("message.started", 1_000, { messageId: "u-live", role: "user" }),
      chatEvent("tool.started", 1_100, {
        toolId: "bash-live",
        name: "Bash",
        input: { command: "bun vitest run apps/silvercode/tests/chat-block-list.test.tsx", run_in_background: true },
      }),
      chatEvent("tool.started", 1_200, {
        toolId: "bash-done",
        name: "Bash",
        input: { command: "done", run_in_background: true },
      }),
      chatEvent("tool.completed", 1_300, { toolId: "bash-done", status: "done" }),
      chatEvent("tool.started", 1_400, { toolId: "task-1", name: "Agent" }),
    ]

    const snapshot = chatActivitySnapshotFromChatEvents(events, [runningJob()], {
      agents: [{ id: "agent-1", label: "Agent 1", status: "running" }],
    })

    expect(snapshot.counts).toEqual({
      agentsRunning: 1,
      backgroundJobsRunning: 1,
      shellsRunning: 1,
    })
    expect(snapshot.shells.map((shell) => shell.label)).toEqual([
      "bun vitest run apps/silvercode/tests/chat-block-list.test.tsx",
    ])
  })

  test("agents drawer snapshot keeps completed current-turn subagents visible", () => {
    const messages = [
      messageWithTools({
        toolCalls: [
          { id: "task-1", name: "Agent", input: { description: "Sleep 16s #1" } },
          { id: "task-2", name: "Agent", input: { description: "Sleep 16s #2" } },
          { id: "task-3", name: "Agent", input: { description: "Sleep 16s #3" } },
          { id: "task-4", name: "Agent", input: { description: "Sleep 16s #4" } },
          { id: "task-5", name: "Agent", input: { description: "Sleep 16s #5" } },
        ],
        toolResults: [
          { id: "task-1", output: "agent 1: done sleeping 20s" },
          { id: "task-2", output: "agent 2: done sleeping 20s" },
          { id: "task-3", output: "agent 3: done sleeping 20s" },
          { id: "task-4", output: "agent 4: done sleeping 20s" },
        ],
      }),
    ]

    const snapshot = chatActivitySnapshotFromMessages(messages, [])

    expect(snapshot.counts.agentsRunning).toBe(1)
    expect(snapshot.agents.map((agent) => agent.label)).toEqual([
      "Sleep 16s #1",
      "Sleep 16s #2",
      "Sleep 16s #3",
      "Sleep 16s #4",
      "Sleep 16s #5",
    ])
    expect(snapshot.agents.map((agent) => agent.status)).toEqual(["done", "done", "done", "done", "running"])
  })

  test("agents drawer snapshot adds notification-only current-turn subagents", () => {
    const messages = [
      userMessage("u-live", "use 4 subagents to sleep 20s", 1_000),
      messageWithTools({
        ts: 1_200,
        toolCalls: [{ id: "task-2", name: "Agent", input: { description: "Sleep 20s #2" } }],
      }),
    ]
    const entries = [
      notificationEntry({
        id: "n-1",
        content: "[subagent Agent] completed: Sleep 20s #1 — agent 1: done sleeping 20s",
        fromSessionId: "s1",
        status: "completed",
      }),
      notificationEntry({
        id: "n-3",
        content: "[subagent Agent] started: Sleep 20s #3",
        fromSessionId: "s1",
        status: "started",
      }),
      notificationEntry({
        id: "n-old",
        content: "[subagent Agent] completed: Old sleep — old done",
        fromSessionId: "s1",
        status: "completed",
      }),
    ].map((entry, index) => {
      const ts = index === 2 ? 900 : 1_300 + index
      return { ...entry, ts, timestamp: ts }
    })

    const snapshot = chatActivitySnapshotFromMessages(messages, [], {
      notificationEntries: entries,
      sessionId: "s1",
    })

    expect(snapshot.agents.map((agent) => agent.label).sort()).toEqual(["Sleep 20s #1", "Sleep 20s #2", "Sleep 20s #3"])
    expect(snapshot.counts.agentsRunning).toBe(2)
  })

  test("agents drawer snapshot merges a tool subagent with its notification lifecycle by tool id", () => {
    const messages = [
      userMessage("u-live", "use 4 subagents to sleep 20s", 1_000),
      messageWithTools({
        ts: 1_200,
        toolCalls: [{ id: "toolu_2", name: "Agent", input: { description: "Sleep 20s #2" } }],
      }),
    ]
    const entries = [
      notificationEntry({
        id: "n-1",
        content: "[subagent general-purpose] started: Sleep 20s #1",
        fromSessionId: "s1",
        status: "started",
        toolUseId: "toolu_1",
      }),
      notificationEntry({
        id: "n-2",
        content: "[subagent general-purpose] started: Sleep 20s #2",
        fromSessionId: "s1",
        status: "started",
        toolUseId: "toolu_2",
      }),
      notificationEntry({
        id: "n-3",
        content: "[subagent general-purpose] started: Sleep 20s #3",
        fromSessionId: "s1",
        status: "started",
        toolUseId: "toolu_3",
      }),
      notificationEntry({
        id: "n-4",
        content: "[subagent general-purpose] started: Sleep 20s #4",
        fromSessionId: "s1",
        status: "started",
        toolUseId: "toolu_4",
      }),
    ].map((entry, index) => ({ ...entry, ts: 1_300 + index, timestamp: 1_300 + index }))

    const snapshot = chatActivitySnapshotFromMessages(messages, [], {
      notificationEntries: entries,
      sessionId: "s1",
    })

    expect(snapshot.agents.map((agent) => agent.label)).toEqual([
      "Sleep 20s #2",
      "Sleep 20s #1",
      "Sleep 20s #3",
      "Sleep 20s #4",
    ])
    expect(snapshot.agents.filter((agent) => agent.label === "Sleep 20s #2")).toHaveLength(1)
    expect(snapshot.counts.agentsRunning).toBe(4)
  })

  test("agents drawer snapshot merges a sidechain subagent with the matching tool row by unique label", () => {
    const messages = [
      userMessage("u-live", "use 4 subagents to sleep 20s", 1_000),
      messageWithTools({
        ts: 1_200,
        toolCalls: [{ id: "toolu_2", name: "Agent", input: { description: "Sleep 20s #2" } }],
      }),
    ]
    const entries = [1, 2, 3, 4].map((i, index) => ({
      ...notificationEntry({
        id: `sidechain-${i}`,
        content: `[subagent general-purpose] started: Sleep 20s #${i}`,
        fromSessionId: "s1",
        status: "started",
      }),
      ts: 1_300 + index,
      timestamp: 1_300 + index,
    }))

    const snapshot = chatActivitySnapshotFromMessages(messages, [], {
      notificationEntries: entries,
      sessionId: "s1",
    })

    expect(snapshot.agents.map((agent) => agent.label)).toEqual([
      "Sleep 20s #2",
      "Sleep 20s #1",
      "Sleep 20s #3",
      "Sleep 20s #4",
    ])
    expect(snapshot.agents.filter((agent) => agent.label === "Sleep 20s #2")).toHaveLength(1)
    expect(snapshot.counts.agentsRunning).toBe(4)
  })

  test("agents drawer snapshot keeps distinct labels when notification tool ids are reused", () => {
    const messages = [
      userMessage("u-live", "use 4 subagents to sleep 20s", 1_000),
      messageWithTools({
        ts: 1_200,
        toolCalls: [{ id: "toolu_2", name: "Agent", input: { description: "Sleep 20s #2" } }],
      }),
    ]
    const entries = [1, 2, 3, 4].map((i, index) => ({
      ...notificationEntry({
        id: `n-${i}`,
        content: `[subagent general-purpose] started: Sleep 20s #${i}`,
        fromSessionId: "s1",
        status: "started",
        toolUseId: "toolu_2",
      }),
      ts: 1_300 + index,
      timestamp: 1_300 + index,
    }))

    const snapshot = chatActivitySnapshotFromMessages(messages, [], {
      notificationEntries: entries,
      sessionId: "s1",
    })

    expect(snapshot.agents.map((agent) => agent.label)).toEqual([
      "Sleep 20s #2",
      "Sleep 20s #1",
      "Sleep 20s #3",
      "Sleep 20s #4",
    ])
    expect(snapshot.counts.agentsRunning).toBe(4)
  })

  test("agents drawer snapshot settles a tool subagent from its completion notification", () => {
    const messages = [
      userMessage("u-live", "use 1 subagent to sleep 20s", 1_000),
      messageWithTools({
        ts: 1_200,
        toolCalls: [{ id: "toolu_2", name: "Agent", input: { description: "Sleep 20s #2" } }],
      }),
    ]
    const entries = [
      notificationEntry({
        id: "n-2-done",
        content: "[subagent general-purpose] completed: Sleep 20s #2 — agent 2: done sleeping 20s",
        fromSessionId: "s1",
        status: "completed",
        toolUseId: "toolu_2",
      }),
    ].map((entry) => ({ ...entry, ts: 1_300, timestamp: 1_300 }))

    const snapshot = chatActivitySnapshotFromMessages(messages, [], {
      notificationEntries: entries,
      sessionId: "s1",
    })

    expect(snapshot.agents.map((agent) => `${agent.label}:${agent.status}`)).toEqual(["Sleep 20s #2:done"])
    expect(snapshot.counts.agentsRunning).toBe(0)
  })

  test("agents drawer snapshot resolves parallel started notifications when all complete", () => {
    const messages = [userMessage("u-live", "use 4 subagents to sleep 20s", 1_000)]
    const entries = [
      ...[1, 2, 3, 4].map((i) =>
        notificationEntry({
          id: `start-${i}`,
          content: `[subagent general-purpose] started: Sleep 20s #${i}`,
          fromSessionId: "s1",
          status: "started",
        }),
      ),
      ...[1, 2, 3, 4].map((i) =>
        notificationEntry({
          id: `done-${i}`,
          content: `[subagent general-purpose] completed: Sleep 20s #${i} — agent ${i}: done sleeping 20s`,
          fromSessionId: "s1",
          status: "completed",
        }),
      ),
    ].map((entry, index) => ({ ...entry, ts: 1_100 + index, timestamp: 1_100 + index }))

    const snapshot = chatActivitySnapshotFromMessages(messages, [], {
      notificationEntries: entries,
      sessionId: "s1",
    })
    const app = renderBlock(
      <Chat.AgentsDrawer
        sessions={[{ sessionId: "s1", name: "session 1", status: "idle", startedAt: 1 }]}
        selfSessionId="s1"
        subagents={snapshot.agents}
        defaultExpanded
      />,
    )

    expect(snapshot.counts.agentsRunning).toBe(0)
    expect(snapshot.agents.map((agent) => `${agent.label}:${agent.status}`)).toEqual([
      "Sleep 20s #1:done",
      "Sleep 20s #2:done",
      "Sleep 20s #3:done",
      "Sleep 20s #4:done",
    ])
    expect(app.text.trim()).toBe("")
  })

  test("agents drawer snapshot ignores no-description subagent notifications instead of leaking agent ids", () => {
    const messages = [userMessage("u-live", "continue agent", 1_000)]
    const entries = [
      notificationEntry({
        id: "agent-id-only",
        content:
          "[subagent Agent] completed: (no description) — agentId: a4b3d91b8a4f030ac (use SendMessage with to: 'a4b3d91b8a4f030ac' to continue this agent)",
        fromSessionId: "s1",
        status: "completed",
      }),
    ].map((entry) => ({ ...entry, ts: 1_100, timestamp: 1_100 }))

    const snapshot = chatActivitySnapshotFromMessages(messages, [], {
      notificationEntries: entries,
      sessionId: "s1",
    })

    expect(snapshot.agents).toEqual([])
  })

  test("clicking a chip opens inline detail", async () => {
    const app = renderBlock(
      <NotificationBlock
        counts={{ agentsRunning: 0, backgroundJobsRunning: 1, shellsRunning: 0 }}
        backgroundJobs={[runningJob()]}
      />,
    )

    const row = app.lines.findIndex((line) => line.includes("▣ 1 bg"))
    expect(row, app.text).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("▣ 1 bg")

    await app.click(col, row)

    expect(app.text).toContain("Background jobs")
    expect(app.text).toContain("reviewing transcript display")
  })

  test("agents drawer includes Task-tool subagents under the foreground session", () => {
    const app = renderBlock(
      <Chat.AgentsDrawer
        sessions={[
          {
            sessionId: "s1",
            name: "session 1",
            status: "idle",
            startedAt: 1,
            metrics: { elapsedMs: 36_000, inputTokens: 1100, outputTokens: 413000 },
          },
        ]}
        selfSessionId="s1"
        subagents={[
          { id: "task-1", label: "Sleep 20s #1", detail: "agent 1: sleeping" },
          { id: "task-2", label: "Sleep 20s #2", metadata: { subagentType: "general-purpose" } },
        ]}
      />,
    )

    expect(app.text).toContain("2/3 active")
    expect(app.text).toContain("session 1")
    expect(app.text).not.toContain("36s")
    expect(app.text).not.toContain("↑")
    expect(app.text).not.toContain("413")
    expect(app.text).not.toContain("session 1 (this) · idle · s1")
    expect(app.text).toContain("Sleep 20s #1")
    expect(app.text).not.toContain("agent 1: sleeping")
    expect(app.text).toContain("Sleep 20s #2")
    expect(app.text).not.toContain("general-purpose")
    expect(app.text).not.toContain("toolu_")
  })

  test("agents drawer pulses running subagent markers down to the row background", () => {
    const app = renderBlock(
      <Chat.AgentsDrawer
        sessions={[{ sessionId: "s1", name: "session 1", status: "idle", startedAt: 1 }]}
        selfSessionId="s1"
        subagents={[{ id: "task-1", label: "Sleep 20s #1", status: "running" }]}
      />,
    )

    const row = app.lines.findIndex((line) => line.includes("Sleep 20s #1"))
    expect(row, app.text).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("●")
    expect(col, app.text).toBeGreaterThanOrEqual(0)
    const cell = app.cell(col, row)
    expect(cell.fg).toStrictEqual(cell.bg)
  })

  test("same-session subagent start notifications are hidden outside debug but completions remain as history", () => {
    const entries = [
      notificationEntry({
        id: "own-start",
        content: "[subagent Agent] started: Sleep 16s #2",
        fromSessionId: "s1",
        status: "started",
      }),
      notificationEntry({
        id: "own-completed",
        content: "[subagent Agent] completed: Sleep 16s #2",
        fromSessionId: "s1",
        status: "completed",
      }),
      notificationEntry({
        id: "peer",
        content: "[subagent Agent] completed: Sleep 18s #3",
        fromSessionId: "s2",
        status: "completed",
      }),
    ]

    expect(filterVisibleNotificationEntries(entries, false, "s1").map((entry) => entry.id)).toEqual([
      "own-completed",
      "peer",
    ])
    expect(filterVisibleNotificationEntries(entries, true, "s1").map((entry) => entry.id)).toEqual([
      "own-start",
      "own-completed",
      "peer",
    ])
  })

  test("same-session subagent completion notifications are hidden when the matching tool result is in history", () => {
    const messages = [
      messageWithTools({
        toolCalls: [{ id: "toolu_2", name: "Agent", input: { description: "Sleep 16s #2" } }],
        toolResults: [{ id: "toolu_2", output: "agent 2: done sleeping 16s" }],
      }),
    ]
    const entries = [
      notificationEntry({
        id: "own-completed",
        content: "[subagent Agent] completed: Sleep 16s #2 — agent 2: done sleeping 16s",
        ts: 1_250,
        fromSessionId: "s1",
        status: "completed",
        toolUseId: "toolu_2",
      }),
      notificationEntry({
        id: "own-other",
        content: "[subagent Agent] completed: Sleep 16s #3 — agent 3: done sleeping 16s",
        ts: 1_260,
        fromSessionId: "s1",
        status: "completed",
        toolUseId: "toolu_3",
      }),
    ]

    expect(filterVisibleNotificationEntries(entries, false, "s1", messages).map((entry) => entry.id)).toEqual([
      "own-other",
    ])
  })

  test("same-session subagent completion notifications are hidden from canonical chat events", () => {
    const events = [
      chatEvent("message.started", 1_000, { messageId: "u-live", role: "user" }),
      chatEvent("tool.started", 1_100, {
        toolId: "toolu_2",
        name: "Agent",
        input: { description: "Sleep 16s #2" },
      }),
      chatEvent("tool.completed", 1_200, {
        toolId: "toolu_2",
        status: "done",
        output: "agent 2: done sleeping 16s",
      }),
    ]
    const entries = [
      notificationEntry({
        id: "own-completed",
        content: "[subagent Agent] completed: Sleep 16s #2 — agent 2: done sleeping 16s",
        ts: 1_250,
        fromSessionId: "s1",
        status: "completed",
        toolUseId: "toolu_2",
      }),
      notificationEntry({
        id: "own-other",
        content: "[subagent Agent] completed: Sleep 16s #3 — agent 3: done sleeping 16s",
        ts: 1_260,
        fromSessionId: "s1",
        status: "completed",
        toolUseId: "toolu_3",
      }),
    ]

    expect(
      filterVisibleNotificationEntriesFromChatEvents(entries, false, "s1", events).map((entry) => entry.id),
    ).toEqual(["own-other"])
  })

  test("same-session Claude sidechain completions are hidden when their Agent row is already in history", () => {
    const messages = [
      messageWithTools({
        toolCalls: [{ id: "toolu_2", name: "Agent", input: { description: "Sleep 20s #2" } }],
        toolResults: [{ id: "toolu_2", output: "agent 2: done sleeping 20s" }],
      }),
    ]
    const entries = [
      notificationEntry({
        id: "sidechain-completed",
        content: "[subagent Agent] completed: Sleep 20s #2 — agent 2: done sleeping 20s",
        fromSessionId: "s1",
        status: "completed",
      }),
    ]

    expect(filterVisibleNotificationEntries(entries, false, "s1", messages).map((entry) => entry.id)).toEqual([])
  })

  test("same-session completion hiding keeps distinct labels when notification tool ids are reused", () => {
    const messages = [
      messageWithTools({
        toolCalls: [{ id: "toolu_2", name: "Agent", input: { description: "Sleep 16s #2" } }],
        toolResults: [{ id: "toolu_2", output: "agent 2: done sleeping 16s" }],
      }),
    ]
    const entries = [1, 2, 3].map((i) =>
      notificationEntry({
        id: `own-${i}`,
        content: `[subagent Agent] completed: Sleep 16s #${i} — agent ${i}: done sleeping 16s`,
        fromSessionId: "s1",
        status: "completed",
        toolUseId: "toolu_2",
      }),
    )

    expect(filterVisibleNotificationEntries(entries, false, "s1", messages).map((entry) => entry.id)).toEqual([
      "own-1",
      "own-3",
    ])
  })

  test("agents drawer stays hidden for only the main session", () => {
    const app = renderBlock(
      <Chat.AgentsDrawer
        sessions={[{ sessionId: "s1", name: "session 1", status: "idle", startedAt: 1 }]}
        selfSessionId="s1"
        defaultExpanded
      />,
    )

    expect(app.text.trim()).toBe("")
  })

  test("agents drawer stays hidden when only the main session and done subagents remain", () => {
    const app = renderBlock(
      <Chat.AgentsDrawer
        sessions={[{ sessionId: "s1", name: "session 1", status: "idle", startedAt: 1 }]}
        selfSessionId="s1"
        defaultExpanded
        subagents={[{ id: "task-1", label: "agent 1: done sleeping 20s", status: "done" }]}
      />,
    )

    expect(app.text.trim()).toBe("")
  })

  test("cmd-hovering an agents drawer row shows raw session and task details", async () => {
    const render = createRenderer({ cols: 120, rows: 24, kittyMode: true, autoRender: true })
    const app = render(
      <PopoverProvider>
        <Box width={120} height={24} flexDirection="column">
          <Chat.AgentsDrawer
            sessions={[{ sessionId: "s1", name: "session 1", status: "idle", startedAt: 1, model: "gpt-test" }]}
            selfSessionId="s1"
            defaultExpanded
            subagents={[
              {
                id: "task-1",
                label: "Sleep 20s #1",
                detail: "agent 1: sleeping",
                raw: { id: "task-1", name: "Task", input: { description: "Sleep 20s #1", prompt: "sleep" } },
              },
            ]}
          />
        </Box>
      </PopoverProvider>,
    )

    app.stdin.write(LEFT_SUPER_PRESS)
    const sessionRow = app.lines.findIndex((line) => line.includes("session 1"))
    expect(sessionRow, app.text).toBeGreaterThanOrEqual(0)
    await app.hover(app.lines[sessionRow]!.indexOf("session 1"), sessionRow)
    await new Promise((r) => setTimeout(r, 650))
    expect(app.text).toContain('"sessionId": "s1"')
    expect(app.text).toContain('"model": "gpt-test"')

    const taskRow = app.lines.findIndex((line) => line.includes("Sleep 2"))
    expect(taskRow, app.text).toBeGreaterThanOrEqual(0)
    await app.hover(app.lines[taskRow]!.indexOf("Sleep 2"), taskRow)
    await new Promise((r) => setTimeout(r, 650))
    expect(app.text).toContain('"name": "Task"')
    expect(app.text).toContain('"prompt": "sleep"')
  })
})
