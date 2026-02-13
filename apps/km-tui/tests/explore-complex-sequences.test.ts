/**
 * Exploration: Complex Sequences
 *
 * Tests long sequences of mixed operations to exercise
 * state machine transitions and catch subtle interaction bugs.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Complex Sequences", () => {
  test("navigate, indent, zoom, navigate, zoom back", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("A"), item("B"), item("C"), item("D"),
      )),
    )
    board.press("j") // B
    board.press("Tab") // Indent B under A
    board.press("k") // A
    board.press("n") // Zoom into A
    board.press("j") // Navigate in zoomed
    board.press("N") // Zoom back
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold all, navigate, unfold at cursor", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("P1", item("c1"), item("c2")),
        item("P2", item("c3"), item("c4")),
        item("leaf"),
      )),
    )
    board.press("z").press("M") // Fold all
    board.press("j") // Next (P2)
    board.press("z").press("a") // Unfold P2
    board.press("j") // Navigate into P2's children
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("select, indent, deselect, navigate", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("A"), item("B"), item("C"), item("D"),
      )),
    )
    board.press("j") // B
    board.press("v") // Select B
    board.press("J") // Extend to C
    board.press("Tab") // Indent selection under A
    board.press("escape") // Deselect
    board.press("j") // Navigate
    board.press("k") // Navigate back
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("add, navigate, delete, undo", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    board.press("a").press("return") // Add after A
    board.press("j") // Navigate
    board.press("Backspace") // Delete
    board.press("C-z") // Undo
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("cross-column operations", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B"), item("C")),
        item("col2", item("D"), item("E")),
        item("col3", item("F")),
      ),
    )
    board.press("j") // B
    board.press("l") // D
    board.press("j") // E
    board.press("h") // Back to col1 (cursor memory)
    board.press("l").press("l") // To col3
    board.press("h").press("h") // Back to col1
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("view switch during navigation", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j") // B
    board.press("2") // Switch to columns view
    board.press("j") // Navigate in columns view
    board.press("1") // Back to cards
    board.press("j") // Navigate
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("depth change then fold", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("A", item("c1", item("deep")), item("c2")),
        item("B"),
      )),
    )
    board.press(">") // Increase depth
    board.press("z").press("M") // Fold all
    board.press("z").press("R") // Unfold all
    board.press("<") // Decrease depth
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("duplicate + indent + zoom", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    board.press("d") // Duplicate A
    board.press("j") // Move to duplicate
    board.press("Tab") // Indent duplicate under A
    board.press("k") // Back to A
    board.press("n") // Zoom into A
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("help overlay during selection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("v") // Select A
    board.press("J") // Extend to B
    board.press("?") // Help overlay
    board.press("?") // Close help
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("search open/close cycle", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("/") // Open search
    board.press("escape") // Close (or try to)
    board.press("j") // Navigate
    board.press("/") // Open again
    board.press("escape") // Close
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
