/**
 * Layer 4 — overflow boundary regression test using assistant text content.
 *
 * The existing `overflow-at-root.test.tsx` uses a long tool-result, but
 * `<ToolCall>` collapses long content into an accordion summary, so the
 * actual bleed is masked — that test cannot detect a regression that
 * removes `overflow="hidden"` from App.tsx's PaneGrid container.
 *
 * This test uses an assistant text-delta with the same 1KB unwrappable
 * blob, which renders through `<MarkdownView>` / `<Prose>` with
 * `wrap="wrap"` — no accordion collapse. A missing overflow boundary in
 * the wrap chain produces a visible bleed past the side-panel boundary,
 * which this test catches.
 *
 * Bead: km-silvercode.overflow-at-root (companion to the tool-result variant).
 */
import { describe, expect, test } from "vitest"
import { renderScenario, leftWidthFor } from "../../src/test/render-harness.tsx"
import { longAssistantText } from "../../src/test/scripts/longAssistantText.ts"
import { parseFrame, summarize } from "../../src/test/parse-frame.ts"

describe("assistant text overflow stays inside the cards region", () => {
  test("120-col: 1KB unwrappable assistant text does not bleed into the side panel", async () => {
    const COLS = 120
    const ROWS = 30
    const s = await renderScenario({ script: longAssistantText, cols: COLS, rows: ROWS })
    const leftWidth = leftWidthFor(COLS)

    // Assertion 1: side panel is present at the expected column.
    const p = parseFrame(s, { leftWidth })
    expect(p.sidePanel, `side panel absent — the blob pushed it off-screen.\n${summarize(p)}`).not.toBeNull()
    expect(p.sidePanel!.hasSilverCodeRow).toBe(true)

    // Assertion 2: no `x` bleed past the side-panel boundary. Scan only
    // rows we know contain the blob render (skip the side-panel zone
    // entirely — the panel may legitimately have an `x` glyph in
    // version strings or labels). The bleed signature is three+
    // consecutive `x`s starting at col >= leftWidth in any row that
    // ALSO has `x`s in the cards zone.
    const offenders: Array<{ row: number; col: number }> = []
    for (let row = 0; row < s.lines.length; row++) {
      const line = s.lines[row] ?? ""
      const inCards = line.slice(0, leftWidth).includes("xxx")
      if (!inCards) continue
      for (let col = leftWidth; col < Math.min(line.length, COLS) - 2; col++) {
        if (line[col] === "x" && line[col + 1] === "x" && line[col + 2] === "x") {
          offenders.push({ row, col })
          break
        }
      }
    }
    expect(
      offenders,
      `1KB blob bled past leftWidth=${leftWidth} into the side panel zone:\n` +
        offenders
          .slice(0, 3)
          .map((o) => `  row ${o.row}, col ${o.col}: ${JSON.stringify(s.lines[o.row]?.slice(0, COLS) ?? "")}`)
          .join("\n"),
    ).toHaveLength(0)
  })
})
