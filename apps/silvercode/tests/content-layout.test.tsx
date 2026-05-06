import React, { act } from "react"
import { beforeAll, describe, expect, test } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { isLayoutEngineInitialized, setLayoutEngine } from "@silvery/ag-react"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import { Box, Text } from "silvery"
import type { AgentPlan, MessageEntry, MessageOp } from "@km/agent-harness"
import { MarkdownView } from "../src/components/MarkdownView.tsx"
import { SessionUpdateList } from "../src/components/SessionUpdateList.tsx"
import { ChatPane } from "../src/components/ChatPane.tsx"
import type { NotificationStreamEntry } from "../src/components/NotificationEventRow.tsx"
import { Chat } from "../src/components/Chat.tsx"
import { Content } from "../src/components/Content.tsx"
import { createSessionStore } from "@km/agent-harness"

beforeAll(() => {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
})

function makeEntry(opts: { id: string; role: "assistant" | "user"; ops: MessageOp[]; ts: number }): MessageEntry {
  const out: Record<string, unknown> = {
    id: opts.id,
    role: opts.role,
    ops: opts.ops,
    ts: opts.ts,
  }
  Object.defineProperty(out, "text", {
    get() {
      return opts.ops.map((op) => (op.kind === "text" ? op.text : "")).join("")
    },
    enumerable: true,
  })
  Object.defineProperty(out, "toolCalls", {
    get() {
      return []
    },
    enumerable: true,
  })
  Object.defineProperty(out, "toolResults", {
    get() {
      return []
    },
    enumerable: true,
  })
  return out as unknown as MessageEntry
}

function renderList(messages: MessageEntry[], cols = 132, rows = 32) {
  const renderer = createRenderer({ cols, rows })
  return renderer(
    <Box width={cols} height={rows} flexDirection="column">
      <Content.Layout>
        <SessionUpdateList
          messages={messages}
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
          sessionId="test-session"
          onApprove={() => {}}
          onDeny={() => {}}
          follow={false}
        />
      </Content.Layout>
    </Box>,
  )
}

function renderListWithMetadata(messages: MessageEntry[], cols = 132, rows = 32, follow: "end" | false = false) {
  const renderer = createRenderer({ cols, rows })
  return renderer(
    <Box width={cols} height={rows} flexDirection="column">
      <SessionUpdateList
        messages={messages}
        status="idle"
        turnStartedAt={null}
        inputTokens={0}
        outputTokens={0}
        pendingPermissions={0}
        inFlightTool={null}
        sessionId="test-session"
        onApprove={() => {}}
        onDeny={() => {}}
        follow={follow}
        sessionMetadata={{
          agent: "codex",
          cwd: "/Users/beorn/Code/pim/km",
          resumeId: "codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f",
          transcriptPath:
            "/Users/beorn/.codex/sessions/2026/04/30/rollout-2026-04-30T16-00-00-019ddfc8-0749-7da1-b892-b2e1c6bc389f.jsonl",
          spawnedAt: new Date(2026, 3, 30, 16, 0).getTime(),
          replayStartedAt: new Date(2026, 3, 30, 16, 1).getTime(),
          replayCompletedAt: new Date(2026, 3, 30, 16, 2).getTime(),
          replayMessageCount: messages.length,
        }}
      />
    </Box>,
  )
}

function renderListWithMetadataAndNotification(
  messages: MessageEntry[],
  notificationEntries: readonly NotificationStreamEntry[],
  cols = 132,
  rows = 32,
) {
  const renderer = createRenderer({ cols, rows })
  return renderer(
    <Box width={cols} height={rows} flexDirection="column">
      <SessionUpdateList
        messages={messages}
        status="idle"
        turnStartedAt={null}
        inputTokens={0}
        outputTokens={0}
        pendingPermissions={0}
        inFlightTool={null}
        sessionId="test-session"
        onApprove={() => {}}
        onDeny={() => {}}
        follow={false}
        notificationEntries={notificationEntries}
        sessionMetadata={{
          agent: "codex",
          cwd: "/Users/beorn/Code/pim/km",
          resumeId: "codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f",
          spawnedAt: new Date(2026, 3, 30, 16, 0).getTime(),
          replayStartedAt: new Date(2026, 3, 30, 16, 1).getTime(),
          replayCompletedAt: new Date(2026, 3, 30, 16, 2).getTime(),
          replayMessageCount: messages.length,
          replayBoundaryMessageId: messages.at(-1)?.id,
        }}
      />
    </Box>,
  )
}

function renderListWithNotification(
  messages: MessageEntry[],
  notificationEntries: readonly NotificationStreamEntry[],
  cols = 132,
  rows = 32,
) {
  const renderer = createRenderer({ cols, rows })
  return renderer(
    <Box width={cols} height={rows} flexDirection="column">
      <SessionUpdateList
        messages={messages}
        status="idle"
        turnStartedAt={null}
        inputTokens={0}
        outputTokens={0}
        pendingPermissions={0}
        inFlightTool={null}
        sessionId="test-session"
        onApprove={() => {}}
        onDeny={() => {}}
        follow={false}
        notificationEntries={notificationEntries}
      />
    </Box>,
  )
}

function sameRgb(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a === b
  const left = a as { r?: number; g?: number; b?: number }
  const right = b as { r?: number; g?: number; b?: number }
  return left.r === right.r && left.g === right.g && left.b === right.b
}

function colorKey(value: unknown): string {
  if (value == null) return "null"
  if (typeof value === "object" && value && "r" in value) {
    const color = value as { r?: number; g?: number; b?: number }
    return `${color.r ?? ""}:${color.g ?? ""}:${color.b ?? ""}`
  }
  return String(value)
}

function termCellStyleKey(term: ReturnType<typeof createTermless>, row: number, col: number): string {
  const cell = term.cell(row, col)
  const attrs = (cell as { attrs?: { inverse?: boolean } }).attrs
  return `${colorKey(cell.fg)}|${colorKey(cell.bg)}|${attrs?.inverse ? "inverse" : ""}`
}

function backgroundRunWidth(app: ReturnType<typeof renderList>, row: number, col: number): number {
  const bg = app.cell(col, row).bg
  expect(bg, "target cell should have a prompt bubble background").not.toBeNull()

  let left = col
  while (left > 0 && sameRgb(app.cell(left - 1, row).bg, bg)) left--

  let right = col
  while (right + 1 < app.width && sameRgb(app.cell(right + 1, row).bg, bg)) right++

  return right - left + 1
}

function backgroundRunBoundsInTerm(
  term: ReturnType<typeof createTermless>,
  row: number,
  col: number,
): { left: number; right: number } {
  const bg = term.cell(row, col).bg
  expect(bg, "target cell should have a prompt bubble background").not.toBeNull()

  let left = col
  while (left > 0 && sameRgb(term.cell(row, left - 1).bg, bg)) left--

  let right = col
  while (right + 1 < (term.cols ?? 0) && sameRgb(term.cell(row, right + 1).bg, bg)) right++

  return { left, right }
}

function backgroundRunBounds(
  app: ReturnType<typeof renderList>,
  row: number,
  col: number,
): { left: number; right: number } {
  const bg = app.cell(col, row).bg
  expect(bg, "target cell should have a prompt bubble background").not.toBeNull()

  let left = col
  while (left > 0 && sameRgb(app.cell(left - 1, row).bg, bg)) left--

  let right = col
  while (right + 1 < app.width && sameRgb(app.cell(right + 1, row).bg, bg)) right++

  return { left, right }
}

