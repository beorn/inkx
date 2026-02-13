/**
 * Exploration: Selection + Batch Operations
 *
 * Tests multi-select with v + Shift-J/K, then batch operations.
 * The board-actions-selection.ts had a race fix for Shift-J/K.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Selection + Batch Operations", () => {
  test("toggle selection with v", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )

    board.press("v") // Toggle selection on A
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("extend selection down with Shift-J", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )

    board.press("v") // Start selection
    board.press("S-j") // Extend down
    board.press("S-j") // Extend down again
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("extend selection up with Shift-K", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )

    // Move to D
    board.press("j").press("j").press("j")
    board.press("v") // Start selection
    board.press("S-k") // Extend up
    board.press("S-k") // Extend up again
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("select all with Ctrl-A", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )

    board.press("C-a") // Select all
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("batch indent with selection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )

    // Select B and C
    board.press("j") // Move to B
    board.press("v") // Start selection
    board.press("S-j") // Extend to C
    board.press("tab") // Indent selection
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("batch delete with selection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )

    // Select B and C
    board.press("j") // Move to B
    board.press("v") // Start selection
    board.press("S-j") // Extend to C
    board.press("x") // Delete selected

    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("clear selection with Escape", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )

    board.press("v") // Start selection
    board.press("S-j") // Extend
    board.press("escape") // Clear selection

    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("selection across column boundary", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"), item("D"))),
    )

    // Move to last item in col1
    board.press("j")
    board.press("v") // Start selection
    // Try to extend into col2
    board.press("S-j")
    board.press("S-j")

    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("Shift-J past end of column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )

    board.press("v") // Start selection on A
    // Press Shift-J many times past the end
    for (let i = 0; i < 10; i++) {
      board.press("S-j")
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("Shift-K past start of column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )

    board.press("v") // Start selection on A
    // Press Shift-K many times past the start
    for (let i = 0; i < 10; i++) {
      board.press("S-k")
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("select then move cursor (j) clears selection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )

    board.press("v") // Select A
    board.press("S-j") // Extend to B
    board.press("j") // Move cursor down — should clear selection

    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("batch shift down with selection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )

    // Select A and B
    board.press("v")
    board.press("S-j")
    // Shift down
    board.press("J")

    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("batch task status toggle", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.task("A"), item.task("B"), item.task("C"))),
    )

    // Select all tasks
    board.press("v")
    board.press("S-j")
    board.press("S-j")

    // Toggle task status
    board.press("space")

    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("rapid selection toggle", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )

    // Rapidly toggle selection
    for (let i = 0; i < 10; i++) {
      board.press("v")
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
