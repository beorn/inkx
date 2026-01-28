/**
 * Test for h/l navigation at board level (km-tui-2)
 *
 * When cursor is on the board title (board level), h/l should not move
 * the cursor since board titles span the full width. Should ring bell
 * and stay at board level.
 */
import { test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

test("h at board level should ring bell and not move", () => {
  const { board } = testEnv(() =>
    item(
      "board",
      item("col1", item("1a"), item("1b")),
      item("col2", item("2a"), item("2b")),
    ),
  )

  // Start at first card
  board.expect("#1a[data-cursor]").toExist()

  // Move up to column header
  board.press("k")
  board.expect("#col1[data-cursor]").toExist()

  // Move up to board title
  board.press("k")
  board.expect("#board[data-cursor]").toExist()

  // Now try h - should ring bell and stay at board
  board.press("h")
  expect(board.bell).toBe(true)
  board.expect("#board[data-cursor]").toExist()
})

test("l at board level should ring bell and not move", () => {
  const { board } = testEnv(() =>
    item(
      "board",
      item("col1", item("1a"), item("1b")),
      item("col2", item("2a"), item("2b")),
    ),
  )

  // Navigate to board level
  board.press("k") // to column header
  board.press("k") // to board title
  board.expect("#board[data-cursor]").toExist()

  // Now try l - should ring bell and stay at board
  board.press("l")
  expect(board.bell).toBe(true)
  board.expect("#board[data-cursor]").toExist()
})

test("multiple h/l at board level should all ring bell", () => {
  const { board } = testEnv(() =>
    item(
      "board",
      item("col1", item("1a")),
      item("col2", item("2a")),
      item("col3", item("3a")),
    ),
  )

  // Navigate to board level
  board.press("k") // to column header
  board.press("k") // to board title
  board.expect("#board[data-cursor]").toExist()

  // Try h multiple times - all should ring bell
  for (let i = 0; i < 5; i++) {
    board.press("h")
    expect(board.bell).toBe(true)
    board.expect("#board[data-cursor]").toExist()
  }

  // Try l multiple times - all should ring bell
  for (let i = 0; i < 5; i++) {
    board.press("l")
    expect(board.bell).toBe(true)
    board.expect("#board[data-cursor]").toExist()
  }
})
