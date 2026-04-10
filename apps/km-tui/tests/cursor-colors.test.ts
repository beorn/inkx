/**
 * Cursor color tests for TreeNode
 *
 * Bug 1 (km-tui.cursor-colors): When a node is selected (yellow bg),
 * infoSuffix and dateBadge Text elements don't set color={style.textColor},
 * so they render as white-on-yellow instead of black-on-yellow.
 *
 * Bug 2 (km-tui.date-not-dim): formatRelativeDate() doesn't colorize
 * scheduled dates, so in a range like "Today -> Tomorrow", the scheduled
 * part shows white while the due part shows green.
 */

import { describe, it, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp, type CellInfo } from "./helpers/test-app.ts"
import { TC } from "./helpers/theme.ts"
import { formatDateBadge } from "../src/views/tree-node-helpers.tsx"

import type { KNode } from "@km/core"

/** Helper to build a data-cursor locator for node IDs with spaces */
function cursor(nodeId: string): string {
  return `[id="${nodeId}"][data-cursor]`
}

/** Deep-compare cell bg/fg (RGB objects) to a TC constant */
function colorEquals(a: CellInfo["fg"], b: { r: number; g: number; b: number }): boolean {
  if (a === null || a === undefined || typeof a === "number") return false
  return (
    typeof a === "object" &&
    (a as { r: number; g: number; b: number }).r === b.r &&
    (a as { r: number; g: number; b: number }).g === b.g &&
    (a as { r: number; g: number; b: number }).b === b.b
  )
}

