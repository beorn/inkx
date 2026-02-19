/**
 * Card/column count display tests.
 *
 * Feature: km-tui.card-count-wip
 *
 * Column headers only show a count when a WIP limit is configured.
 * When shown, the count is formatted as "count/wip" (e.g., "3/5").
 * Without a WIP limit, no count is shown — the +N overflow indicator
 * is sufficient.
 *
 * Card titles (in cards view) never show an inline child count —
 * the +N overflow indicator replaces that behavior.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/**
 * Find the column header row by looking for a row that contains the column name
 * but is NOT the breadcrumb row (which contains ">").
 * The separator line (───) appears right after the column header.
 */
function findColumnHeaderRow(screenText: string, columnName: string): number {
  const rows = screenText.split("\n")
  // Find the separator row (all dashes), then the header is the row before it
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].includes("─") && rows[i - 1].includes(columnName) && !rows[i - 1].includes(">")) {
      return i - 1
    }
  }
  return -1
}

// =============================================================================
// Column header count display
// =============================================================================

describe("column header count", () => {
  test("column header hides count when no WIP limit", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("nocap", item("task-a"), item("task-b"), item("task-c")),
        ),
      { columns: 60, rows: 24 },
    )

    const headerRow = findColumnHeaderRow(board.screen.text, "nocap")
    expect(headerRow, "column header row should exist").toBeGreaterThanOrEqual(0)

    // The row should NOT contain any digits (no card count)
    // because there is no WIP limit configured
    const rowText = board.screen.text.split("\n")[headerRow]
    expect(rowText).toContain("nocap")
    expect(rowText).not.toMatch(/\d/)
  })

  test("column header shows count/wip when WIP limit configured", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("capped km.limit:: 5", item("task-a"), item("task-b"), item("task-c")),
        ),
      { columns: 60, rows: 24 },
    )

    const headerRow = findColumnHeaderRow(board.screen.text, "capped")
    expect(headerRow, "column header row should exist").toBeGreaterThanOrEqual(0)

    // The row should show "3/5" (3 cards, WIP limit 5)
    const rowText = board.screen.text.split("\n")[headerRow]
    expect(rowText).toContain("capped")
    expect(rowText).toContain("3/5")
  })

  test("column header shows warning when WIP limit exceeded", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("overflow km.limit:: 2", item("task-a"), item("task-b"), item("task-c")),
        ),
      { columns: 60, rows: 24 },
    )

    const headerRow = findColumnHeaderRow(board.screen.text, "overflow")
    expect(headerRow, "column header row should exist").toBeGreaterThanOrEqual(0)

    // The row should show "3/2" (3 cards, WIP limit 2) with warning
    const rowText = board.screen.text.split("\n")[headerRow]
    expect(rowText).toContain("overflow")
    expect(rowText).toContain("3/2")
  })
})

// =============================================================================
// Card title inline count (removed)
// =============================================================================

describe("card title inline count (removed)", () => {
  test("card title does NOT show inline child count", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col", item("parent", item("child-a"), item("child-b"), item("child-c"))),
        ),
      { columns: 60, rows: 24 },
    )

    // The card title "parent" should NOT have a count indicator
    // The inline child count was removed in favor of the +N overflow indicator
    const box = board.screen.nodeBox("parent")
    expect(box, "parent card should exist").not.toBeNull()
    if (!box) return

    // Scan the title line — no digit should appear (parent has no digits in name)
    let foundDigit = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (/\d/.test(cell.char)) {
        foundDigit = true
        break
      }
    }
    expect(foundDigit, "card title should not have an inline count indicator").toBe(false)
  })

  test("card title does NOT show count even with many children", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item(
              "big-parent",
              item("ca"),
              item("cb"),
              item("cc"),
              item("cd"),
              item("ce"),
              item("cf"),
              item("cg"),
            ),
          ),
        ),
      { columns: 60, rows: 30 },
    )

    const box = board.screen.nodeBox("big-parent")
    expect(box, "big-parent should exist").not.toBeNull()
    if (!box) return

    // No digit should appear on the card title line
    let foundDigit = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (/\d/.test(cell.char)) {
        foundDigit = true
        break
      }
    }
    expect(foundDigit, "card title should not have an inline count indicator").toBe(false)
  })
})

// =============================================================================
// Columns view: count behavior matches cards view
// =============================================================================

describe("columns view column header count", () => {
  test("columns view hides count when no WIP limit", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("nocol", item("parent", item("child-a"), item("child-b"))),
        ),
      { columns: 60, rows: 24, viewMode: "columns" },
    )

    const headerRow = findColumnHeaderRow(board.screen.text, "nocol")
    expect(headerRow, "column header row should exist").toBeGreaterThanOrEqual(0)

    // No count should appear on the header row
    const rowText = board.screen.text.split("\n")[headerRow]
    expect(rowText).toContain("nocol")
    expect(rowText).not.toMatch(/\d/)
  })

  test("columns view shows count/wip when WIP limit configured", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("limited km.limit:: 5", item("parent", item("child-a"), item("child-b"))),
        ),
      { columns: 60, rows: 24, viewMode: "columns" },
    )

    const headerRow = findColumnHeaderRow(board.screen.text, "limited")
    expect(headerRow, "column header row should exist").toBeGreaterThanOrEqual(0)

    // Should show "1/5" (1 card, WIP limit 5)
    const rowText = board.screen.text.split("\n")[headerRow]
    expect(rowText).toContain("limited")
    expect(rowText).toContain("1/5")
  })
})
