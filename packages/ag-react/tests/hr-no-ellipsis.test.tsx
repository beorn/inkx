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
import { parseColor } from "@silvery/ag-term/pipeline/render-helpers"
import { HR } from "../src/ui/components/Typography"
import { Content } from "../src/ui/components/Content"
import { DocumentView } from "../src/ui/components/DocumentView"

const ELLIPSIS = "…"

function ruleWidth(text: string): number {
  return Math.max(0, ...text.split("\n").map((line) => line.match(/─+/u)?.[0].length ?? 0))
}

function ruleSpan(text: string): { start: number; width: number } {
  const line = text.split("\n").find((candidate) => candidate.includes("─"))
  if (line === undefined) throw new Error("expected a rendered thematic break")
  return { start: line.indexOf("─"), width: line.match(/─+/u)?.[0].length ?? 0 }
}

function resolveRgb(color: string): { r: number; g: number; b: number } {
  const resolved = parseColor(color)
  if (resolved === null || typeof resolved === "number") {
    throw new Error(`expected ${color} to resolve to RGB, got ${JSON.stringify(resolved)}`)
  }
  return resolved
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
    // resizes is its own defect regardless of the engine's rounding mode.
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

  test("centres inside DocumentView's real block frame", () => {
    const render = createRenderer({ cols: 80, rows: 8 })
    const app = render(
      <DocumentView
        blocks={[
          { id: "p1", kind: "paragraph", content: "x".repeat(200) },
          { id: "r1", kind: "rule" },
        ]}
      />,
    )
    const proseLine = app.lines.find((line) => line.includes("x"))
    const ruleLine = app.lines.find((line) => line.includes("─"))
    if (proseLine === undefined || ruleLine === undefined) {
      throw new Error("expected both prose and thematic-break rows")
    }
    const proseStart = proseLine.indexOf("x")
    const proseWidth = proseLine.match(/x+/u)?.[0].length ?? 0
    const ruleStart = ruleLine.indexOf("─")
    const width = ruleLine.match(/─+/u)?.[0].length ?? 0
    const leading = ruleStart - proseStart
    const trailing = proseStart + proseWidth - ruleStart - width
    expect(leading).toBeGreaterThan(0)
    expect(Math.abs(leading - trailing)).toBeLessThanOrEqual(1)
  })
})

/**
 * Acceptance 2 — the measure: `min(67%, 60)`, centred.
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
describe("HR measure — min(67%, 60), centred (@km/tui/22744 acceptance 2)", () => {
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

  test("is centred with at most one column of rounding asymmetry", () => {
    for (const cols of [20, 40, 80, 120]) {
      const render = createRenderer({ cols, rows: 3 })
      const { start, width } = ruleSpan(render(<HR />).text)
      const trailing = cols - start - width
      expect(start).toBeGreaterThan(0)
      expect(Math.abs(start - trailing)).toBeLessThanOrEqual(1)
    }
  })

  test("uses the faint divider token by default while preserving overrides", () => {
    const render = createRenderer({ cols: 80, rows: 3 })
    const defaultRule = render(<HR />)
    const { start } = ruleSpan(defaultRule.text)
    expect(defaultRule.cell(start, 0).fg).toEqual(resolveRgb("$border-muted"))

    const overridden = render(<HR color="$fg-success" />)
    const overriddenStart = ruleSpan(overridden.text).start
    expect(overridden.cell(overriddenStart, 0).fg).toEqual(resolveRgb("$fg-success"))
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
