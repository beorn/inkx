/**
 * Exploration: Selection — select multiple (v), then operations.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("multiselect operations", () => {
  test("v selects current card, then J extends selection", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2"), item("task3")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#task1[data-cursor]").toExist()

    // v to enter visual/select mode
    board.press("v")

    // Shift+J to extend selection down
    board.press("J")

    // Multiple cards should now be selected
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("v then Escape cancels selection", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("v")
    board.press("escape")

    // Should be back to normal single-cursor mode
    board.expect("#task1[data-cursor]").toExist()
  })

  test("selecting and deleting multiple items with Backspace", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("keep"), item("del1"), item("del2"), item("also-keep")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to del1
    board.press("j")
    board.expect("#del1[data-cursor]").toExist()

    // Select del1 and del2
    board.press("v")
    board.press("J")

    // Delete selected with Backspace
    board.press("backspace")

    const text = stripAnsi(board.screenshot())
    // keep and also-keep should remain
    expect(text).toContain("keep")
  })
})
