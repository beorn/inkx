/**
 * Bug: km-qlib7 — Asymmetric horizontal scroll
 *
 * Viewport doesn't scroll back symmetrically when navigating left.
 * After scrolling right (l,l from col1 to col3), going back left (h to col2)
 * should restore the viewport to show col1+col2, but it stays at col2+col3.
 *
 * Root cause: calcEdgeBasedScrollOffset with effectivePadding=0 (when
 * visibleCount=2 and padding=1) only scrolls when cursor is OUTSIDE visible
 * range. Col2 at the left edge is still "inside" the visible range.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("km-qlib7: asymmetric horizontal scroll", () => {
  test("navigating left restores viewport symmetrically", () => {
    // 4 columns in 80-wide terminal: only 2 columns visible at once
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1")),
          item("col2", item("B1")),
          item("col3", item("C1")),
          item("col4", item("D1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Start at col1's first card (A1)
    board.expect("#A1[data-cursor]").toExist()

    // col1 and col2 should be visible initially
    const col1Initial = board.q("#col1").boundingBox()
    const col2Initial = board.q("#col2").boundingBox()
    expect(col1Initial).not.toBeNull()
    expect(col2Initial).not.toBeNull()

    // Press l -> col2
    board.press("l")
    board.expect("#B1[data-cursor]").toExist()
    // col1 and col2 still visible (no scroll needed)
    expect(board.q("#col1").boundingBox()).not.toBeNull()
    expect(board.q("#col2").boundingBox()).not.toBeNull()

    // Press l -> col3 (scrolls right, viewport shows col2+col3)
    board.press("l")
    board.expect("#C1[data-cursor]").toExist()
    // col3 should be visible now
    expect(board.q("#col3").boundingBox()).not.toBeNull()

    // Press h -> col2 (BUG: viewport stays at col2+col3 instead of scrolling back to col1+col2)
    board.press("h")
    board.expect("#B1[data-cursor]").toExist()

    // col1 should be visible again after scrolling back
    // This is the assertion that fails — viewport doesn't scroll back
    const col1After = board.q("#col1").boundingBox()
    expect(col1After, "col1 should be visible after navigating back to col2").not.toBeNull()
  })

  test("back-and-forth navigation maintains symmetric scroll positions", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1")),
          item("col2", item("B1")),
          item("col3", item("C1")),
          item("col4", item("D1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Navigate right: col1 -> col2 -> col3
    board.press("l").press("l")
    board.expect("#C1[data-cursor]").toExist()

    // Navigate left: col3 -> col2 -> col1
    board.press("h").press("h")
    board.expect("#A1[data-cursor]").toExist()

    // col1 must be visible (we're on it!)
    const col1Box = board.q("#col1").boundingBox()
    expect(col1Box, "col1 must be visible when cursor is on col1").not.toBeNull()

    // Navigate right again: col1 -> col2
    board.press("l")
    board.expect("#B1[data-cursor]").toExist()

    // Both col1 and col2 should be visible (same as initial state)
    expect(board.q("#col1").boundingBox(), "col1 visible with cursor on col2").not.toBeNull()
    expect(board.q("#col2").boundingBox(), "col2 visible with cursor on col2").not.toBeNull()
  })
})
