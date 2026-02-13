/**
 * Exploration: Zoom and Navigation
 *
 * Tests zoom in/out (n/N) and navigation history (back/forward).
 * Recent changes in board-actions-nav.ts consolidation.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Zoom & Navigation", () => {
  test("zoom into node with children", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"))),
    )
    board.press("n") // Zoom into parent
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).toContain("child1")
    expect(text).toContain("child2")
  })

  test("zoom out with N", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1")), item("B"))),
    )
    board.press("n") // Zoom in
    board.press("N") // Zoom out
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("zoom in twice (nested zoom)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("level1", item("level2", item("deep1"), item("deep2")), item("sib")),
        item("B"),
      )),
    )
    board.press("n") // Zoom into level1
    board.press("n") // Zoom into level2
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).toContain("deep1")
  })

  test("zoom out at root level (no-op)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    board.press("N") // Already at root
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).toContain("A")
  })

  test("zoom in then navigate", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2"), item("c3")),
        item("B"),
      )),
    )
    board.press("n") // Zoom into parent
    board.press("j") // Navigate down in zoomed view
    board.press("j") // Continue
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("zoom + delete child", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
      )),
    )
    board.press("n") // Zoom into parent
    board.press("x") // Delete c1
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("nav back after zoom", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
    )
    board.press("n") // Zoom in
    board.press("A-left") // Nav back (should zoom out)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("nav forward after back", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
    )
    board.press("n") // Zoom in
    board.press("A-left") // Nav back
    board.press("A-right") // Nav forward
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("zoom into empty node", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("empty"), item("B"))),
    )
    board.press("n") // Zoom into empty — has no children
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("zoom + shift + zoom back", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2"), item("c3")),
        item("B"),
      )),
    )
    board.press("n") // Zoom in
    board.press("J") // Shift c1 down
    board.press("N") // Zoom out
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("deep zoom (3 levels) and back", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("L1", item("L2", item("L3", item("deep")))),
      )),
    )
    board.press("n") // Zoom L1
    board.press("n") // Zoom L2
    board.press("n") // Zoom L3
    const text1 = board.screenshot()
    expect(text1).not.toContain("[object Object]")
    expect(text1).not.toContain("TypeError")
    board.press("N").press("N").press("N") // Back to root
    const text2 = board.screenshot()
    expect(text2).not.toContain("[object Object]")
    expect(text2).not.toContain("TypeError")
  })
})
