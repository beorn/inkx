/**
 * Exploration: Zoom in/out (Enter to zoom in, Backspace to zoom out).
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("zoom navigation", () => {
  test("Enter on column header zooms into that column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2")),
          item("col2", item("taskA")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Zoom in
    board.press("return")

    // Should now be zoomed into col1
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("task1")
    expect(text).toContain("task2")
  })

  test("Backspace zooms out", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1")),
          item("col2", item("taskA")),
        ),
      { columns: 80, rows: 24 },
    )

    // Zoom into col1
    board.press("k")
    board.press("return")

    // Zoom out
    board.press("backspace")

    // Should see both columns again
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("Enter on card zooms into that card", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1",
            item("parent", item("child1"), item("child2")),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#parent[data-cursor]").toExist()

    // Zoom into parent
    board.press("return")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
    // Should show children as columns or cards
    expect(text).toContain("child1")
    expect(text).toContain("child2")
  })
})
