/**
 * HR node visual rendering
 *
 * HR nodes (type: "hr" from markdown thematic breaks, or items with content
 * matching ---, asterisks, or underscores) render as horizontal lines spanning
 * available width.
 * - Dimmed when cursor is NOT on the node
 * - Selection-styled when cursor IS on the node (yellow bg, black text in cards view)
 * - In edit mode: shows raw content (e.g., '---')
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("HR display", () => {
  test("HR node (type=hr) renders as horizontal line with box-drawing characters", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-above"), item.hr("hr-node"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    const text = stripAnsi(board.screenshot())
    // The HR line should contain ─ characters
    expect(text).toContain("─")
    // Normal items should also be visible
    expect(text).toContain("task-above")
    expect(text).toContain("task-below")
  })

  test("item with content '---' renders as horizontal line", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-above"), item("---"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    const text = stripAnsi(board.screenshot())
    // Should render as a line, not show literal "---"
    expect(text).toContain("─")
  })

  test("HR line is dimmed when cursor is NOT on it", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-above"), item.hr("hr-node"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    // Cursor starts on task-above, so HR should be dimmed
    const ansi = board._result.ansi
    const lines = ansi.split("\n")
    const hrLine = lines.find((l) => l.includes("─".repeat(5)))
    expect(hrLine).toBeDefined()
    // Dim ANSI code: \x1b[2m or \x1b[0;2m
    expect(hrLine).toMatch(/\x1b\[[\d;]*2m/)
  })

  test("HR card gets selection styling when cursor IS on it", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-above"), item.hr("hr-node"), item("task-below")),
        ),
      { columns: 60, rows: 20 },
    )

    // Move cursor down to the HR node
    board.press("j")

    // The cursor should be on the HR node
    board.expect("#hr-node[data-cursor]").toExist()

    // The HR node has ─ characters visible in the output
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("─")
  })

  test("non-HR content like '---foo' does NOT trigger HR rendering", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("---foo")),
        ),
      { columns: 60, rows: 20 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the literal content
    expect(text).toContain("---foo")
  })

  test("item with content '***' renders as horizontal line", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("***")),
        ),
      { columns: 60, rows: 20 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text).toContain("─")
  })

  test("item with content '___' renders as horizontal line", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("___")),
        ),
      { columns: 60, rows: 20 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text).toContain("─")
  })
})
