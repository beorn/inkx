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
import { testEnv, item } from "./helpers/board-test.ts"
import { formatDateBadge } from "../src/views/tree-node-helpers.ts"
import type { KNode } from "@km/core"

/** Helper to build a data-cursor locator for node IDs with spaces */
function cursor(nodeId: string): string {
  return `[id="${nodeId}"][data-cursor]`
}

describe("cursor colors (km-tui.cursor-colors)", () => {
  it("selected node date badge has black text on yellow background", () => {
    // Create a task with a due date far enough in the future to show as a short date
    const nodes = item("board",
      item("col1",
        item.task("dateTask"),
      ),
    )
    const taskNode = nodes.find((n) => n.content === "dateTask")!
    taskNode.due_date = "2026-04-15" // Far future date -> "Apr 15"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // The first task should be selected (cursor on it)
    board.expect(cursor("dateTask")).toExist()

    // Find the date badge position: it should be right-aligned in the node row
    const nodeBox = board.screen.nodeBox("dateTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    // Find where "Apr" starts in the node's row
    const row = board.screen.row(nodeBox.y)
    const aprIdx = row.indexOf("Apr")
    expect(aprIdx, "date badge 'Apr' should be visible in the row").toBeGreaterThan(-1)

    // The date badge text should be black (0) on yellow (3) when selected
    const cell = board.screen.cell(aprIdx, nodeBox.y)
    expect(cell.fg, `date badge fg at (${aprIdx},${nodeBox.y}) should be black`).toEqual(0)
    expect(cell.bg, `date badge bg at (${aprIdx},${nodeBox.y}) should be yellow`).toEqual(3)
  })

  it("selected node info suffix has black text on yellow background", () => {
    // Create a task with an assigned_to value to generate an info suffix
    // Use columns view because info suffix only shows in oneliner (non-compact) mode
    const nodes = item("board",
      item("col1",
        item.task("assignedTask"),
      ),
    )
    const taskNode = nodes.find((n) => n.content === "assignedTask")!
    taskNode.assigned_to = "alice"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24, viewMode: "columns" })

    // The first task should be selected
    board.expect(cursor("assignedTask")).toExist()

    // Find where "@alice" appears in the node's row
    const nodeBox = board.screen.nodeBox("assignedTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    const aliceIdx = row.indexOf("@alice")
    expect(aliceIdx, "info suffix '@alice' should be visible").toBeGreaterThan(-1)

    // The info suffix text should be black (0) on yellow (3) when selected
    const cell = board.screen.cell(aliceIdx, nodeBox.y)
    expect(cell.fg, `info suffix fg at (${aliceIdx},${nodeBox.y}) should be black`).toEqual(0)
    expect(cell.bg, `info suffix bg at (${aliceIdx},${nodeBox.y}) should be yellow`).toEqual(3)
  })

  it("non-selected node date badge is NOT black-on-yellow", () => {
    // Create two tasks, second one with a date
    const nodes = item("board",
      item("col1",
        item.task("firstTask"),
        item.task("secondTask"),
      ),
    )
    const secondTask = nodes.find((n) => n.content === "secondTask")!
    secondTask.due_date = "2026-04-15"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // First task is selected, second is not
    board.expect(cursor("firstTask")).toExist()

    // Second task's date badge should NOT have yellow background
    const nodeBox = board.screen.nodeBox("secondTask")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    const aprIdx = row.indexOf("Apr")
    if (aprIdx > -1) {
      const cell = board.screen.cell(aprIdx, nodeBox.y)
      expect(cell.bg, "non-selected date badge should not have yellow bg").not.toEqual(3)
    }
  })
})

describe("date badge colors (km-tui.date-not-dim)", () => {
  it("formatDateBadge colorizes scheduled date for today", () => {
    // Create a node with scheduled_date = today and due_date = tomorrow
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`

    const badge = formatDateBadge({
      scheduled_date: todayStr,
      due_date: tomorrowStr,
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
      scheduled_date: tomorrowStr,
      due_date: futureStr,
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
      scheduled_date: nextWeekStr,
      due_date: nextMonthStr,
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
      scheduled_date: todayStr,
    } as KNode)

    const GREEN = "\x1b[32m"
    // "Today ->" should be green
    expect(badge).toContain(`${GREEN}Today`)
  })
})
