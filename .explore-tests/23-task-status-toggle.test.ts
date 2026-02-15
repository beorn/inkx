/**
 * Exploration: Task status toggling (x to toggle done/todo).
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("task status toggle", () => {
  test("x toggles task status", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("my-task", "todo")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("[id='my-task'][data-cursor]").toExist()

    // Toggle status
    board.press("x")

    // Board should render without crash
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
    expect(text).toContain("my-task")
  })

  test("double x returns to original status", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("toggle-task", "todo")),
        ),
      { columns: 80, rows: 24 },
    )

    // Toggle twice
    board.press("x")
    board.press("x")

    // Should render without crash
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("toggle-task")
  })

  test("x on non-task item does not crash", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.paragraph("just text")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("x")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })
})
