/**
 * Verification: km-tui.date-range-color
 *
 * Bug: unselected date display colors may be inconsistent — scheduled dates
 * may show as white while due dates show as green.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { formatDateBadge } from "../apps/km-tui/src/views/tree-node-helpers.ts"
import type { KNode } from "@km/core"

describe("date range color (km-tui.date-range-color)", () => {
  test("unselected card with date range: both dates visible", () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`

    const nodes = item("board",
      item("col1",
        item.task("Other"),
        item.task("Ranged Task"),
      ),
    )
    const rangedTask = nodes.find((n) => n.content === "Ranged Task")!
    rangedTask.scheduled_date = todayStr
    rangedTask.due_date = tomorrowStr

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Move cursor to "Other" so "Ranged Task" is not selected
    board.expect("#Other[data-cursor]").toExist()

    // Find the ranged task's row
    const nodeBox = board.screen.nodeBox("Ranged Task")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    // Badge should show date range with arrow
    expect(row).toMatch(/Today|Tomorrow|→/)
  })

  test("formatDateBadge with scheduled + due date includes arrow separator", () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`

    const badge = formatDateBadge({
      scheduled_date: todayStr,
      due_date: tomorrowStr,
    } as KNode)

    // Badge should contain arrow separator between dates
    expect(badge).toContain("→")
    expect(badge).toMatch(/Today/)
    expect(badge).toMatch(/Tomorrow/)
  })

  test("due-only date shows correct format", () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

    const badge = formatDateBadge({
      due_date: todayStr,
    } as KNode)

    // Due-only "Today" should have green ANSI
    const GREEN = "\x1b[32m"
    expect(badge).toContain(`${GREEN}Today`)
  })

  test("overdue date shows red", () => {
    // Use a date far enough in the past (>1 day) to ensure it shows red
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 5)
    const pastStr = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, "0")}-${String(pastDate.getDate()).padStart(2, "0")}`

    const badge = formatDateBadge({
      due_date: pastStr,
    } as KNode)

    // Overdue should have red ANSI
    const RED = "\x1b[31m"
    expect(badge).toContain(RED)
  })
})
