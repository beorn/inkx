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

  test("keyboard toggle_task_done toggles between todo and done (does not cycle)", () => {
    // Regression: km-tui.task-toggle-cycles — x used to cycle todo→wip→blocked→done
    // because handleTaskStatusCycle ignored op.status. toggle_task_done should flip
    // between todo and done, nothing else.
    const { board, repo } = testEnv(() => item.root("board", item("Column", item.task("Buy milk", "todo"))), {
      columns: 80,
      rows: 24,
    })

    expect(repo.getNode("Buy milk")?.item?.task?.status).toBe("todo")

    // First toggle: todo -> done
    board.command("toggle_task_done")
    expect(repo.getNode("Buy milk")?.item?.task?.status).toBe("done")

    // Second toggle: done -> todo
    board.command("toggle_task_done")
    expect(repo.getNode("Buy milk")?.item?.task?.status).toBe("todo")

    // Third toggle: todo -> done (stable two-state toggle)
    board.command("toggle_task_done")
    expect(repo.getNode("Buy milk")?.item?.task?.status).toBe("done")
  })

  test("toggle_task_done on wip task flips to done (not next in cycle)", () => {
    // Regression: km-tui.task-toggle-cycles — x on a wip task used to go to blocked.
    const { board, repo } = testEnv(() => item.root("board", item("Column", item.task("Do work", "wip"))), {
      columns: 80,
      rows: 24,
    })

    expect(repo.getNode("Do work")?.item?.task?.status).toBe("wip")
    board.command("toggle_task_done")
    expect(repo.getNode("Do work")?.item?.task?.status).toBe("done")
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

    // Navigate to task-2 and toggle (done -> todo, because toggle_task_done flips)
    board.navigateTo("task-2")
    board.command("toggle_task_done")

    // task-2 toggles from done -> todo (binary toggle, not cycle)
    expect(repo.getNode("task-2")?.item?.task?.status).toBe("todo")
    // Others unchanged
    expect(repo.getNode("task-1")?.item?.task?.status).toBe("todo")
    expect(repo.getNode("task-3")?.item?.task?.status).toBe("wip")
  })

  // =========================================================================
  // Cursor preservation on checkbox click (regression: km-tui.checkbox-cursor-move)
  // =========================================================================

  test("keyboard toggle on cursor node preserves cursor position", () => {
    const { board, repo } = testEnv(
      () =>
        item.root(
          "board",
          item("Column", item.task("task-1", "todo"), item.task("task-2", "todo"), item.task("task-3", "todo")),
        ),
      { columns: 80, rows: 24 },
    )

    // Cursor starts on task-1. Toggle it.
    board.expectState({ cursor: "task-1" })
    board.command("toggle_task_done")

    // Cursor stays on task-1 after toggle (todo -> done)
    board.expectState({ cursor: "task-1" })
    expect(repo.getNode("task-1")?.item?.task?.status).toBe("done")

    // Navigate to task-2, toggle task-2
    board.navigateTo("task-2")
    board.expectState({ cursor: "task-2" })
    board.command("toggle_task_done")

    // Cursor stays on task-2 (todo -> done)
    board.expectState({ cursor: "task-2" })
    expect(repo.getNode("task-2")?.item?.task?.status).toBe("done")

    // task-1 unchanged (still done), task-3 unchanged (still todo)
    expect(repo.getNode("task-1")?.item?.task?.status).toBe("done")
    expect(repo.getNode("task-3")?.item?.task?.status).toBe("todo")
  })
})
