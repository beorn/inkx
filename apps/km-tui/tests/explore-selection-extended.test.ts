/**
 * Exploration: Selection Extended
 *
 * Deep tests on selection mode (v), extend (J/K), and batch operations.
 * Exercises the recent selection batch fix in board-actions-selection.ts.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Selection Extended", () => {
  test("v toggles selection on current item", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("v") // Select A
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("v twice deselects", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("v") // Select
    board.press("v") // Deselect
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("escape clears selection", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("v") // Select A
    board.press("J") // Extend to B
    board.press("escape") // Clear selection
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("extend selection down then up", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))
    board.press("v") // Select A
    board.press("J") // Extend to B
    board.press("J") // Extend to C
    board.press("K") // Shrink back to B
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("select all with Ctrl-a", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("C-a") // Select all
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("select then navigate (should clear selection)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    board.press("v") // Select A
    board.press("l") // Navigate to col2
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("batch delete with selection", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))
    board.press("v") // Select A
    board.press("J") // Extend to B
    board.press("x") // Delete selected
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // C and D should remain
    expect(text).toContain("C")
    expect(text).toContain("D")
  })

  test("select all then delete all", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("C-a") // Select all
    board.press("x") // Delete all
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("selection + duplicate", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("v") // Select A
    board.press("J") // Extend to B
    board.press("d") // Duplicate selected
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("selection + shift down", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))
    board.press("v") // Select A
    board.press("J") // Extend to B
    board.press("Alt+j") // Shift selection down
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("selection + indent", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("j") // Move to B
    board.press("v") // Select B
    board.press("J") // Extend to C
    board.press("Tab") // Batch indent
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("extend to all items in column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))))
    board.press("v") // Select A
    board.press("J").press("J").press("J").press("J") // Extend to E
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
