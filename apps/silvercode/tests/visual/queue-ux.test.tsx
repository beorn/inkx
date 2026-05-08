/**
 * Queue UX — three TDD bugs from the queue editor.
 *
 * A1 — Single visible cursor when queue is focused
 *     The unfocused TextArea must not render its inverse "fake" cursor.
 *     Two visible cursors (one real, one inverse) confuse the user.
 *
 * A2 — Per-line `>` prefix in queue display
 *     Wire format keeps `\n\n` between entries (Claude paragraph break),
 *     but the rendered queue shows each entry on its own line with its
 *     own `>` prefix and SINGLE-newline separation in the display.
 *
 * A3 — Plain Enter in queue inserts newline (does not flush)
 *     A force-flush requires an explicit chord (Ctrl+J). Plain Enter
 *     mid-line should insert a newline like a normal multi-line editor.
 */

import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { leftWidthFor, renderScenario } from "../../src/test/render-harness.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../../src/test/fake-session.ts"

const COLS = 120
const ROWS = 30
const SESSION = "fake-session-1" as SessionId
let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = []

const silentWrite = ((
  _chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
  callback?: (err?: Error) => void,
): boolean => {
  const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback
  cb?.()
  return true
}) as typeof process.stdout.write

beforeEach(() => {
  consoleSpies = (["log", "info", "debug", "warn", "error"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  )
  vi.spyOn(process.stdout, "write").mockImplementation(silentWrite)
  vi.spyOn(process.stderr, "write").mockImplementation(silentWrite as typeof process.stderr.write)
})

afterEach(() => {
  for (const spy of consoleSpies) spy.mockRestore()
  consoleSpies = []
})

function turnStart(turnId: string): AgentEvent {
  return { kind: "turn-start", sessionId: SESSION, turnId: turnId as TurnId, role: "assistant", ts: 1010 }
}

function sessionInit(): AgentEvent {
  return {
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/silvercode-test",
    model: "claude-sonnet-4-6",
    mode: "auto",
    tools: [],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "2.1.119",
    apiKeySource: "OAuth",
    ts: 1000,
  }
}

function userMessage(): AgentEvent {
  return { kind: "user-message", sessionId: SESSION, turnId: "u1" as TurnId, text: "seed", ts: 1005 }
}

function createQueueFake(): ScriptedFakeSession {
  return Object.assign(createFakeSession({ sessionId: SESSION }), { agent: "claude", protocolVersion: 1 })
}

/**
 * Drive App + a single-flight turn-start so subsequent sends land in the
 * queue. Then seed the queue by typing in the command box and pressing
 * Enter for each entry — the controller's "\n\n" join produces the wire
 * format.
 */
async function busySession(opts: { entries?: readonly string[] } = {}) {
  const s = await renderScenario({
    script: [sessionInit(), userMessage(), turnStart("a1")],
    cols: COLS,
    rows: ROWS,
    fake: createQueueFake(),
  })
  const entries = opts.entries ?? []
  if (entries.length > 0) {
    s.controller.setQueuedText(s.controller.focusedId(), entries.join("\n\n"))
    await new Promise<void>((r) => setTimeout(r, 0))
    s.resample()
  }
  return s
}

describe("A1 — single visible cursor in queue editor", () => {
  test("when command is focused with non-empty queue, only ONE cursor is visible (no inverse fake-cursor in queue)", async () => {
    const s = await busySession({ entries: ["alpha", "beta"] })
    try {
      // Default focus is "command". The command TextArea owns the real
      // hardware cursor; the queue TextArea must NOT render its inverse
      // "fake cursor" at the same time, because the user sees that as a
      // second blinking caret.
      //
      // Detection strategy: scan every cell in the queue region for
      // inverse styling. The queue lines contain "alpha" / "beta" — we
      // use those to locate them. After the fix no cell on those lines
      // is inverse.
      const lines = s.lines
      const queueRowIndices = lines
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.includes("alpha") || l.includes("beta"))
        .map(({ i }) => i)
      expect(queueRowIndices.length, `Could not locate queue lines.\nFrame:\n${s.text}`).toBeGreaterThan(0)

      let inverseCellsInQueue = 0
      for (const row of queueRowIndices) {
        for (let col = 0; col < s.cols; col++) {
          const cell = s.app.cell(col, row)
          if (cell.inverse) inverseCellsInQueue++
        }
      }
      expect(
        inverseCellsInQueue,
        `Queue rows still contain inverse cells (= fake cursor leaking through). Frame:\n${s.text}`,
      ).toBe(0)
    } finally {
      s.dispose()
    }
  })

  test("when queue is focused, the command region must NOT render an inverse fake cursor", async () => {
    const s = await busySession({ entries: ["one"] })
    try {
      // Move focus into the queue. ArrowUp on empty command triggers
      // onEdge("top") → onFocusRegion("queue").
      await s.app.press("ArrowUp")
      // Sanity: we're in queue mode now.
      expect(s.text).toContain("QUEUE HELD")
      // The command TextArea is now inactive. Its row should contain a
      // single `> ` prefix (Text bold) but NO inverse cell. After the
      // fix, the inactive TextArea suppresses the fake cursor.
      const lines = s.lines
      // Find the "live" command row — it lives below the divider. The
      // command TextArea is empty so the row is just whitespace after
      // the prompt. Locate it as: the LAST row containing "> " inside
      // the bottom 8 rows of the frame.
      const lowerHalf = lines.slice(Math.max(0, lines.length - 8))
      const lowerStart = lines.length - lowerHalf.length
      const candidateOffsets = lowerHalf.map((l, i) => ({ l, i: lowerStart + i })).filter(({ l }) => l.includes("> "))
      const commandRow = candidateOffsets[candidateOffsets.length - 1]?.i
      expect(commandRow, `Could not locate command row.\nFrame:\n${s.text}`).toBeDefined()

      let inverseCellsInCommand = 0
      for (let col = 0; col < s.cols; col++) {
        const cell = s.app.cell(col, commandRow!)
        if (cell.inverse) inverseCellsInCommand++
      }
      expect(
        inverseCellsInCommand,
        `Inactive command row contains inverse cells (fake cursor).\nFrame:\n${s.text}`,
      ).toBe(0)
    } finally {
      s.dispose()
    }
  })
})