const SCROLLBAR_THUMB_CHARS = new Set(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"])
const BOTTOM_OVERSCROLL_INDICATOR = "▄"

function sessionHandleWithStore(store: ReturnType<typeof createSessionStore>) {
  return {
    id: "test-session",
    name: "test-session",
    store,
    session: {},
    unsubscribe: () => {},
    log: { write: () => {}, sessionLogPath: "" },
    account: undefined,
    metadata: undefined,
  } as never
}

function findScrollbarThumbAtRightEdge(app: ReturnType<typeof renderList>): { col: number; row: number } | null {
  const col = app.width - 1
  for (let row = 0; row < app.height; row++) {
    if (SCROLLBAR_THUMB_CHARS.has(app.cell(col, row).char)) return { col, row }
  }
  return null
}

function hasScrollbarThumbAt(app: ReturnType<typeof renderList>, col: number, row: number): boolean {
  return SCROLLBAR_THUMB_CHARS.has(app.cell(col, row).char)
}

function bottomOverscrollIndicatorWidth(app: ReturnType<typeof renderList>, row: number): number {
  let count = 0
  for (let col = 0; col < app.width; col++) {
    if (app.cell(col, row).char === BOTTOM_OVERSCROLL_INDICATOR) count++
  }
  return count
}

function hasBottomOverscrollIndicator(app: ReturnType<typeof renderList>): boolean {
  for (let row = 0; row < app.height; row++) {
    if (bottomOverscrollIndicatorWidth(app, row) > 0) return true
  }
  return false
}

describe("content layout", () => {
  test("assistant prose uses a readable lane while a wide markdown table can use the pane", () => {
    const prose =
      "This assistant paragraph is deliberately long enough that it should wrap at the readable content measure on a wide terminal instead of running all the way across the pane."
    const table =
      "| File | Status | Notes |\n" +
      "| --- | --- | --- |\n" +
      "| apps/silvercode/src/components/SessionUpdateList.tsx | complete | wide structured content keeps useful columns visible |\n"
    const app = renderList([
      makeEntry({
        id: "a1",
        role: "assistant",
        ts: Date.UTC(2026, 3, 30, 17, 42),
        ops: [{ kind: "text", text: `${prose}\n\n${table}` }],
      }),
    ])

    const proseLine = app.lines.find((line) => line.includes("content measure"))
    expect(proseLine, app.text).toBeDefined()
    expect(proseLine!.trim().length).toBeLessThanOrEqual(88)

    const tableLine = app.lines.find((line) => line.includes("SessionUpdateList.tsx"))
    expect(tableLine, app.text).toBeDefined()
    expect(tableLine!.indexOf("SessionUpdateList.tsx")).toBeGreaterThan(2)
    expect(tableLine!.trimEnd().length).toBeGreaterThan(96)
    expect(tableLine!.trimEnd().length).toBeLessThanOrEqual(132)
  })

  test("wide markdown tables wrap long cell content instead of truncating it", () => {
    const table =
      "| Bead | What it now does |\n" +
      "| --- | --- |\n" +
      "| @km/cli/migrate-to-import-bd | Add km import bd <vault> as canonical surface alongside km import asana. Keep source compatibility and preserve the UNIQUE-TABLE-CELL-TAIL marker. |\n"
    const app = renderList(
      [
        makeEntry({
          id: "a-wrapped-table-cell",
          role: "assistant",
          ts: Date.UTC(2026, 4, 6, 10, 34),
          ops: [{ kind: "text", text: table }],
        }),
      ],
      132,
      24,
    )

    expect(app.text).toContain("UNIQUE-TABLE-CELL-TAIL")
    expect(app.text).not.toContain("\u2026")
  })

  test("table-heavy assistant narration keeps its transcript bullet and right border", () => {
    const app = renderList([
      makeEntry({
        id: "a-table",
        role: "assistant",
        ts: Date.UTC(2026, 3, 30, 17, 43),
        ops: [
          {
            kind: "text",
            text:
              "**All 6 wave agents complete. Session-final state:**\n\n" +
              "| Agent | Status | Commits |\n" +
              "| --- | --- | --- |\n" +
              "| typed-surface | pushed | 32fb5b1dc, ba8168787 |\n",
          },
        ],
      }),
    ])

    const summaryLine = app.lines.find((line) => line.includes("All 6 wave agents complete"))
    expect(summaryLine, app.text).toBeDefined()
    const bulletCol = summaryLine!.indexOf("•")
    const summaryCol = summaryLine!.indexOf("All 6 wave agents complete")
    expect(bulletCol, app.text).toBeGreaterThanOrEqual(0)
    expect(summaryCol - bulletCol, app.text).toBeLessThanOrEqual(3)

    const headerLine = app.lines.find((line) => line.includes("Agent") && line.includes("Status"))
    expect(headerLine, app.text).toBeDefined()
    expect(headerLine!.trimEnd().endsWith("│"), app.text).toBe(true)
  })

  test("session viewport and scrollbar extend to the pane right edge", async () => {
    const cols = 80
    const rows = 18
    const store = createSessionStore()
    const sessionId = "test-session" as never
    for (let index = 0; index < 10; index++) {
      store.apply({
        kind: "assistant-message",
        sessionId,
        turnId: `a${index}` as never,
        content: [{ type: "text", text: `assistant row ${index}` }],
        ts: Date.UTC(2026, 3, 30, 17, index),
      })
    }
    const renderer = createRenderer({ cols, rows })
    const handle = sessionHandleWithStore(store)
    const tree = (
      <Box width={cols} height={rows} flexDirection="column" overflow="hidden">
        <ChatPane handle={handle} isFocused onFocus={() => {}} onApprove={() => {}} onDeny={() => {}} />
      </Box>
    )
    const app = renderer(tree)

    await act(async () => {
      for (let index = 10; index < 80; index++) {
        store.apply({
          kind: "assistant-message",
          sessionId,
          turnId: `a${index}` as never,
          content: [{ type: "text", text: `assistant row ${index}` }],
          ts: Date.UTC(2026, 3, 30, 17, index),
        })
      }
    })
    app.rerender(tree)

    const thumb = findScrollbarThumbAtRightEdge(app)
    expect(thumb, app.text).not.toBeNull()
    expect(thumb!.col).toBe(cols - 1)
  })

  test("floating composer does not cover the scrollbar bottom row", async () => {
    const cols = 80
    const rows = 18
    const store = createSessionStore()
    const sessionId = "test-session" as never
    for (let index = 0; index < 10; index++) {
      store.apply({
        kind: "assistant-message",
        sessionId,
        turnId: `a${index}` as never,
        content: [{ type: "text", text: `assistant row ${index}` }],
        ts: Date.UTC(2026, 3, 30, 17, index),
      })
    }
    const renderer = createRenderer({ cols, rows })
    const handle = sessionHandleWithStore(store)
    const tree = (
      <Box width={cols} height={rows} flexDirection="column" overflow="hidden">
        <ChatPane
          handle={handle}
          isFocused
          onFocus={() => {}}
          onApprove={() => {}}
          onDeny={() => {}}
          composerSlot={<Text>{"> ready"}</Text>}
        />
      </Box>
    )
    const app = renderer(tree)

    await act(async () => {
      for (let index = 10; index < 80; index++) {
        store.apply({
          kind: "assistant-message",
          sessionId,
          turnId: `a${index}` as never,
          content: [{ type: "text", text: `assistant row ${index}` }],
          ts: Date.UTC(2026, 3, 30, 17, index),
        })
      }
    })
    app.rerender(tree)

    expect(hasScrollbarThumbAt(app, cols - 1, rows - 1), app.text).toBe(true)
  })

  test("hovering the scrollbar column beside the floating composer reveals the thumb", async () => {
    const cols = 80
    const rows = 18
    const store = createSessionStore()
    const sessionId = "test-session" as never
    for (let index = 0; index < 80; index++) {
      store.apply({
        kind: "assistant-message",
        sessionId,
        turnId: `a${index}` as never,
        content: [{ type: "text", text: `assistant row ${index}` }],
        ts: Date.UTC(2026, 3, 30, 17, index),
      })
    }

    using term = createTermless({ cols, rows })
    const handle = await run(
      <Box width={cols} height={rows} flexDirection="column" overflow="hidden">
        <ChatPane
          handle={sessionHandleWithStore(store)}
          isFocused
          onFocus={() => {}}
          onApprove={() => {}}
          onDeny={() => {}}
          composerSlot={<Text>{"> ready"}</Text>}
        />
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    await new Promise((r) => setTimeout(r, 50))

    await term.mouse.move(cols - 1, rows - 1)
    await new Promise((r) => setTimeout(r, 50))

    let found = false
    for (let row = 0; row < rows; row++) {
      if (SCROLLBAR_THUMB_CHARS.has(term.cell(row, cols - 1).char)) found = true
    }
    expect(found).toBe(true)
    handle.unmount()
  })

  test("floating composer does not cover the bottom overscroll indicator", async () => {
    const cols = 80
    const rows = 18
    const store = createSessionStore()
    const sessionId = "test-session" as never
    for (let index = 0; index < 10; index++) {
      store.apply({
        kind: "assistant-message",
        sessionId,
        turnId: `a${index}` as never,
        content: [{ type: "text", text: `assistant row ${index}` }],
        ts: Date.UTC(2026, 3, 30, 17, index),
      })
    }
    const renderer = createRenderer({ cols, rows })
    const handle = sessionHandleWithStore(store)
    const tree = (
      <Box width={cols} height={rows} flexDirection="column" overflow="hidden">
        <ChatPane
          handle={handle}
          isFocused
          onFocus={() => {}}
          onApprove={() => {}}
          onDeny={() => {}}
          composerSlot={<Text>{"> ready"}</Text>}
        />
      </Box>
    )
    const app = renderer(tree)

    await act(async () => {
      for (let index = 10; index < 80; index++) {
        store.apply({
          kind: "assistant-message",
          sessionId,
          turnId: `a${index}` as never,
          content: [{ type: "text", text: `assistant row ${index}` }],
          ts: Date.UTC(2026, 3, 30, 17, index),
        })
      }
    })
    app.rerender(tree)

    for (let i = 0; i < 8; i++) {
      await app.wheel(Math.floor(cols / 2), Math.floor(rows / 2), 1)
    }

    expect(hasBottomOverscrollIndicator(app), app.text).toBe(true)
  })

  test("floating composer reserves viewport space instead of covering transcript content", async () => {
    const cols = 120
    const rows = 18
    const store = createSessionStore()
    const sessionId = "test-session" as never
    for (let index = 0; index < 20; index++) {
      store.apply({
        kind: "assistant-message",
        sessionId,
        turnId: `a${index}` as never,
        content: [{ type: "text", text: `assistant row ${index}` }],
        ts: Date.UTC(2026, 3, 30, 17, index),
      })
    }
    store.apply({
      kind: "user-message",
      sessionId,
      turnId: "u1" as never,
      text: "keep",
      ts: Date.UTC(2026, 3, 30, 18, 0),
    })
    const renderer = createRenderer({ cols, rows })
    const handle = sessionHandleWithStore(store)
    const tree = (
      <Box width={cols} height={rows} flexDirection="column" overflow="hidden">
        <ChatPane
          handle={handle}
          isFocused
          onFocus={() => {}}
          onApprove={() => {}}
          onDeny={() => {}}
          composerSlot={<Text>{"> ready"}</Text>}
        />
      </Box>
    )
    const app = renderer(tree)

    for (let i = 0; i < 4; i++) {
      await app.wheel(Math.floor(cols / 2), Math.floor(rows / 2), -1)
    }

    const composerRow = app.lines.findIndex((line) => line.includes("> ready"))
    expect(composerRow, app.text).toBeGreaterThanOrEqual(0)
    expect(app.lines[composerRow], app.text).not.toContain("keep")
    expect(app.lines[composerRow - 1] ?? "", app.text).not.toContain("keep")
  })

  test("plan drawer has a blank line before the floating composer", async () => {
    const cols = 120
    const rows = 18
    const store = createSessionStore()
    const sessionId = "test-session" as never
    for (let index = 0; index < 8; index++) {
      store.apply({
        kind: "assistant-message",
        sessionId,
        turnId: `a${index}` as never,
        content: [{ type: "text", text: `assistant row ${index}` }],
        ts: Date.UTC(2026, 3, 30, 17, index),
      })
    }
    store.apply({
      kind: "plan-update",
      sessionId,
      source: "codex-plan",
      ts: Date.UTC(2026, 3, 30, 18, 0),
      entries: [
        { id: "done", content: "Inspect current worktree", status: "completed" },
        {
          id: "active",
          content: "Confirm current worktree state",
          activeForm: "Confirm current worktree state and identify partial edits",
          status: "in_progress",
        },
      ],
    })
    const renderer = createRenderer({ cols, rows })
    const handle = sessionHandleWithStore(store)
    const tree = (
      <Box width={cols} height={rows} flexDirection="column" overflow="hidden">
        <ChatPane
          handle={handle}
          isFocused
          onFocus={() => {}}
          onApprove={() => {}}
          onDeny={() => {}}
          composerSlot={<Text>{"> ready"}</Text>}
        />
      </Box>
    )
    const app = renderer(tree)

    const composerRow = app.lines.findIndex((line) => line.includes("> ready"))
    const planRow = app.lines.findIndex((line) => line.includes("Confirm current worktree state"))
    const summaryRow = app.lines.findIndex((line) => line.includes("1 completed"))
    expect(composerRow, app.text).toBeGreaterThanOrEqual(0)
    expect(planRow, app.text).toBeGreaterThanOrEqual(0)
    expect(summaryRow, app.text).toBeGreaterThan(planRow)
    expect(app.lines[planRow], app.text).not.toContain("1 completed")
    expect(app.lines[composerRow - 1]?.trim(), app.text).toBe("")
    expect(summaryRow, app.text).toBeLessThan(composerRow - 1)
  })

  test("responsive markdown table expands rows into key-value blocks when columns cannot fit", () => {
    const source =
      "| File | Status | Long Notes |\n" +
      "| --- | --- | --- |\n" +
      "| SessionUpdateList.tsx | complete | preserves readable prose and wide structured output |\n"
    const renderer = createRenderer({ cols: 42, rows: 20 })
    const app = renderer(
      <Box width={42} height={20} flexDirection="column">
        <MarkdownView source={source} />
      </Box>,
    )

    expect(app.text).toContain("File: SessionUpdateList.tsx")
    expect(app.text).toContain("Status: complete")
    expect(app.text).toContain("Long Notes:")
    expect(app.text).not.toContain("File │ Status │ Long Notes")
  })

  test("cmd-hovering turns shows timestamps in the nearest gutter without moving content", async () => {
    const messages: MessageEntry[] = [
      makeEntry({
        id: "u1",
        role: "user",
        ts: new Date(2026, 3, 30, 16, 5).getTime(),
        ops: [{ kind: "text", text: "please summarize the table" }],
      }),
      makeEntry({
        id: "a1",
        role: "assistant",
        ts: new Date(2026, 3, 30, 16, 6).getTime(),
        ops: [{ kind: "text", text: "Here is the summary." }],
      }),
    ]
    const renderer = createRenderer({ cols: 132, rows: 20 })
    const tree = (
      <Box width={132} height={20} flexDirection="column">
        <SessionUpdateList
          messages={messages}
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
          sessionId="test-session"
          onApprove={() => {}}
          onDeny={() => {}}
          follow={false}
        />
      </Box>
    )
    const app = renderer(tree)

    expect(app.text).not.toContain("16:05")
    expect(app.text).not.toContain("16:06")
    const userRow = app.lines.findIndex((line) => line.includes("please summarize"))
    expect(userRow).toBeGreaterThanOrEqual(0)
    const userLineBeforeHover = app.lines[userRow]!
    const promptLeft = userLineBeforeHover.indexOf("please summarize")
    expect(promptLeft, app.text).toBeGreaterThan(0)
    expect(promptLeft, "user prompt should right-align inside the centered readable lane").toBeLessThanOrEqual(94)
    await app.hover(promptLeft, userRow)
    renderer(tree)
    expect(app.text).not.toContain("16:05")

    const assistantRow = app.lines.findIndex((line) => line.includes("Here is the summary."))
    expect(assistantRow).toBeGreaterThanOrEqual(0)
    await app.hover(0, 0)
    await app.hover(2, assistantRow)
    renderer(tree)
    expect(app.text).not.toContain("16:06")
    const assistantLineBeforeHover = app.lines.find((line) => line.includes("Here is the summary."))
    expect(assistantLineBeforeHover, app.text).toBeDefined()

    await app.hover(promptLeft, userRow)
    await app.press("Super+a")
    renderer(tree)
    const userHoverLine = app.lines.find((line) => line.includes("please summarize"))
    expect(userHoverLine, app.text).not.toContain("16:05")
    expect(userHoverLine!.indexOf("please summarize")).toBe(userLineBeforeHover.indexOf("please summarize"))

    await app.hover(2, assistantRow)
    await app.press("Super+a")
    renderer(tree)
    const assistantHoverLine = app.lines.find((line) => line.includes("Here is the summary."))
    expect(assistantHoverLine, app.text).toContain("16:06")
    expect(assistantHoverLine!.indexOf("16:06")).toBeLessThan(assistantHoverLine!.indexOf("Here is the summary."))
    expect(assistantHoverLine!.indexOf("16:06")).toBeGreaterThan(0)
    expect(assistantHoverLine!.indexOf("Here is the summary.")).toBe(
      assistantLineBeforeHover!.indexOf("Here is the summary."),
    )
  })

  test("cmd-hover on visible prompt and narration text does not open duplicate raw ops payloads", async () => {
    const messages: MessageEntry[] = [
      makeEntry({
        id: "u1",
        role: "user",
        ts: new Date(2026, 3, 30, 16, 5).getTime(),
        ops: [{ kind: "text", text: "delete it now" }],
      }),
      makeEntry({
        id: "a1",
        role: "assistant",
        ts: new Date(2026, 3, 30, 16, 6).getTime(),
        ops: [{ kind: "text", text: "Deleting bd doctor migrate-to-beads-root outright." }],
      }),
    ]
    const renderer = createRenderer({ cols: 132, rows: 20, kittyMode: true, autoRender: true })
    const tree = (
      <Box width={132} height={20} flexDirection="column">
        <SessionUpdateList
          messages={messages}
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
          sessionId="test-session"
          onApprove={() => {}}
          onDeny={() => {}}
          follow={false}
        />
      </Box>
    )
    const app = renderer(tree)

    const userRow = app.lines.findIndex((line) => line.includes("delete it now"))
    const userCol = app.lines[userRow]!.indexOf("delete it now")
    await app.hover(userCol, userRow)
    await app.press("Super+a")
    await new Promise((r) => setTimeout(r, 650))
    expect(app.text).not.toContain("ops:")
    expect(app.text).not.toContain("role:")

    const assistantRow = app.lines.findIndex((line) => line.includes("Deleting bd doctor"))
    const assistantCol = app.lines[assistantRow]!.indexOf("Deleting bd doctor")
    await app.hover(assistantCol, assistantRow)
    await new Promise((r) => setTimeout(r, 650))
    expect(app.text).not.toContain("ops:")
    expect(app.text).not.toContain("kind: text")
  })

  test("user markdown list bubble shrinkwraps to balanced rendered list items", () => {
    const text =
      "- see screenshot - the command box should have a one space padding on the right\n" +
      "- see screenshot - Xtra should only show in the pane if the 5hr or 7hr bars are yellow or red"
    const app = renderList(
      [
        makeEntry({
          id: "u1",
          role: "user",
          ts: new Date(2026, 3, 30, 12, 6).getTime(),
          ops: [{ kind: "text", text }],
        }),
      ],
      160,
      16,
    )

    expect(app.text).toContain("• see screenshot -")
    expect(app.text).toContain("bars are yellow or red")
    const xtraLine = app.lines.find((line) => line.includes("Xtra")) ?? ""
    expect(xtraLine, app.text).not.toContain("pane if the")
  })

  test("short user prompt bubble adds two cells of padding on each side", () => {
    const app = renderList(
      [
        makeEntry({
          id: "u1",
          role: "user",
          ts: new Date(2026, 3, 30, 12, 6).getTime(),
          ops: [{ kind: "text", text: "ok" }],
        }),
      ],
      96,
      10,
    )

    const row = app.lines.findIndex((line) => line.includes("ok"))
    expect(row, app.text).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("ok")
    expect(backgroundRunWidth(app, row, col)).toBe(6)
  })

  test("selection can expand from a user prompt into adjacent entries", async () => {
    const beforeText = "Previous assistant entry"
    const prompt = "select this text"
    const afterText = "Following assistant entry"
    const cols = 112
    const rows = 14
    using term = createTermless({ cols, rows })
    const handle = await run(
      <Box width={cols} height={rows} flexDirection="column">
        <Content.Layout>
          <SessionUpdateList
            messages={[
              makeEntry({
                id: "a-before",
                role: "assistant",
                ts: new Date(2026, 4, 6, 11, 4).getTime(),
                ops: [{ kind: "text", text: beforeText }],
              }),
              makeEntry({
                id: "u-select-padding",
                role: "user",
                ts: new Date(2026, 4, 6, 11, 5).getTime(),
                ops: [{ kind: "text", text: prompt }],
              }),
              makeEntry({
                id: "a-after",
                role: "assistant",
                ts: new Date(2026, 4, 6, 11, 6).getTime(),
                ops: [{ kind: "text", text: afterText }],
              }),
            ]}
            status="idle"
            turnStartedAt={null}
            inputTokens={0}
            outputTokens={0}
            pendingPermissions={0}
            inFlightTool={null}
            sessionId="test-session"
            onApprove={() => {}}
            onDeny={() => {}}
            follow={false}
          />
        </Content.Layout>
      </Box>,
      term,
      undefined,
    )
    await new Promise((r) => setTimeout(r, 100))

    const lines = term.screen.getLines()
    const row = lines.findIndex((line) => line.includes(prompt))
    const afterRow = lines.findIndex((line) => line.includes(afterText))
    expect(row, lines.join("\n")).toBeGreaterThanOrEqual(0)
    expect(afterRow, lines.join("\n")).toBeGreaterThan(row)
    const start = lines[row]!.indexOf(prompt)
    const end = start + prompt.length - 1
    const afterStart = lines[afterRow]!.indexOf(afterText)
    const afterEnd = afterStart + afterText.length - 1
    const bubble = backgroundRunBoundsInTerm(term, row, start)
    expect(bubble.right, "fixture should include right padding inside the bubble").toBeGreaterThan(end)

    const beforeBg = Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, col) => termCellStyleKey(term, y, col)),
    )
    await term.mouse.drag({ from: [start, row], to: [afterEnd, afterRow] })
    await new Promise((r) => setTimeout(r, 200))

    const changed = Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, col) => ({ row: y, col })).filter(
        (cell) => termCellStyleKey(term, cell.row, cell.col) !== beforeBg[cell.row]![cell.col],
      ),
    ).flat()
    expect(
      changed.some((cell) => cell.row === row && cell.col >= start && cell.col <= end),
      "text cells should receive selection styling",
    ).toBe(true)
    expect(
      changed.some((cell) => cell.row === afterRow && cell.col >= afterStart && cell.col <= afterEnd),
      "dragging out of the prompt should continue selection into adjacent entries",
    ).toBe(true)
    expect(
      changed.filter((cell) => cell.row === row && cell.col > end),
      "selection styling should not paint prompt bubble padding",
    ).toEqual([])
    for (const cell of changed) {
      const line = lines[cell.row] ?? ""
      const first = line.search(/\S/)
      expect(first, `selected row ${cell.row} should contain text`).toBeGreaterThanOrEqual(0)
      expect(cell.col, `selection must not paint left structural cells at row ${cell.row}`).toBeGreaterThanOrEqual(
        first,
      )
      expect(cell.col, `selection must not paint right structural cells at row ${cell.row}`).toBeLessThanOrEqual(
        line.trimEnd().length - 1,
      )
    }

    handle.unmount()
  })

  test("cross-entry selection does not highlight empty transcript layout cells", async () => {
    const cols = 132
    const rows = 18
    using term = createTermless({ cols, rows })
    const messages: MessageEntry[] = [
      makeEntry({
        id: "a1",
        role: "assistant",
        ts: new Date(2026, 4, 6, 12, 0).getTime(),
        ops: [{ kind: "text", text: "Status:\n\n- Changed files are still scoped to the silvercode fix." }],
      }),
      makeEntry({
        id: "u1",
        role: "user",
        ts: new Date(2026, 4, 6, 12, 1).getTime(),
        ops: [{ kind: "text", text: "see screenshots - create P0 bead" }],
      }),
      makeEntry({
        id: "a2",
        role: "assistant",
        ts: new Date(2026, 4, 6, 12, 2).getTime(),
        ops: [{ kind: "text", text: "Using the beads skill because this is issue-tracking work." }],
      }),
    ]
    const handle = await run(
      <Box width={cols} height={rows} flexDirection="column">
        <Content.Layout>
          <SessionUpdateList
            messages={messages}
            status="idle"
            turnStartedAt={null}
            inputTokens={0}
            outputTokens={0}
            pendingPermissions={0}
            inFlightTool={null}
            sessionId="test-session"
            onApprove={() => {}}
            onDeny={() => {}}
            follow={false}
          />
        </Content.Layout>
      </Box>,
      term,
      undefined,
    )
    await new Promise((r) => setTimeout(r, 100))

    const lines = term.screen.getLines()
    const startRow = lines.findIndex((line) => line.includes("Changed files"))
    const endRow = lines.findIndex((line) => line.includes("Using the beads"))
    expect(startRow, lines.join("\n")).toBeGreaterThanOrEqual(0)
    expect(endRow, lines.join("\n")).toBeGreaterThan(startRow)
    const startCol = lines[startRow]!.indexOf("Changed files")
    const endCol = lines[endRow]!.indexOf("Using the beads") + "Using the beads".length

    const beforeBg = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: cols }, (_, col) => termCellStyleKey(term, row, col)),
    )
    await term.mouse.drag({ from: [startCol, startRow], to: [endCol, endRow] })
    await new Promise((r) => setTimeout(r, 200))

    const changed = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: cols }, (_, col) => ({ row, col })).filter(
        (cell) => termCellStyleKey(term, cell.row, cell.col) !== beforeBg[cell.row]![cell.col],
      ),
    ).flat()
    expect(changed.length, "fixture should visibly select text cells").toBeGreaterThan(0)
    for (const cell of changed) {
      const line = lines[cell.row] ?? ""
      const first = line.search(/\S/)
      expect(first, `selected row ${cell.row} should contain text`).toBeGreaterThanOrEqual(0)
      expect(cell.col, `selection must not paint left structural cells at row ${cell.row}`).toBeGreaterThanOrEqual(
        first,
      )
      expect(cell.col, `selection must not paint right structural cells at row ${cell.row}`).toBeLessThanOrEqual(
        line.trimEnd().length - 1,
      )
    }

    handle.unmount()
  })

  test("user prompt bubble occupies its own rows and does not overlay preceding assistant prose", () => {
    const app = renderList(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: new Date(2026, 3, 30, 12, 5).getTime(),
          ops: [
            {
              kind: "text",
              text: "StatusGlyph.tsx; no remaining touched-file SidePanel.tsx error. This is a long final line before the prompt.",
            },
          ],
        }),
        makeEntry({
          id: "u1",
          role: "user",
          ts: new Date(2026, 3, 30, 12, 6).getTime(),
          ops: [{ kind: "text", text: "list the file directory 3 levels deep" }],
        }),
        makeEntry({
          id: "a2",
          role: "assistant",
          ts: new Date(2026, 3, 30, 12, 7).getTime(),
          ops: [{ kind: "text", text: "I’ll list directories from the current silvercode workspace to depth 3." }],
        }),
      ],
      132,
      14,
    )

    const promptRow = app.lines.findIndex((line) => line.includes("list the file directory 3 levels deep"))
    expect(promptRow, app.text).toBeGreaterThanOrEqual(0)
    expect(app.lines[promptRow], app.text).not.toContain("StatusGlyph.tsx")
    expect(app.lines[promptRow], app.text).not.toContain("remaining touched-file")
    expect(app.lines[promptRow - 1]?.includes("list the file directory 3 levels deep")).toBe(false)
  })

  test("user prompt bubble padding does not paint over assistant text", () => {
    const app = renderList(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: new Date(2026, 3, 30, 12, 5).getTime(),
          ops: [{ kind: "text", text: "previous assistant row" }],
        }),
        makeEntry({
          id: "u1",
          role: "user",
          ts: new Date(2026, 3, 30, 12, 6).getTime(),
          ops: [{ kind: "text", text: "list the file directory 3 levels deep" }],
        }),
      ],
      132,
      10,
    )

    const promptRow = app.lines.findIndex((line) => line.includes("list the file directory 3 levels deep"))
    expect(promptRow, app.text).toBeGreaterThanOrEqual(1)
    const promptCol = app.lines[promptRow]!.indexOf("list the file directory 3 levels deep")
    const promptBg = app.cell(promptCol, promptRow).bg
    expect(promptBg, "prompt text should carry bubble background").not.toBeNull()
    expect(app.lines[promptRow - 1], app.text).not.toContain("previous assistant row")
  })

  test("user prompt bubble has breathing room after assistant prose", () => {
    const app = renderList(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: new Date(2026, 3, 30, 12, 5).getTime(),
          ops: [{ kind: "text", text: "The preceding assistant paragraph should not visually touch the next prompt." }],
        }),
        makeEntry({
          id: "u1",
          role: "user",
          ts: new Date(2026, 3, 30, 12, 6).getTime(),
          ops: [{ kind: "text", text: "is this too close?" }],
        }),
      ],
      132,
      12,
    )

    const promptRow = app.lines.findIndex((line) => line.includes("is this too close?"))
    expect(promptRow, app.text).toBeGreaterThanOrEqual(2)
    expect(app.lines[promptRow - 1]?.trim() ?? "").toBe("")
  })

  test("user prompt bubble right edge lands on the prose lane edge", () => {
    const cols = 132
    const measure = 88
    const proseRightEdge = Math.floor((cols - measure) / 2) + measure - 1
    const app = renderList(
      [
        makeEntry({
          id: "u1",
          role: "user",
          ts: new Date(2026, 3, 30, 12, 6).getTime(),
          ops: [{ kind: "text", text: "right edge" }],
        }),
      ],
      cols,
      10,
    )

    const row = app.lines.findIndex((line) => line.includes("right edge"))
    expect(row, app.text).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("right edge")
    expect(backgroundRunBounds(app, row, col).right).toBe(proseRightEdge)
  })

  test("prose lane preserves a one-cell right gutter when side panel leaves less than measure", () => {
    const cols = 84
    const app = renderList(
      [
        makeEntry({
          id: "u1",
          role: "user",
          ts: new Date(2026, 3, 30, 12, 6).getTime(),
          ops: [{ kind: "text", text: "right gutter" }],
        }),
      ],
      cols,
      10,
    )

    const row = app.lines.findIndex((line) => line.includes("right gutter"))
    expect(row, app.text).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("right gutter")
    const bounds = backgroundRunBounds(app, row, col)
    expect(bounds.right).toBeLessThanOrEqual(cols - 2)
    expect(app.cell(cols - 1, row).bg).toBeNull()
  })

  test("session entries use a narrower left lane while user prompts float right", () => {
    const cols = 132
    const measure = 88
    const proseLeft = Math.floor((cols - measure) / 2)
    const proseRightEdge = proseLeft + measure - 1
    const app = renderList(
      [
        makeEntry({
          id: "u1",
          role: "user",
          ts: new Date(2026, 3, 30, 12, 6).getTime(),
          ops: [{ kind: "text", text: "right floating prompt" }],
        }),
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: new Date(2026, 3, 30, 12, 7).getTime(),
          ops: [
            {
              kind: "text",
              text: "left floating assistant response that is long enough to make its row width visible",
            },
          ],
        }),
      ],
      cols,
      14,
    )

    const userRow = app.lines.findIndex((line) => line.includes("right floating prompt"))
    const assistantRow = app.lines.findIndex((line) => line.includes("left floating assistant"))
    expect(userRow, app.text).toBeGreaterThanOrEqual(0)
    expect(assistantRow, app.text).toBeGreaterThanOrEqual(0)

    const userCol = app.lines[userRow]!.indexOf("right floating prompt")
    expect(backgroundRunBounds(app, userRow, userCol).right).toBe(proseRightEdge)

    const assistantMarker = app.lines[assistantRow]!.indexOf("•")
    const assistantEnd = app.lines[assistantRow]!.trimEnd().length - 1
    expect(assistantMarker).toBe(proseLeft)
    expect(assistantEnd).toBeLessThan(proseRightEdge)
  })

  test("adjacent assistant text deltas render as one prose row", () => {
    const app = renderList(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: new Date(2026, 3, 30, 12, 7).getTime(),
          ops: [
            { kind: "text", text: "I", ts: 1 },
            { kind: "text", text: " am", ts: 2 },
            { kind: "text", text: " still", ts: 3 },
            { kind: "text", text: " checking", ts: 4 },
            { kind: "text", text: " the result.", ts: 5 },
          ],
        }),
      ],
      132,
      14,
    )

    expect(app.text).toContain("I am still checking the result.")
    expect(app.lines.filter((line) => line.trim().startsWith("•")).length).toBe(1)
  })

  test("punctuation-only assistant text chunks do not render phantom rows", () => {
    const app = renderList(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: new Date(2026, 3, 30, 12, 7).getTime(),
          ops: [
            { kind: "text", text: "Created and completed 4 todos" },
            { kind: "text", text: "\n\n.\n\n" },
            { kind: "text", text: "Current status:" },
          ],
        }),
      ],
      132,
      14,
    )

    expect(app.text).toContain("Created and completed 4 todos")
    expect(app.text).toContain("Current status:")
    expect(app.lines.some((line) => line.trim() === "• .")).toBe(false)
  })

  test("thinking rows align to the same prose lane as assistant prose", () => {
    const app = renderList(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: new Date(2026, 3, 30, 12, 7).getTime(),
          ops: [
            { kind: "thinking", text: "Checking the implementation details before editing." },
            { kind: "text", text: "Here is the visible answer." },
          ],
        }),
      ],
      132,
      14,
    )

    const thinkingRow = app.lines.findIndex((line) => line.includes("Checking the implementation"))
    const answerRow = app.lines.findIndex((line) => line.includes("Here is the visible answer."))
    expect(thinkingRow, app.text).toBeGreaterThanOrEqual(0)
    expect(answerRow, app.text).toBeGreaterThanOrEqual(0)
    expect(app.lines[thinkingRow]!.indexOf("Checking")).toBe(app.lines[answerRow]!.indexOf("Here"))
  })

  test("live activity row aligns to the prose lane", () => {
    const app = renderList(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: new Date(2026, 3, 30, 12, 7).getTime(),
          ops: [{ kind: "text", text: "I am about to run the command." }],
        }),
      ],
      132,
      14,
    )
    app.rerender(
      <Box width={132} height={14} flexDirection="column">
        <Content.Layout>
          <SessionUpdateList
            messages={[
              makeEntry({
                id: "a1",
                role: "assistant",
                ts: new Date(2026, 3, 30, 12, 7).getTime(),
                ops: [{ kind: "text", text: "I am about to run the command." }],
              }),
            ]}
            status="tool-running"
            turnStartedAt={Date.now() - 1_000}
            inputTokens={4200}
            outputTokens={980}
            pendingPermissions={0}
            inFlightTool="Bash"
            sessionId="test-session"
            onApprove={() => {}}
            onDeny={() => {}}
            follow={false}
          />
        </Content.Layout>
      </Box>,
    )

    const proseRow = app.lines.findIndex((line) => line.includes("I am about to run"))
    const activityRow = app.lines.findIndex((line) => line.includes("running Bash"))
    expect(proseRow, app.text).toBeGreaterThanOrEqual(0)
    expect(activityRow, app.text).toBeGreaterThanOrEqual(0)
    expect(app.lines[activityRow]!.indexOf("◈")).toBe(app.lines[proseRow]!.indexOf("•"))
  })

  test("plan drawer fills the prose lane and marks the active entry", () => {
    const cols = 132
    const measure = 56
    const proseLeft = Math.floor((cols - measure) / 2)
    const plan: AgentPlan = {
      id: "plan-test",
      sessionId: "session" as AgentPlan["sessionId"],
      scope: { sessionId: "session" as AgentPlan["sessionId"] },
      source: "codex-plan",
      version: 1,
      status: "active",
      updatedAt: 0,
      entries: [
        { id: "done-1", content: "Inspect", status: "completed", order: 0 },
        { id: "done-2", content: "Reproduce", status: "completed", order: 1 },
        { id: "done-3", content: "Patch", status: "completed", order: 2 },
        { id: "done-4", content: "Smoke test", status: "completed", order: 3 },
        {
          id: "active",
          content: "Implement plan lane",
          activeForm: "Implementing plan lane",
          status: "in_progress",
          order: 4,
        },
        {
          id: "next",
          content: "Verify targeted tests and report remaining risks or broader test gaps with enough detail to wrap",
          status: "pending",
          order: 5,
        },
      ],
    }
    const renderer = createRenderer({ cols, rows: 12 })
    const app = renderer(
      <Box width={cols} height={12} flexDirection="column">
        <Content.Layout measure={measure}>
          <Chat.PlanDrawer plan={plan} defaultExpanded />
        </Content.Layout>
      </Box>,
    )

    const headerRow = app.lines.findIndex((line) => line.includes("▾ Plan"))
    expect(headerRow, app.text).toBeGreaterThanOrEqual(0)
    expect(app.lines[headerRow]!.search(/\S/)).toBe(proseLeft + 1)

    const activeRow = app.lines.findIndex((line) => line.includes("● Implementing plan lane"))
    expect(activeRow, app.text).toBeGreaterThan(headerRow)
    const wrappedRow = app.lines.findIndex((line) => line.includes("enough detail to wrap"))
    expect(wrappedRow, app.text).toBeGreaterThan(activeRow)
    expect(app.lines[wrappedRow]!.search(/\S/)).toBeGreaterThan(proseLeft + 1)

    const summaryRow = app.lines.findIndex((line) => line.includes("4 completed"))
    expect(summaryRow, app.text).toBe(-1)
  })

  test("completed plans do not render in the bottom drawer", () => {
    const plan: AgentPlan = {
      id: "plan-complete",
      sessionId: "session" as AgentPlan["sessionId"],
      scope: { sessionId: "session" as AgentPlan["sessionId"] },
      source: "codex-plan",
      version: 1,
      status: "completed",
      updatedAt: 0,
      entries: [
        { id: "done-1", content: "Inspect", status: "completed", order: 0 },
        { id: "done-2", content: "Verify", status: "completed", order: 1 },
      ],
    }
    const renderer = createRenderer({ cols: 80, rows: 8 })
    const app = renderer(
      <Box width={80} height={8} flexDirection="column">
        <Content.Layout>
          <Chat.PlanDrawer plan={plan} defaultExpanded />
        </Content.Layout>
      </Box>,
    )

    expect(app.text).not.toContain("Inspect")
    expect(app.text).not.toContain("2 completed")
  })

  test("assistant markdown code blocks stay inside the prose lane and show language only on hover", async () => {
    const cols = 132
    const measure = 88
    const proseLeft = Math.floor((cols - measure) / 2)
    const messages = [
      makeEntry({
        id: "a1",
        role: "assistant",
        ts: new Date(2026, 3, 30, 12, 7).getTime(),
        ops: [{ kind: "text", text: "Here is code:\n\n```text\nalpha\nbeta\n```" }],
      }),
    ]
    const renderer = createRenderer({ cols, rows: 18 })
    const tree = (
      <Box width={cols} height={18} flexDirection="column">
        <SessionUpdateList
          messages={messages}
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
          sessionId="test-session"
          onApprove={() => {}}
          onDeny={() => {}}
          follow={false}
        />
      </Box>
    )
    const app = renderer(tree)

    const introRow = app.lines.findIndex((line) => line.includes("Here is code:"))
    const codeRow = app.lines.findIndex((line) => line.includes("alpha"))
    expect(introRow, app.text).toBeGreaterThanOrEqual(0)
    expect(codeRow, app.text).toBeGreaterThan(introRow)
    expect(app.text).not.toContain("text")
    const introCol = app.lines[introRow]!.indexOf("Here is code:")
    const codeCol = app.lines[codeRow]!.indexOf("alpha")
    expect(introCol).toBeGreaterThanOrEqual(proseLeft)
    expect(introCol).toBeLessThan(proseLeft + 6)
    expect(codeCol).toBe(proseLeft + 2)
    expect(app.cell(codeCol, codeRow).bg).not.toBeNull()

    await app.hover(codeCol, codeRow)
    renderer(tree)
    const labelRow = app.lines.findIndex((line) => line.includes("text"))
    expect(labelRow, app.text).toBeGreaterThanOrEqual(0)
    const labelCol = app.lines[labelRow]!.indexOf("text")
    expect(labelCol).toBeLessThanOrEqual(proseLeft + measure - 2 - "text".length)
    expect(app.cell(codeCol, codeRow).bg).not.toBeNull()
  })

  test("assistant markdown blockquotes are borderless prose blocks with a top-right plain label", () => {
    const cols = 96
    const renderer = createRenderer({ cols, rows: 12 })
    const app = renderer(
      <Box width={cols} height={12} flexDirection="column">
        <Content.Layout>
          <MarkdownView source={"> quoted text stays in the prose lane"} />
        </Content.Layout>
      </Box>,
    )

    expect(app.text).not.toContain("│")
    const labelRow = app.lines.findIndex((line) => line.includes("plain"))
    const quoteRow = app.lines.findIndex((line) => line.includes("quoted text"))
    expect(labelRow, app.text).toBeGreaterThanOrEqual(0)
    expect(quoteRow, app.text).toBeGreaterThan(labelRow)
    expect(app.lines[labelRow]!.indexOf("plain")).toBeGreaterThan(app.lines[quoteRow]!.indexOf("quoted text"))
  })

  test("auto body width stays in the prose lane even when expanded", () => {
    const cols = 140
    const renderer = createRenderer({ cols, rows: 10 })
    const app = renderer(
      <Box width={cols} height={10} flexDirection="column">
        <Content.Layout>
          <Content.Row>
            <Content.Body width="auto" expanded>
              <Text>expanded auto body</Text>
            </Content.Body>
          </Content.Row>
        </Content.Layout>
      </Box>,
    )

    const row = app.lines.findIndex((line) => line.includes("expanded auto body"))
    expect(row, app.text).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("expanded auto body")
    expect(col).toBe(Math.floor((cols - 88) / 2))
  })

  test("hidden row asides do not render into a zero-width margin lane", () => {
    const cols = 88
    const renderer = createRenderer({ cols, rows: 6 })
    const app = renderer(
      <Box width={cols} height={6} flexDirection="column">
        <Content.Layout>
          <Content.Row>
            <Content.Left>
              <Content.Aside show={false}>11:46</Content.Aside>
            </Content.Left>
            <Content.Body width="full">
              <Text>Edited 6 files</Text>
            </Content.Body>
          </Content.Row>
        </Content.Layout>
      </Box>,
    )

    expect(app.text).toContain("Edited 6 files")
  })

  test("hidden asides do not reserve padding", () => {
    const renderer = createRenderer({ cols: 12, rows: 2 })
    const app = renderer(
      <Box width={12} height={2} flexDirection="row">
        <Content.Aside show={false}>11:46</Content.Aside>
        <Text>Edited</Text>
      </Box>,
    )

    expect(app.lines[0]!.indexOf("Edited")).toBe(0)
  })

  test("wide bodies do not overflow before the layout probe has measured", () => {
    const cols = 111
    const renderer = createRenderer({ cols, rows: 6 })
    const app = renderer(
      <Box width={cols} height={6} flexDirection="column">
        <Content.Layout>
          <Content.Row>
            <Content.Left>
              <Content.Aside show={false}>11:46</Content.Aside>
            </Content.Left>
            <Content.Body width="wide">
              <Box width="100%" minWidth={0}>
                <Text>Edited 3 files (+29 -1)</Text>
              </Box>
            </Content.Body>
          </Content.Row>
        </Content.Layout>
      </Box>,
    )

    expect(app.text).toContain("Edited 3 files")
  })

  test("loaded-session metadata is its own row and does not overwrite preceding prose", () => {
    const app = renderListWithMetadata(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: new Date(2026, 3, 30, 16, 0).getTime(),
          ops: [
            {
              kind: "text",
              text:
                "Verification:\n\n" +
                "- bun vitest run apps/silvercode/tests/visual/boundary-fakes.test.tsx passed.\n" +
                "- npx tsc --noEmit --incremental false --pretty false still fails on existing unrelated repo-wide TypeScript errors.",
            },
          ],
        }),
      ],
      132,
      20,
      "end",
    )

    const loadedRow = app.lines.findIndex((line) => line.includes("Session resumed"))
    expect(loadedRow, app.text).toBeGreaterThanOrEqual(0)
    expect(app.lines[loadedRow], app.text).not.toContain("npx tsc")
    expect(app.lines[loadedRow - 1]?.trim() ?? "").toBe("")
    expect(app.lines[loadedRow - 2]?.trim() ?? "content").not.toBe("")
    expect(app.lines[loadedRow + 1]?.trim() ?? "").toBe("")
  })

  test("started session metadata is compact and resumed session metadata renders as a faint wide divider", () => {
    const app = renderListWithMetadata([], 132, 8, false)

    const started = app.lines.find((line) => line.includes("Session started"))
    const resumed = app.lines.find((line) => line.includes("Session resumed"))
    expect(started, app.text).toBeDefined()
    expect(resumed, app.text).toBeDefined()
    expect(started, app.text).not.toContain("─")
    expect(resumed, app.text).toMatch(/─ ▸ Session resumed .* ─/)
  })

  test("resumed session divider preserves one-cell left and right gutters", () => {
    const app = renderListWithMetadata([], 132, 8, false)
    const row = app.lines.find((line) => line.includes("Session resumed"))
    expect(row, app.text).toBeDefined()
    const firstRule = row!.indexOf("─")
    const lastRule = row!.lastIndexOf("─")
    expect(firstRule, app.text).toBeGreaterThanOrEqual(1)
    expect(lastRule, app.text).toBeLessThan(app.width - 1)
    expect(row![firstRule - 1]).not.toBe("─")
    expect(row![lastRule + 1]).not.toBe("─")
  })

  test("loaded-session metadata does not overlay the final wrapped line at the viewport tail", () => {
    const app = renderListWithMetadata(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: new Date(2026, 3, 30, 16, 0).getTime(),
          ops: [
            {
              kind: "text",
              text:
                "Implemented both fixes.\n\n" +
                "Verification:\n\n" +
                "- bun vitest run apps/silvercode/tests/visual/boundary-fakes.test.tsx passed.\n" +
                "- Targeted command padding test passed.\n" +
                "- npx tsc --noEmit --incremental false --pretty false still fails on existing unrelated repo-wide TypeScript errors, mostly in agent-harness/vendor silvery plus StatusGlyph.tsx error.",
            },
          ],
        }),
      ],
      132,
      14,
      "end",
    )

    const loadedRow = app.lines.findIndex((line) => line.includes("Session resumed"))
    expect(loadedRow, app.text).toBeGreaterThanOrEqual(0)
    expect(app.lines[loadedRow], app.text).not.toContain("StatusGlyph")
    expect(app.lines[loadedRow], app.text).not.toContain("error")
  })

  test("notifications render in the prose lane", () => {
    const app = renderListWithNotification(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: 1_000,
          ops: [{ kind: "text", text: "before notification" }],
        }),
      ],
      [
        {
          kind: "notification",
          id: "tribe-1",
          source: "tribe",
          timestamp: 1_001,
          content: '<channel source="plugin:tribe:tribe" from="daemon" type="health">peer ready</channel>',
        },
      ],
      132,
      16,
    )

    const notificationLine = app.lines.find((line) => line.includes("Tribe") && line.includes("peer ready"))
    const proseLine = app.lines.find((line) => line.includes("before notification"))
    expect(notificationLine, app.text).toBeDefined()
    expect(proseLine, app.text).toBeDefined()
    expect(notificationLine!.indexOf("Tribe")).toBe(proseLine!.indexOf("before notification"))
  })

  test("notifications interleave between timestamped assistant text ops", () => {
    const app = renderListWithNotification(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: 1_000,
          ops: [
            { kind: "text", text: "before notification", ts: 1_000 },
            { kind: "text", text: "after notification", ts: 3_000 },
          ],
        }),
      ],
      [
        {
          kind: "notification",
          id: "tribe-between",
          source: "tribe",
          ts: 2_000,
          content: '<channel source="plugin:tribe:tribe" from="daemon" type="health">notification between</channel>',
        },
      ],
      132,
      16,
    )

    const beforeRow = app.lines.findIndex((line) => line.includes("before notification"))
    const notificationRow = app.lines.findIndex((line) => line.includes("notification between"))
    const afterRow = app.lines.findIndex((line) => line.includes("after notification"))
    expect(beforeRow, app.text).toBeGreaterThanOrEqual(0)
    expect(notificationRow, app.text).toBeGreaterThan(beforeRow)
    expect(afterRow, app.text).toBeGreaterThan(notificationRow)
  })

  test("resumed-session metadata anchors to the replay boundary message across notification rows", () => {
    const app = renderListWithMetadataAndNotification(
      [
        makeEntry({
          id: "u1",
          role: "user",
          ts: 1_000,
          ops: [{ kind: "text", text: "question" }],
        }),
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: 3_000,
          ops: [{ kind: "text", text: "final replayed answer" }],
        }),
      ],
      [
        {
          kind: "notification",
          id: "tribe-before-boundary",
          source: "tribe",
          timestamp: 2_000,
          content: '<channel source="plugin:tribe:tribe" from="daemon" type="health">notification before answer</channel>',
        },
      ],
      132,
      16,
    )

    const notificationRow = app.lines.findIndex((line) => line.includes("notification before answer"))
    const answerRow = app.lines.findIndex((line) => line.includes("final replayed answer"))
    const resumedRow = app.lines.findIndex((line) => line.includes("Session resumed"))
    expect(notificationRow, app.text).toBeGreaterThanOrEqual(0)
    expect(answerRow, app.text).toBeGreaterThan(notificationRow)
    expect(resumedRow, app.text).toBeGreaterThan(answerRow)
  })

  test("blocky prose entries get a blank row above and below", () => {
    const app = renderList(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: 1_000,
          ops: [{ kind: "text", text: "Implemented both fixes.\n\nVerification:\n\n- tests passed" }],
        }),
      ],
      132,
      16,
    )

    const row = app.lines.findIndex((line) => line.includes("Implemented both fixes."))
    expect(row, app.text).toBeGreaterThanOrEqual(0)
    expect(app.lines[row - 1]?.trim() ?? "").toBe("")
    const bullet = app.lines.findIndex((line) => line.includes("tests passed"))
    expect(bullet, app.text).toBeGreaterThan(row)
    expect(app.lines[bullet + 1]?.trim() ?? "").toBe("")
  })

  test("standalone assistant prose inside a turn gets a blank row above and below", () => {
    const app = renderList(
      [
        makeEntry({
          id: "a1",
          role: "assistant",
          ts: 1_000,
          ops: [
            { kind: "text", text: "The targeted tests now pass." },
            { kind: "text", text: "Implemented both fixes.\n\nChanged:\n- Prompt padding\n- Side panel quota" },
          ],
        }),
      ],
      132,
      18,
    )

    const first = app.lines.findIndex((line) => line.includes("The targeted tests now pass."))
    const standalone = app.lines.findIndex((line) => line.includes("Implemented both fixes."))
    expect(first, app.text).toBeGreaterThanOrEqual(0)
    expect(standalone, app.text).toBeGreaterThan(first)
    expect(app.lines[standalone - 1]?.trim() ?? "").toBe("")
    const lastBullet = app.lines.findIndex((line) => line.includes("Side panel quota"))
    expect(lastBullet, app.text).toBeGreaterThan(standalone)
    expect(app.lines[lastBullet + 1]?.trim() ?? "").toBe("")
  })
})
