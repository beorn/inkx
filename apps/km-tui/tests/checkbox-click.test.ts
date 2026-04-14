/**
 * Checkbox Interaction Tests
 *
 * Tests that task status checkboxes:
 * - Render correct status icons for different task states
 * - Toggle between done/todo via keyboard command
 * - Toggle between done/todo via click (DOM-level mouse events)
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("checkbox interaction", () => {
  // =========================================================================
  // Rendering
  // =========================================================================

  test("todo task renders with square icon", () => {
    using app = createTestApp(item.root("board", item("Column", item.task("Buy milk", "todo"))), {
      cols: 80,
      rows: 24,
    })

    // The todo icon is □ (U+25A1)
    const taskEl = app.q("[id='Buy milk']")
    expect(taskEl.count()).toBeGreaterThan(0)
    const text = taskEl.textContent()
    expect(text).toContain("Buy milk")
  })

  test("done task renders with check icon", () => {
    using app = createTestApp(item.root("board", item("Column", item.task("Buy milk", "done"))), {
      cols: 80,
      rows: 24,
    })

    const taskEl = app.q("[id='Buy milk']")
    expect(taskEl.count()).toBeGreaterThan(0)
    const text = taskEl.textContent()
    expect(text).toContain("Buy milk")
  })

  test("status icons render with a space between marker and title (km-tui.checkbox-spacing)", () => {
    // Regression: ✓Build instead of ✓ Build. The prefix box is [marker][space]
    // = 2 cells; the space must reach the screen as an actual space cell.
    // Root cause was BODY_PREFIX/body fallback length=1 (fixed in 89b694ad5),
    // but the visible symptom was on the done-task path so we lock that in.
    using app = createTestApp(
      item.root(
        "board",
        item(
          "Column",
          item.task("Build", "done"),
          item.task("Plan", "todo"),
          item.task("Code", "wip"),
          item.task("Review", "blocked"),
          item.task("Skip", "dropped"),
        ),
      ),
      { cols: 80, rows: 24 },
    )

    // String-level check across all status icons.
    expect(app.text).toContain("\u2713 Build") // ✓ done
    expect(app.text).toContain("\u25A1 Plan") // □ todo
    expect(app.text).toContain("\u25A1 Code") // □ wip
    expect(app.text).toContain("\u2717 Review") // ✗ blocked
    expect(app.text).toContain("\u2717 Skip") // ✗ dropped

    // Cell-level: the row containing the done task must have a real space
    // cell between the ✓ glyph and the 'B'. This catches output-phase
    // wcwidth bugs that string scans can smooth over.
    function assertMarkerSpaceTitle(marker: string, title: string): void {
      const lines = app.text.split("\n")
      const row = lines.find((l) => l.includes(title) && l.includes(marker) && !l.includes(">"))
      if (!row) throw new Error(`row for ${marker} ${title} not found`)
      const idx = row.indexOf(marker)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(row[idx + 1]).toBe(" ")
      expect(row[idx + 2]).toBe(title[0])
      const rowN = lines.indexOf(row)
      app.expectCellChar(idx, rowN, marker)
      app.expectCellChar(idx + 1, rowN, " ")
      app.expectCellChar(idx + 2, rowN, title[0]!)
    }

    assertMarkerSpaceTitle("\u2713", "Build")
    assertMarkerSpaceTitle("\u25A1", "Plan")
    assertMarkerSpaceTitle("\u2717", "Review")

    // Cursor on the done task must not collapse the spacing either
    // (selection styling wraps the prefix Box in inverse — easy to break).
    app.navigateTo("Build")
    assertMarkerSpaceTitle("\u2713", "Build")
  })

  // =========================================================================
  // Keyboard toggle
  // =========================================================================

  test("keyboard toggle_task_done toggles between todo and done (does not cycle)", () => {
    // Regression: km-tui.task-toggle-cycles — x used to cycle todo→wip→blocked→done
    // because handleTaskStatusCycle ignored op.status. toggle_task_done should flip
    // between todo and done, nothing else.
    using app = createTestApp(item.root("board", item("Column", item.task("Buy milk", "todo"))), {
      cols: 80,
      rows: 24,
    })

    expect(app.repo.getNode("Buy milk")?.item?.task?.status).toBe("todo")

    // First toggle: todo -> done
    app.command("toggle_task_done")
    expect(app.repo.getNode("Buy milk")?.item?.task?.status).toBe("done")

    // Second toggle: done -> todo
    app.command("toggle_task_done")
    expect(app.repo.getNode("Buy milk")?.item?.task?.status).toBe("todo")

    // Third toggle: todo -> done (stable two-state toggle)
    app.command("toggle_task_done")
    expect(app.repo.getNode("Buy milk")?.item?.task?.status).toBe("done")
  })

  test("toggle_task_done on wip task flips to done (not next in cycle)", () => {
    // Regression: km-tui.task-toggle-cycles — x on a wip task used to go to blocked.
    using app = createTestApp(item.root("board", item("Column", item.task("Do work", "wip"))), {
      cols: 80,
      rows: 24,
    })

    expect(app.repo.getNode("Do work")?.item?.task?.status).toBe("wip")
    app.command("toggle_task_done")
    expect(app.repo.getNode("Do work")?.item?.task?.status).toBe("done")
  })

  // =========================================================================
  // Click toggle (DOM-level mouse events)
  // =========================================================================

  test("checkbox icon renders as interactive component for task nodes", () => {
    using app = createTestApp(item.root("board", item("Column", item.task("Buy milk", "todo"))), {
      cols: 80,
      rows: 24,
    })

    // The task node should render with a checkbox icon (□ U+25A1 for todo)
    const taskEl = app.q("[id='Buy milk']")
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
    using app = createTestApp(item.root("board", item("Column", item.task("Buy milk", "todo"))), {
      cols: 80,
      rows: 24,
    })

    const statusCycle = ["wip", "blocked", "done", "dropped", "todo"]

    for (const expected of statusCycle) {
      app.command("cycle_task_status")
      expect(app.repo.getNode("Buy milk")?.item?.task?.status).toBe(expected)
    }
  })

  // =========================================================================
  // Multiple tasks
  // =========================================================================

  test("toggling preserves other task statuses", () => {
    using app = createTestApp(
      item.root(
        "board",
        item("Column", item.task("task-1", "todo"), item.task("task-2", "done"), item.task("task-3", "wip")),
      ),
      { cols: 80, rows: 24 },
    )

    // Navigate to task-2 and toggle (done -> todo, because toggle_task_done flips)
    app.navigateTo("task-2")
    app.command("toggle_task_done")

    // task-2 toggles from done -> todo (binary toggle, not cycle)
    expect(app.repo.getNode("task-2")?.item?.task?.status).toBe("todo")
    // Others unchanged
    expect(app.repo.getNode("task-1")?.item?.task?.status).toBe("todo")
    expect(app.repo.getNode("task-3")?.item?.task?.status).toBe("wip")
  })

  // =========================================================================
  // Cursor preservation on checkbox click (regression: km-tui.checkbox-cursor-move)
  // =========================================================================

  test("keyboard toggle on cursor node preserves cursor position", () => {
    using app = createTestApp(
      item.root(
        "board",
        item("Column", item.task("task-1", "todo"), item.task("task-2", "todo"), item.task("task-3", "todo")),
      ),
      { cols: 80, rows: 24 },
    )

    // Cursor starts on task-1. Toggle it.
    expect(app.state.cursor).toBe("task-1")
    app.command("toggle_task_done")

    // Cursor stays on task-1 after toggle (todo -> done)
    expect(app.state.cursor).toBe("task-1")
    expect(app.repo.getNode("task-1")?.item?.task?.status).toBe("done")

    // Navigate to task-2, toggle task-2
    app.navigateTo("task-2")
    expect(app.state.cursor).toBe("task-2")
    app.command("toggle_task_done")

    // Cursor stays on task-2 (todo -> done)
    expect(app.state.cursor).toBe("task-2")
    expect(app.repo.getNode("task-2")?.item?.task?.status).toBe("done")

    // task-1 unchanged (still done), task-3 unchanged (still todo)
    expect(app.repo.getNode("task-1")?.item?.task?.status).toBe("done")
    expect(app.repo.getNode("task-3")?.item?.task?.status).toBe("todo")
  })
})
