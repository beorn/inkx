/**
 * Defaults contract — extractText (@silvery/headless) copy extraction.
 *
 * Bead: km-silvery 19756 (selection-copy-margins).
 *
 * The one rule this file exists to enforce (silvery CLAUDE.md § "Defaults
 * contract tests"): every public option with a documented default MUST have a
 * test that OMITS the option and asserts the documented behavior. 19756 flipped
 * `extractText`'s `respectSelectableFlag` default from `false` to `true` (copy
 * is *semantic* by contract — what is highlighted is what is copied). Without an
 * omit-the-option test, the docstring and the code can drift apart silently —
 * exactly the defaults-contract failure class that shipped three times in one
 * week (see CLAUDE.md). These tests call `extractText` with the option omitted
 * and assert the semantic default; the explicit-`false` cases pin the documented
 * Shift+drag raw-rectangle escape hatch so it cannot rot either.
 *
 * Pure-function level. The matching drag-through-the-runtime integration lives
 * in tests/features/selection-copy-margins.test.tsx.
 */

import { describe, test, expect } from "vitest"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { extractText } from "@silvery/headless/selection"

// ============================================================================
// Helpers
// ============================================================================

/**
 * A row with a `gutterWidth`-cell non-selectable left gutter (margin/padding),
 * then selectable `content`. Mirrors a real render where layout blanks are
 * non-selectable and text-origin cells carry SELECTABLE_FLAG.
 */
function rowWithGutter(
  buf: TerminalBuffer,
  row: number,
  gutterWidth: number,
  content: string,
): void {
  for (let i = 0; i < gutterWidth; i++) {
    buf.setCell(i, row, { char: " ", selectable: false })
  }
  for (let i = 0; i < content.length; i++) {
    buf.setCell(gutterWidth + i, row, { char: content[i]!, selectable: true })
  }
}

// ============================================================================
// Contract — respectSelectableFlag defaults to true (semantic copy)
// ============================================================================

describe("contract: extractText respectSelectableFlag default", () => {
  test("contract: omitting the option skips non-selectable gutter cells", () => {
    const buf = new TerminalBuffer(24, 1)
    rowWithGutter(buf, 0, 4, "Hello")

    // Option OMITTED — exercises the documented default (true / semantic copy).
    const text = extractText(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 8, row: 0 },
    })

    expect(text).toBe("Hello")
  })

  test("contract: default skips the left gutter on EVERY row of a multi-row selection", () => {
    // The 19756 bug shape: a multi-row selection whose rectangle covers each
    // interior row's leading gutter. The default must drop the gutter on all
    // rows, not just the anchor/head row.
    const buf = new TerminalBuffer(24, 3)
    rowWithGutter(buf, 0, 4, "FIRST")
    rowWithGutter(buf, 1, 4, "SECOND")
    rowWithGutter(buf, 2, 4, "THIRD")

    const text = extractText(buf, {
      anchor: { col: 4, row: 0 },
      head: { col: 20, row: 2 },
    })

    expect(text).toBe("FIRST\nSECOND\nTHIRD")
    expect(text).not.toContain("    SECOND")
    expect(text).not.toContain("    THIRD")
  })

  test("contract: respectSelectableFlag:false opts out — raw rectangle keeps the gutter", () => {
    // The documented Shift+drag escape hatch (docs/guide/text-selection.md):
    // raw screen-rectangle extraction must still copy the non-selectable cells
    // verbatim, so users can grab exactly what they see on screen.
    const buf = new TerminalBuffer(24, 1)
    // Two visible gutter chars (X Y) so the raw rectangle is observable.
    buf.setCell(0, 0, { char: "X", selectable: false })
    buf.setCell(1, 0, { char: "Y", selectable: false })
    const content = "Hi"
    for (let i = 0; i < content.length; i++) {
      buf.setCell(2 + i, 0, { char: content[i]!, selectable: true })
    }

    const raw = extractText(
      buf,
      { anchor: { col: 0, row: 0 }, head: { col: 3, row: 0 } },
      { respectSelectableFlag: false },
    )
    expect(raw).toBe("XYHi")

    // And the default (omitted) drops them — the two paths must diverge exactly
    // on the selectable-flag, proving the default is the semantic one.
    const semantic = extractText(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 3, row: 0 },
    })
    expect(semantic).toBe("Hi")
  })
})
