/* oxlint-disable complexity/complexity -- Test file with nested assertions */
// createDriverTest FREEZE bucket — see km-all.test-system bead. Reason: MemoryStore + createBareRepo + act for time mocking
/**
 * Date, priority, and recurrence tests: badge display, date prompt dialog,
 * priority cycling, due date filtering for @next board.
 *
 * Covers:
 * - formatDateBadge and badge visibility in cards/columns views
 * - td/ts/tr chord sequences for date/recurrence dialogs
 * - sp chord for priority cycling
 * - due:past/due:today/due:week query matching for @next board rules
 * - evaluateAllRules materializing embeds for dated tasks
 * - onNodeChanged creating embeds after interactive td
 */

import { describe, test, it, expect, vi, beforeAll, afterAll } from "vitest"
import { act } from "react"
import { createDriverTest, item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { __triggerChordTimeout } from "../src/board/board-app.ts"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { formatDateBadge } from "../src/views/tree-node-helpers.tsx"
import type { KNode } from "@km/core"
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import {
  MemoryStore,
  queryTasks,
  evaluateAllRules,
  createRuleContext,
  getChildren,
  onNodeChanged,
  createBareRepo,
} from "@km/storage"
import type { Database } from "bun:sqlite"
import { formatDate } from "@km/core"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withTestRepo(setup: (repoDir: string) => void, fn: (store: MemoryStore) => void): void {
  const testDir = join("/tmp", `kmtest-due-${ulid()}`)
  mkdirSync(testDir, { recursive: true })
  setup(testDir)
  using store = new MemoryStore(testDir)
  try {
    fn(store)
  } finally {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  }
}

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return formatDate(d)
}

function today(): string {
  return formatDate(new Date())
}

function tomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return formatDate(d)
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return formatDate(d)
}

/** Strip ANSI escape codes from a string */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

