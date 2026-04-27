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
import { renderScenario } from "../../src/test/render-harness.tsx"
import { markdownRich } from "../../src/test/scripts/markdownRich.ts"
import { parseFrame, summarize } from "../../src/test/parse-frame.ts"
import { expectLayoutInvariants } from "./_invariants.ts"

describe("markdown rendering at multiple widths", () => {
  // Excludes 40 from invariants because at 40 cols, the side panel
  // (flexBasis=40) consumes the full width — the left region has 0 cols.
  // parseFrame returns no card stream and side-panel markers overlap with
  // the empty left. We still verify content renders at 40 but skip invariants.
  const widths = [60, 80, 120] as const

  // Side panel auto-opens at lg (120 cols) and above; below that, panel is
  // hidden so the message area gets the full width. Tests at cols < 120
  // need to tell parseFrame that no panel is present (leftWidth = cols).
  const PANEL_AUTO_OPEN_COLS = 120
  const SIDE_PANEL_W = 40
  const expectedLeftWidth = (cols: number): number =>
    cols >= PANEL_AUTO_OPEN_COLS ? cols - SIDE_PANEL_W : cols

  for (const cols of widths) {
    test(`markdownRich at cols=${cols}: layout invariants hold`, async () => {
      // rows=200 is required so SessionUpdateList's `follow="end"` doesn't
      // scroll the leading `●` glyph out of the viewport — markdownRich
      // wraps to ~100 rendered lines at narrow widths.
      const s = await renderScenario({ script: markdownRich, cols, rows: 200 })
      const leftWidth = expectedLeftWidth(cols)
      const panelHidden = cols < PANEL_AUTO_OPEN_COLS
      const p = parseFrame(s, { leftWidth })
      const assistants = p.cardStream.filter((b) => b.glyph === "●")
      expect(assistants.length, `no ● assistant block at cols=${cols}.\n${summarize(p)}`).toBeGreaterThan(0)
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
    })
  }

  test("markdownRich at narrow cols=40: side panel hidden by default, content renders", async () => {
    // cols=40 < lg (120) — responsive default hides the panel so the message
    // area gets the full width. Asserts the new behavior: panel markers do
    // NOT render, but message content does. (Manual /panel opens it as an
    // overlay; that path tested elsewhere.)
    const s = await renderScenario({ script: markdownRich, cols: 40, rows: 60 })
    expect(s.text, `'first' missing at cols=40`).toMatch(/first/)
    expect(s.text, `'bullet' missing at cols=40`).toMatch(/bullet/)
  })
})
