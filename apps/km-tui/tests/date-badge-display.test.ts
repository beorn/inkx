import { describe, it, expect } from "vitest"
import { act } from "react"
import { item, testEnv } from "./helpers/board-test.ts"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { formatDateBadge } from "../src/views/tree-node-helpers.ts"
import type { KNode } from "@km/core"

describe("date badge display", () => {
  it("formatDateBadge returns badge for node with due_date", () => {
    // Use a date 30+ days out so it renders as "Mon DD" not relative
    const badge = formatDateBadge({ due_date: "2026-03-15" } as KNode)
    expect(badge).not.toBe("")
    expect(badge).toContain("Mar 15")
  })

  it("formatDateBadge returns empty for node without dates", () => {
    const badge = formatDateBadge({} as KNode)
    expect(badge).toBe("")
  })

  it("date badge appears in card after repo.updateNode", async () => {
    const nodes = item("board",
      item("col1",
        item.task("Test task"),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Initially no date
    let screen = driver.getState().screen
    let clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    expect(clean).not.toContain("Mar 15")

    // Set due_date on the task node
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_date: "2026-03-15" })
    })

    // Trigger render flush (inkx custom renderer needs a keypress to flush
    // useSyncExternalStore updates — j/k is a no-op cursor move on single card)
    await driver.press("j")

    // Date badge should appear right-aligned in the card
    screen = driver.getState().screen
    clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    expect(clean).toContain("Mar 15")
  })

  it("date badge appears in detail pane after repo.updateNode", async () => {
    const nodes = item("board",
      item("col1",
        item.task("Test task"),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Set due_date on the task node
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_date: "2026-03-15" })
    })

    // Open detail pane (Space opens detail for current node)
    await driver.press(" ")

    const screen = driver.getState().screen
    const clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    // Detail pane should show the due date (rendered as relative date)
    expect(clean).toContain("Due: Mar 15")
  })

  it("date badge visible in cards view with initial due_date (testEnv)", () => {
    // Create nodes, then set due_date before rendering
    const nodes = item("board",
      item("col1",
        item.task("Task with date"),
      ),
    )
    // Manually set due_date on the task node before creating repo
    const taskNode = nodes.find((n) => n.content === "Task with date")!
    taskNode.due_date = "2026-03-15"
    taskNode.priority = 1

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })
    const screen = board.screenshot()
    // Check the date badge appears
    expect(screen).toContain("Mar 15")
    expect(screen).toContain("P1")
  })

  it("date badge visible in cards view with multiple columns (testEnv)", () => {
    const nodes = item("board",
      item("col1",
        item.task("Task A"),
        item.task("Task B"),
      ),
      item("col2",
        item.task("Task C"),
      ),
    )
    // Set due_date on Task A
    const taskA = nodes.find((n) => n.content === "Task A")!
    taskA.due_date = "2026-03-15"
    taskA.priority = 2
    // Set priority on Task C
    const taskC = nodes.find((n) => n.content === "Task C")!
    taskC.priority = 3

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })
    const screen = board.screenshot()
    expect(screen).toContain("Mar 15")
    expect(screen).toContain("P2")
    expect(screen).toContain("P3")
  })

  it("date badge visible with many columns (narrow width per column)", () => {
    const nodes = item("board",
      item("col1", item.task("Task A")),
      item("col2", item.task("Task B")),
      item("col3", item.task("Task C")),
      item("col4", item.task("Task D")),
    )
    // Set due_date on Task A
    const taskA = nodes.find((n) => n.content === "Task A")!
    taskA.due_date = "2026-03-15"

    // 80 columns / 4 columns = 20 chars per column -- very narrow
    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })
    const screen = board.screenshot()
    // With only ~20 chars per column, badge may be truncated but should still appear
    expect(screen).toContain("Mar 15")
  })

  it("date badge visible in columns view (testEnv)", () => {
    const nodes = item("board",
      item("col1",
        item.task("Task with date"),
      ),
    )
    const taskNode = nodes.find((n) => n.content === "Task with date")!
    taskNode.due_date = "2026-03-15"
    taskNode.priority = 2

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24, viewMode: "columns" })
    const screen = board.screenshot()
    expect(screen).toContain("Mar 15")
    expect(screen).toContain("P2")
  })

  it("date badge appears after 'td' key simulation (full workflow)", async () => {
    // Simulate the full workflow: user presses 'td', types a date, presses Enter
    const nodes = item("board",
      item("col1",
        item.task("My task"),
      ),
    )
    const { board, repo } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Before: no date badge
    let screen = board.screenshot()
    expect(screen).not.toContain("Mar 15")

    // User presses 'td' to open the date prompt
    board.press("t").press("d")

    // Simulate what DatePromptDialog.onConfirm does:
    // (In the test, we can't actually type in the dialog, so we use repo.updateNode)
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_date: "2026-03-15" })
    })

    // Press Escape to close the date prompt
    board.press("escape")

    // The date badge should now be visible in the card
    screen = board.screenshot()
    expect(screen).toContain("Mar 15")
  })

  it("structural sharing preserves date badge after unrelated mutation", () => {
    // Regression: applyStructuralSharing must detect date/priority changes
    const nodes = item("board",
      item("col1",
        item.task("Task A"),
        item.task("Task B"),
      ),
    )
    const { board, repo } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Set due_date on Task A
    const col = repo.getChildren("board")[0]!
    const taskA = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskA.id, { due_date: "2026-03-15", priority: 1 })
    })
    board.press("j") // flush
    let screen = board.screenshot()
    expect(screen).toContain("Mar 15")
    expect(screen).toContain("P1")

    // Now mutate Task B (unrelated) — Task A's badge should persist
    const taskB = repo.getChildren(col.id)[1]!
    act(() => {
      repo.updateNode(taskB.id, { content: "Task B updated" })
    })
    board.press("j") // flush
    screen = board.screenshot()
    expect(screen).toContain("Mar 15")
    expect(screen).toContain("P1")
    expect(screen).toContain("Task B updated")
  })

  it("priority badge visible in cards view (testEnv)", () => {
    const nodes = item("board",
      item("col1",
        item.task("Priority task"),
      ),
    )
    const taskNode = nodes.find((n) => n.content === "Priority task")!
    taskNode.priority = 2

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })
    const screen = board.screenshot()
    expect(screen).toContain("P2")
  })

  it("date badge visible after setting via 'td' key sequence", () => {
    const nodes = item("board",
      item("col1",
        item.task("Todo task"),
      ),
    )
    const { board, repo } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Simulate what 'td' does: update the node's due_date
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_date: "2026-03-15" })
    })

    // Flush by pressing a no-op key
    board.press("j")

    const screen = board.screenshot()
    expect(screen).toContain("Mar 15")
  })
})
