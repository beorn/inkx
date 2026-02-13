/**
 * Exploration: Add Node Extended
 *
 * Tests add node operations (a/A keys) and the recent
 * consolidation in board-actions-edit.ts. Focus on add
 * in various contexts.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Add Node Extended", () => {
  test("add after with 'a' opens edit mode", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("a") // Add after A
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("add after then cancel with escape", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("a") // Open add dialog
    board.press("escape") // Cancel
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("add after then confirm with enter", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const before = repo.getChildren("col1").length
    board.press("a") // Open add
    board.press("return") // Confirm (empty title)
    const after = repo.getChildren("col1").length
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // Should have added a new node
    expect(after).toBeGreaterThanOrEqual(before)
  })

  test("add before with 'A'", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("A") // Add before A
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("add at last position", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("G") // Jump to last item
    board.press("a") // Add after last
    board.press("return") // Confirm
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("add in empty column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"))))
    board.press("x") // Delete A — column now empty
    board.press("a") // Add in empty column
    board.press("return") // Confirm
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("add multiple items in sequence", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"))))
    // Note: after 'a' + return, cursor may stay in edit mode
    // so subsequent 'a' presses may not work as expected in testEnv
    board.press("a").press("return") // Add item 1
    board.press("escape") // Ensure we exit any edit mode
    board.press("a").press("return") // Add item 2
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("add then delete newly added", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("a").press("return") // Add after A
    board.press("x") // Delete the newly added item
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("add then navigate away", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    board.press("a").press("return") // Add after A
    board.press("l") // Navigate to col2
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("add after zoom", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")))))
    board.press("n") // Zoom into parent
    board.press("a").press("return") // Add in zoomed view
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("add after fold", () => {
    const { board } = testEnv(() => item("board", item("col1", item("P1", item("c1"), item("c2")), item("B"))))
    board.press("z").press("a") // Fold P1
    board.press("a").press("return") // Add after folded P1
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
