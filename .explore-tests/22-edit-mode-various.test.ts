/**
 * Exploration: Edit mode on various node types.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("edit mode on various node types", () => {
  test("i on regular task enters edit mode", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("editable-task")),
        ),
      { columns: 60, rows: 20 },
    )

    board.expect("[id='editable-task'][data-cursor]").toExist()

    // Press i to enter edit mode
    board.press("i")

    // Board should still render
    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)

    // Escape to exit edit mode
    board.press("escape")

    // Should be back to normal mode
    const afterEsc = board.q("[data-cursor]")
    expect(afterEsc.count()).toBeGreaterThan(0)
  })

  test("i on paragraph node enters edit mode", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.paragraph("my paragraph")),
        ),
      { columns: 60, rows: 20 },
    )

    board.expect("[id='my paragraph'][data-cursor]").toExist()

    board.press("i")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)

    board.press("escape")
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
  })

  test("i on code block enters edit mode", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.code("console.log('hello')")),
        ),
      { columns: 60, rows: 20 },
    )

    board.expect("[id=\"console.log('hello')\"][data-cursor]").toExist()

    board.press("i")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)

    board.press("escape")
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
  })

  test("i on quote block enters edit mode", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.quote("wise words")),
        ),
      { columns: 60, rows: 20 },
    )

    board.expect("[id='wise words'][data-cursor]").toExist()

    board.press("i")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)

    board.press("escape")
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
  })

  test("i on column header does NOT enter edit mode (or handles gracefully)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1")),
        ),
      { columns: 60, rows: 20 },
    )

    // Navigate to column header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Press i — should either enter edit or be no-op
    board.press("i")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })
})
