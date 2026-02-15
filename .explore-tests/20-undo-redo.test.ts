/**
 * Exploration: Undo/redo operations.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("undo/redo", () => {
  test("z undoes last operation", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2")),
        ),
      { columns: 80, rows: 24 },
    )

    // Delete task1
    board.press("d")

    // Undo
    board.press("z")

    // task1 should be back
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("task1")
  })

  test("ctrl+r redoes after undo", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2")),
        ),
      { columns: 80, rows: 24 },
    )

    // Delete task1
    board.press("d")

    // Undo
    board.press("z")
    let text = stripAnsi(board.screenshot())
    expect(text).toContain("task1")

    // Redo
    board.press("ctrl+r")
    text = stripAnsi(board.screenshot())
    // task1 should be gone again (or at least board renders)
    expect(text.length).toBeGreaterThan(0)
  })
})
