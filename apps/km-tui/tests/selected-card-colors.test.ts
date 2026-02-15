/**
 * Tests for selected card color consistency (km-tui.selected-color, km-tui.fold-count-color, km-tui.date-range-color)
 *
 * All content on a selected card should be black-on-yellow (fg=0, bg=3).
 * This includes: title, date badges, fold counts, info suffixes.
 *
 * Date ranges on non-selected cards should use green for future/today, red for overdue.
 */

import { describe, it, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/** Helper: find first occurrence of text in a given row, return x position */
function findTextInRow(board: ReturnType<typeof testEnv>["board"], y: number, text: string): number {
  const row = board.screen.row(y)
  return row.indexOf(text)
}

/** Helper: check that all non-space cells in a range have expected fg/bg */
function expectCellRangeColor(
  board: ReturnType<typeof testEnv>["board"],
  y: number,
  xStart: number,
  length: number,
  opts: { fg?: number; bg?: number },
  label: string,
) {
  for (let x = xStart; x < xStart + length; x++) {
    const cell = board.screen.cell(x, y)
    if (cell.char.trim() === "") continue // skip spaces
    if (opts.fg !== undefined) {
      expect(cell.fg, `${label} fg at (${x},${y}) char='${cell.char}'`).toEqual(opts.fg)
    }
    if (opts.bg !== undefined) {
      expect(cell.bg, `${label} bg at (${x},${y}) char='${cell.char}'`).toEqual(opts.bg)
    }
  }
}

describe("km-tui.selected-color: all selected card content is black-on-yellow", () => {
  it("date badge on selected card is black (fg=0) on yellow (bg=3)", () => {
    const nodes = item("board",
      item("col1",
        item.task("taskWithDate"),
      ),
    )
    const taskNode = nodes.find((n) => n.content === "taskWithDate")!
    taskNode.due_date = "2026-04-15"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Task should be selected
    board.expect('[id="taskWithDate"][data-cursor]').toExist()

    // Find the date badge in the rendered output
    const nodeBox = board.screen.nodeBox("taskWithDate")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    const aprIdx = row.indexOf("Apr")
    expect(aprIdx, "date badge 'Apr' should be visible").toBeGreaterThan(-1)

    // Every character in date badge should be black-on-yellow
    expectCellRangeColor(board, nodeBox.y, aprIdx, 6, { fg: 0, bg: 3 },
      "selected date badge")
  })

  it("child count on selected card is black (fg=0) on yellow (bg=3)", () => {
    // Use item() DSL to create a task with children properly
    const nodes = item("board",
      item("col1",
        item("pt",
          item.task("c1"),
          item.task("c2"),
        ),
      ),
    )

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // pt should be selected (first card)
    board.expect('[id="pt"][data-cursor]').toExist()

    const nodeBox = board.screen.nodeBox("pt")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    // The child count "2" should be visible on the same row as the node title
    const row = board.screen.row(nodeBox.y)
    // Search for the count — look for " 2" pattern (space then digit)
    const countMatch = row.match(/\s(\d+)[│\s]*$/)
    const countIdx = countMatch ? row.indexOf(countMatch[1]!, row.length - 10) : -1
    expect(countIdx, `child count should be visible in row: "${row}"`).toBeGreaterThan(-1)

    const cell = board.screen.cell(countIdx, nodeBox.y)
    expect(cell.fg, "child count fg should be black").toEqual(0)
    expect(cell.bg, "child count bg should be yellow").toEqual(3)
  })

  it("folded child count on selected card is black (fg=0) on yellow (bg=3)", () => {
    // When a node is folded, the child count shows bold (more prominent).
    // It should still be black-on-yellow when selected, NOT cyan or white.
    const nodes = item("board",
      item("col1",
        item("pt",
          item.task("c1"),
          item.task("c2"),
          item.task("c3"),
        ),
      ),
    )

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // pt should be selected
    board.expect('[id="pt"][data-cursor]').toExist()

    // Fold the node
    board.press("z")

    const nodeBox = board.screen.nodeBox("pt")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    // Count may be followed by border char (│) or end of line
    const countMatch = row.match(/\s(\d+)[│\s]*$/)
    const countIdx = countMatch ? row.indexOf(countMatch[1]!, row.length - 10) : -1
    expect(countIdx, `folded child count should be visible in row: "${row}"`).toBeGreaterThan(-1)

    const cell = board.screen.cell(countIdx, nodeBox.y)
    expect(cell.fg, "folded child count fg should be black").toEqual(0)
    expect(cell.bg, "folded child count bg should be yellow").toEqual(3)
    // Folded count should ideally be bold, but the key assertion is the color
    // (bold may not propagate through all inkx render paths)
  })

  it("title text on selected card is black (fg=0) on yellow (bg=3)", () => {
    const nodes = item("board",
      item("col1",
        item.task("mySelectedTask"),
      ),
    )

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    board.expect('[id="mySelectedTask"][data-cursor]').toExist()
    board.expectNodeColor("mySelectedTask", { fg: 0, bg: 3 })
  })

  it("date range on selected card is black-on-yellow (not green/red)", () => {
    // Task with both scheduled and due date
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`

    const nodes = item("board",
      item("col1",
        item.task("rangeTask"),
      ),
    )
    const taskNode = nodes.find((n) => n.content === "rangeTask")!
    taskNode.scheduled_date = todayStr
    taskNode.due_date = tomorrowStr

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    board.expect('[id="rangeTask"][data-cursor]').toExist()

    const nodeBox = board.screen.nodeBox("rangeTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    // Find "Today" in the row
    const todayIdx = row.indexOf("Today")
    expect(todayIdx, "'Today' should be visible in date range").toBeGreaterThan(-1)

    // All date range text should be black-on-yellow when selected
    const cell = board.screen.cell(todayIdx, nodeBox.y)
    expect(cell.fg, "date range 'Today' fg should be black when selected").toEqual(0)
    expect(cell.bg, "date range 'Today' bg should be yellow when selected").toEqual(3)
  })
})

describe("km-tui.fold-count-color: fold count consistent on non-selected cards", () => {
  it("child count on non-selected card has consistent color", () => {
    const nodes = item("board",
      item("col1",
        item.task("ft"),
        item("ns",
          item.task("nc"),
        ),
      ),
    )

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // ft is selected, ns is not
    board.expect('[id="ft"][data-cursor]').toExist()

    const nodeBox = board.screen.nodeBox("ns")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    const countMatch = row.match(/\s(\d+)[│\s]*$/)
    const countIdx = countMatch ? row.indexOf(countMatch[1]!, row.length - 10) : -1
    expect(countIdx, `child count should be visible in row: "${row}"`).toBeGreaterThan(-1)

    const cell = board.screen.cell(countIdx, nodeBox.y)
    // Non-selected child count should NOT have yellow bg
    expect(cell.bg, "non-selected child count should not have yellow bg").not.toEqual(3)
  })
})

describe("km-tui.date-range-color: date uses green/red when not selected", () => {
  it("overdue date on non-selected card shows red (fg=1)", () => {
    const nodes = item("board",
      item("col1",
        item.task("firstTask"),
        item.task("overdueTask"),
      ),
    )
    const overdueTask = nodes.find((n) => n.content === "overdueTask")!
    overdueTask.due_date = "2025-01-01" // Past date — overdue

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // firstTask is selected, overdueTask is not
    board.expect('[id="firstTask"][data-cursor]').toExist()

    const nodeBox = board.screen.nodeBox("overdueTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    const janIdx = row.indexOf("Jan")
    expect(janIdx, "overdue date 'Jan' should be visible").toBeGreaterThan(-1)

    const cell = board.screen.cell(janIdx, nodeBox.y)
    expect(cell.fg, "overdue date fg should be red (1)").toEqual(1)
  })

  it("today's due date on non-selected card shows green (fg=2)", () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

    const nodes = item("board",
      item("col1",
        item.task("firstTask"),
        item.task("todayTask"),
      ),
    )
    const todayTask = nodes.find((n) => n.content === "todayTask")!
    todayTask.due_date = todayStr

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    board.expect('[id="firstTask"][data-cursor]').toExist()

    const nodeBox = board.screen.nodeBox("todayTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    const todayIdx = row.indexOf("Today")
    expect(todayIdx, "'Today' should be visible").toBeGreaterThan(-1)

    const cell = board.screen.cell(todayIdx, nodeBox.y)
    expect(cell.fg, "today due date fg should be green (2)").toEqual(2)
  })

  it("future date on non-selected card does not show green or red", () => {
    const nodes = item("board",
      item("col1",
        item.task("firstTask"),
        item.task("futureTask"),
      ),
    )
    const futureTask = nodes.find((n) => n.content === "futureTask")!
    futureTask.due_date = "2026-12-15" // Far future

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    board.expect('[id="firstTask"][data-cursor]').toExist()

    const nodeBox = board.screen.nodeBox("futureTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    const decIdx = row.indexOf("Dec")
    expect(decIdx, "'Dec' should be visible").toBeGreaterThan(-1)

    const cell = board.screen.cell(decIdx, nodeBox.y)
    // Future date should NOT be red (1) or green (2)
    expect(cell.fg, "future date should not be red").not.toEqual(1)
    expect(cell.fg, "future date should not be green").not.toEqual(2)
  })
})
