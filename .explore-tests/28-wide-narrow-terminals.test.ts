/**
 * Exploration: Rendering at extreme terminal sizes.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("terminal size edge cases", () => {
  test("very narrow terminal (30 cols) renders without crash", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("short")),
        ),
      { columns: 30, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("very short terminal (8 rows) renders without crash", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2")),
        ),
      { columns: 80, rows: 8 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("minimum terminal (20x5) renders without crash", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("t")),
        ),
      { columns: 20, rows: 5 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("wide terminal (200 cols) renders correctly", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1")),
          item("col2", item("task2")),
        ),
      { columns: 200, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text).toContain("task1")
    expect(text).toContain("task2")
  })

  test("navigation works in narrow terminal", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1"), item("a2")),
          item("col2", item("b1")),
        ),
      { columns: 40, rows: 15 },
    )

    board.press("j")
    board.press("l")

    // Should not crash, cursor should be somewhere
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
  })
})
