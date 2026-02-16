/**
 * Bug: km-tui.header-j-scroll — j from board header enters off-screen column
 * without scrolling to it.
 *
 * When cursor is at board header level and user presses j, the cursor enters
 * a column (via stickyX memory) that may be off-screen. The viewport should
 * scroll to make that column visible, but it doesn't.
 *
 * Root cause: Board.tsx passes scrollTo={undefined} when isBoardSelected,
 * which freezes the HorizontalVirtualList scroll state. When j transitions
 * from board to column, scrollTo changes from undefined to layout.colIndex,
 * but the frozen scroll offset may not include the target column.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("header-j-scroll (km-tui.header-j-scroll)", () => {
  /**
   * Create a board with enough columns that some are off-screen.
   * At 80 columns width, ~2 columns fit (each ~35+ chars wide).
   */
  function createWideBoard() {
    return item.root(
      "board",
      item("col-a", item("a1"), item("a2")),
      item("col-b", item("b1"), item("b2")),
      item("col-c", item("c1"), item("c2")),
      item("col-d", item("d1"), item("d2")),
      item("col-e", item("e1"), item("e2")),
    )
  }

  test("j from board header scrolls to remembered off-screen column", () => {
    const { board } = testEnv(createWideBoard, {
      columns: 80,
      rows: 24,
    })

    // Initial state: cursor on first card in first column
    board.expect("#a1[data-cursor]").toExist()

    // Navigate right to col-e (off-screen column)
    board.press("l").press("l").press("l").press("l")
    // Should now be on e1
    board.expect("#e1[data-cursor]").toExist()
    // col-e should be visible
    board.expectScreen("e1")

    // Navigate up to column header
    board.press("k")
    // Navigate up to board header
    board.press("k")
    // Verify we're at board level
    board.expect("[data-board][data-cursor]").toExist()

    // Now press j — should return to col-e (via stickyX) and scroll to it
    board.press("j")

    // The cursor should be on col-e's header
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // stickyX should have returned us to col-e
    expect(cursor.textContent()).toContain("col-e")

    // AND the column should be visible on screen (this is the bug —
    // the cursor enters col-e but the viewport doesn't scroll to show it)
    // Check that col-e's cards are visible in the rendered output
    const screenshot = board.screenshot()
    expect(screenshot).toContain("e1")
    expect(screenshot).toContain("e2")
  })

  test("j from board header to first column does not need scrolling", () => {
    const { board } = testEnv(createWideBoard, {
      columns: 80,
      rows: 24,
    })

    // Navigate up to board header from first column
    board.press("k").press("k")

    // j should enter first column (no stickyX set)
    board.press("j")

    // First column should be visible (it already was)
    board.expectScreen("a1")
    board.expectScreen("a2")
  })

  test("j from board header after visiting far column via h/l", () => {
    const { board } = testEnv(createWideBoard, {
      columns: 80,
      rows: 24,
    })

    // Navigate to col-d column header
    board.press("k") // to col-a header
    board.press("l").press("l").press("l") // to col-d header

    // Go up to board
    board.press("k")

    // j should return to col-d and scroll to show it
    board.press("j")

    // col-d should be visible
    const screenshot = board.screenshot()
    expect(screenshot).toContain("d1")
  })
})
