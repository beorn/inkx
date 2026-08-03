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
