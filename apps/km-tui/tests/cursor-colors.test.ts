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
import { stripAnsi } from "inkx"
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

// =============================================================================
// Cursor color override tests (selected cursor renders all text as black-on-yellow)
// =============================================================================

/**
 * Find the card content line for a selected card and extract the content
 * between border characters, trimming trailing border ANSI codes.
 *
 * Selected cards use yellow background (48;5;3 in 256-color mode).
 */
function findSelectedCardContent(ansi: string, text: string): string | undefined {
  const lines = ansi.split("\n")
  for (const line of lines) {
    const plain = stripAnsi(line)
    if (!plain.includes(text)) continue
    // Selected card has yellow background (48;5;3)
    if (!line.includes("48;5;3")) continue

    // Extract content between border chars │...│
    const firstBorder = line.indexOf("\u2502")
    const lastBorder = line.lastIndexOf("\u2502")
    if (firstBorder >= 0 && lastBorder > firstBorder) {
      let content = line.slice(firstBorder + 1, lastBorder)
      // Trim trailing ANSI code that belongs to the border character
      content = content.replace(/\x1b\[[\d;:]+m$/, "")
      return content
    }
  }
  return undefined
}

/**
 * Check if ANSI string has any non-black foreground color.
 * "Black" means 256-color 0, basic 30, or RGB 0;0;0.
 * Ignores background codes, resets, and formatting attributes.
 */
function hasNonBlackForeground(ansi: string): boolean {
  const sgrRegex = /\x1b\[([\d;:]+)m/g
  let match
  while ((match = sgrRegex.exec(ansi)) !== null) {
    const parts = match[1]!.split(";")
    for (let i = 0; i < parts.length; i++) {
      const code = Number.parseInt(parts[i]!, 10)
      // Extended foreground: 38;5;N
      if (code === 38 && parts[i + 1] === "5") {
        const colorNum = Number.parseInt(parts[i + 2] ?? "", 10)
        if (colorNum !== 0) return true
        i += 2
        continue
      }
      // Extended foreground: 38;2;R;G;B
      if (code === 38 && parts[i + 1] === "2") {
        const r = Number.parseInt(parts[i + 2] ?? "0", 10)
        const g = Number.parseInt(parts[i + 3] ?? "0", 10)
        const b = Number.parseInt(parts[i + 4] ?? "0", 10)
        if (r !== 0 || g !== 0 || b !== 0) return true
        i += 4
        continue
      }
      // Skip background: 48;5;N or 48;2;R;G;B
      if (code === 48) {
        if (parts[i + 1] === "5") { i += 2; continue }
        if (parts[i + 1] === "2") { i += 4; continue }
        continue
      }
      // Standard foreground: 31-37 (not 30=black)
      if (code >= 31 && code <= 37) return true
      // Bright foreground: 90-97
      if (code >= 90 && code <= 97) return true
    }
  }
  return false
}

describe("cursor color override", () => {
  it("selected node with inline code renders without colored foreground", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("Fix the `config` bug")),
        ),
      { columns: 60, rows: 20 },
    )

    const ansi = board._result.ansi
    expect(board.screenshot()).toContain("Fix the config bug")

    const content = findSelectedCardContent(ansi, "Fix the config bug")
    expect(content).toBeDefined()

    // Selected content should have only black foreground (no cyan from backtick code)
    expect(hasNonBlackForeground(content!)).toBe(false)
  })

  it("selected node with priority date badge renders without colored foreground", () => {
    const nodes = item(
      "board",
      item("col1", item.task("Important task")),
    )
    const taskNode = nodes.find((n) => n.content === "Important task")!
    taskNode.priority = 1
    taskNode.due_date = "2025-01-01"

    const { board } = testEnv(() => nodes, { columns: 60, rows: 20 })

    const ansi = board._result.ansi
    expect(board.screenshot()).toContain("Important task")

    const content = findSelectedCardContent(ansi, "Important task")
    expect(content).toBeDefined()

    expect(hasNonBlackForeground(content!)).toBe(false)
  })

  it("unselected node retains colored foreground for inline code", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("First task"), item.task("Has `code` text")),
        ),
      { columns: 60, rows: 20 },
    )

    const ansi = board._result.ansi
    const lines = ansi.split("\n")

    // Find the unselected card (no yellow background 48;5;3)
    const codeLine = lines.find((line) => {
      const plain = stripAnsi(line)
      return plain.includes("Has code text") && !line.includes("48;5;3")
    })
    expect(codeLine).toBeDefined()

    // Unselected card SHOULD have non-black foreground (cyan for `code`)
    expect(hasNonBlackForeground(codeLine!)).toBe(true)
  })

  it("after navigation, newly selected node loses foreground colors", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("Plain task"), item.task("Has `styled` content")),
        ),
      { columns: 60, rows: 20 },
    )

    board.press("j")

    const ansi = board._result.ansi
    const content = findSelectedCardContent(ansi, "Has styled content")
    expect(content).toBeDefined()

    expect(hasNonBlackForeground(content!)).toBe(false)
  })
})

// =============================================================================
// Selected card color tests (km-tui.selected-color, km-tui.fold-count-color, km-tui.date-range-color)
//
// All content on a selected card should be black-on-yellow (fg=0, bg=3).
// This includes: title, date badges, fold counts, info suffixes.
//
// Date ranges on non-selected cards should use green for future/today, red for overdue.
// =============================================================================

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
