/**
 * When zoom-out (u) can't go higher because we're already at the repo root,
 * the cursor should move up through the selection levels:
 *   card → column header → board root
 *
 * Bead: km-tui.zoom-cursor-fallback
 */

import { describe, it, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("zoom-out fallback: cursor moves up when at repo root", () => {
  it("moves cursor from card to column header when at repo root", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task1"), item("task2")),
        item("col2", item("task3")),
      ),
    )

    // Cursor starts on first card (task1)
    board.expect("#task1[data-cursor]").toExist()

    // Press u — can't zoom out from repo root, so cursor should move up
    board.press("u")

    // Should now be at column header level
    board.expect("#col1[data-cursor]").toExist()
  })

  it("moves cursor from column header to board root when at repo root", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task1")),
        item("col2", item("task3")),
      ),
    )

    // Move to column header first
    board.press("k") // card → column header

    board.expect("#col1[data-cursor]").toExist()

    // Press u — should move to board level
    board.press("u")

    board.expect("#board[data-cursor]").toExist()
  })

  it("rings bell at board level when at repo root (nowhere to go)", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task1")),
      ),
    )

    // Navigate up to board level
    board.press("k") // column header
    board.press("k") // board level

    board.expect("#board[data-cursor]").toExist()

    // Press u at board level — should ring bell
    board.press("u")
    expect(board.bell).toBe(true)
  })

  it("moves cursor to parent: card → column → board", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("a"), item("b"), item("c")),
      ),
    )

    // Start at first card, navigate to third card
    board.press("j").press("j")
    board.expect("#c[data-cursor]").toExist()

    // u goes to PARENT (not prev sibling): c → col1 → board
    board.press("u")
    board.expect("#col1[data-cursor]").toExist()

    board.press("u") // column header → board
    board.expect("#board[data-cursor]").toExist()

    board.press("u") // at board level, should ring bell
    expect(board.bell).toBe(true)
  })
})
