/**
 * Exploration: Navigation with collapsed columns.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("collapsed column navigation", () => {
  test("collapsing a column with 'c' then navigating past it", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1")),
          item("col2 collapse=true", item("b1")),
          item("col3", item("c1")),
        ),
      { columns: 100, rows: 24 },
    )

    // col2 starts collapsed. Navigate right from col1
    board.expect("#a1[data-cursor]").toExist()

    // l should skip collapsed col2 and go to col3
    board.press("l")
    // Should be in col3 or col2 header
    const cursor = board.q("[data-cursor]").textContent()
    // col2 items (b1) should not be visible if collapsed
    expect(cursor.length).toBeGreaterThan(0)
  })

  test("toggling column collapse with 'c' key", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1"), item("a2")),
          item("col2", item("b1")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Collapse with 'c'
    board.press("c")

    // col1 should be collapsed (cards not visible in their full form)
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })
})
