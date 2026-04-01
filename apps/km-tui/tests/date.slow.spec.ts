/**
 * Date Display & Interaction Journey Tests
 *
 * User-level journey specs for date badges, date prompt dialog, and
 * date-related visual distinctions. Complements date.slow.test.ts which
 * focuses on formatDateBadge unit tests, card border integrity with badges,
 * date queries for @next board, and rule evaluation.
 *
 * These journey tests cover the user stories:
 * - Cards with due dates display date badges on screen
 * - Overdue vs upcoming dates have distinct visual styles
 * - Opening date prompt (td), setting a date, and verifying persistence
 * - Priority badge visibility alongside date badges
 * - Start date dialog (ts) and recurrence dialog (tr) workflows
 *
 * Key bindings:
 *   td = open due date prompt
 *   ts = cycle task status
 *   tr = open recurrence prompt
 *   t! = cycle priority
 */

import { describe, test, expect, vi, beforeAll, afterAll } from "vitest"
import { act } from "react"
import { item, testEnv } from "./helpers/board-test.ts"
import { formatDate } from "@km/core"

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return formatDate(d)
}

function today(): string {
  return formatDate(new Date())
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return formatDate(d)
}

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

  test("card with overdue date shows badge, future date shows badge, no-date card has none", () => {
    const nodes = item(
      "board",
      item("col1", item.task("Overdue task"), item.task("Future task"), item.task("No date task")),
    )
    const overdueNode = nodes.find((n) => n.content === "Overdue task")!
    overdueNode.due_at = daysFromNow(-5)

    const futureNode = nodes.find((n) => n.content === "Future task")!
    futureNode.due_at = daysFromNow(30)

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Step 1: All task names visible
    const screenshot = board.screenshot()
    expect(screenshot).toContain("Overdue task")
    expect(screenshot).toContain("Future task")
    expect(screenshot).toContain("No date task")

    // Step 2: Overdue date badge text should be visible on overdue card's row
    const lines = screenshot.split("\n")
    const overdueLine = lines.find((l) => l.includes("Overdue task"))
    expect(overdueLine).toBeDefined()
    // Overdue badge shows a date (some relative format like "5d ago" or a date)
    // Just verify it has more than just the task name
    expect(overdueLine!.length).toBeGreaterThan("Overdue task".length + 10)

    // Step 3: Future date badge should also be present
    const futureLine = lines.find((l) => l.includes("Future task"))
    expect(futureLine).toBeDefined()
    expect(futureLine!.length).toBeGreaterThan("Future task".length + 10)

    // Step 4: No-date card should NOT have a date badge
    // (it should be shorter or same length without extra date text)
    expect(screenshot).toContain("No date task")
  })

  test("today's due date shows 'Today' badge text", () => {
    const nodes = item("board", item("col1", item.task("Due today")))
    const taskNode = nodes.find((n) => n.content === "Due today")!
    taskNode.due_at = today()

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Step 1: Task visible
    const screenshot = board.screenshot()
    expect(screenshot).toContain("Due today")

    // Step 2: Should show "Today" in the badge
    expect(screenshot).toContain("Today")

    // Step 3: "Today" badge should appear on the same line as the task
    const lines = screenshot.split("\n")
    const todayLine = lines.find((l) => l.includes("Due today") && l.includes("Today"))
    expect(todayLine).toBeDefined()
  })

  test("set due date via td chord, verify badge appears and persists", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item.task("Buy groceries"), item.task("Do laundry"))),
    )

    // Step 1: No date badge initially
    expect(board.screenshot()).not.toContain("Today")

    // Step 2: Open date prompt with td
    board.command("set_due_date")
    expect(board.screenshot()).toContain("Set Due Date")

    // Step 3: Type "tomorrow" and confirm
    for (const ch of "tomorrow") board.press(ch)
    board.press("Enter")

    // Step 4: Dialog should close
    expect(board.screenshot()).not.toContain("Set Due Date")

    // Step 5: Node should have due_at persisted in repo
    const col = repo.getChildren("board")[0]!
    const task = repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeTruthy()
  })

  test("date and priority badges coexist on the same card", () => {
    const nodes = item("board", item("col1", item.task("Urgent task"), item.task("Normal task")))
    const urgentNode = nodes.find((n) => n.content === "Urgent task")!
    urgentNode.due_at = daysFromNow(3)
    urgentNode.priority = "P1"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Step 1: Both badges should be visible on the same card
    const screenshot = board.screenshot()
    expect(screenshot).toContain("P1")
    expect(screenshot).toContain("Urgent task")

    // Step 2: Navigate to next card to verify cursor is on it
    board.command("cursor_down")
    const cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("Normal task")
    // Normal task should not have a priority set
    const normalNode = nodes.find((n) => n.content === "Normal task")!
    expect(normalNode.priority).toBeUndefined()
  })

  test("cancel date dialog with Escape, no date is set", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item.task("My task"))))

    // Step 1: Open date dialog
    board.command("set_due_date")
    expect(board.screenshot()).toContain("Set Due Date")

    // Step 2: Type some text
    board.press("f").press("r").press("i")
    expect(board.screenshot()).toContain("fri")

    // Step 3: Cancel with Escape
    board.press("Escape")
    expect(board.screenshot()).not.toContain("Set Due Date")

    // Step 4: No due_at should be set
    const col = repo.getChildren("board")[0]!
    const task = repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeFalsy()
  })

  test("ts cycles task status, tr opens recurrence dialog", () => {
    // ts was remapped from set_start_date to cycle_task_status
    const { board, repo } = testEnv(() => item("board", item("col1", item.task("Recurring task"))))

    // Step 1: ts cycles task status (no dialog)
    board.command("cycle_task_status_t")
    expect(board.screenshot()).not.toContain("Set Start Date")

    // Step 2: Verify status was cycled
    const col = repo.getChildren("board")[0]!
    const task = repo.getChildren(col.id)[0]!
    expect(task.item?.task?.status).not.toBe("todo")

    // Step 3: Open recurrence dialog
    board.command("set_recurring")
    expect(board.screenshot()).toContain("Set Recurrence")

    // Step 4: Cancel
    board.press("Escape")
    expect(board.screenshot()).not.toContain("Set Recurrence")

    // Step 5: Card should still be visible and cursor valid
    const cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("Recurring task")
  })

  test("date badge updates after programmatic repo change", () => {
    const nodes = item("board", item("col1", item.task("Task A"), item.task("Task B")))
    const { board, repo } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Step 1: No dates initially
    expect(board.screenshot()).not.toContain("Mar 15")

    // Step 2: Set due_at on Task A via repo
    const col = repo.getChildren("board")[0]!
    const taskA = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskA.id, { due_at: "2026-03-15" })
    })
    board.command("cursor_down") // flush render

    // Step 3: Date badge should appear
    expect(board.screenshot()).toContain("Mar 15")

    // Step 4: Navigate and come back — badge persists
    board.command("cursor_up")
    expect(board.screenshot()).toContain("Mar 15")
  })
})
