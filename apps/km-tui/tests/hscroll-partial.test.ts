/**
 * Bug: km-tui.hscroll-partial — Cursoring to partially visible columns doesn't
 * trigger horizontal scroll.
 *
 * When navigating right with 'l' to a column that is only partially visible
 * (clipped at the viewport edge), the horizontal scroll should adjust to fully
 * show that column. With Math.ceil in estimatedVisibleCount, the scroll
 * algorithm thinks the column fits when it doesn't.
 *
 * Root cause: useVirtualization's estimatedVisibleCount uses Math.ceil which
 * overcounts items that fit in the viewport. At certain widths, items + gaps
 * exceed the effective viewport by a few chars, but the scroll algorithm
 * doesn't trigger because it thinks the item is within the visible range.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("km-tui.hscroll-partial: partial column visibility triggers scroll", () => {
  // Test at widths where maxCols >= 2 (columns narrower than viewport).
  // Widths 60, 65 have maxCols=1 and column width > viewport — a separate issue.
  for (const width of [73, 75, 77, 85]) {
    test(`width=${width}: cursor column is fully visible after navigating right`, () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("A1")),
            item("col2", item("B1")),
            item("col3", item("C1")),
          ),
        { columns: width, rows: 20 },
      )

      // Start at col1's first card
      board.expect("#A1[data-cursor]").toExist()

      // Navigate right to col2
      board.press("l")
      board.expect("#B1[data-cursor]").toExist()

      // Navigate right to col3
      board.press("l")
      board.expect("#C1[data-cursor]").toExist()

      // col3 must be fully visible — its bounding box right edge must be
      // within the terminal viewport width
      const col3Box = board.q("#col3").boundingBox()
      expect(col3Box, `col3 should be rendered at width=${width}`).not.toBeNull()
      if (col3Box) {
        expect(
          col3Box.x + col3Box.width,
          `col3 right edge (${col3Box.x + col3Box.width}) should be <= viewport width (${width}) at width=${width}`,
        ).toBeLessThanOrEqual(width)
      }
    })
  }

  test("navigating to last column and back preserves full visibility", () => {
    // Use width=73 (a known failing width before the fix)
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1")),
          item("col2", item("B1")),
          item("col3", item("C1")),
        ),
      { columns: 73, rows: 20 },
    )

    // Navigate right twice to col3
    board.press("l").press("l")
    board.expect("#C1[data-cursor]").toExist()

    // col3 must be fully visible
    const col3Box = board.q("#col3").boundingBox()
    expect(col3Box).not.toBeNull()
    if (col3Box) {
      expect(col3Box.x + col3Box.width).toBeLessThanOrEqual(73)
    }

    // Navigate back to col2
    board.press("h")
    board.expect("#B1[data-cursor]").toExist()

    // col2 must be fully visible
    const col2Box = board.q("#col2").boundingBox()
    expect(col2Box).not.toBeNull()
    if (col2Box) {
      expect(col2Box.x + col2Box.width).toBeLessThanOrEqual(73)
    }
  })

  test("widths where column fits: scroll ensures full visibility at various sizes", () => {
    // Broader range of widths where columns should be narrower than viewport
    for (const width of [70, 72, 74, 76, 78, 80, 90, 100, 120]) {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("A1")),
            item("col2", item("B1")),
            item("col3", item("C1")),
          ),
        { columns: width, rows: 20 },
      )

      board.press("l").press("l")
      board.expect("#C1[data-cursor]").toExist()

      const col3Box = board.q("#col3").boundingBox()
      expect(col3Box, `col3 should be rendered at width=${width}`).not.toBeNull()
      if (col3Box) {
        expect(
          col3Box.x + col3Box.width,
          `col3 right edge at width=${width}`,
        ).toBeLessThanOrEqual(width)
      }
    }
  })
})
