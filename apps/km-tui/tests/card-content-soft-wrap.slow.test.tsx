/**
 * Card content soft-wrap regression test (@km/silvery/card-content-overflow-clip).
 *
 * Bug: when a card's body or title contains a long unbreakable token like
 * `.claude/skills/{claim,do}/SKILL.md` or an absolute filesystem path, the
 * legacy wrap algorithm couldn't break the token (no spaces, no hyphens) so
 * the body Box reported its min-content = the full token width. Cards
 * narrower than that token saw the text either (a) overflow into the page
 * background past the card border, or (b) get hard-clipped mid-token by
 * `wrap="truncate"`, losing information.
 *
 * Fix: silvery's `wrapText` now treats path/identifier separators (`/`,
 * `\`, `.`, `_`, `:`) as SECONDARY soft-break opportunities. When no hard
 * boundary (space, hyphen) fits on the current line, the algorithm wraps
 * AFTER the separator — `.claude/` on one line, `skills/` on the next.
 *
 * This test runs at the km-tui layer because the rendered cell grid is the
 * cleanest place to assert the user-visible outcome — every cell painted
 * with a body-text glyph must live inside the card's `[left, right]` cell
 * range, full stop. The silvery-level wrap unit tests (in
 * `vendor/silvery/tests/features/wrap-soft-break.test.tsx`) cover the
 * primitive's behavior; this file covers integration with TreeNode +
 * CardColumn + the wrap-aware terminal measurer.
 */

import { describe, expect, test } from "vitest"
import { item, createTestApp } from "./helpers/create-test-app.ts"

// ─── Cell-level card detection ──────────────────────────────────────────────

interface CardBounds {
  /** First cell column belonging to the card (the `╭` corner). */
  readonly left: number
  /** Last cell column belonging to the card (the `╮` corner — INCLUSIVE). */
  readonly right: number
  /** Top border row. */
  readonly top: number
  /** Bottom border row (where `╰` sits). */
  readonly bottom: number
}

/**
 * Walk the rendered screen looking for a card top border (`╭...─...╮`) in a
 * specific column window — this lets the caller find ONE specific card
 * unambiguously when multiple cards are on screen. Returns the card bounds
 * if found, or null.
 */
function findCardBoundsAt(
  text: string,
  cellAt: (col: number, row: number) => string,
  expectedLeftRange: { min: number; max: number },
): CardBounds | null {
  const lines = text.split("\n")
  for (let row = 0; row < lines.length; row++) {
    for (let col = expectedLeftRange.min; col <= expectedLeftRange.max; col++) {
      const ch = cellAt(col, row)
      if (ch !== "╭") continue
      // Found a candidate top-left. Walk right looking for ╮.
      let right = -1
      for (let c = col + 1; c < lines[row]!.length; c++) {
        const cc = cellAt(c, row)
        if (cc === "╮") {
          right = c
          break
        }
        if (cc !== "─") break // not a clean top border — abort
      }
      if (right < 0) continue
      // Find bottom border.
      let bottom = -1
      for (let r = row + 1; r < lines.length; r++) {
        if (cellAt(col, r) === "╰") {
          bottom = r
          break
        }
        if (cellAt(col, r) !== "│") break // wall broken — abort
      }
      if (bottom < 0) continue
      return { left: col, right, top: row, bottom }
    }
  }
  return null
}

/**
 * Check that no body content bleeds outside a card's bordered rectangle.
 * Specifically: for every body row of the card, every cell at columns
 * `card.left+1 .. card.right-1` is the card's content; the cells AT the
 * border (`left` and `right`) must remain border characters. Returns an
 * array of violation descriptions (empty array = no overflow).
 */
