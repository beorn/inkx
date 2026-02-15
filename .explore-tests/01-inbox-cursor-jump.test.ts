/**
 * Verification: km-tui.inbox-cursor-jump
 *
 * Bug: navigating down from a specific card causes cursor to jump to
 * the board title instead of the next card.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"

describe("inbox cursor jump (km-tui.inbox-cursor-jump)", () => {
  test("j from first card goes to second card, not board title", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("card1"), item("card2"), item("card3")),
          item("col2", item("cardA"), item("cardB")),
        ),
      { columns: 80, rows: 24 },
    )

    // Cursor should start on card1
    board.expect("#card1[data-cursor]").toExist()

    // j should go to card2
    board.press("j")
    board.expect("#card2[data-cursor]").toExist()

    // j again should go to card3
    board.press("j")
    board.expect("#card3[data-cursor]").toExist()

    // Should NOT be on board title
    board.expect("#board[data-cursor]").not.toExist()
  })

  test("j through all cards in multi-column board stays within column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Inbox", item("task1"), item("task2"), item("task3"), item("task4")),
          item("Todo", item("todoA"), item("todoB")),
          item("Done", item("doneX")),
        ),
      { columns: 100, rows: 24 },
    )

    // Start on task1
    board.expect("#task1[data-cursor]").toExist()

    // Navigate down through all cards in first column
    board.press("j")
    board.expect("#task2[data-cursor]").toExist()

    board.press("j")
    board.expect("#task3[data-cursor]").toExist()

    board.press("j")
    board.expect("#task4[data-cursor]").toExist()

    // At the bottom of the column, j should NOT jump to board title
    board.press("j")
    // Should stay on task4 (boundary) or be on task4 still
    const cursor = board.q("[data-cursor]").textContent()
    expect(cursor).toContain("task4")
    board.expect("#board[data-cursor]").not.toExist()
  })

  test("navigating l then j in second column works correctly", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1"), item("a2")),
          item("col2", item("b1"), item("b2"), item("b3")),
        ),
      { columns: 80, rows: 24 },
    )

    // Move to col2
    board.press("l")
    board.expect("#b1[data-cursor]").toExist()

    // Navigate down
    board.press("j")
    board.expect("#b2[data-cursor]").toExist()

    board.press("j")
    board.expect("#b3[data-cursor]").toExist()

    // Should NOT jump to board title
    board.expect("#board[data-cursor]").not.toExist()
  })
})
