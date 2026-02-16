/**
 * Bug: km-tui.shift-cursor — column shift moves cursor, should stay
 *
 * After shifting a column with Meta+l/Meta+h, the cursor should stay on
 * the shifted column. Subsequent navigation (j to enter column, l/h to
 * move between columns) should work correctly from the new position.
 * Visual column order should also reflect the shift.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("km-tui.shift-cursor: column shift preserves cursor position", () => {
  test("Meta+l shifts column right — cursor stays on same column header", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    board.press("Meta+l")

    // Cursor should still be on col1 (now at position 1)
    board.expect("#col1[data-cursor]").toExist()

    // Navigate down into the column — should enter col1's cards, not col2's
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("Meta+h shifts column left — cursor stays on same column header", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    // Navigate to col2 header
    board.press("l")
    board.press("k")
    board.expect("#col2[data-cursor]").toExist()

    // Shift col2 left
    board.press("Meta+h")

    // Cursor should still be on col2 (now at position 0)
    board.expect("#col2[data-cursor]").toExist()

    // Navigate down into the column — should enter col2's cards
    board.press("j")
    board.expect("#2a[data-cursor]").toExist()
  })

  test("Meta+l shifts column right — pressing l from shifted column moves to next column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right (col1 is now at position 1, between col2 and col3)
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()

    // Press l to move to next column — should go to col3 (which is now at position 2)
    board.press("l")
    board.expect("#col3[data-cursor]").toExist()
  })

  test("Meta+h shifts column left — pressing h from shifted column moves to previous column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    // Navigate to col3 header
    board.press("l").press("l").press("k")
    board.expect("#col3[data-cursor]").toExist()

    // Shift col3 left (col3 is now at position 1, between col1 and col2)
    board.press("Meta+h")
    board.expect("#col3[data-cursor]").toExist()

    // Press h to move to previous column — should go to col1 (at position 0)
    board.press("h")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("shift column right then down enters correct column's cards", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a")),
      ),
    )
    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()

    // Navigate down — should enter col1's first card
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()

    // Navigate further down — should see col1's second card
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("shift column left then down enters correct column's cards", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("1a")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a")),
      ),
    )
    // Navigate to col2 header
    board.press("l").press("k")
    board.expect("#col2[data-cursor]").toExist()

    // Shift col2 left
    board.press("Meta+h")
    board.expect("#col2[data-cursor]").toExist()

    // Navigate down — should enter col2's first card
    board.press("j")
    board.expect("#2a[data-cursor]").toExist()

    // Navigate further down — should see col2's second card
    board.press("j")
    board.expect("#2b[data-cursor]").toExist()
  })

  test("Meta+l visually reorders columns — all 3 columns visible", () => {
    // Use wider terminal to ensure all columns fit without scrolling
    const { board } = testEnv(
      () => item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      { columns: 120, rows: 24 },
    )
    // Navigate to col1 header and shift right
    board.press("k")
    board.press("Meta+l")

    // After shift: visual order should be col2, col1, col3
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    const col3Box = board.q("#col3").boundingBox()
    expect(col1Box).not.toBeNull()
    expect(col2Box).not.toBeNull()
    expect(col3Box).not.toBeNull()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
    expect(col1Box!.x).toBeLessThan(col3Box!.x)
  })

  test("Meta+h visually reorders columns — all 3 columns visible", () => {
    // Use wider terminal to ensure all columns fit without scrolling
    const { board } = testEnv(
      () => item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      { columns: 120, rows: 24 },
    )
    // Navigate to col2 header and shift left
    board.press("l").press("k")
    board.press("Meta+h")

    // After shift: visual order should be col2, col1, col3
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    const col3Box = board.q("#col3").boundingBox()
    expect(col1Box).not.toBeNull()
    expect(col2Box).not.toBeNull()
    expect(col3Box).not.toBeNull()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
    expect(col1Box!.x).toBeLessThan(col3Box!.x)
  })

  test("multiple shifts preserve cursor and visual order", () => {
    // Use wider terminal for 4 columns
    const { board } = testEnv(
      () => item("board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
        item("col4", item("4a")),
      ),
      { columns: 160, rows: 24 },
    )
    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right three times (col1 moves: pos 0 -> 1 -> 2 -> 3)
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()

    // col1 should now be at the rightmost position
    // Visual order: col2, col3, col4, col1
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    const col3Box = board.q("#col3").boundingBox()
    const col4Box = board.q("#col4").boundingBox()
    expect(col1Box).not.toBeNull()
    expect(col2Box).not.toBeNull()
    expect(col3Box).not.toBeNull()
    expect(col4Box).not.toBeNull()
    expect(col2Box!.x).toBeLessThan(col3Box!.x)
    expect(col3Box!.x).toBeLessThan(col4Box!.x)
    expect(col4Box!.x).toBeLessThan(col1Box!.x)

    // Navigate down — should enter col1's card
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("shift column with narrow viewport scrolls cursor into view", () => {
    // 80-wide viewport with 3 columns: maxCols = floor(80/35) = 2
    // So only 2 columns visible at once — scroll is active
    const { board } = testEnv(
      () => item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      { columns: 80, rows: 24 },
    )
    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    board.press("Meta+l")

    // Cursor should still be on col1 — and col1 should be visible (in viewport)
    board.expect("#col1[data-cursor]").toExist()
    const col1Box = board.q("#col1").boundingBox()
    expect(col1Box).not.toBeNull()
  })
})
