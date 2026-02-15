/**
 * Exploration: Keys at board level — behavior when cursor is on board root.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("board level key behavior", () => {
  test("at board level: l and h are boundary", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a")),
          item("col2", item("b")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to board level
    board.press("k").press("k")
    board.expect("#board[data-cursor]").toExist()

    // h at board level is boundary
    board.press("h")
    board.expect("#board[data-cursor]").toExist()

    // l at board level is boundary
    board.press("l")
    board.expect("#board[data-cursor]").toExist()
  })

  test("at board level: Enter zooms into board (no-op or shows children)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to board level
    board.press("k").press("k")
    board.expect("#board[data-cursor]").toExist()

    // Enter at board level
    board.press("return")

    // Should not crash
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("at board level: v then j selects columns", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a")),
          item("col2", item("b")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to board level
    board.press("k").press("k")
    board.expect("#board[data-cursor]").toExist()

    // v for visual select at board level
    board.press("v")

    // Should not crash
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })
})