describe("cursor colors (km-tui.cursor-colors)", () => {
  it("selected node date badge has black text on yellow background", () => {
    // Create a task with a due date far enough in the future to show as a short date
    const nodes = item("board", item("col1", item.task("dateTask")))
    const taskNode = nodes.find((n) => n.content === "dateTask")!
    taskNode.due_at = "2027-04-15" // Far future date -> "Apr 15"

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // The first task should be selected (cursor on it)
    app.expect(cursor("dateTask")).toExist()

    // Find the date badge position: it should be right-aligned in the node row
    const nodeBox = app.screen.nodeBox("dateTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    // Find where "Apr" starts in the node's row
    const row = app.screen.row(nodeBox.y)
    const aprIdx = row.indexOf("Apr")
    expect(aprIdx, "date badge 'Apr' should be visible in the row").toBeGreaterThan(-1)

    // The date badge text should be $selectedfg on $selected when selected
    const cell = app.screen.cell(aprIdx, nodeBox.y)
    expect(cell.fg, `date badge fg at (${aprIdx},${nodeBox.y}) should be $selectedfg`).toEqual(TC.$selectedfg)
    expect(cell.bg, `date badge bg at (${aprIdx},${nodeBox.y}) should be $selected`).toEqual(TC.$selected)
  })

  it("selected node info suffix has black text on yellow background", () => {
    // Create a task with an assigned_to value to generate an info suffix
    // Use columns view because info suffix only shows in oneliner (non-compact) mode
    const nodes = item("board", item("col1", item.task("assignedTask")))
    const taskNode = nodes.find((n) => n.content === "assignedTask")!
    taskNode.assigned_to = "alice"

    using app = createTestApp(nodes, { cols: 80, rows: 24, viewMode: "columns" })

    // The first task should be selected
    app.expect(cursor("assignedTask")).toExist()

    // Find where "@A" (short code for "alice") appears in the node's row
    const nodeBox = app.screen.nodeBox("assignedTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    const aliceIdx = row.indexOf("@A")
    expect(aliceIdx, "info suffix '@A' should be visible").toBeGreaterThan(-1)

    // The info suffix text should be $selectedfg on $selected when selected
    const cell = app.screen.cell(aliceIdx, nodeBox.y)
    expect(cell.fg, `info suffix fg at (${aliceIdx},${nodeBox.y}) should be $selectedfg`).toEqual(TC.$selectedfg)
    expect(cell.bg, `info suffix bg at (${aliceIdx},${nodeBox.y}) should be $selected`).toEqual(TC.$selected)
  })

  it("non-selected node date badge is NOT black-on-yellow", () => {
    // Create two tasks, second one with a date
    const nodes = item("board", item("col1", item.task("firstTask"), item.task("secondTask")))
    const secondTask = nodes.find((n) => n.content === "secondTask")!
    secondTask.due_at = "2027-04-15"

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // First task is selected, second is not
    app.expect(cursor("firstTask")).toExist()

    // Second task's date badge should NOT have yellow background
    const nodeBox = app.screen.nodeBox("secondTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    const aprIdx = row.indexOf("Apr")
    if (aprIdx > -1) {
      const cell = app.screen.cell(aprIdx, nodeBox.y)
      expect(cell.bg, "non-selected date badge should not have $selected bg").not.toEqual(TC.$selected)
    }
  })
})

describe("date badge colors (km-tui.date-not-dim)", () => {
  it("formatDateBadge colorizes scheduled date for today", () => {
    // Create a node with start_at = today and due_at = tomorrow
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`

    const badge = formatDateBadge({
      start_at: todayStr,
      due_at: tomorrowStr,
    } as KNode)

    // The badge should contain ANSI green for "Today" (scheduled date)
    // Green ANSI = \x1b[32m
    const GREEN = "\x1b[32m"
    // Both "Today" and "Tomorrow" should be green-colored
    // The scheduled "Today" part should have green coloring (currently it does NOT)
    expect(badge).toContain(`${GREEN}Today`)
  })

  it("formatDateBadge colorizes scheduled date for tomorrow", () => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const futureDate = new Date(today)
    futureDate.setDate(futureDate.getDate() + 30)

    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`
    const futureStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, "0")}-${String(futureDate.getDate()).padStart(2, "0")}`

    const badge = formatDateBadge({
      start_at: tomorrowStr,
      due_at: futureStr,
    } as KNode)

    // The scheduled "Tomorrow" part should have green coloring
    const GREEN = "\x1b[32m"
    expect(badge).toContain(`${GREEN}Tomorrow`)
  })

  it("formatDateBadge does not colorize future scheduled dates", () => {
    const today = new Date()
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 10)
    const nextMonth = new Date(today)
    nextMonth.setDate(nextMonth.getDate() + 40)

    const nextWeekStr = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, "0")}-${String(nextWeek.getDate()).padStart(2, "0")}`
    const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-${String(nextMonth.getDate()).padStart(2, "0")}`

    const badge = formatDateBadge({
      start_at: nextWeekStr,
      due_at: nextMonthStr,
    } as KNode)

    // Future scheduled date should NOT have ANSI color codes around it
    const GREEN = "\x1b[32m"
    const RED = "\x1b[31m"
    // The start date portion (before the arrow) should not have color
    const arrowIdx = badge.indexOf("→")
    expect(arrowIdx).toBeGreaterThan(-1)
    const startPart = badge.slice(0, arrowIdx)
    expect(startPart).not.toContain(GREEN)
    expect(startPart).not.toContain(RED)
  })

  it("formatDateBadge scheduled-only today shows green", () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

    const badge = formatDateBadge({
      start_at: todayStr,
    } as KNode)

    const GREEN = "\x1b[32m"
    // "Today ->" should be green
    expect(badge).toContain(`${GREEN}Today`)
  })
})

// =============================================================================
// Selected card color tests (km-tui.selected-color, km-tui.fold-count-color, km-tui.date-range-color)
// =============================================================================

describe("km-tui.selected-color: all selected card content is black-on-yellow", () => {
  it("date badge on selected card is $selectedfg on $selected", () => {
    const nodes = item("board", item("col1", item.task("taskWithDate")))
    const taskNode = nodes.find((n) => n.content === "taskWithDate")!
    taskNode.due_at = "2027-04-15"

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Task should be selected
    app.expect('[id="taskWithDate"][data-cursor]').toExist()

    // Find the date badge in the rendered output
    const nodeBox = app.screen.nodeBox("taskWithDate")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    const aprIdx = row.indexOf("Apr")
    expect(aprIdx, "date badge 'Apr' should be visible").toBeGreaterThan(-1)

    // Every character in date badge should be $selectedfg on $selected
    for (let x = aprIdx; x < aprIdx + 6; x++) {
      const cell = app.screen.cell(x, nodeBox.y)
      if (cell.char.trim() === "") continue
      expect(cell.fg, `selected date badge fg at (${x},${nodeBox.y}) char='${cell.char}'`).toEqual(TC.$selectedfg)
      expect(cell.bg, `selected date badge bg at (${x},${nodeBox.y}) char='${cell.char}'`).toEqual(TC.$selected)
    }
  })

  // Child count is hidden in cards (hideChildCount) — overflow indicator shows count instead.
  // Color tests for child count only apply in outline/list mode.

  it("title text on selected card is $selectedfg on $selected", () => {
    const nodes = item("board", item("col1", item.task("mySelectedTask")))

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    app.expect('[id="mySelectedTask"][data-cursor]').toExist()
    app.expectNodeColor("mySelectedTask", { fg: TC.$selectedfg, bg: TC.$selected })
  })

  it("date range on selected card is black-on-yellow (not green/red)", () => {
    // Task with both scheduled and due date
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`

    const nodes = item("board", item("col1", item.task("rangeTask")))
    const taskNode = nodes.find((n) => n.content === "rangeTask")!
    taskNode.start_at = todayStr
    taskNode.due_at = tomorrowStr

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    app.expect('[id="rangeTask"][data-cursor]').toExist()

    const nodeBox = app.screen.nodeBox("rangeTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    // Find "Today" in the row
    const todayIdx = row.indexOf("Today")
    expect(todayIdx, "'Today' should be visible in date range").toBeGreaterThan(-1)

    // All date range text should be $selectedfg on $selected when selected
    const cell = app.screen.cell(todayIdx, nodeBox.y)
    expect(cell.fg, "date range 'Today' fg should be $selectedfg when selected").toEqual(TC.$selectedfg)
    expect(cell.bg, "date range 'Today' bg should be $selected when selected").toEqual(TC.$selected)
  })
})

// Child count is hidden in cards (hideChildCount) — fold-count-color tests
// only apply in outline/list mode where count is visible.

describe("km-tui.date-range-color: date uses green/red when not selected", () => {
  it("overdue date on non-selected card shows $error fg", () => {
    const nodes = item("board", item("col1", item.task("firstTask"), item.task("overdueTask")))
    const overdueTask = nodes.find((n) => n.content === "overdueTask")!
    overdueTask.due_at = "2025-01-01" // Past date — overdue

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // firstTask is selected, overdueTask is not
    app.expect('[id="firstTask"][data-cursor]').toExist()

    const nodeBox = app.screen.nodeBox("overdueTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    const janIdx = row.indexOf("Jan")
    expect(janIdx, "overdue date 'Jan' should be visible").toBeGreaterThan(-1)

    const cell = app.screen.cell(janIdx, nodeBox.y)
    expect(cell.fg, "overdue date fg should be $error").toEqual(TC.$error)
  })

  it("today's due date on non-selected card shows $success fg", () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

    const nodes = item("board", item("col1", item.task("firstTask"), item.task("todayTask")))
    const todayTask = nodes.find((n) => n.content === "todayTask")!
    todayTask.due_at = todayStr

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    app.expect('[id="firstTask"][data-cursor]').toExist()

    const nodeBox = app.screen.nodeBox("todayTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    const todayIdx = row.indexOf("Today")
    expect(todayIdx, "'Today' should be visible").toBeGreaterThan(-1)

    const cell = app.screen.cell(todayIdx, nodeBox.y)
    expect(cell.fg, "today due date fg should be $success").toEqual(TC.$success)
  })

  // FREEZE: needs createDriverTest — hardcoded ANSI palette indices (1, 2) for negative assertions
  it("future date on non-selected card does not show green or red", () => {
    const nodes = item("board", item("col1", item.task("firstTask"), item.task("futureTask")))
    const futureTask = nodes.find((n) => n.content === "futureTask")!
    futureTask.due_at = "2026-12-15" // Far future

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    app.expect('[id="firstTask"][data-cursor]').toExist()

    const nodeBox = app.screen.nodeBox("futureTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    const decIdx = row.indexOf("Dec")
    expect(decIdx, "'Dec' should be visible").toBeGreaterThan(-1)

    const cell = app.screen.cell(decIdx, nodeBox.y)
    // Future date should NOT be red or green
    expect(colorEquals(cell.fg, TC.$error), "future date should not be red").toBe(false)
    expect(colorEquals(cell.fg, TC.$success), "future date should not be green").toBe(false)
  })
})

describe("km-tui.done-style: completed task date badge hidden, title dimmed", () => {
  it("done task hides date badge entirely (saves space, not relevant)", () => {
    const nodes = item("board", item("col1", item.task("firstTask"), item.task("doneOverdue")))
    const doneTask = nodes.find((n) => n.content === "doneOverdue")!
    doneTask.due_at = "2025-01-01" // Past date — would show "Jan 1" on a todo task
    doneTask.item = { ...doneTask.item, task: { status: "done", marker: "[x]" } }

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    app.expect('[id="firstTask"][data-cursor]').toExist()

    const nodeBox = app.screen.nodeBox("doneOverdue")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    // Date should NOT appear anywhere on the done task's row
    const row = app.screen.row(nodeBox.y)
    expect(row.indexOf("Jan"), "done task should not show date 'Jan'").toBe(-1)
  })

  it("done task with priority hides date badge (including priority)", () => {
    const nodes = item("board", item("col1", item.task("firstTask"), item.task("donePrio")))
    const doneTask = nodes.find((n) => n.content === "donePrio")!
    doneTask.priority = "P1"
    doneTask.due_at = "2025-01-01"
    doneTask.item = { ...doneTask.item, task: { status: "done", marker: "[x]" } }

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    const nodeBox = app.screen.nodeBox("donePrio")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    // "P1" should not appear — content is "donePrio" which doesn't contain "P1"
    expect(row.indexOf("P1"), "done task should not show priority badge").toBe(-1)
  })

  it("todo task DOES show date badge with colors", () => {
    const nodes = item("board", item("col1", item.task("firstTask"), item.task("todoDate")))
    const todoTask = nodes.find((n) => n.content === "todoDate")!
    todoTask.due_at = "2027-04-15" // Far future date -> "Apr 15"

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    const nodeBox = app.screen.nodeBox("todoDate")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    expect(row.indexOf("Apr"), "todo task should show date").toBeGreaterThan(-1)
  })

  it("done task title is dimmed", () => {
    const nodes = item("board", item("col1", item.task("firstTask"), item.task("doneTitle")))
    const doneTask = nodes.find((n) => n.content === "doneTitle")!
    doneTask.item = { ...doneTask.item, task: { status: "done", marker: "[x]" } }

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    const nodeBox = app.screen.nodeBox("doneTitle")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    const titleIdx = row.indexOf("doneTitle")
    expect(titleIdx, "title should be visible").toBeGreaterThan(-1)
    const titleCell = app.screen.cell(titleIdx, nodeBox.y)
    expect(titleCell.dim, "done task title should be dimmed").toBe(true)
  })

  it("dropped task also hides date badge and dims title", () => {
    // Dropped tasks get the same treatment as done tasks
    const nodes = item("board", item("col1", item.task("firstTask"), item.task("droppedTask")))
    const droppedTask = nodes.find((n) => n.content === "droppedTask")!
    droppedTask.due_at = "2025-01-01"
    droppedTask.priority = "P2"
    droppedTask.item = { ...droppedTask.item, task: { status: "dropped", marker: "[-]" } }

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    const nodeBox = app.screen.nodeBox("droppedTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)

    // Date badge should be hidden
    expect(row.indexOf("Jan"), "dropped task should not show date").toBe(-1)
    expect(row.indexOf("P2"), "dropped task should not show priority").toBe(-1)

    // Title should be dimmed
    const titleIdx = row.indexOf("droppedTask")
    expect(titleIdx, "title should be visible").toBeGreaterThan(-1)
    const titleCell = app.screen.cell(titleIdx, nodeBox.y)
    expect(titleCell.dim, "dropped task title should be dimmed").toBe(true)
  })

  it("done task with inline code has colors stripped (not colored)", () => {
    // Regression: done tasks should strip ANSI colors from title content,
    // including inline code (backtick) which normally renders as colored.
    const nodes = item("board", item("col1", item.task("firstTask"), item.task("Fix the `config` bug")))
    const doneTask = nodes.find((n) => n.content === "Fix the `config` bug")!
    doneTask.item = { ...doneTask.item, task: { status: "done", marker: "[x]" } }

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    const nodeBox = app.screen.nodeBox("Fix the `config` bug")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    const configIdx = row.indexOf("config")
    expect(configIdx, "'config' should be visible").toBeGreaterThan(-1)

    // "config" should NOT be cyan (6) — colors stripped for done tasks
    const cell = app.screen.cell(configIdx, nodeBox.y)
    expect(cell.fg, "done task inline code should not be cyan").not.toEqual(6)
  })
})
