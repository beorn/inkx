/**
 * Exploration: Move mode — moving cards between columns.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("move mode", () => {
  test("m enters move mode, then h/l moves card", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("movable"), item("stay")),
          item("col2", item("existing")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#movable[data-cursor]").toExist()

    // Enter move mode
    board.press("m")

    // Move right (to col2)
    board.press("l")

    // Board should render without crash
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("m then Escape cancels move mode", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2")),
          item("col2", item("taskA")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#task1[data-cursor]").toExist()

    board.press("m")
    board.press("escape")

    // Should be back in normal mode
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("task1")
  })

  test("move card within column (j/k in move mode)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("first"), item("second"), item("third")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#first[data-cursor]").toExist()

    // Enter move mode
    board.press("m")

    // Move down
    board.press("j")

    // Board renders without crash
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })
})
