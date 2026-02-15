/**
 * Regression check: km-tui.virtual-nav
 *
 * Body cards should be navigable — cursor should NOT jump to title.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"

describe("virtual body navigation (km-tui.virtual-nav)", () => {
  test("body paragraphs are navigable with j/k", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("para1"),
          item.paragraph("para2"),
          item("col1", item("task1")),
        ),
    )

    // Cursor should start on first body paragraph
    board.expect("#para1[data-cursor]").toExist()

    // j should move to second paragraph, not jump to board title
    board.press("j")
    board.expect("#para2[data-cursor]").toExist()
    board.expect("#board[data-cursor]").not.toExist()
  })

  test("l from body column navigates to first structural column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("intro text"),
          item("Todo", item("task1"), item("task2")),
          item("Done", item("done1")),
        ),
    )

    // Start on body paragraph
    board.expect("[id='intro text'][data-cursor]").toExist()

    // l should navigate to first structural column card
    board.press("l")
    board.expect("#task1[data-cursor]").toExist()
  })

  test("h from first structural column goes back to body", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("body text"),
          item("col1", item("task1")),
        ),
    )

    // Navigate to col1
    board.press("l")
    board.expect("#task1[data-cursor]").toExist()

    // h should go back to body column
    board.press("h")
    board.expect("[id='body text'][data-cursor]").toExist()
  })
})
