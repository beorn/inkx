/**
 * Test for h/l boundary crash (km-cwn2)
 */
import { test, expect } from "bun:test"
import { testEnv, item } from "./helpers/board-test.ts"

test("h/l at right boundary doesn't crash", () => {
  const { board } = testEnv(() =>
    item(
      "board",
      item("col1", item("1a"), item("1b")),
      item("col2", item("2a"), item("2b")),
      item("col3", item("3a"), item("3b")),
    ),
  )

  // Start at first card
  board.expect("#1a[data-cursor]").toExist()

  // Move right to col2
  board.press("l")
  board.expect("#2a[data-cursor]").toExist()

  // Move right to col3
  board.press("l")
  board.expect("#3a[data-cursor]").toExist()

  // Try to move right past boundary (should not crash)
  board.press("l")
  board.expect("#3a[data-cursor]").toExist()

  // Try multiple times
  for (let i = 0; i < 10; i++) {
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()
  }
})

test("h at left boundary doesn't crash", () => {
  const { board } = testEnv(() =>
    item(
      "board",
      item("col1", item("1a"), item("1b")),
      item("col2", item("2a"), item("2b")),
      item("col3", item("3a"), item("3b")),
    ),
  )

  // Start at first card
  board.expect("#1a[data-cursor]").toExist()

  // Try to move left past boundary (should not crash)
  board.press("h")
  board.expect("#1a[data-cursor]").toExist()

  // Try multiple times
  for (let i = 0; i < 10; i++) {
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
  }
})