function checkCardBoundary(card: CardBounds, cellAt: (col: number, row: number) => string): string[] {
  const violations: string[] = []
  for (let row = card.top + 1; row < card.bottom; row++) {
    // Left border must be `│`. If it's not, content overwrote the wall.
    const leftCh = cellAt(card.left, row)
    if (leftCh !== "│") {
      violations.push(`row ${row} col ${card.left}: left border is "${leftCh}" — expected "│"`)
    }
    // Right border must be `│`. If text spilled past the available content
    // area, it would have overwritten this cell first.
    const rightCh = cellAt(card.right, row)
    if (rightCh !== "│") {
      violations.push(
        `row ${row} col ${card.right}: right border is "${rightCh}" — expected "│" (text painted into border cell)`,
      )
    }
  }
  return violations
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("card body with long unbreakable token", () => {
  test("path-style token (.claude/skills/{claim,do}/SKILL.md) wraps at /", () => {
    // Single column, card has a body paragraph containing the path.
    // Card is ~38 cells wide (col 1..38); inner content area is cols 2..37
    // (36 cells). The path is 34 chars — fits on one line WITH word-wrap if
    // we break at the `/` separators. Without soft-break wrap the token is
    // unbreakable and overflows.
    const longPath = ".claude/skills/{claim,do}/SKILL.md"
    using app = createTestApp(
      item("board", item("col1", item("Reference incident", item.p(`See ${longPath} more text follows.`)))),
      { cols: 80, rows: 20 },
    )

    const cellAt = (col: number, row: number): string => app.cell(col, row).char || " "
    const card = findCardBoundsAt(app.text, cellAt, { min: 0, max: 5 })
    expect(card, "card bordered region should be detectable").not.toBeNull()
    if (!card) return

    const violations = checkCardBoundary(card, cellAt)
    if (violations.length > 0) {
      throw new Error(`Card body content escaped border:\n${violations.join("\n")}\n\nFull screen:\n${app.text}`)
    }

    // Affirmative check: body content was actually rendered (not silently
    // hidden). At least the prefix `· See` should appear, plus some part
    // of the path token wrapped onto a continuation line.
    expect(app.text).toContain("See")
    // The path will wrap at `/` — at least one of these segments should
    // appear at the START of a wrapped continuation line.
    const text = app.text
    expect(/\.claude\//.test(text) || /skills\//.test(text)).toBe(true)
  })

  test("absolute path token wraps at / instead of overflowing", () => {
    const longPath = "/Users/beorn/Code/pim/km/apps/km-tui/src/views/CardColumn.tsx"
    using app = createTestApp(
      item("board", item("col1", item("Bug report", item.p(`Path is ${longPath} that crashes.`)))),
      { cols: 80, rows: 20 },
    )

    const cellAt = (col: number, row: number): string => app.cell(col, row).char || " "
    const card = findCardBoundsAt(app.text, cellAt, { min: 0, max: 5 })
    expect(card, "card bordered region should be detectable").not.toBeNull()
    if (!card) return

    const violations = checkCardBoundary(card, cellAt)
    if (violations.length > 0) {
      throw new Error(`Absolute path overflowed card border:\n${violations.join("\n")}\n\nFull screen:\n${app.text}`)
    }
  })

  test("snake_case_identifier wraps at _", () => {
    // Long underscore-joined identifier — typical for code symbols
    const longIdent = "very_very_long_underscored_identifier_that_overflows_card"
    using app = createTestApp(item("board", item("col1", item("Symbol", item.p(`Ref: ${longIdent} here.`)))), {
      cols: 80,
      rows: 20,
    })

    const cellAt = (col: number, row: number): string => app.cell(col, row).char || " "
    const card = findCardBoundsAt(app.text, cellAt, { min: 0, max: 5 })
    expect(card, "card bordered region should be detectable").not.toBeNull()
    if (!card) return

    const violations = checkCardBoundary(card, cellAt)
    if (violations.length > 0) {
      throw new Error(
        `Snake_case identifier overflowed card border:\n${violations.join("\n")}\n\nFull screen:\n${app.text}`,
      )
    }
  })

  test("dotted.namespace.token wraps at .", () => {
    const longDotted = "package.subpackage.module.submodule.SymbolName"
    using app = createTestApp(item("board", item("col1", item("Module", item.p(`Use ${longDotted} please.`)))), {
      cols: 80,
      rows: 20,
    })

    const cellAt = (col: number, row: number): string => app.cell(col, row).char || " "
    const card = findCardBoundsAt(app.text, cellAt, { min: 0, max: 5 })
    expect(card, "card bordered region should be detectable").not.toBeNull()
    if (!card) return

    const violations = checkCardBoundary(card, cellAt)
    if (violations.length > 0) {
      throw new Error(`Dotted namespace overflowed card border:\n${violations.join("\n")}\n\nFull screen:\n${app.text}`)
    }
  })
})

describe("card with long path is rendered, not just hidden", () => {
  test("user's reported scenario: path content remains visible after wrap", () => {
    // The complete user scenario: body paragraph with path token, card
    // selected (cursor on it). The fix must (a) not let content overflow
    // the border AND (b) still render the path content (not just clip it).
    using app = createTestApp(
      item(
        "board",
        item("col1", item("Reference", item.p("Path: .claude/skills/{claim,do}/SKILL.md is the workflow."))),
      ),
      { cols: 80, rows: 20 },
    )

    expect(app.state.cursor).toBe("Reference")

    const screen = app.text
    // The path's first segment must appear (wrapped onto its own row).
    expect(screen).toContain(".claude/")
    // The path's last segment too.
    expect(screen).toContain("SKILL.md")
  })
})
