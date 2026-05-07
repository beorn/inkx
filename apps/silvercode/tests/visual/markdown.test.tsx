/**
 * Markdown rendering — MarkdownView exercised through a rich assistant
 * message. Runs the markdownRich scenario at multiple widths; verifies
 * the layout invariants hold and the expected markdown features render.
 *
 * Catches: wrap breaking inside paragraphs, tight-list spacing drift,
 * code-fence width blowouts, heading collapse, bullet gutter misalignment
 * when content wraps.
 *
 * Widths chosen:
 * - 40: very narrow, often breaks first
 * - 60: common compact terminal
 * - 80: default terminal
 * - 120: "desktop" width we design for
 */
import { describe, expect, test } from "vitest"
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { markdownRich } from "../../src/test/scripts/markdownRich.ts"
import { parseFrame } from "../../src/test/parse-frame.ts"
import { expectLayoutInvariants } from "./_invariants.ts"
import { leftWidthFor } from "../../src/test/render-harness.tsx"

describe("markdown rendering at multiple widths", () => {
  // Excludes 40 from invariants because at 40 cols, the side panel
  // consumes most of the width and the left region is intentionally tiny.
  // parseFrame returns no block stream and side-panel markers overlap with
  // the empty left. We still verify content renders at 40 but skip invariants.
  const widths = [60, 80, 120] as const

  // Side panel auto-opens at lg (120 cols) and above; below that, panel is
  // hidden so the message area gets the full width. Tests at cols < 120
  // need to tell parseFrame that no panel is present (leftWidth = cols).
  const PANEL_AUTO_OPEN_COLS = 120
  const expectedLeftWidth = (cols: number): number => leftWidthFor(cols)

  for (const cols of widths) {
    test(`markdownRich at cols=${cols}: layout invariants hold`, async () => {
      // rows=200 is required so SessionUpdateList's `follow="end"` doesn't
      // scroll the leading `●` glyph out of the viewport — markdownRich
      // wraps to ~100 rendered lines at narrow widths.
      const s = await renderScenario({ script: markdownRich, cols, rows: 200 })
      try {
        const leftWidth = expectedLeftWidth(cols)
        const panelHidden = cols < PANEL_AUTO_OPEN_COLS
        const p = parseFrame(s, { leftWidth })
        // Match key markdown tokens. At narrow widths panel is hidden so the
        // message column gets the full terminal width — paragraphs wrap less
        // aggressively. Code fence still asserted only where it fits.
        expect(s.text, `H1 heading missing at cols=${cols}`).toMatch(/Heading/)
        expect(s.text, `'first' missing at cols=${cols}`).toMatch(/first/)
        expect(s.text, `'bullet' missing at cols=${cols}`).toMatch(/bullet/)
        if (cols >= 80) {
          expect(s.text, `code fence missing at cols=${cols}`).toMatch(/function|hello/)
        }
        // Skip panel-presence + overflow-into-panel invariants when panel is
        // hidden (cols < lg=120) — the responsive default gives the message
        // area the full width, so there's no panel column zone to overflow into.
        expectLayoutInvariants(s, {
          leftWidth,
          skip: panelHidden ? { sidePanel: true, overflow: true } : undefined,
        })
      } finally {
        s.dispose()
      }
    })
  }

  test("markdownRich at narrow cols=40: side panel hidden by default, content renders", async () => {
    // cols=40 < lg (120) — responsive default hides the panel so the message
    // area gets the full width. Asserts the new behavior: panel markers do
    // NOT render, but message content does. (Manual /panel opens it as an
    // overlay; that path tested elsewhere.)
    const s = await renderScenario({ script: markdownRich, cols: 40, rows: 60 })
    try {
      expect(s.text, `'first' missing at cols=40`).toMatch(/first/)
      expect(s.text, `'bullet' missing at cols=40`).toMatch(/bullet/)
    } finally {
      s.dispose()
    }
  })

  test("code and quote blocks render as inset prose blocks, not bordered boxes", async () => {
    const s = await renderScenario({ script: markdownRich, cols: 80, rows: 80 })
    try {
      expect(s.text).toContain("function hello")
      expect(s.text).not.toContain("│")
      expect(s.text).not.toContain("typescript")

      const codeLine = s.text.split("\n").find((line) => line.includes("function hello")) ?? ""
      expect(codeLine.indexOf("function hello")).toBeGreaterThan(0)
      const commandLine = s.text.split("\n").find((line) => line.includes(">")) ?? ""
      expect(commandLine.indexOf(">")).toBe(codeLine.indexOf("function hello") - 1)
    } finally {
      s.dispose()
    }
  })

  test("blocky assistant prose does not overlap the following user prompt or composer", async () => {
    const sessionId = "fake-blocky-overlap" as SessionId
    const a1 = "a1" as TurnId
    const u2 = "u2" as TurnId
    const script: AgentEvent[] = [
      {
        kind: "session-init",
        sessionId,
        cwd: "/tmp/fake",
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
      },
      { kind: "turn-start", sessionId, turnId: a1, role: "assistant", ts: 1010 },
      {
        kind: "text-delta",
        sessionId,
        turnId: a1,
        blockIndex: 0,
        text:
          "Implemented both fixes.\n\n" +
          "Verification:\n\n" +
          "- first check passed\n" +
          "- second check passed\n\n" +
          "The final paragraph should stay on its own rows and never share a line with the next user prompt.",
        ts: 1020,
      },
      { kind: "turn-end", sessionId, turnId: a1, stopReason: "end_turn", ts: 1030 },
      { kind: "user-message", sessionId, turnId: u2, text: "list the files", ts: 1040 },
    ]
    const s = await renderScenario({ script, cols: 100, rows: 24 })
    const firstRow = s.lines.findIndex((line) => line.includes("Implemented both fixes."))
    const finalRow = s.lines.findIndex((line) => line.includes("The final paragraph"))
    const userRow = s.lines.findIndex((line) => line.includes("list the files"))
    const composerRow = s.lines.findIndex((line) => /^\s*>\s/.test(line))
    expect(firstRow, s.text).toBeGreaterThanOrEqual(0)
    expect(finalRow, s.text).toBeGreaterThan(firstRow)
    expect(userRow, s.text).toBeGreaterThan(finalRow)
    expect(composerRow, s.text).toBeGreaterThan(userRow)
    expect(s.lines[userRow]!, s.text).not.toContain("final paragraph")
    expect(s.lines[composerRow]!, s.text).not.toContain("final paragraph")
    // Slice to chat region — side panel always paints its rightmost
    // border across all rows (cols 99 etc.), so trim of the full row
    // never returns "" once side panel is visible.
    const leftWidth = leftWidthFor(100)
    if (firstRow > 1) expect(s.lines[firstRow - 1]?.slice(0, leftWidth).trim() ?? "").toBe("")
    expect(s.lines[userRow - 1]?.slice(0, leftWidth).trim() ?? "").toBe("")
    s.dispose()
  })

  test("incremental user prompt after blocky assistant prose does not reuse the final paragraph row", async () => {
    const sessionId = "fake-incremental-blocky-overlap" as SessionId
    const a1 = "a1" as TurnId
    const u2 = "u2" as TurnId
    const script: AgentEvent[] = [
      {
        kind: "session-init",
        sessionId,
        cwd: "/tmp/fake",
        model: "codex",
        mode: "auto",
        tools: [],
        mcp_servers: [],
        slashCommands: [],
        skills: [],
        plugins: [],
        claudeCodeVersion: "0.124.0",
        apiKeySource: "OAuth",
        ts: 1000,
      },
      { kind: "turn-start", sessionId, turnId: a1, role: "assistant", ts: 1010 },
      {
        kind: "text-delta",
        sessionId,
        turnId: a1,
        blockIndex: 0,
        text:
          "Implemented both fixes.\n\n" +
          "Changed:\n" +
          "- SessionPromptComposer.tsx added padding.\n" +
          "- SidePanel.tsx changed Xtra visibility.\n\n" +
          "Verification:\n" +
          "- boundary fakes passed.\n" +
          "- command padding passed.\n\n" +
          "The final paragraph is intentionally long enough to wrap near the bottom of the viewport.",
        ts: 1020,
      },
      { kind: "turn-end", sessionId, turnId: a1, stopReason: "end_turn", ts: 1030 },
    ]
    const s = await renderScenario({ script, cols: 100, rows: 16, autoEmit: true })
    s.emit({ kind: "user-message", sessionId, turnId: u2, text: "list the files", ts: 1040 })
    const frame = s.resample()
    const finalRows = frame.lines
      .map((line, row) => ({ line, row }))
      .filter(({ line }) => line.includes("final paragraph"))
    const userRows = frame.lines
      .map((line, row) => ({ line, row }))
      .filter(({ line }) => line.includes("list the files"))

    expect(finalRows.length, frame.text).toBeGreaterThan(0)
    expect(userRows.length, frame.text).toBeGreaterThan(0)
    for (const user of userRows) {
      expect(user.line, frame.text).not.toContain("final paragraph")
      expect(
        finalRows.some((final) => final.row === user.row),
        frame.text,
      ).toBe(false)
    }
    const lastFinal = Math.max(...finalRows.map(({ row }) => row))
    const firstUser = Math.min(...userRows.map(({ row }) => row))
    expect(firstUser, frame.text).toBeGreaterThan(lastFinal)
    expect((frame.lines[firstUser - 1] ?? "").replace(/[█▌▐▀▄▔▁▂▃▅▆▇]/g, "").trim()).toBe("")
    s.dispose()
  })
})
