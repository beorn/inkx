/**
 * Undo Cursor Restore — Verifies cursor returns to original position after undo.
 *
 * Bug: After duplicate + undo, cursor jumps to root because the undo entry
 * only reverses the data mutation (deleteNode) but doesn't restore cursor state.
 * The cursor was pointing at the now-deleted duplicate node.
 */
import { describe, it, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("undo cursor restore", () => {
  it("restores cursor to original card after duplicate + undo", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task-a"), item("task-b"), item("task-c")))
    )

    // Cursor starts on task-a. Move to task-b.
    board.press("j")
    board.expect("#task-b[data-cursor]").toExist()

    // Duplicate task-b (key: d)
    board.press("d")
    // After duplicate, cursor moves to the new duplicate (task-b copy)
    // The original task-b should still be visible
    board.expect("#task-b").toExist()

    // Undo (ctrl+z)
    board.press("ctrl+z")

    // After undo, cursor should be back on task-b (not at root or lost)
    board.expect("#task-b[data-cursor]").toExist()
  })

  it("restores cursor when undoing duplicate of first card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("first"), item("second")))
    )

    // Cursor starts on first card
    board.expect("#first[data-cursor]").toExist()

    // Duplicate first card
    board.press("d")

    // Undo
    board.press("ctrl+z")

    // Cursor should be back on first card
    board.expect("#first[data-cursor]").toExist()
  })
})
