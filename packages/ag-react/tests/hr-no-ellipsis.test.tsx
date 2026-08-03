/**
 * A thematic break must never render an ellipsis.
 *
 * Bead: @km/tui/22744-hr-truncated-in-prose-lane
 *
 * The glyph convention makes U+2026 mean TEXT TRUNCATION — content was cut
 * off. A thematic break carries zero characters, so an ellipsis on one is a
 * glyph making a FALSE CLAIM about the document. That is the defect: not a
 * cosmetic nit, a lying render.
 *
 * Root cause sits upstream of the width clamp: `HR` fabricated a fixed
 * 200-character payload and asked for `wrap="truncate"` — and truncate is
 * exactly the mode that appends the ellipsis, because truncation MEANS content
 * was lost. The rule was requesting its own defect.
 *
 * The category rule (acceptance 4): CHROME IS CLIPPED, PROSE IS TRUNCATED.
 * Truncation's ellipsis is a claim about lost content; zero-content chrome has
 * none to lose, so chrome uses `wrap="clip"`.
 *
 * These assert rendered CHARACTERS, not the width calculation — the defect is a
 * glyph, and a width-only test would pass while the lie remained.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { HR } from "../src/ui/components/Typography"
import { Content } from "../src/ui/components/Content"
import { DocumentView } from "../src/ui/components/DocumentView"

const ELLIPSIS = "…"

function ruleWidth(text: string): number {
  return Math.max(0, ...text.split("\n").map((line) => line.match(/─+/u)?.[0].length ?? 0))
}

describe("HR — no ellipsis at any width (@km/tui/22744)", () => {
  // Straddle the inset breakpoints: well under the 60-col cap, around it, and
  // far above — where the old 200-char payload always overflowed.
  for (const cols of [20, 40, 80, 120, 200]) {
    test(`no U+2026 at ${cols} cols`, () => {
      const render = createRenderer({ cols, rows: 3 })
      const app = render(<HR />)
      expect(app.text).not.toContain(ELLIPSIS)
    })
  }

  test("still draws real rule glyphs — guards against a vacuous pass", () => {
    // A component rendering nothing would also contain no ellipsis.
    const render = createRenderer({ cols: 80, rows: 3 })
    const app = render(<HR />)
    expect(app.text).toContain("─")
  })

  test("never exceeds its container", () => {
    const cols = 40
    const render = createRenderer({ cols, rows: 3 })
    const app = render(<HR />)
    expect(ruleWidth(app.text)).toBeLessThanOrEqual(cols)
  })

  test("is stable across adjacent container widths — never jitters", () => {
    // Monotonicity: widening the container by one column may grow the rule by
    // one, never shrink it. A rule that oscillates by a column as a pane
    // resizes is its own defect, which is why the inset floors rather than
    // rounds.
    let previous = 0
    for (let cols = 10; cols <= 90; cols++) {
      const render = createRenderer({ cols, rows: 3 })
      const app = render(<HR />)
      const drawn = ruleWidth(app.text)
      expect(drawn).toBeGreaterThanOrEqual(previous)
      previous = drawn
    }
  })
})

describe("HR inside a prose lane — the reported context (@km/tui/22744)", () => {
  // The bare-HR cases above do NOT reproduce: an unclamped HR never overflows,
  // so nothing truncates. The operator saw this in maddoc, where the rule sits
  // inside Content's ProseLane and IS clamped. Reproduce that context or the
  // whole suite is vacuous.
  for (const cols of [20, 40, 80]) {
    test(`no U+2026 in a prose lane at ${cols} cols`, () => {
      const render = createRenderer({ cols, rows: 5 })
      const app = render(
        <Content.Layout>
          <Content.Row>
            <Content.Body width="prose">
              <HR />
            </Content.Body>
          </Content.Row>
        </Content.Layout>,
      )
      expect(app.text).not.toContain(ELLIPSIS)
    })
  }
})

describe("HR via DocumentView — maddoc's actual path (@km/tui/22744)", () => {
  for (const cols of [20, 40, 80, 120]) {
    test(`no U+2026 via DocumentView rule block at ${cols} cols`, () => {
      const render = createRenderer({ cols, rows: 6 })
      const app = render(<DocumentView blocks={[{ id: "r1", kind: "rule" }]} />)
      expect(app.text).not.toContain(ELLIPSIS)
    })
  }
})

/**
 * Acceptance 2 — the inset: `min(67%, 60)`, leading-aligned.
 *
 * A full-bleed rule reads as a page divider; a break between paragraphs should
 * be visibly narrower than the text it divides. The cap matters separately from
 * the fraction: on a wide terminal 67% is still enormous.
 *
 * Written as `width` + `maxWidth` because the engine ignores `min()`/`calc()`
 * in the `width` prop — measured, not assumed: bare `50%` applies while
 * `calc(50%)` silently goes full-bleed. These tests pin the OUTCOME, so the
 * pair cannot be "simplified" into a `min()` string that constrains nothing.
 */
describe("HR inset — min(67%, 60), leading-aligned (@km/tui/22744 acceptance 2)", () => {
  test("spans ~67% of a narrow container, well short of full bleed", () => {
    const cols = 40
    const render = createRenderer({ cols, rows: 3 })
    const drawn = ruleWidth(render(<HR />).text)
    // 0.67 * 40 = 26.8; the engine rounds. Allow ±1 rather than pinning the
    // engine's rounding mode — monotonicity is asserted separately, and that is
    // the property anyone actually depends on.
    expect(drawn).toBeGreaterThanOrEqual(26)
    expect(drawn).toBeLessThanOrEqual(28)
  })

  test("caps at 60 columns however wide the terminal gets", () => {
    for (const cols of [100, 120, 200]) {
      const render = createRenderer({ cols, rows: 3 })
      expect(ruleWidth(render(<HR />).text)).toBe(60)
    }
  })

  test("the cap is a real constraint, not an artifact of the fill length", () => {
    // Guard against a vacuous cap: if the rule were capped by RULE_FILL running
    // out rather than by maxWidth, this would still read 60 at every width.
    const render = createRenderer({ cols: 80, rows: 3 })
    const drawn = ruleWidth(render(<HR />).text)
    expect(drawn).toBeGreaterThan(0)
    expect(drawn).toBeLessThan(60)
  })

  test("is leading-aligned — the rule starts at the container's left edge", () => {
    // A centred rule would not line up with the left-aligned prose it divides.
    const render = createRenderer({ cols: 80, rows: 3 })
    const line = render(<HR />)
      .text.split("\n")
      .find((l) => l.includes("─"))
    expect(line).toBeDefined()
    expect(line?.indexOf("─")).toBe(0)
  })

  test("never shrinks as the container widens — no jitter on resize", () => {
    // The monotonicity guard now has teeth: before the inset the rule simply
    // filled, so it was monotonic for free. With a percentage it is a claim
    // about the engine's rounding, across the cap boundary at ~89 columns.
    let previous = 0
    for (let cols = 10; cols <= 120; cols++) {
      const render = createRenderer({ cols, rows: 3 })
      const drawn = ruleWidth(render(<HR />).text)
      expect(drawn).toBeGreaterThanOrEqual(previous)
      previous = drawn
    }
    expect(previous).toBe(60)
  })

  test("still no ellipsis at any width, now that a real constraint clips it", () => {
    // The inset makes the fill overflow at EVERY width, not just in a prose
    // lane — so this is where a regression to wrap="truncate" would surface.
    for (const cols of [20, 40, 80, 120]) {
      const render = createRenderer({ cols, rows: 3 })
      expect(render(<HR />).text).not.toContain(ELLIPSIS)
    }
  })
})