describe("A2 — per-line `>` prefix in queue display", () => {
  test("each queued entry renders on its own line prefixed with `>` (single-newline display, not `\\n\\n`)", async () => {
    const s = await busySession({ entries: ["cmd1", "cmd2", "cmd3"] })
    try {
      // The wire format stays "cmd1\n\ncmd2\n\ncmd3" inside the
      // controller — display is one line per entry with its own
      // ">" prefix.
      const lines = s.lines
      const idx1 = lines.findIndex((l) => l.includes("cmd1"))
      const idx2 = lines.findIndex((l) => l.includes("cmd2"))
      const idx3 = lines.findIndex((l) => l.includes("cmd3"))
      expect(idx1, `cmd1 missing.\nFrame:\n${s.text}`).toBeGreaterThanOrEqual(0)
      expect(idx2, `cmd2 missing.\nFrame:\n${s.text}`).toBeGreaterThanOrEqual(0)
      expect(idx3, `cmd3 missing.\nFrame:\n${s.text}`).toBeGreaterThanOrEqual(0)

      // Single-newline display: cmd lines are CONSECUTIVE rows (no blank
      // row between them). Today the wire-format `\n\n` produces a
      // blank row between every entry — that's the bug.
      expect(idx2 - idx1, `cmd1→cmd2 has a blank row between (\\n\\n leaking into display).\nFrame:\n${s.text}`).toBe(1)
      expect(idx3 - idx2, `cmd2→cmd3 has a blank row between (\\n\\n leaking into display).\nFrame:\n${s.text}`).toBe(1)

      // Each line carries its own `>` prefix. Today the queue shows ONE
      // `>` for the entire multi-entry buffer (the prefix lives in a
      // sibling Text outside the TextArea), so cmd2 / cmd3 lines have
      // no `>`.
      const linesWithCmd = [lines[idx1]!, lines[idx2]!, lines[idx3]!]
      for (const line of linesWithCmd) {
        expect(line, `Queue line missing '>' prefix: ${JSON.stringify(line)}\nFrame:\n${s.text}`).toMatch(/>/)
      }
    } finally {
      s.dispose()
    }
  })

  test("wire format is unchanged — controller's queue buffer keeps `\\n\\n` between entries", async () => {
    const s = await busySession({ entries: ["alpha", "beta", "gamma"] })
    try {
      // Move focus into the queue (so we're sure the queue TextArea is
      // mounted and any display ↔ wire transform is exercised).
      await s.app.press("ArrowUp")
      // Force-flush — Ctrl+J in the queue triggers onQueueSubmit. The
      // dispatched payload must use the wire-format separator.
      const baseline = s.fake.sent.length
      await s.app.press("Ctrl+j")
      await new Promise<void>((r) => setTimeout(r, 40))
      // ONE send, with all three entries joined by "\n\n".
      expect(s.fake.sent.length, `Expected one flushed send.`).toBe(baseline + 1)
      const last = s.fake.sent[s.fake.sent.length - 1]!
      expect(last.payload).toBe("alpha\n\nbeta\n\ngamma")
    } finally {
      s.dispose()
    }
  })
})

