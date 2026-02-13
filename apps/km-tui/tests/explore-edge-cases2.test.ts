/**
 * Exploration: Edge Cases
 *
 * Tests unusual/extreme scenarios that might trigger crashes or
 * unexpected behavior. Focus on boundary conditions.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Edge Cases", () => {
  test("single item board", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("Solo"))),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).toContain("Solo")
  })

  test("navigate in single-item board", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("Solo"))),
    )
    board.press("j") // No next item
    board.press("k") // No prev item
    board.press("l") // No next column
    board.press("h") // No prev column
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("delete only item leaves empty board", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("Solo"))),
    )
    board.press("x")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("wide terminal with narrow content", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("A"))),
      { columns: 200 },
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("very narrow terminal", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("A"), item("B"))),
      { columns: 20 },
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("tall terminal with few items", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("A"))),
      { rows: 50, columns: 80 },
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("very short terminal (5 rows)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("A"), item("B"), item("C"))),
      { rows: 5, columns: 80 },
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("unicode content", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("Japanese: \u65e5\u672c\u8a9e"),
        item("Emoji: hello"),
        item("Arabic: \u0645\u0631\u062d\u0628\u0627"),
      )),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("special characters in content", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("<html>tag</html>"),
        item("path/to/file.ts"),
        item("key=value&other=pair"),
      )),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("deeply nested tree", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("L1",
          item("L2",
            item("L3",
              item("L4",
                item("L5", item("deep")),
              ),
            ),
          ),
        ),
      )),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("many columns (10)", () => {
    const cols = Array.from({ length: 10 }, (_, i) => item(`c${i}`, item(`item${i}`)))
    const { board } = testEnv(
      () => item("board", ...cols),
      { columns: 200 },
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("rapid key presses (stress test)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    for (let i = 0; i < 20; i++) {
      board.press("j")
    }
    for (let i = 0; i < 20; i++) {
      board.press("k")
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("all operations on empty column after delete", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"))),
    )
    board.press("x") // Delete A, column now empty
    board.press("j") // Navigate in empty
    board.press("k")
    board.press("d") // Duplicate nothing
    board.press("v") // Select nothing
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
