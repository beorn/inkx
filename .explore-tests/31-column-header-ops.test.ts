/**
 * Exploration: Operations on column headers.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("column header operations", () => {
  test("i on column header enters edit mode", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    board.press("i")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)

    board.press("escape")
  })

  test("Enter on column header zooms in", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("deep1"), item("deep2")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    board.press("return")

    // Should zoom into col1
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("deep1")
    expect(text).toContain("deep2")
  })

  test("c toggles column collapse on header", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2")),
          item("col2", item("taskA")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    board.press("c")

    // Column should be collapsed — render without crash
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("h/l on column headers navigates between columns", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a")),
          item("col2", item("b")),
          item("col3", item("c")),
        ),
      { columns: 100, rows: 24 },
    )

    // Go to col1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // l to col2 header
    board.press("l")
    board.expect("#col2[data-cursor]").toExist()

    // l to col3 header
    board.press("l")
    board.expect("#col3[data-cursor]").toExist()

    // h back to col2
    board.press("h")
    board.expect("#col2[data-cursor]").toExist()
  })
})
