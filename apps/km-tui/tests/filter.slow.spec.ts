/**
 * Filter/View Journey Tests
 *
 * User-level journey specs for filter operations. Tests multi-step filter
 * workflows verifying BOTH screen output AND state consistency.
 *
 * Complements filter.slow.test.ts (property-based filters, embed filters,
 * hidden count indicators, hide_node) and vd-filter.spec.ts (toggle_hide_done
 * for embeds). These journey tests cover user stories:
 * - Toggle done visibility (vd chord), verify cards appear/disappear
 * - Filter -> navigate -> unfilter round-trip
 * - Filter with cursor preservation
 *
 * Key bindings:
 *   vd = toggle_hide_done (hide/show done tasks)
 *   V  = open/close filter panel (View Settings)
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Filter/View Journeys", () => {
  test("vd hides done tasks, navigate among remaining, vd restores all", () => {
    const nodes = item("board", item("col1", item("todoA"), item("doneA"), item("todoB"), item("doneB")))
    // Mark some tasks as done
    for (const n of nodes) {
      if (n.id === "doneA" || n.id === "doneB") {
        n.item = { ...n.item, task: { status: "done", marker: "[x]" } }
      }
    }

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Step 1: All tasks visible initially
    let screen = board.screenshot()
    expect(screen).toContain("todoA")
    expect(screen).toContain("doneA")
    expect(screen).toContain("todoB")
    expect(screen).toContain("doneB")

    // Step 2: vd hides done tasks
    board.command("toggle_hide_done")
    screen = board.screenshot()
    expect(screen).toContain("todoA")
    expect(screen).not.toContain("doneA")
    expect(screen).toContain("todoB")
    expect(screen).not.toContain("doneB")

    // Step 3: Cursor should still be on a visible card (todoA)
    board.expect("#todoA[data-cursor]").toExist()

    // Step 4: vd again restores done tasks — all should reappear
    board.command("toggle_hide_done")
    screen = board.screenshot()
    expect(screen).toContain("todoA")
    expect(screen).toContain("doneA")
    expect(screen).toContain("todoB")
    expect(screen).toContain("doneB")
  })

  test("filter via V panel, navigate filtered results, close panel, unfilter", () => {
    const { board } = testEnv(
      () => item("board", item("Tasks", item("Buy groceries"), item("Fix bug"), item("Write docs"))),
      { columns: 120, rows: 24 },
    )

    // Step 1: All items visible initially
    let screen = board.screenshot()
    expect(screen).toContain("Buy groceries")
    expect(screen).toContain("Fix bug")
    expect(screen).toContain("Write docs")

    // Step 2: Open filter panel and toggle 'todo' status
    board.command("filter")
    screen = board.screenshot()
    expect(screen).toContain("View Settings")

    board.command("select_toggle") // toggle todo on (Status row, first value)

    // Step 3: Close filter panel
    board.press("Escape")
    screen = board.screenshot()
    // Filter indicator should show
    expect(screen).toContain("[F]")

    // Step 4: Navigate among filtered results
    board.command("cursor_down")

    // Step 5: Open panel again and clear filters
    board.command("filter")
    board.command("cycle_task_status") // clear all
    board.press("Escape")

    screen = board.screenshot()
    // All items should be visible again
    expect(screen).toContain("Buy groceries")
    expect(screen).toContain("Fix bug")
    expect(screen).toContain("Write docs")
    expect(screen).not.toContain("[F]")
  })

  test("vd preserves cursor on visible card when done card above is hidden", () => {
    const nodes = item("board", item("col1", item("done-top"), item("my-task"), item("done-bottom")))
    for (const n of nodes) {
      if (n.id === "done-top" || n.id === "done-bottom") {
        n.item = { ...n.item, task: { status: "done", marker: "[x]" } }
      }
    }

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Step 1: Navigate to my-task
    board.command("cursor_down")
    board.expect("#my-task[data-cursor]").toExist()

    // Step 2: vd hides done tasks — cursor should stay on my-task
    board.command("toggle_hide_done")
    board.expect("#my-task[data-cursor]").toExist()
    const screen = board.screenshot()
    expect(screen).not.toContain("done-top")
    expect(screen).not.toContain("done-bottom")
    expect(screen).toContain("my-task")
  })

  test("filter then navigate across columns, unfilter preserves column position", () => {
    const nodes = item(
      "board",
      item("Todo", item("todo-a"), item("done-a")),
      item("Notes", item("note-1"), item("done-note")),
    )
    for (const n of nodes) {
      if (n.id === "done-a" || n.id === "done-note") {
        n.item = { ...n.item, task: { status: "done", marker: "[x]" } }
      }
    }

    const { board } = testEnv(() => nodes, { columns: 120, rows: 24 })

    // Step 1: Hide done tasks
    board.command("toggle_hide_done")
    let screen = board.screenshot()
    expect(screen).not.toContain("done-a")
    expect(screen).not.toContain("done-note")

    // Step 2: Navigate to second column
    board.command("cursor_right")
    board.expect("#note-1[data-cursor]").toExist()

    // Step 3: Unfilter — done tasks should reappear in both columns
    board.command("toggle_hide_done")
    screen = board.screenshot()
    expect(screen).toContain("done-a")
    expect(screen).toContain("done-note")
    expect(screen).toContain("todo-a")
    expect(screen).toContain("note-1")
  })

  test("hidden count indicator updates as filter changes", () => {
    const nodes = item(
      "board",
      item("Tasks", item("todo-1"), item("todo-2"), item("done-1"), item("done-2"), item("done-3")),
    )
    for (const n of nodes) {
      if (n.id?.startsWith("done-")) {
        n.item = { ...n.item, task: { status: "done", marker: "[x]" } }
      }
    }

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Step 1: No hidden indicator initially
    let screen = board.screenshot()
    expect(screen).not.toContain("hidden")

    // Step 2: vd hides 3 done tasks
    board.command("toggle_hide_done")
    screen = board.screenshot()
    expect(screen).toContain("+3 hidden")

    // Step 3: vd again shows all tasks — no hidden indicator
    board.command("toggle_hide_done")
    screen = board.screenshot()
    expect(screen).not.toContain("hidden")
  })
})
