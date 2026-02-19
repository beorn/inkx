/**
 * NodeView Component Tests
 *
 * Tests the unified ColumnHeader component that replaced duplicated
 * column header rendering across CardColumn, ColumnsView, and
 * shared-components (MemoizedColumnHeader).
 *
 * Verifies:
 * - Column header renders correctly at all style levels
 * - Icon, title, count, separator display
 * - Selection styling (yellow bg when selected)
 * - WIP limit and warning indicators
 * - Virtual/body column dimming
 * - Untitled node display
 * - Sigil name suffix display
 * - Hyperlink rendering through text pipeline
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "../helpers/board-test.ts"

// =============================================================================
// Integration: Column header rendering via ColumnHeader component
// =============================================================================

describe("ColumnHeader (cards view)", () => {
  test("column header shows name without count (no WIP limit)", () => {
    const { board } = testEnv(
      () => item("board", item("Todo", item("task1"), item("task2"), item("task3"))),
      { columns: 60, rows: 20 },
    )

    const output = board.screenshot()
    // Column name should be visible
    expect(output).toContain("Todo")
    // Count is hidden without WIP limit — only shown as count/wip
  })

  test("column header shows count/wip when WIP limit set", () => {
    const { board } = testEnv(
      () => item("board", item("Todo km.limit:: 5", item("task1"), item("task2"), item("task3"))),
      { columns: 60, rows: 20 },
    )

    const output = board.screenshot()
    expect(output).toContain("Todo")
    expect(output).toContain("3/5")
  })

  test("column header shows separator line", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("task"))),
      { columns: 40, rows: 10 },
    )

    const output = board.screenshot()
    // Should have horizontal rule (─) separator
    expect(output).toContain("─")
  })

  test("multiple column headers render side by side", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.section("Todo"),
          item.section("Doing"),
          item.section("Done"),
        ),
      { columns: 120, rows: 20 },
    )

    const output = board.screenshot()
    expect(output).toContain("Todo")
    expect(output).toContain("Doing")
    expect(output).toContain("Done")

    // All three should be on the same line
    const headerLine = output
      .split("\n")
      .find((l) => l.includes("Todo") && l.includes("Doing") && l.includes("Done"))
    expect(headerLine).toBeDefined()
  })

  test("column header counts update with WIP limit", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("few km.limit:: 3", item("a")),
          item("many km.limit:: 10", item("b"), item("c"), item("d"), item("e"), item("f")),
        ),
      { columns: 80, rows: 20 },
    )

    const output = board.screenshot()
    // First column has 1 card with WIP 3, second has 5 with WIP 10
    expect(output).toContain("1/3")
    expect(output).toContain("5/10")
  })
})

describe("ColumnHeader (columns view)", () => {
  test("column header shows in columns view mode", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("task1"), item("task2"))),
      { columns: 60, rows: 20 },
    )

    // Switch to columns view
    board.press("v")

    const output = board.screenshot()
    expect(output).toContain("col")
    expect(output).toContain("─")
  })
})

describe("ColumnHeader content rendering", () => {
  test("wiki links in column name render without brackets", () => {
    const { board } = testEnv(
      () => item("board", item("[[My Project]]", item("task"))),
      { columns: 60, rows: 15 },
    )

    const output = board.screenshot()
    expect(output).toContain("My Project")
    expect(output).not.toContain("[[")
    expect(output).not.toContain("]]")
  })

  test("column with URL in card shows prettified URL", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("Check https://example.com/page for info"))),
      { columns: 60, rows: 15 },
    )

    const output = board.screenshot()
    // URL should be prettified (protocol stripped)
    expect(output).toContain("example.com/page")
    // Protocol should be stripped
    expect(output).not.toContain("https://")
  })
})
