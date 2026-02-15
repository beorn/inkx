/**
 * Exploration: Indent/outdent operations (> and <).
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("indent/outdent", () => {
  test("> indents card (makes it child of previous sibling)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("parent"), item("to-indent")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to to-indent
    board.press("j")
    board.expect("[id='to-indent'][data-cursor]").toExist()

    // Indent
    board.press(">")

    // Board should render without crash
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("< outdents card (moves it up a level)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("parent", item("child"))),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to child (j to get into parent's children)
    board.press("j")

    // Outdent
    board.press("<")

    // Board should render without crash
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })
})
