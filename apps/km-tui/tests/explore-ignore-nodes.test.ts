/**
 * Exploration: Board Ignore (I key action)
 *
 * Tests the ignore system that hides nodes from board view.
 * In fake repo (no fs_path), ignore uses slug-based paths.
 * Exercises: ignore node, toggle show ignored, un-ignore.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Board Ignore", () => {
  test("ignore node with I key (in-memory repo)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    // Cursor on A
    board.press("I")
    const text = board.screenshot()
    // Should not crash. In-memory repo has no fs_path, so computeIgnorePath
    // falls back to slug-based path. It should show a toast or status.
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("toggle show ignored with Shift-I", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    // Toggle show ignored
    board.press("S-i")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("ignore then toggle show", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    // Ignore A
    board.press("I")
    // Toggle show ignored
    board.press("S-i")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("ignore on column header", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    // Move to column level (up from A should go to col header or boundary)
    board.press("k")
    board.press("I")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("ignore multiple nodes sequentially", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))
    board.press("I") // Ignore A
    board.press("I") // Ignore next visible (B)
    board.press("I") // Ignore next visible (C)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("ignore all nodes in column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("I")
    board.press("I")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("rapid ignore/show-ignored toggle", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    for (let i = 0; i < 5; i++) {
      board.press("S-i")
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