/** Helper to find the Inbox section (the one with km.add:: rules containing "due:past") */
function findInboxSection(db: Database): { id: string } | undefined {
  const rows = db.query("SELECT * FROM nodes WHERE json_extract(data, '$.rules.add') IS NOT NULL").all() as Record<
    string,
    unknown
  >[]

  for (const row of rows) {
    const data = JSON.parse((row.data as string) || "{}") as Record<string, any>
    const adds = Array.isArray(data.rules?.add) ? data.rules.add : data.rules?.add ? [data.rules.add] : []
    if (adds.some((a: string) => a.includes("due:past"))) {
      return { id: row.id as string }
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Date badge display
// ---------------------------------------------------------------------------

describe("date badge display", () => {
  // Freeze time so hardcoded dates like "2026-03-15" always render as absolute
  // "Mar 15" rather than relative names like "Sunday" when tests run near that date.
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"))
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it("formatDateBadge returns badge for node with due_at", () => {
    // Use a date 30+ days out so it renders as "Mon DD" not relative
    const badge = formatDateBadge({ due_at: "2026-03-15" } as KNode)
    expect(badge).not.toBe("")
    expect(badge).toContain("Mar 15")
  })

  it("formatDateBadge returns empty for node without dates", () => {
    const badge = formatDateBadge({} as KNode)
    expect(badge).toBe("")
  })

  // ---------------------------------------------------------------------------
  // Date colorization (km-tui.date-render)
  // ---------------------------------------------------------------------------

  it("formatDateBadge shows 'Yesterday' for yesterday's due date", () => {
    const badge = formatDateBadge({ due_at: yesterday() } as KNode)
    expect(stripAnsi(badge)).toContain("Yesterday")
  })

  it("formatDateBadge shows 'Today' for today's due date", () => {
    const badge = formatDateBadge({ due_at: today() } as KNode)
    expect(stripAnsi(badge)).toContain("Today")
  })

  it("formatDateBadge shows 'Tomorrow' for tomorrow's due date", () => {
    const badge = formatDateBadge({ due_at: tomorrow() } as KNode)
    expect(stripAnsi(badge)).toContain("Tomorrow")
  })

  it("formatDateBadge uses year suffix for different year", () => {
    const badge = formatDateBadge({ due_at: "2025-09-30" } as KNode)
    expect(stripAnsi(badge)).toContain("Sep 30 '25")
  })

  it("formatDateBadge omits year suffix for current year", () => {
    const badge = formatDateBadge({ due_at: "2026-07-15" } as KNode)
    const text = stripAnsi(badge)
    expect(text).toContain("Jul 15")
    expect(text).not.toContain("'26")
  })

  it("overdue due date is red+bold", () => {
    // 30 days ago — overdue
    const badge = formatDateBadge({ due_at: daysFromNow(-30) } as KNode)
    // Red bold ANSI: \x1b[1;31m
    expect(badge).toContain("\x1b[1;31m")
  })

  it("future due date is dim+cyan", () => {
    // 30 days out — future
    const badge = formatDateBadge({ due_at: daysFromNow(30) } as KNode)
    // Dim cyan ANSI: \x1b[2;36m
    expect(badge).toContain("\x1b[2;36m")
  })

  it("today's due date is green", () => {
    const badge = formatDateBadge({ due_at: today() } as KNode)
    // Green ANSI: \x1b[32m
    expect(badge).toContain("\x1b[32m")
  })

  it("start_at shown when no due_at", () => {
    const badge = formatDateBadge({ start_at: daysFromNow(10) } as KNode)
    const text = stripAnsi(badge)
    expect(text).not.toBe("")
    // Start-only shows as "date →"
    expect(text).toContain("→")
  })

  it("due_at preferred over start_at for display", () => {
    const badge = formatDateBadge({
      due_at: "2026-07-15",
      start_at: "2026-06-01",
    } as KNode)
    const text = stripAnsi(badge)
    expect(text).toContain("Jul 15")
    expect(text).toContain("Jun 1")
  })

  it("card renders overdue date text in card", () => {
    const nodes = item("board", item("col1", item.task("Overdue task")))
    const taskNode = nodes.find((n) => n.content === "Overdue task")!
    taskNode.due_at = daysFromNow(-5)

    using app = createTestApp(nodes, { cols: 80, rows: 24 })
    // Overdue date text should appear in the card
    expect(app.text).toContain("Overdue task")
    // The date should be rendered (some short date format)
    const badge = formatDateBadge(taskNode as KNode)
    const badgeText = stripAnsi(badge)
    // The date text from the badge should appear in the rendered card
    expect(app.text).toContain(badgeText)
  })

  it("card renders future date text in card", () => {
    const nodes = item("board", item("col1", item.task("Future task")))
    const taskNode = nodes.find((n) => n.content === "Future task")!
    taskNode.due_at = daysFromNow(30)

    using app = createTestApp(nodes, { cols: 80, rows: 24 })
    // Future date text should appear in the card
    expect(app.text).toContain("Future task")
    const badge = formatDateBadge(taskNode as KNode)
    const badgeText = stripAnsi(badge)
    expect(app.text).toContain(badgeText)
  })

  it("date badge appears in card after repo.updateNode", async () => {
    const nodes = item("board", item("col1", item.task("Test task")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Initially no date
    let screen = driver.getState().screen
    let clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    expect(clean).not.toContain("Mar 15")

    // Set due_at on the task node
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_at: "2026-03-15" })
    })

    // Trigger render flush (silvery custom renderer needs a keypress to flush
    // useSyncExternalStore updates — j/k is a no-op cursor move on single card)
    await driver.press("j")

    // Date badge should appear right-aligned in the card
    screen = driver.getState().screen
    clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    expect(clean).toContain("Mar 15")
  })

  it("date badge appears in detail pane after repo.updateNode", async () => {
    const nodes = item("board", item("col1", item.task("Test task")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Set due_at on the task node
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_at: "2026-03-15" })
    })

    // Open detail pane (D = toggle_detail_pane in v2)
    await driver.press("D")

    const screen = driver.getState().screen
    const clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    // Detail pane should show the due date (rendered as relative date)
    expect(clean).toContain("Due")
    expect(clean).toContain("Mar 15")
  })

  it("date badge visible in cards view with initial due_at", () => {
    // Create nodes, then set due_at before rendering
    const nodes = item("board", item("col1", item.task("Task with date")))
    // Manually set due_at on the task node before creating repo
    const taskNode = nodes.find((n) => n.content === "Task with date")!
    taskNode.due_at = "2026-03-15"
    taskNode.priority = "P1"

    using app = createTestApp(nodes, { cols: 80, rows: 24 })
    // Check the date badge appears
    expect(app.text).toContain("Mar 15")
    expect(app.text).toContain("P1")
  })

  it("date badge visible in cards view with multiple columns", () => {
    const nodes = item(
      "board",
      item("col1", item.task("Task A"), item.task("Task B")),
      item("col2", item.task("Task C")),
    )
    // Set due_at on Task A
    const taskA = nodes.find((n) => n.content === "Task A")!
    taskA.due_at = "2026-03-15"
    taskA.priority = "P2"
    // Set priority on Task C
    const taskC = nodes.find((n) => n.content === "Task C")!
    taskC.priority = "P3"

    using app = createTestApp(nodes, { cols: 80, rows: 24 })
    expect(app.text).toContain("Mar 15")
    expect(app.text).toContain("P2")
    expect(app.text).toContain("P3")
  })

  it("date badge visible with many columns (narrow width per column)", () => {
    const nodes = item(
      "board",
      item("col1", item.task("Task A")),
      item("col2", item.task("Task B")),
      item("col3", item.task("Task C")),
      item("col4", item.task("Task D")),
    )
    // Set due_at on Task A
    const taskA = nodes.find((n) => n.content === "Task A")!
    taskA.due_at = "2026-03-15"

    // 80 columns / 4 columns = 20 chars per column -- very narrow
    using app = createTestApp(nodes, { cols: 80, rows: 24 })
    // With only ~20 chars per column, badge may be truncated but should still appear
    expect(app.text).toContain("Mar 15")
  })

  it("card border intact with date badge in cards view", () => {
    // Regression test: date badge (with ANSI color codes) must not overwrite
    // the right border character of the card's bordered box.
    // Bug: km-tui.card-border-bleed
    const nodes = item(
      "board",
      item("col1", item.task("After Delei gets ring - change to d@delei.org")),
      item("col2", item.task("Some other task")),
    )
    const taskNode = nodes.find((n) => n.content?.includes("Delei"))!
    taskNode.due_at = "2025-09-30" // Overdue date -> red badge

    using app = createTestApp(nodes, { cols: 80, rows: 24 })
    const screen = app.text

    // Find the card with the date badge
    expect(screen).toContain("Sep 30")

    // Check card border integrity using screen.cell()
    // Find top-left corners of cards in the rendered output
    const lines = screen.split("\n")
    for (let y = 0; y < lines.length; y++) {
      const line = lines[y]!
      for (let x = 0; x < line.length; x++) {
        if (line[x] === "╭") {
          // Found card top-left. Scan right for ╮ to find card width.
          let cardWidth = -1
          for (let xx = x + 1; xx < line.length; xx++) {
            if (line[xx] === "╮") {
              cardWidth = xx - x + 1
              break
            }
          }
          if (cardWidth > 0) {
            const rightBorderCol = x + cardWidth - 1
            // Check content rows below using screen.cell()
            for (let yy = y + 1; yy < lines.length; yy++) {
              const rowLine = lines[yy]!
              const leftChar = rowLine[x]
              if (leftChar === "╰") break // Bottom border
              if (leftChar !== "│") break // Not a card row

              // RIGHT BORDER must be │
              const rightChar = rowLine[rightBorderCol]
              expect(
                rightChar,
                `Card at (${x},${y}), row ${yy}: right border at col ${rightBorderCol} is "${rightChar}" instead of "│". Row: "${rowLine}"`,
              ).toBe("│")

              // Also check via cell API (buffer level)
              const cellRight = app.screen.cell(rightBorderCol, yy)
              expect(
                cellRight.char,
                `Card at (${x},${y}), row ${yy}: buffer cell at (${rightBorderCol},${yy}) is "${cellRight.char}" instead of "│"`,
              ).toBe("│")
            }
          }
        }
      }
    }
  })

  it.each([40, 50, 60, 70, 80, 100, 120])("card border intact at %d cols with date badge", (cols) => {
    const nodes = item(
      "board",
      item("col1", item.task("After Delei gets ring - change to d@delei.org")),
      item("col2", item.task("Another task with content")),
    )
    const taskNode = nodes.find((n) => n.content?.includes("Delei"))!
    taskNode.due_at = "2025-09-30"

    using app = createTestApp(nodes, { cols, rows: 24 })
    const screen = app.text

    // Verify Sep 30 appears (unless too narrow to fit)
    if (cols >= 80) {
      expect(screen, `cols=${cols}: date badge should appear`).toContain("Sep")
    }

    // Check all card borders
    const lines = screen.split("\n")
    for (let y = 0; y < lines.length; y++) {
      const line = lines[y]!
      for (let x = 0; x < line.length; x++) {
        if (line[x] === "╭") {
          let cardWidth = -1
          for (let xx = x + 1; xx < line.length; xx++) {
            if (line[xx] === "╮") {
              cardWidth = xx - x + 1
              break
            }
          }
          if (cardWidth > 0) {
            const rightBorderCol = x + cardWidth - 1
            for (let yy = y + 1; yy < lines.length; yy++) {
              const rowLine = lines[yy]!
              const leftChar = rowLine[x]
              if (leftChar === "╰") break
              if (leftChar !== "│") break

              const rightChar = rowLine[rightBorderCol]
              expect(
                rightChar,
                `cols=${cols}: Card at (${x},${y}), row ${yy}: right border at col ${rightBorderCol} is "${rightChar}" instead of "│". Row: "${rowLine}"`,
              ).toBe("│")
            }
          }
        }
      }
    }
  })

  it("card border intact after navigation with date badge", () => {
    // Test that incremental rendering after cursor movement preserves borders
    const nodes = item(
      "board",
      item("col1", item.task("Task with due date"), item.task("Task two"), item.task("Task three")),
      item("col2", item.task("Another task")),
    )
    const taskNode = nodes.find((n) => n.content === "Task with due date")!
    taskNode.due_at = "2025-09-30"

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Navigate down (incremental render)
    app.press("j")
    app.press("j")

    // Navigate back up
    app.press("k")
    app.press("k")

    // Check borders after navigation
    const screen = app.text
    const lines = screen.split("\n")
    for (let y = 0; y < lines.length; y++) {
      const line = lines[y]!
      for (let x = 0; x < line.length; x++) {
        if (line[x] === "╭") {
          let cardWidth = -1
          for (let xx = x + 1; xx < line.length; xx++) {
            if (line[xx] === "╮") {
              cardWidth = xx - x + 1
              break
            }
          }
          if (cardWidth > 0) {
            const rightBorderCol = x + cardWidth - 1
            for (let yy = y + 1; yy < lines.length; yy++) {
              const rowLine = lines[yy]!
              if (rowLine[x] === "╰") break
              if (rowLine[x] !== "│") break

              expect(
                rowLine[rightBorderCol],
                `After nav: Card at (${x},${y}), row ${yy}: right border at col ${rightBorderCol} is "${rowLine[rightBorderCol]}" not "│". Row: "${rowLine}"`,
              ).toBe("│")
            }
          }
        }
      }
    }
  })

  it("date badge visible in columns view", () => {
    const nodes = item("board", item("col1", item.task("Task with date")))
    const taskNode = nodes.find((n) => n.content === "Task with date")!
    taskNode.due_at = "2026-03-15"
    taskNode.priority = "P2"

    using app = createTestApp(nodes, { cols: 80, rows: 24, viewMode: "columns" })
    expect(app.text).toContain("Mar 15")
    expect(app.text).toContain("P2")
  })

  it("child count appears before date badge in columns view (km-tui.oneliner-order)", () => {
    // A card with children AND a due date should show: Title ... COUNT ... date
    // COUNT (right-aligned) should come before date badge (rightmost)
    const nodes = item("board", item("col1", item("Parent task", item("child-a"), item("child-b"), item("child-c"))))
    // Set due_at on the parent task (the card that has children)
    const parentNode = nodes.find((n) => n.data?.name === "Parent task")!
    parentNode.due_at = "2026-09-15"

    using app = createTestApp(nodes, { cols: 80, rows: 24, viewMode: "columns" })

    // Find the row containing "Parent task"
    const nodeBox = app.screen.nodeBox("Parent task")
    expect(nodeBox, "Parent task node should exist").not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)

    // Both child count (3) and date (Sep 15) should appear
    const countIdx = row.indexOf(" 3")
    const dateIdx = row.indexOf("Sep 15")
    expect(countIdx, "child count '3' should be visible in the row").toBeGreaterThan(-1)
    expect(dateIdx, "date badge 'Sep 15' should be visible in the row").toBeGreaterThan(-1)

    // COUNT must appear before date
    expect(
      countIdx,
      `child count (at ${countIdx}) should appear before date badge (at ${dateIdx}): "${row}"`,
    ).toBeLessThan(dateIdx)
  })

  it("date badge appears after 'td' key simulation (full workflow)", async () => {
    // Simulate the full workflow: user presses 'td', types a date, presses Enter
    const nodes = item("board", item("col1", item.task("My task")))
    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Before: no date badge
    expect(app.text).not.toContain("Mar 15")

    // User presses 'td' to open the date prompt
    app.press("t").press("d")

    // Simulate what DatePromptDialog.onConfirm does:
    // (In the test, we can't actually type in the dialog, so we use repo.updateNode)
    const col = app.repo.getChildren("board")[0]!
    const taskNode = app.repo.getChildren(col.id)[0]!
    act(() => {
      app.repo.updateNode(taskNode.id, { due_at: "2026-03-15" })
    })

    // Press Escape to close the date prompt
    app.press("escape")

    // The date badge should now be visible in the card
    expect(app.text).toContain("Mar 15")
  })

  it("structural sharing preserves date badge after unrelated mutation", () => {
    // Regression: date/priority changes must be reflected after unrelated mutations
    const nodes = item("board", item("col1", item.task("Task A"), item.task("Task B")))
    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Set due_at on Task A
    const col = app.repo.getChildren("board")[0]!
    const taskA = app.repo.getChildren(col.id)[0]!
    act(() => {
      app.repo.updateNode(taskA.id, { due_at: "2026-03-15", priority: "P1" })
    })
    app.press("j") // flush
    expect(app.text).toContain("Mar 15")
    expect(app.text).toContain("P1")

    // Now mutate Task B (unrelated) — Task A's badge should persist
    const taskB = app.repo.getChildren(col.id)[1]!
    act(() => {
      app.repo.updateNode(taskB.id, { content: "Task B updated" })
    })
    app.press("j") // flush
    expect(app.text).toContain("Mar 15")
    expect(app.text).toContain("P1")
    expect(app.text).toContain("Task B updated")
  })

  it("priority badge visible in cards view", () => {
    const nodes = item("board", item("col1", item.task("Priority task")))
    const taskNode = nodes.find((n) => n.content === "Priority task")!
    taskNode.priority = "P2"

    using app = createTestApp(nodes, { cols: 80, rows: 24 })
    expect(app.text).toContain("P2")
  })

  it("date badge visible after setting via 'td' key sequence", () => {
    const nodes = item("board", item("col1", item.task("Todo task")))
    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Simulate what 'td' does: update the node's due_at
    const col = app.repo.getChildren("board")[0]!
    const taskNode = app.repo.getChildren(col.id)[0]!
    act(() => {
      app.repo.updateNode(taskNode.id, { due_at: "2026-03-15" })
    })

    // Flush by pressing a no-op key
    app.press("j")

    expect(app.text).toContain("Mar 15")
  })
})

