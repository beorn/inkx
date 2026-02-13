/**
 * Exploration: Detail Pane + Interactions
 *
 * Tests the detail pane toggle (l opens, h/Escape closes)
 * and interactions with other features while detail pane is open.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Detail Pane Interactions", () => {
  test("open detail pane with l", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"))),
    )
    board.press("l") // Navigate right to col2
    board.press("l") // Open detail pane (or navigate further right)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("detail pane with navigation", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    // Open detail pane
    board.press("l")
    // Navigate while detail is open
    board.press("j")
    board.press("j")
    board.press("k")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("close detail pane with h", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B"))),
    )
    board.press("l") // Navigate to col2
    board.press("l") // Open detail pane
    board.press("h") // Close detail pane or navigate left
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("detail pane then fold", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("parent", item("child1"), item("child2"))),
      ),
    )
    board.press("l") // Open detail pane
    board.press("z").press("a") // Toggle fold
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("detail pane then search", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    board.press("l") // Open detail pane
    board.press("/") // Open search
    const text = board.screenshot()
    expect(text).toContain("Search")
    expect(text).not.toContain("[object Object]")
  })

  test("detail pane then delete", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("l") // Open detail pane
    board.press("x") // Delete
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("detail pane then undo", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j") // Move to B
    board.press("tab") // Indent B
    board.press("l") // Open detail pane
    board.press("C-z") // Undo
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("detail pane in list view", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    board.press("3") // List view (detail pane is default on)
    board.press("j") // Navigate
    board.press("h") // Should navigate left in list view
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
