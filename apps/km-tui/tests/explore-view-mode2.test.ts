/**
 * Exploration: View Mode Transitions
 *
 * Tests switching between cards/columns/list/tabs views.
 * Recent changes in ColumnsView.tsx and overflow indicators.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: View Mode Transitions", () => {
  function makeBoard() {
    return testEnv(
      () =>
        item(
          "board",
          item("col1", item("A"), item("B"), item("C")),
          item("col2", item("D"), item("E")),
          item("col3", item("F")),
        ),
      { columns: 120, rows: 30 },
    )
  }

  test("switch to columns view (s-2)", () => {
    const { board } = makeBoard()
    board.press("2") // Switch to columns view
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("switch to list view (s-3)", () => {
    const { board } = makeBoard()
    board.press("3") // Switch to list view
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("switch to tabs view (s-4)", () => {
    const { board } = makeBoard()
    board.press("4") // Switch to tabs view
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("switch from cards to list and back", () => {
    const { board } = makeBoard()
    board.press("3") // List
    board.press("1") // Cards
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("navigate in list view", () => {
    const { board } = makeBoard()
    board.press("3") // List view
    board.press("j").press("j").press("j")
    board.press("k")
    board.press("l")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("navigate in columns view", () => {
    const { board } = makeBoard()
    board.press("2") // Columns view
    board.press("j").press("j")
    board.press("l")
    board.press("j")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("switch view during selection", () => {
    const { board } = makeBoard()
    board.press("v") // Select A
    board.press("S-j") // Extend to B
    board.press("2") // Switch to columns view
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("switch view after zoom", () => {
    const { board } = makeBoard()
    board.press("n") // Zoom in
    board.press("2") // Switch view
    board.press("1") // Back to cards
    board.press("N") // Zoom out
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("all view modes cycle without crash", () => {
    const { board } = makeBoard()
    for (let v = 1; v <= 4; v++) {
      board.press(String(v))
      const text = board.screenshot()
      expect(text).not.toContain("[object Object]")
      expect(text).not.toContain("TypeError")
    }
  })

  test("rapid view switching", () => {
    const { board } = makeBoard()
    for (let i = 0; i < 10; i++) {
      board.press(String((i % 4) + 1))
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete in list view", () => {
    const { board } = makeBoard()
    board.press("3") // List view
    board.press("j") // Move to B
    board.press("x") // Delete
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("indent in columns view", () => {
    const { board } = makeBoard()
    board.press("2") // Columns view
    board.press("j") // Move to B
    board.press("tab") // Indent
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold in different view modes", () => {
    const env = testEnv(
      () =>
        item(
          "board",
          item("col1", item("parent", item("child1"), item("child2")), item("B")),
        ),
      { columns: 100, rows: 30 },
    )
    const { board } = env

    // Fold in cards view
    board.press("z")
    expect(board.screenshot()).not.toContain("[object Object]")

    // Switch to columns and fold/unfold
    board.press("2")
    board.press("z") // Unfold
    expect(board.screenshot()).not.toContain("[object Object]")

    // Switch to list
    board.press("3")
    board.press("z") // Toggle fold
    expect(board.screenshot()).not.toContain("[object Object]")
  })
})
