/**
 * Exploration: View mode transitions — cards to columns, outline depth changes.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("view mode transitions", () => {
  test("switching to columns view preserves cursor context", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2")),
          item("col2", item("taskA")),
        ),
      { columns: 80, rows: 24, viewMode: "cards" },
    )

    // Navigate to task2
    board.press("j")
    board.expect("#task2[data-cursor]").toExist()

    // Switch to columns view (1/2/3/4 cycle view modes)
    board.press("2")

    // Board should still render without crash
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)

    // Cursor should still be somewhere reasonable
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
  })

  test("switching to list view", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2")),
        ),
      { columns: 80, rows: 24, viewMode: "cards" },
    )

    // Switch to list view
    board.press("3")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)

    // Tasks should still be visible in some form
    expect(text).toContain("task1")
  })

  test("outline depth increase/decrease works", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1",
            item("task1", item("sub1"), item("sub2")),
            item("task2"),
          ),
        ),
      { columns: 80, rows: 24, viewMode: "columns" },
    )

    // In columns view, + and - control outline depth
    board.press("+")
    const text1 = stripAnsi(board.screenshot())
    expect(text1.length).toBeGreaterThan(0)

    board.press("-")
    const text2 = stripAnsi(board.screenshot())
    expect(text2.length).toBeGreaterThan(0)
  })
})
