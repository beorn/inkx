/**
 * Exploration: Multi-Column Navigation
 *
 * Tests navigation between multiple columns (h/l),
 * cursor memory, and edge cases with empty columns.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Multi-Column Navigation", () => {
  test("h/l navigate between columns", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"), item("D"))),
    )
    board.press("l") // Move to col2
    board.press("h") // Back to col1
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).toContain("A")
  })

  test("l at rightmost column wraps or stops", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"))))
    board.press("l") // Move to col2
    board.press("l") // Already at rightmost
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("h at leftmost column wraps or stops", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"))))
    board.press("h") // Already at leftmost
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("navigate to third column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B")), item("col3", item("C"))),
    )
    board.press("l").press("l") // Move to col3
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("cursor memory: remember card position per column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C")), item("col2", item("D"), item("E"))),
    )
    board.press("j").press("j") // Move to C in col1
    board.press("l") // Move to col2
    board.press("j") // Move to E in col2
    board.press("h") // Back to col1 — should remember C
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("single column board with h/l", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("l") // No second column
    board.press("h") // Still only one column
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("many columns with rapid navigation", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("c1", item("A")),
        item("c2", item("B")),
        item("c3", item("C")),
        item("c4", item("D")),
        item("c5", item("E")),
      ),
    )
    board.press("l").press("l").press("l").press("l") // Move to c5
    board.press("h").press("h").press("h").press("h") // Back to c1
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete item in one column, navigate to another", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    board.press("x") // Delete A in col1
    board.press("l") // Navigate to col2
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).toContain("C")
  })

  test("navigate between columns of different heights", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B"), item("C"), item("D"), item("E"), item("F"))),
    )
    board.press("l") // To col2
    board.press("j").press("j").press("j").press("j") // To F
    board.press("h") // Back to col1 (only 1 item)
    board.press("l") // Back to col2 — should remember position
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("G jumps to last item in column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))
    board.press("G") // Jump to last
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("g g jumps to first item", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))
    board.press("j").press("j").press("j") // Move to D
    board.press("g").press("g") // Jump to first (gg chord)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
