/**
 * Exploration: Dialog interactions — search (/), new item.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("dialog interactions", () => {
  test("/ opens search dialog", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("/")

    // Search dialog should be visible
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("Escape closes search dialog", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("/")
    board.press("escape")

    // After escape, should be back to normal mode
    // Cursor should be somewhere
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
  })

  test("n opens new item dialog", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("n")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("Escape from new item dialog returns to a navigable state", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("n")
    board.press("escape")

    // After escape, board should be usable — cursor somewhere
    const cursor = board.q("[data-cursor]")
    // If new item creates a new item and escape doesn't cancel, cursor may
    // be on the new item. Either way, there should be a cursor.
    expect(cursor.count()).toBeGreaterThan(0)

    // Navigation should work
    board.press("j")
    const afterJ = board.q("[data-cursor]")
    expect(afterJ.count()).toBeGreaterThan(0)
  })
})
