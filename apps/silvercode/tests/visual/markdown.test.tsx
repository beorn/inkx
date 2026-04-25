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

  for (const cols of widths) {
    test(`markdownRich at cols=${cols}: layout invariants hold`, async () => {
      const s = await renderScenario({ script: markdownRich, cols, rows: 60 })
      const p = parseFrame(s)
      const assistants = p.cardStream.filter((b) => b.glyph === "●")
      expect(assistants.length, `no ● assistant block at cols=${cols}.\n${summarize(p)}`).toBeGreaterThan(0)
      // Match key markdown tokens. At narrow widths the message column is
      // ~16 cols once the side panel takes its 40-col share — paragraphs
      // wrap aggressively, "first bullet" splits across two lines, and the
      // code fence near the end of the document falls below the visible
      // viewport (the cursor follows the latest streamed item, which is
      // the message itself, not the fence). Assert tokens that always
      // survive narrow rendering at the visible top of the message; assert
      // the code fence only at widths where it actually fits.
      expect(s.text, `H1 heading missing at cols=${cols}`).toMatch(/Heading/)
      expect(s.text, `'first' missing at cols=${cols}`).toMatch(/first/)
      expect(s.text, `'bullet' missing at cols=${cols}`).toMatch(/bullet/)
      if (cols >= 80) {
        expect(s.text, `code fence missing at cols=${cols}`).toMatch(/function|hello/)
      }
      expectLayoutInvariants(s)
    })
  }

  test("markdownRich at narrow cols=40: content renders (no invariants — side panel dominates)", async () => {
    // cols=40 with flexBasis=40 side panel means left region width = 0 —
    // everything should get clipped but at minimum the side panel still
    // renders. Basically a smoke test that we don't crash.
    const s = await renderScenario({ script: markdownRich, cols: 40, rows: 60 })
    // Side panel markers should always render.
    expect(s.text, `side panel missing at cols=40`).toMatch(/Sessions|Silver|Claude/)
  })
})
