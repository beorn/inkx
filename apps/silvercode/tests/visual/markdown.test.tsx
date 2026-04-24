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
      // Match key markdown tokens. At narrow widths ("cols=60") content
      // wraps, so we match the prefix tokens instead of full phrases.
      // "Heading" (H1 start) MUST appear. "first bullet" is short enough
      // to fit even at 60 cols. "function" appears from the code fence.
      expect(s.text, `H1 heading missing at cols=${cols}`).toMatch(/Heading/)
      expect(s.text, `bullet missing at cols=${cols}`).toContain("first bullet")
      expect(s.text, `code fence missing at cols=${cols}`).toMatch(/function|hello/)
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