// ---------------------------------------------------------------------------
// Date prompt (td), start date (ts), recurrence (tr)
// ---------------------------------------------------------------------------

describe("date prompt (td)", () => {
  test("td chord opens due date dialog", () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"), item.task("Write report"))))

    // Navigate to card level
    app.press("j")

    // Press t (chord prefix) then d (due date)
    app.press("t")
    app.press("d")

    // Dialog should be open — check for "Set Due Date" text
    expect(app.text).toContain("Set Due Date")
  })

  test("td chord does not leak 'd' into text input", () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"))))

    app.press("j")
    app.press("t")
    app.press("d")

    // The dialog input should be empty (no leaked 'd')
    // The prompt shows "> " followed by a cursor — no 'd' character
    expect(app.text).not.toMatch(/> d[^a-z]/)
    // Should show empty state hint
    expect(app.text).toContain("Empty = clear value")
  })

  test("td chord timeout resolves t standalone to noop in v2", () => {
    // In v2, 't' standalone is noop (chord prefix only).
    // When chord timeout fires, 't' resolves to noop.
    // Then 'd' arriving afterward should be handled as clipboard_cut (its v2 binding).
    const { board, store } = createDriverTest(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")
    board.press("t")

    // Manually trigger chord timeout (bypasses real setTimeout)
    act(() => {
      __triggerChordTimeout(store.getState)
    })

    // Verify: t standalone = noop, so datePrompt should NOT be set
    expect(store.getState().ui.datePrompt).toBeFalsy()

    // Now press 'd' — should resolve to clipboard_cut (not open a dialog)
    board.press("d")

    // No date dialog should appear
    const text = board.screenshot()
    expect(text).not.toContain("Set Due Date")
  })

  test("ts chord cycles task status (not start date dialog)", () => {
    // ts was remapped from set_start_date to cycle_task_status
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"))))

    app.press("j")

    // Task starts as "todo" (item.task creates with task_status)
    const col = app.repo.getChildren("board")[0]!
    const task = app.repo.getChildren(col.id)[0]!
    expect(task.item?.task?.status).toBe("todo")

    app.press("t")
    app.press("s")

    // Should NOT open start date dialog
    expect(app.text).not.toContain("Set Start Date")

    // Should have cycled task status
    const updatedTask = app.repo.getChildren(col.id)[0]!
    expect(updatedTask.item?.task?.status).not.toBe("todo")
  })

  test("tr chord opens recurrence dialog", () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"))))

    app.press("j")
    app.press("t")
    app.press("r")

    expect(app.text).toContain("Set Recurrence")
  })

  test("Escape cancels date dialog", () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"))))

    app.press("j")
    app.press("t")
    app.press("d")

    // Verify dialog open
    expect(app.text).toContain("Set Due Date")

    // Cancel
    app.press("Escape")

    // Dialog should be closed
    expect(app.text).not.toContain("Set Due Date")
  })

  test("Enter in date dialog does NOT create new nodes", () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"))))

    app.press("j")

    // Count nodes before
    const nodesBefore = app.repo.getChildren(app.repo.getChildren("board")[0]!.id).length

    // Open date dialog
    app.press("t")
    app.press("d")
    expect(app.text).toContain("Set Due Date")

    // Press Enter — should confirm dialog, NOT create a new node
    app.press("Enter")

    // Dialog should be closed
    expect(app.text).not.toContain("Set Due Date")

    // Node count should be unchanged (no new nodes created)
    const nodesAfter = app.repo.getChildren(app.repo.getChildren("board")[0]!.id).length
    expect(nodesAfter).toBe(nodesBefore)
  })

  test("typing in date dialog reaches the text input", () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"))))

    app.press("j")
    app.press("t")
    app.press("d")

    // Type a date
    app.press("f")
    app.press("r")
    app.press("i")

    // The input should show "fri" and the preview should resolve it
    expect(app.text).toContain("fri")
  })

  test("navigation keys are filtered when date dialog is open", () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"), item.task("Write report"))))

    app.press("j") // Navigate to card level

    // Open date dialog
    app.press("t")
    app.press("d")
    expect(app.text).toContain("Set Due Date")

    // Press 'j' (normally moves cursor down) — should be filtered, not move cursor
    app.press("j")

    // Dialog should still be open (j was consumed as text input or filtered)
    expect(app.text).toContain("Set Due Date")
    // 'j' should appear in the dialog input, not cause navigation
    expect(app.text).toContain("j")
  })

  test("Enter confirms date and updates node field", () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"))))

    app.press("j")
    app.press("t")
    app.press("d")

    // Type "tomorrow"
    for (const ch of "tomorrow") app.press(ch)

    // Press Enter to confirm
    app.press("Enter")

    // Dialog should be closed
    expect(app.text).not.toContain("Set Due Date")

    // Node should have a due_at field set
    const col = app.repo.getChildren("board")[0]!
    const task = app.repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeTruthy()
  })

  test("Enter in date dialog does NOT start inline editing (km-qaco9)", () => {
    // Regression: Enter while date dialog is open must NOT trigger
    // enter_inline_edit on the background card.
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"), item.task("Write report"))))

    app.press("j") // Navigate to card level

    // Record the cursor position node before opening dialog
    const screenBefore = app.text
    void screenBefore

    // Open date dialog
    app.press("t")
    app.press("d")
    expect(app.text).toContain("Set Due Date")

    // Press Enter with empty input — should close dialog, NOT enter inline edit
    app.press("Enter")

    // Dialog should be closed
    const screenAfter = app.text
    expect(screenAfter).not.toContain("Set Due Date")

    // Should NOT be in inline edit mode — no cursor blinking indicator or edit border.
    // The background card content should be unchanged.
    expect(screenAfter).toContain("Buy groceries")
    expect(screenAfter).toContain("Write report")
    // No edit indicator ("> " prompt from inline edit) should appear
    expect(screenAfter).not.toMatch(/> Buy groceries/)
  })

  test("Escape in date dialog does NOT affect background board state (km-qaco9)", () => {
    // Regression: Escape while date dialog is open must NOT trigger
    // close_or_quit or text.exit_edit on the background.
    using app = createTestApp(item("board", item("col1", item.task("Task A")), item("col2", item.task("Task B"))))

    // Navigate into column 2
    app.press("l")
    app.press("j")

    const screenBefore = app.text
    void screenBefore

    // Open date dialog
    app.press("t")
    app.press("d")
    expect(app.text).toContain("Set Due Date")

    // Press Escape — should close dialog, NOT zoom out or navigate back
    app.press("Escape")

    // Dialog should be closed
    const screenAfter = app.text
    expect(screenAfter).not.toContain("Set Due Date")

    // Board state should be unchanged — both columns still visible,
    // cursor still on same node
    expect(screenAfter).toContain("Task A")
    expect(screenAfter).toContain("Task B")
  })

  test("multiple Enter/Escape cycles don't corrupt state (km-qaco9)", () => {
    // Regression: repeated open/close cycles should not leak state
    using app = createTestApp(item("board", item("col1", item.task("My task"))))

    app.press("j")

    const col = app.repo.getChildren("board")[0]!
    const nodesBefore = app.repo.getChildren(col.id).length

    // Cycle 1: open, Escape
    app.press("t").press("d")
    expect(app.text).toContain("Set Due Date")
    app.press("Escape")
    expect(app.text).not.toContain("Set Due Date")

    // Cycle 2: open, Enter (empty = clear)
    app.press("t").press("d")
    expect(app.text).toContain("Set Due Date")
    app.press("Enter")
    expect(app.text).not.toContain("Set Due Date")

    // Cycle 3: open, type, Enter
    app.press("t").press("d")
    expect(app.text).toContain("Set Due Date")
    for (const ch of "fri") app.press(ch)
    app.press("Enter")
    expect(app.text).not.toContain("Set Due Date")

    // No extra nodes created
    const nodesAfter = app.repo.getChildren(col.id).length
    expect(nodesAfter).toBe(nodesBefore)

    // The task should have a due_at set from the last cycle
    const task = app.repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Priority (sp)
// ---------------------------------------------------------------------------

describe("priority (sp)", () => {
  test("sp sets P0 on card", () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"))))

    app.press("j")

    // Initially no priority in full screenshot
    expect(app.text).not.toMatch(/P[0-4]/)

    // t! → P0 (first in cycle)
    app.press("t")
    app.press("!")

    // Should show P0 somewhere (toast or card)
    expect(app.text).toContain("P0")
  })

  test("sp cycles through priorities", () => {
    // incremental: false — pre-existing silvery toast rendering mismatch at (41,21)
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"))), { incremental: false })

    app.press("j")

    // Cycle: none → P0 → P1 → P2 → P3 → P4 → none
    // Each sp should show the next priority in a toast
    app.press("t").press("!")
    expect(app.text).toContain("Priority: P0")

    app.press("t").press("!")
    expect(app.text).toContain("Priority: P1")

    app.press("t").press("!")
    expect(app.text).toContain("Priority: P2")

    app.press("t").press("!")
    expect(app.text).toContain("Priority: P3")

    app.press("t").press("!")
    expect(app.text).toContain("Priority: P4")

    app.press("t").press("!")
    expect(app.text).toContain("Priority: None")
  })
})

// ---------------------------------------------------------------------------
// Due date queries for @next board
// ---------------------------------------------------------------------------

describe("due date queries for @next board", () => {
  test("due:past -status:done -status:dropped matches non-done overdue tasks", () => {
    withTestRepo(
      (dir) => {
        writeFileSync(
          join(dir, "tasks.md"),
          `# Tasks

- [ ] Overdue todo due:${yesterday()}
- [/] Overdue wip due:${yesterday()}
- [!] Overdue blocked due:${yesterday()}
- [x] Overdue done due:${yesterday()}
- [-] Overdue dropped due:${yesterday()}
`,
        )
      },
      (store) => {
        const db = store.getDatabase()
        const results = queryTasks(db, `due:past -status:done -status:dropped`)
        // Should match todo, wip, blocked — NOT done, dropped
        expect(results.length).toBe(3)
        const contents = results.map((r) => r.content ?? "")
        expect(contents.some((c) => c.includes("todo"))).toBe(true)
        expect(contents.some((c) => c.includes("wip"))).toBe(true)
        expect(contents.some((c) => c.includes("blocked"))).toBe(true)
      },
    )
  })

  test("current template rules miss blocked tasks with due dates", () => {
    // This test demonstrates the gap in the current template:
    // due:past status:todo + due:past status:wip covers todo and wip,
    // but not blocked tasks with past due dates
    withTestRepo(
      (dir) => {
        writeFileSync(
          join(dir, "tasks.md"),
          `# Tasks

- [ ] Overdue todo due:${yesterday()}
- [/] Overdue wip due:${yesterday()}
- [!] Overdue blocked due:${yesterday()}
`,
        )
      },
      (store) => {
        const db = store.getDatabase()

        // Current template rules for due:past
        const todoResults = queryTasks(db, "due:past status:todo")
        const wipResults = queryTasks(db, "due:past status:wip")

        expect(todoResults.length).toBe(1) // only todo
        expect(wipResults.length).toBe(1) // only wip
        // blocked is missed by both rules!

        // Better rule: use negation to catch all non-done/dropped
        const betterResults = queryTasks(db, "due:past -status:done -status:dropped")
        expect(betterResults.length).toBe(3) // todo + wip + blocked
      },
    )
  })

  test("km.add:: rule materializes embeds for dated tasks after evaluateAllRules", () => {
    withTestRepo(
      (dir) => {
        writeFileSync(
          join(dir, "tasks.md"),
          `# Tasks

- [ ] Overdue todo due:${yesterday()}
- [/] Overdue wip due:${yesterday()}
- [!] Overdue blocked due:${yesterday()}
- [x] Overdue done due:${yesterday()}
`,
        )
        writeFileSync(
          join(dir, "@next.md"),
          `# Next Actions

## Inbox km.add:: due:past -status:done -status:dropped km.add:: due:today -status:done -status:dropped km.add:: due:week -status:done -status:dropped km.add:: start:past -status:done -status:dropped

## Next
`,
        )
      },
      (store) => {
        const db = store.getDatabase()
        const ctx = createRuleContext()
        for (const _ of evaluateAllRules(db, ctx)) {
          /* exhaust */
        }

        const inbox = findInboxSection(db)
        expect(inbox).toBeDefined()

        // Should have embeds for the 3 non-done/dropped overdue tasks
        const children = getChildren(db, inbox!.id)
        const embeds = children.filter((c) => c.symlink_to != null)
        expect(embeds.length).toBe(3)
      },
    )
  })

  test("interactive td: onNodeChanged creates embeds after setting due date", () => {
    // Reproduces the interactive flow: user sets due date on an item,
    // onNodeChanged creates embeds in DB, touch() clears children cache.
    withTestRepo(
      (dir) => {
        writeFileSync(
          join(dir, "tasks.md"),
          `# Tasks

- [ ] My task
`,
        )
        writeFileSync(
          join(dir, "@next.md"),
          `# Next Actions

## Inbox km.add:: due:past -status:done -status:dropped km.add:: due:today -status:done -status:dropped

## Next
`,
        )
      },
      (store) => {
        const db = store.getDatabase()

        // First, run evaluateAllRules so rules are materialized (simulates initial load)
        const initCtx = createRuleContext()
        for (const _ of evaluateAllRules(db, initCtx)) {
          /* exhaust */
        }

        const inbox = findInboxSection(db)
        expect(inbox).toBeDefined()

        // No embeds yet (task has no due date)
        const childrenBefore = getChildren(db, inbox!.id)
        const embedsBefore = childrenBefore.filter((c) => c.symlink_to != null)
        expect(embedsBefore.length).toBe(0)

        // Find the task node
        const taskNode = db
          .query("SELECT * FROM nodes WHERE content LIKE '%My task%' AND task_status IS NOT NULL")
          .get() as Record<string, unknown> | null
        expect(taskNode).not.toBeNull()

        // Simulate interactive "td" — set due_at to yesterday (matches due:past rule)
        const yest = yesterday()
        db.run("UPDATE nodes SET due_at = ?, updated_at = ? WHERE id = ?", [yest, Date.now(), taskNode!.id] as any)

        // Call onNodeChanged (same as handleDatePromptConfirm does)
        const ruleCtx = createRuleContext()
        onNodeChanged(db, taskNode!.id as string, ruleCtx)

        // Verify embeds were created in DB
        const childrenAfter = getChildren(db, inbox!.id)
        const embedsAfter = childrenAfter.filter((c) => c.symlink_to != null)
        expect(embedsAfter.length).toBe(1)
        expect(embedsAfter[0]!.symlink_to).toBe(taskNode!.id)
      },
    )
  })

  test("without evaluateAllRules, inbox has no dated items (demonstrates bug)", () => {
    // This test demonstrates the root cause: MemoryStore (like discoverOnly mode)
    // does not call evaluateAllRules. Without it, the Inbox's km.add:: rules never
    // materialize embed nodes, so dated tasks don't appear.
    withTestRepo(
      (dir) => {
        writeFileSync(
          join(dir, "tasks.md"),
          `# Tasks

- [ ] Overdue todo due:${yesterday()}
- [/] Overdue wip due:${yesterday()}
- [!] Overdue blocked due:${yesterday()}
- [x] Overdue done due:${yesterday()}
`,
        )
        writeFileSync(
          join(dir, "@next.md"),
          `# Next Actions

## Inbox km.add:: due:past -status:done -status:dropped km.add:: due:today -status:done -status:dropped km.add:: due:week -status:done -status:dropped km.add:: start:past -status:done -status:dropped

## Next
`,
        )
      },
      (store) => {
        const db = store.getDatabase()

        // Before evaluateAllRules: inbox should have NO embeds
        const inbox = findInboxSection(db)
        expect(inbox).toBeDefined()

        const childrenBefore = getChildren(db, inbox!.id)
        const embedsBefore = childrenBefore.filter((c) => c.symlink_to != null)
        expect(embedsBefore.length).toBe(0)

        // After evaluateAllRules: inbox should have 3 embeds
        const ctx = createRuleContext()
        for (const _ of evaluateAllRules(db, ctx)) {
          /* exhaust */
        }

        const childrenAfter = getChildren(db, inbox!.id)
        const embedsAfter = childrenAfter.filter((c) => c.symlink_to != null)
        expect(embedsAfter.length).toBe(3)
      },
    )
  })
})

// =============================================================================
// Merged from date.slow.spec.ts — Date Badge Display Journey Tests
// =============================================================================

describe("Date Badge Display Journeys", () => {
  // Freeze time so hardcoded dates like "2026-03-15" always render as absolute
  // "Mar 15" rather than relative names like "Sunday" when tests run near that date.
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"))
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  test("card with overdue date shows badge, future date shows badge, no-date card has none", async () => {
    const nodes = item(
      "board",
      item("col1", item.task("Overdue task"), item.task("Future task"), item.task("No date task")),
    )
    const overdueNode = nodes.find((n) => n.content === "Overdue task")!
    overdueNode.due_at = daysFromNow(-5)

    const futureNode = nodes.find((n) => n.content === "Future task")!
    futureNode.due_at = daysFromNow(30)

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Step 1: All task names visible
    const screenshot = app.text
    expect(screenshot).toContain("Overdue task")
    expect(screenshot).toContain("Future task")
    expect(screenshot).toContain("No date task")

    // Step 2: Overdue date badge text should be visible on overdue card's row
    const lines = screenshot.split("\n")
    const overdueLine = lines.find((l) => l.includes("Overdue task"))
    expect(overdueLine).toBeDefined()
    expect(overdueLine!.length).toBeGreaterThan("Overdue task".length + 10)

    // Step 3: Future date badge should also be present
    const futureLine = lines.find((l) => l.includes("Future task"))
    expect(futureLine).toBeDefined()
    expect(futureLine!.length).toBeGreaterThan("Future task".length + 10)

    // Step 4: No-date card should NOT have a date badge
    expect(screenshot).toContain("No date task")
  })

  test("today's due date shows 'Today' badge text", () => {
    const nodes = item("board", item("col1", item.task("Due today")))
    const taskNode = nodes.find((n) => n.content === "Due today")!
    taskNode.due_at = today()

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Step 1: Task visible
    expect(app.text).toContain("Due today")

    // Step 2: Should show "Today" in the badge
    expect(app.text).toContain("Today")

    // Step 3: "Today" badge should appear on the same line as the task
    const lines = app.text.split("\n")
    const todayLine = lines.find((l) => l.includes("Due today") && l.includes("Today"))
    expect(todayLine).toBeDefined()
  })

  test("set due date via td chord, verify badge appears and persists", async () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy groceries"), item.task("Do laundry"))))

    // Step 1: No date badge initially
    expect(app.text).not.toContain("Today")

    // Step 2: Open date prompt with td
    app.command("set_due_date")
    expect(app.text).toContain("Set Due Date")

    // Step 3: Type "tomorrow" and confirm
    for (const ch of "tomorrow") app.press(ch)
    app.press("Enter")

    // Step 4: Dialog should close
    expect(app.text).not.toContain("Set Due Date")

    // Step 5: Node should have due_at persisted in repo
    const col = app.repo.getChildren("board")[0]!
    const task = app.repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeTruthy()
  })

  test("date and priority badges coexist on the same card", () => {
    const nodes = item("board", item("col1", item.task("Urgent task"), item.task("Normal task")))
    const urgentNode = nodes.find((n) => n.content === "Urgent task")!
    urgentNode.due_at = daysFromNow(3)
    urgentNode.priority = "P1"

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Step 1: Both badges should be visible on the same card
    expect(app.text).toContain("P1")
    expect(app.text).toContain("Urgent task")

    // Step 2: Navigate to next card to verify cursor is on it
    app.command("cursor_down")
    const cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("Normal task")
    // Normal task should not have a priority set
    const normalNode = nodes.find((n) => n.content === "Normal task")!
    expect(normalNode.priority).toBeUndefined()
  })

  test("cancel date dialog with Escape, no date is set", async () => {
    using app = createTestApp(item("board", item("col1", item.task("My task"))))

    // Step 1: Open date dialog
    app.command("set_due_date")
    expect(app.text).toContain("Set Due Date")

    // Step 2: Type some text
    app.press("f")
    app.press("r")
    app.press("i")
    expect(app.text).toContain("fri")

    // Step 3: Cancel with Escape
    app.press("Escape")
    expect(app.text).not.toContain("Set Due Date")

    // Step 4: No due_at should be set
    const col = app.repo.getChildren("board")[0]!
    const task = app.repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeFalsy()
  })

  test("ts cycles task status, tr opens recurrence dialog", async () => {
    // ts was remapped from set_start_date to cycle_task_status
    using app = createTestApp(item("board", item("col1", item.task("Recurring task"))))

    // Step 1: ts cycles task status (no dialog)
    app.command("cycle_task_status_t")
    expect(app.text).not.toContain("Set Start Date")

    // Step 2: Verify status was cycled
    const col = app.repo.getChildren("board")[0]!
    const task = app.repo.getChildren(col.id)[0]!
    expect(task.item?.task?.status).not.toBe("todo")

    // Step 3: Open recurrence dialog
    app.command("set_recurring")
    expect(app.text).toContain("Set Recurrence")

    // Step 4: Cancel
    app.press("Escape")
    expect(app.text).not.toContain("Set Recurrence")

    // Step 5: Card should still be visible and cursor valid
    const cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("Recurring task")
  })

  test("date badge updates after programmatic repo change", () => {
    const nodes = item("board", item("col1", item.task("Task A"), item.task("Task B")))
    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Step 1: No dates initially
    expect(app.text).not.toContain("Mar 15")

    // Step 2: Set due_at on Task A via repo
    const col = app.repo.getChildren("board")[0]!
    const taskA = app.repo.getChildren(col.id)[0]!
    act(() => {
      app.repo.updateNode(taskA.id, { due_at: "2026-03-15" })
    })
    app.command("cursor_down") // flush render

    // Step 3: Date badge should appear
    expect(app.text).toContain("Mar 15")

    // Step 4: Navigate and come back — badge persists
    app.command("cursor_up")
    expect(app.text).toContain("Mar 15")
  })
})
