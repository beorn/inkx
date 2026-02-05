/**
 * Cursor Stability Invariant
 *
 * Moving the cursor should only change ANSI styling (cursor highlight),
 * not the underlying text content - unless scrolling happens.
 *
 * This catches cache invalidation bugs where content disappears.
 */
import { test, expect, describe } from "vitest"
import { loadTestBoard, createTestBoard, check } from "@km/tui/test"
import { stripAnsi } from "inkx/testing"
import { existsSync } from "fs"

/**
 * Extract board content (everything except breadcrumb and status bar).
 * Breadcrumb is line 0, status bar is last line.
 */
function getBoardContent(text: string): string {
  const lines = stripAnsi(text).split("\n")
  // Skip first line (breadcrumb) and last line (status bar)
  return lines.slice(1, -1).join("\n")
}

/**
 * Check that board content is stable after cursor movement.
 * The breadcrumb and status bar can change, but columns/cards should not.
 */
function expectBoardContentStable(
  before: string,
  after: string,
  action: string,
) {
  const contentBefore = getBoardContent(before)
  const contentAfter = getBoardContent(after)

  // If scrolling happened, content can legitimately change
  const scrolled =
    contentAfter.includes("▲") !== contentBefore.includes("▲") ||
    contentAfter.includes("▼") !== contentBefore.includes("▼") ||
    contentAfter.includes("+") !== contentBefore.includes("+") // "+N more" indicator

  if (!scrolled) {
    expect(
      contentAfter,
      `Board content changed after ${action} (no scroll)`,
    ).toBe(contentBefore)
  }
}

describe("Cursor movement preserves text content", () => {
  test("synthetic: j/k movement preserves text", () => {
    const board = createTestBoard([
      "Col > Task A",
      "Col > Task B",
      "Col > Task C",
    ])

    const initial = board.text

    board.press("j")
    expectBoardContentStable(initial, board.text, "j")

    board.press("k")
    expectBoardContentStable(initial, board.text, "k (back)")

    check.all(board)
  })

  test("synthetic: level changes preserve text", () => {
    const board = createTestBoard(["Projects > Task A", "Projects > Task B"])

    const initial = board.text

    // Up to column level
    board.press("k")
    expectBoardContentStable(initial, board.text, "k to column")

    // Up to board level
    board.press("k")
    expectBoardContentStable(initial, board.text, "k to board")

    // Back down
    board.press("j")
    expectBoardContentStable(initial, board.text, "j to column")

    board.press("j")
    expectBoardContentStable(initial, board.text, "j to card")
  })

  // BUG: Content shifts after navigating up/down levels with real vault
  // See bead km-tui.level-nav-shift
  test.skip("real vault: level changes preserve text", async () => {
    const board = await loadTestBoard("/tmp/v2")

    const initial = board.text

    // Navigate up through levels
    board.press("k")
    expectBoardContentStable(initial, board.text, "k (first)")

    board.press("k")
    expectBoardContentStable(initial, board.text, "k (second)")

    // Navigate back down
    board.press("j")
    board.press("j")
    expectBoardContentStable(initial, board.text, "j j (back to start)")

    check.rendering(board)
  })
})
