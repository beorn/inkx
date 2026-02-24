/**
 * Move Mode Visual Feedback Tests
 *
 * Tests that move mode shows visual indicators in the status bar.
 */

import { describe, it, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Move Mode UI", () => {
  it("shows MOVE indicator when entering move mode", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
    )

    // Initially no move mode indicator
    const initial = board.screenshot()
    expect(initial).not.toContain("MOVE")

    // Select current node with Shift+J (extend selection down)
    board.press("shift+ArrowDown") // Shift+J to select current and next

    // Enter move mode with 'm'
    board.press("m").press("m")

    // Should show MOVE indicator in status bar
    const afterMove = board.screenshot()
    expect(afterMove).toContain("MOVE")
  })

  it("hides MOVE indicator when canceling move mode", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
    )

    // Select and enter move mode
    board.press("shift+ArrowDown") // Shift+J to select
    board.press("m").press("m") // Enter move mode
    expect(board.screenshot()).toContain("MOVE")

    // Cancel with Escape
    board.press("\x1b") // Escape key

    // Should hide MOVE indicator
    const afterCancel = board.screenshot()
    expect(afterCancel).not.toContain("MOVE")
  })

  it("hides MOVE indicator after confirming move", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
    )

    // Select and enter move mode
    board.press("shift+ArrowDown") // Shift+J to select
    board.press("m").press("m") // Enter move mode
    expect(board.screenshot()).toContain("MOVE")

    // Move to different column and confirm with Enter
    board.press("l") // Move right to col2
    board.press("\r") // Enter key to confirm

    // Should hide MOVE indicator after confirmation
    const afterConfirm = board.screenshot()
    expect(afterConfirm).not.toContain("MOVE")
  })

  it("shows MOVE indicator while navigating in move mode", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("task1"), item("task2"), item("task3")),
        item("col2", item("task4"), item("task5")),
      ),
    )

    // Select and enter move mode
    board.press("shift+ArrowDown") // Shift+J to select
    board.press("m").press("m") // Enter move mode
    expect(board.screenshot()).toContain("MOVE")

    // Navigate around - indicator should persist
    board.press("j") // Down
    expect(board.screenshot()).toContain("MOVE")

    board.press("l") // Right to next column
    expect(board.screenshot()).toContain("MOVE")

    board.press("k") // Up
    expect(board.screenshot()).toContain("MOVE")
  })

  it("does not show MOVE indicator in normal mode", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
    )

    // Navigate normally - no MOVE indicator
    board.press("j")
    expect(board.screenshot()).not.toContain("MOVE")

    board.press("l")
    expect(board.screenshot()).not.toContain("MOVE")

    board.press("k")
    expect(board.screenshot()).not.toContain("MOVE")
  })
})
