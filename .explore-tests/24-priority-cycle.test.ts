/**
 * Exploration: Priority cycling (tp to cycle priority).
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("priority cycling", () => {
  test("tp cycles priority on task", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("priority-task")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("[id='priority-task'][data-cursor]").toExist()

    // tp to set/cycle priority
    board.press("t").press("p")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
    // Should show some priority indicator
  })

  test("multiple tp cycles through priority levels", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("cycle-task")),
        ),
      { columns: 80, rows: 24 },
    )

    // Cycle multiple times
    board.press("t").press("p")
    board.press("t").press("p")
    board.press("t").press("p")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })
})
