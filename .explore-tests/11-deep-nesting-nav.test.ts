/**
 * Exploration: Navigation edge cases with deep nesting, single-item columns,
 * and empty columns.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"

describe("navigation edge cases", () => {
  test("single-item column: j at only card is boundary, k goes to header", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("only-card")),
          item("col2", item("c2-card")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#only-card[data-cursor]").toExist()

    // j should hit boundary (only one card)
    board.press("j")
    board.expect("#only-card[data-cursor]").toExist()

    // k should go to column header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("empty column: navigation skips or handles gracefully", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1")),
          item("col2"),
          item("col3", item("c1")),
        ),
      { columns: 100, rows: 24 },
    )

    // Start on a1
    board.expect("#a1[data-cursor]").toExist()

    // l should skip empty col2 or go to its header
    board.press("l")
    const cursor = board.q("[data-cursor]").textContent()
    // Should be somewhere in col2 or col3, not crash
    expect(cursor.length).toBeGreaterThan(0)
  })

  test("deep nesting: items nested 3+ levels render without crash", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1",
            item("L1",
              item("L2",
                item("L3", item("deep-leaf")),
              ),
            ),
          ),
        ),
      { columns: 80, rows: 30 },
    )

    board.expect("#L1[data-cursor]").toExist()

    // Navigate down through nested items
    board.press("j")
    const afterJ = board.q("[data-cursor]").textContent()
    expect(afterJ.length).toBeGreaterThan(0)
  })

  test("many columns: h/l navigation wraps correctly at boundaries", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("c1", item("a1")),
          item("c2", item("b1")),
          item("c3", item("c3-1")),
          item("c4", item("d1")),
          item("c5", item("e1")),
        ),
      { columns: 120, rows: 24 },
    )

    // Navigate right through all columns
    board.expect("#a1[data-cursor]").toExist()
    board.press("l")
    board.expect("#b1[data-cursor]").toExist()
    board.press("l")
    board.expect("[id='c3-1'][data-cursor]").toExist()
    board.press("l")
    board.expect("#d1[data-cursor]").toExist()
    board.press("l")
    board.expect("#e1[data-cursor]").toExist()

    // At rightmost column, l should be boundary
    board.press("l")
    board.expect("#e1[data-cursor]").toExist()

    // Navigate back all the way
    board.press("h").press("h").press("h").press("h")
    board.expect("#a1[data-cursor]").toExist()

    // At leftmost column, h should be boundary
    board.press("h")
    board.expect("#a1[data-cursor]").toExist()
  })
})
