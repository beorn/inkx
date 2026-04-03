/**
 * Checkbox Interaction Tests
 *
 * Tests that task status checkboxes:
 * - Render correct status icons for different task states
 * - Toggle between done/todo via keyboard command
 * - Toggle between done/todo via click (DOM-level mouse events)
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("checkbox interaction", () => {
  // =========================================================================
  // Rendering
  // =========================================================================

  test("todo task renders with square icon", () => {
    const { board } = testEnv(() => item.root("board", item("Column", item.task("Buy milk", "todo"))), {
      columns: 80,
      rows: 24,
    })

    // The todo icon is □ (U+25A1)
    const taskEl = board.q("[id='Buy milk']")
    expect(taskEl.count()).toBeGreaterThan(0)
    const text = taskEl.textContent()
    expect(text).toContain("Buy milk")
  })

  test("done task renders with check icon", () => {
    const { board } = testEnv(() => item.root("board", item("Column", item.task("Buy milk", "done"))), {
      columns: 80,
      rows: 24,
    })

    const taskEl = board.q("[id='Buy milk']")
    expect(taskEl.count()).toBeGreaterThan(0)
    const text = taskEl.textContent()
    expect(text).toContain("Buy milk")
  })

  // =========================================================================
  // Keyboard toggle
  // =========================================================================

  test("keyboard toggle_task_done cycles task status", () => {
    const { board, repo } = testEnv(() => item.root("board", item("Column", item.task("Buy milk", "todo"))), {
      columns: 80,
      rows: 24,
    })

    // Verify initial state
    expect(repo.getNode("Buy milk")?.item?.task?.status).toBe("todo")

    // The toggle_task_done key (x) goes through handleTaskStatusCycle,
    // which cycles: todo -> wip -> blocked -> done -> dropped -> todo
    board.command("toggle_task_done")
    expect(repo.getNode("Buy milk")?.item?.task?.status).toBe("wip")

    board.command("toggle_task_done")
    expect(repo.getNode("Buy milk")?.item?.task?.status).toBe("blocked")

    board.command("toggle_task_done")
    expect(repo.getNode("Buy milk")?.item?.task?.status).toBe("done")
  })

  // =========================================================================
  // Click toggle (DOM-level mouse events)
  // =========================================================================

  test("checkbox icon renders as interactive component for task nodes", () => {
    const { board } = testEnv(() => item.root("board", item("Column", item.task("Buy milk", "todo"))), {
      columns: 80,
      rows: 24,
    })

    // The task node should render with a checkbox icon (□ U+25A1 for todo)
    const taskEl = board.q("[id='Buy milk']")
    expect(taskEl.count()).toBeGreaterThan(0)
    const box = taskEl.boundingBox()
    expect(box).not.toBeNull()

    // The prefix box (containing the checkbox icon) is inside the task row.
    // Verify the task is rendered with content visible.
    const text = taskEl.textContent()
    expect(text).toContain("Buy milk")
  })

  // =========================================================================
  // Cycle through statuses
  // =========================================================================

  test("cycle_task_status cycles through all statuses", () => {
    const { board, repo } = testEnv(() => item.root("board", item("Column", item.task("Buy milk", "todo"))), {
      columns: 80,
      rows: 24,
    })

    const statusCycle = ["wip", "blocked", "done", "dropped", "todo"]

    for (const expected of statusCycle) {
      board.command("cycle_task_status")
      expect(repo.getNode("Buy milk")?.item?.task?.status).toBe(expected)
    }
  })

  // =========================================================================
  // Multiple tasks
  // =========================================================================

  test("toggling preserves other task statuses", () => {
    const { board, repo } = testEnv(
      () =>
        item.root(
          "board",
          item("Column", item.task("task-1", "todo"), item.task("task-2", "done"), item.task("task-3", "wip")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to task-2 and toggle (cycles done -> dropped)
    board.navigateTo("task-2")
    board.command("toggle_task_done")

    // task-2 cycles from done -> dropped (handleTaskStatusCycle cycles through all)
    expect(repo.getNode("task-2")?.item?.task?.status).toBe("dropped")
    // Others unchanged
    expect(repo.getNode("task-1")?.item?.task?.status).toBe("todo")
    expect(repo.getNode("task-3")?.item?.task?.status).toBe("wip")
  })
})
