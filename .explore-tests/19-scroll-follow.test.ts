/**
 * Exploration: Scroll follows cursor when column has many items.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("scroll follow", () => {
  test("scrolling down reveals items below fold", () => {
    // Create a column with many items that won't all fit on screen
    const items: ReturnType<typeof item>[] = []
    for (let i = 0; i < 20; i++) {
      items.push(item(`task-${i}`))
    }

    const { board } = testEnv(
      () => item("board", item("col1", ...items)),
      { columns: 80, rows: 15 }, // Small screen to force scrolling
    )

    // Navigate down through items
    for (let i = 0; i < 10; i++) {
      board.press("j")
    }

    // The cursor should be on task-10
    board.expect("[id='task-10'][data-cursor]").toExist()

    // task-10 should be visible on screen
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("task-10")
  })

  test("scrolling up from bottom works", () => {
    const items: ReturnType<typeof item>[] = []
    for (let i = 0; i < 15; i++) {
      items.push(item(`item-${i}`))
    }

    const { board } = testEnv(
      () => item("board", item("col1", ...items)),
      { columns: 80, rows: 12 },
    )

    // Navigate to bottom
    for (let i = 0; i < 14; i++) {
      board.press("j")
    }

    // Navigate back up
    for (let i = 0; i < 14; i++) {
      board.press("k")
    }

    // Should be back on first item
    board.expect("[id='item-0'][data-cursor]").toExist()
  })
})
