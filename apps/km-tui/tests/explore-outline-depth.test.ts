/**
 * Exploration: Outline Depth Changes
 *
 * Tests the < and > keys for changing outline depth,
 * which affects what level of nesting is shown as columns.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Outline Depth", () => {
  test("increase depth with >", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A", item("child1"), item("child2")), item("B"))),
    )
    board.press(">") // Increase outline depth
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("decrease depth with <", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A", item("child1"), item("child2")), item("B"))),
    )
    board.press(">") // First increase
    board.press("<") // Then decrease
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("decrease depth at minimum (no-op)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    board.press("<") // Already at min depth
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("multiple depth increases", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("L1", item("L2", item("L3", item("deep")))),
      )),
    )
    board.press(">")
    board.press(">")
    board.press(">")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("depth change + navigation", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("A", item("c1"), item("c2")),
        item("B", item("c3")),
      )),
    )
    board.press(">") // Deeper view
    board.press("j") // Navigate
    board.press("l") // Column nav
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("depth change + zoom", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
    )
    board.press(">") // Change depth
    board.press("n") // Zoom
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("rapid depth changes", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("A", item("c1", item("deep"))),
        item("B"),
      )),
    )
    board.press(">").press(">").press(">")
    board.press("<").press("<").press("<")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