describe("A3 — plain Enter in queue inserts newline, does NOT flush", () => {
  test("plain Enter pressed mid-entry inserts a newline (no force-flush)", async () => {
    const s = await busySession({ entries: ["queued"] })
    try {
      // Move focus into the queue.
      await s.app.press("ArrowUp")
      expect(s.text).toContain("QUEUE HELD")
      const baseline = s.fake.sent.length
      // Press Enter — should INSERT a newline in the queue buffer, NOT
      // dispatch a flush. After the fix, the queue's submitKey is no
      // longer "enter".
      await s.app.press("Enter")
      await new Promise<void>((r) => setTimeout(r, 40))
      expect(s.fake.sent.length, `Plain Enter must not flush queue.`).toBe(baseline)
      // Queue divider still visible — buffer not cleared.
      expect(s.text).toContain("QUEUE")
    } finally {
      s.dispose()
    }
  })

  test("Ctrl+J in the queue force-flushes the entire buffer", async () => {
    const s = await busySession({ entries: ["one", "two"] })
    try {
      await s.app.press("ArrowUp")
      const baseline = s.fake.sent.length
      await s.app.press("Ctrl+j")
      await new Promise<void>((r) => setTimeout(r, 40))
      expect(s.fake.sent.length, `Ctrl+J should force-flush.`).toBe(baseline + 1)
      const last = s.fake.sent[s.fake.sent.length - 1]!
      expect(last.payload).toBe("one\n\ntwo")
      // Queue cleared → divider gone.
      expect(s.text).not.toContain("QUEUE")
    } finally {
      s.dispose()
    }
  })
})

describe("command box padding", () => {
  test("command input leaves one blank cell at the right edge of the pane", async () => {
    const s = await renderScenario({ script: [], cols: COLS, rows: ROWS })
    try {
      const leftWidth = leftWidthFor(COLS)
      for (const ch of "x".repeat(leftWidth - 3)) await s.app.press(ch)

      const commandRow = s.lines.findIndex((line) => line.includes(" > ") && line.includes("x"))
      expect(commandRow, `Could not locate typed command row.\nFrame:\n${s.text}`).toBeGreaterThanOrEqual(0)
      expect(
        s.app.cell(leftWidth - 1, commandRow).char,
        `Command input should reserve one trailing blank cell before the side pane.\nFrame:\n${s.text}`,
      ).toBe(" ")
    } finally {
      s.dispose()
    }
  })
})
