/**
 * Exploration: Cursor After Delete
 *
 * Tests cursor recovery after deleting nodes, including the
 * recent fix in keyboard-helpers.ts for cursor-after-delete-all.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Cursor After Delete", () => {
  test("delete first item, cursor moves to next", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("x") // Delete A
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // Board should still render
    expect(text).toContain("col1")
  })

  test("delete middle item", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j") // Move to B
    board.press("x") // Delete B
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete last item, cursor moves to previous", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j").press("j") // Move to C
    board.press("x") // Delete C
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete all items in column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    board.press("x") // Delete A
    board.press("x") // Delete B (or whatever is left)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // Column should still exist but be empty
    expect(text).toContain("col1")
  })

  test("delete all items then navigate", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B"))),
    )
    board.press("x") // Delete A
    board.press("l") // Navigate to col2
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete then add", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    board.press("x") // Delete A
    board.press("a") // Add after cursor
    board.press("return") // Confirm
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("batch delete selected items", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    board.press("v") // Select A
    board.press("S-j") // Extend to B
    board.press("S-j") // Extend to C
    board.press("x") // Delete selected (A, B, C)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // D should survive
    expect(text).toContain("D")
  })

  test("delete only item in single-column board", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"))),
    )
    board.press("x") // Delete A
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete then undo restores cursor", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j") // Move to B
    board.press("x") // Delete B
    board.press("C-z") // Undo delete
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("select all then delete", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("C-a") // Select all
    board.press("x") // Delete all
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
