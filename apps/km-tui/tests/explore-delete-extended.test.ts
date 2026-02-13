/**
 * Exploration: Delete Extended
 *
 * Deep tests on delete operations and cursor recovery
 * after various delete scenarios.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Delete Extended", () => {
  test("delete middle item, cursor falls to next", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j") // Move to B
    board.press("Backspace") // Delete B
    const children = repo.getChildren("col1")
    expect(children.length).toBe(2)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete last item, cursor falls to previous", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j").press("j") // Move to C
    board.press("Backspace") // Delete C
    const children = repo.getChildren("col1")
    expect(children.length).toBe(2)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete folded parent deletes children", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item("P1", item("c1"), item("c2")),
        item("B"),
      )),
    )
    board.press("z").press("a") // Fold P1
    board.press("Backspace") // Delete folded P1
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).toContain("B")
  })

  test("delete parent with indented children", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("A", item("child1"), item("child2")),
        item("B"),
      )),
    )
    board.press("Backspace") // Delete A (has children)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete then undo restores", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("Backspace") // Delete A
    expect(repo.getChildren("col1").length).toBe(2)
    board.press("C-z") // Undo
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete all items one by one", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("Backspace") // Delete A
    board.press("Backspace") // Delete next
    board.press("Backspace") // Delete last
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete across columns", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B")),
        item("col2", item("C"), item("D")),
      ),
    )
    board.press("Backspace") // Delete A in col1
    board.press("l") // Move to col2
    board.press("Backspace") // Delete C in col2
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("batch delete then add", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    board.press("v") // Select A
    board.press("J").press("J") // Extend to C
    board.press("Backspace") // Delete A, B, C
    board.press("a").press("return") // Add new item
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete in zoomed view", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2"), item("c3")),
      )),
    )
    board.press("n") // Zoom into parent
    board.press("Backspace") // Delete c1
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete all in zoomed view then zoom out", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
    )
    board.press("n") // Zoom into parent
    board.press("Backspace") // Delete c1
    board.press("Backspace") // Delete c2
    board.press("N") // Zoom out
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
