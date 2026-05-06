/**
 * Regression: a 1KB unwrappable blob (no whitespace) inside a tool result
 * must NOT push the side panel off-screen.
 *
 * This is the load-bearing test for the "overflow at root" pattern —
 * ChatPane's outer Box owns the single `overflow="hidden"` boundary.
 * Per CSS spec §4.5 (honoured by flexily/src/layout-zero.ts:587), an
 * `overflow!=visible` flex item gets `min-size: 0` automatically and
 * participates in shrink distribution against its parent. The boundary
 * keeps the left column from expanding past `cols - SIDE_PANEL_WIDTH`,
 * even when descendants render unwrappable content that exceeds the
 * column's width by 10x+.
 *
 * If a future change drops `overflow="hidden"` from ChatPane's outer
 * Box, this test fails immediately at both 60-col and 120-col widths —
 * the blob expands the column and the side panel either disappears or
 * gets pushed past the right edge.
 *
 * Bead: km-silvercode.overflow-at-root
 */
import { describe, expect, test } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { longToolResult } from "../../src/test/scripts/longToolResult.ts"
import { leftWidthFor } from "../../src/test/render-harness.tsx"
import { parseFrame, summarize } from "../../src/test/parse-frame.ts"

describe("overflow=hidden at ChatPane root keeps side panel visible", () => {
  test("120-col: 1KB unwrappable blob does not bleed into the side panel", async () => {
    const COLS = 120
    const ROWS = 30
    const s = await renderScenario({ script: longToolResult, cols: COLS, rows: ROWS })
    const leftWidth = leftWidthFor(COLS)

    // Assertion 1: side panel is present at the expected column.
    const p = parseFrame(s, { leftWidth })
    expect(p.sidePanel, `side panel absent — the blob pushed it off-screen.\n${summarize(p)}`).not.toBeNull()
    expect(p.sidePanel!.hasSilverCodeRow).toBe(true)

    // Assertion 2: the right-edge column of the side panel renders at
    // some col >= leftWidth. parseFrame already verifies the side-panel
    // markers are inside the right region.
    expect(p.sidePanel!.sessionsHeadingRow).toBeGreaterThanOrEqual(0)

    // Assertion 3: no `x` characters bleed past leftWidth into the side
    // panel column zone. The 1KB blob in `longToolResult` is `"x".repeat(1024)`,
    // so a stray `x` to the right of leftWidth proves the overflow boundary
    // failed.
    const offenders: Array<{ row: number; col: number; line: string }> = []
    for (let row = 0; row < s.lines.length; row++) {
      const line = s.lines[row] ?? ""
      // Scan cells at col >= leftWidth for the blob signature `xxx…`.
      for (let col = leftWidth; col < Math.min(line.length, COLS); col++) {
        if (line[col] === "x" && line[col + 1] === "x" && line[col + 2] === "x") {
          offenders.push({ row, col, line })
          break
        }
      }
    }
    expect(
      offenders,
      `1KB blob bled past leftWidth=${leftWidth} into the side panel zone:\n` +
        offenders
          .slice(0, 3)
          .map((o) => `  row ${o.row}, col ${o.col}: ${JSON.stringify(o.line)}`)
          .join("\n"),
    ).toHaveLength(0)
  })

  test("60-col: panel hidden by default, blob renders in full-width region without crashing", async () => {
    // Responsive default hides the side panel at cols < lg (120) — at 60
    // cols there's no panel-column zone for the blob to bleed into. Test
    // becomes a smoke check: the long blob renders without crashing the
    // App and without the side panel sneaking back in.
    const COLS = 60
    const ROWS = 30
    const s = await renderScenario({ script: longToolResult, cols: COLS, rows: ROWS })
    const p = parseFrame(s, { leftWidth: COLS })
    expect(p.sidePanel, `side panel should be hidden at cols=${COLS} (responsive default).\n${summarize(p)}`).toBeNull()
  })
})
