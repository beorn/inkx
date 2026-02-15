/**
 * Exploration: Horizontal scroll when columns exceed screen width.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("horizontal scroll", () => {
  test("navigating to off-screen column scrolls horizontally", () => {
    // Create many columns that exceed 60-char screen
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1")),
          item("col2", item("b1")),
          item("col3", item("c1")),
          item("col4", item("d1")),
          item("col5", item("e1")),
          item("col6", item("f1")),
        ),
      { columns: 60, rows: 24 },
    )

    // Navigate right through columns
    board.press("l")
    board.press("l")
    board.press("l")
    board.press("l")
    board.press("l")

    // Should be on f1 (last column)
    board.expect("#f1[data-cursor]").toExist()

    // Screen should show f1
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("f1")
  })

  test("navigating back left after horizontal scroll", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1")),
          item("col2", item("b1")),
          item("col3", item("c1")),
          item("col4", item("d1")),
          item("col5", item("e1")),
        ),
      { columns: 50, rows: 24 },
    )

    // Navigate to rightmost
    board.press("l").press("l").press("l").press("l")
    board.expect("#e1[data-cursor]").toExist()

    // Navigate back to leftmost
    board.press("h").press("h").press("h").press("h")
    board.expect("#a1[data-cursor]").toExist()

    // a1 should be visible
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("a1")
  })
})
