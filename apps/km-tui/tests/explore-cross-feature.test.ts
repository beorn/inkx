/**
 * Exploration: Cross-Feature Interactions
 *
 * Tests combinations of features that might interact unexpectedly.
 * Focus: delete+undo, fold+zoom, selection+view change, etc.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Cross-Feature Interactions", () => {
  test("delete all items then undo", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    board.press("x") // Delete A
    board.press("x") // Delete B (or whatever cursor is on)
    board.press("C-z") // Undo last delete
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("indent then zoom into parent", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j") // Move to B
    board.press("tab") // Indent B under A
    board.press("k") // Move to A (now parent)
    board.press("n") // Zoom into A
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold + zoom interaction", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("parent", item("child1"), item("child2")), item("B")),
      ),
    )
    board.press("z").press("a") // Fold parent
    board.press("n") // Zoom into parent (even though folded)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("zoom then undo", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j").press("tab") // Indent B
    board.press("k") // Back to A
    board.press("n") // Zoom into A
    board.press("C-z") // Undo the indent
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("selection + zoom", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("v") // Select A
    board.press("S-j") // Extend to B
    board.press("n") // Zoom in (should clear selection or handle gracefully)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("duplicate + indent + undo", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    board.press("d") // Duplicate A
    board.press("j") // Move to duplicate
    board.press("tab") // Indent duplicate
    board.press("C-z") // Undo indent
    board.press("C-z") // Undo duplicate
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("view switch preserves cursor", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j").press("j") // Move to C
    board.press("2") // Switch to columns view
    board.press("1") // Back to cards
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("help overlay then action", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    board.press("?") // Open help
    const helpText = board.screenshot()
    expect(helpText).not.toContain("[object Object]")

    board.press("?") // Close help
    board.press("j") // Navigate
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
  })

  test("shift card then duplicate", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("J") // Shift A down
    board.press("d") // Duplicate (wherever cursor is)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete then add (cursor recovery)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j") // Move to B
    board.press("x") // Delete B
    board.press("a") // Add after (cursor should be on A or C)
    board.press("return") // Confirm add
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("outdent then navigate", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A", item("B"), item("C")), item("D"))),
    )
    // B is child of A, navigate to B
    board.press("j") // Move within cards
    board.press("S-tab") // Outdent B
    board.press("j") // Navigate
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("search, select result, then undo previous action", () => {
    const { board } = testEnv(
      () =>
        item("board", item("col1", item("A"), item("B")), item("col2", item("C"))),
      { columns: 100, rows: 30 },
    )
    board.press("j").press("tab") // Indent B
    board.press("/") // Open search
    board.press("escape") // Close search (may not work - known bug)
    board.press("C-z") // Undo indent
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("rapid mixed operations", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    // Rapid sequence of diverse operations
    board.press("j") // Move down
    board.press("tab") // Indent
    board.press("C-z") // Undo
    board.press("d") // Duplicate
    board.press("J") // Shift down
    board.press("v") // Toggle selection
    board.press("escape") // Clear selection
    board.press("x") // Delete
    board.press("C-z") // Undo delete
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
