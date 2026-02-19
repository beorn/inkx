/**
 * P2 Feature: km-tui.filter — Property-based filtering
 *
 * Ctrl+/ opens a filter panel in the top-right corner.
 * Navigate with j/k (rows) and h/l (values), toggle with Space/Enter.
 * X clears all filters. Escape closes the panel.
 *
 * Filter categories: task status, priority, due date.
 * Text search persists from old implementation.
 * Filter state persists across view mode changes.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"

describe("P2: Filter feature", () => {
  test("Ctrl+/ toggles filter panel", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Tasks", item("Buy groceries"), item("Fix bug"), item("Write docs")),
          item("Notes", item("Meeting notes"), item("Design doc")),
        ),
      { columns: 120, rows: 24 },
    )

    // Initially no filter panel
    let screen = board.screenshot()
    expect(screen).not.toContain("Filter")

    // Open filter panel with Ctrl+/
    board.press("ctrl+/")
    screen = board.screenshot()
    expect(screen).toContain("Filter")
    expect(screen).toContain("Status")
    expect(screen).toContain("Priority")
    expect(screen).toContain("Due")
  })

  test("Escape closes filter panel", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"), item("Fix bug"))), {
      columns: 120,
      rows: 24,
    })

    board.press("ctrl+/")
    let screen = board.screenshot()
    expect(screen).toContain("Filter")

    board.press("Escape")
    screen = board.screenshot()
    expect(screen).not.toContain("Status")
  })

  test("j/k navigates between filter rows", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    board.press("ctrl+/")
    // Initially on Status row (row 0)
    let screen = board.screenshot()
    expect(screen).toContain("> Status")

    // Move down to Priority
    board.press("j")
    screen = board.screenshot()
    expect(screen).toContain("> Priority")

    // Move down to Due
    board.press("j")
    screen = board.screenshot()
    expect(screen).toContain("> Due")

    // Move back up
    board.press("k")
    screen = board.screenshot()
    expect(screen).toContain("> Priority")
  })

  test("Space toggles a filter value", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"), item("Fix bug"))), {
      columns: 120,
      rows: 24,
    })

    board.press("ctrl+/")
    // On Status row, first value (todo)
    // Toggle 'todo' on
    board.press(" ")
    let screen = board.screenshot()
    expect(screen).toContain("[x]todo")

    // Toggle it off
    board.press(" ")
    screen = board.screenshot()
    expect(screen).toContain("[ ]todo")
  })

  test("h/l navigates between values in a row", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    board.press("ctrl+/")
    // Move right to second value (wip)
    board.press("l")
    board.press(" ") // toggle wip on
    let screen = board.screenshot()
    expect(screen).toContain("[x]wip")

    // Move left back to first value (todo)
    board.press("h")
    board.press(" ") // toggle todo on
    screen = board.screenshot()
    expect(screen).toContain("[x]todo")
    expect(screen).toContain("[x]wip")
  })

  test("X clears all filters", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    board.press("ctrl+/")
    // Toggle some filters on
    board.press(" ") // todo on
    board.press("l")
    board.press(" ") // wip on

    let screen = board.screenshot()
    expect(screen).toContain("[x]todo")
    expect(screen).toContain("[x]wip")

    // Clear all
    board.press("X")
    screen = board.screenshot()
    expect(screen).toContain("[ ]todo")
    expect(screen).toContain("[ ]wip")
  })

  test("filter indicator shows in top bar when filters active", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    // No filter indicator initially
    let screen = board.screenshot()
    expect(screen).not.toContain("F:")

    // Open filter and toggle todo status
    board.press("ctrl+/")
    board.press(" ") // toggle todo on

    // Close filter panel
    board.press("Escape")

    screen = board.screenshot()
    // Filter indicator should be visible in top bar
    expect(screen).toContain("F:")
    expect(screen).toContain("todo")
  })

  test("text filter still works via filterText state", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item(
            "Tasks",
            item("Buy groceries"),
            item("Fix bug in auth"),
            item("Fix login page"),
            item("Write documentation"),
          ),
        ),
      { columns: 120, rows: 24 },
    )

    // All items visible initially
    let screen = board.screenshot()
    expect(screen).toContain("Buy groceries")
    expect(screen).toContain("Fix bug in auth")
    expect(screen).toContain("Write documentation")

    // Set filter text programmatically (text search via SET_FILTER action)
    store.getState().setUI({ filterText: "Fix" })
    // Press a neutral key to flush the React render cycle
    board.press("ctrl+/")
    board.press("Escape")

    screen = board.screenshot()
    // Only "Fix" items should be visible
    expect(screen).toContain("Fix bug in auth")
    expect(screen).toContain("Fix login page")
    expect(screen).not.toContain("Buy groceries")
    expect(screen).not.toContain("Write documentation")
  })

  test("filter persists across view mode changes", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("Tasks", item("Buy groceries"), item("Fix bug")),
          item("Notes", item("Meeting notes"), item("Fix design")),
        ),
      { columns: 120, rows: 24 },
    )

    // Apply text filter "Fix" programmatically
    store.getState().setUI({ filterText: "Fix" })
    // Press a neutral key to flush the React render cycle
    board.press("ctrl+/")
    board.press("Escape")

    // In cards view, only Fix items visible
    let screen = board.screenshot()
    expect(screen).toContain("Fix bug")
    expect(screen).not.toContain("Buy groceries")

    // Switch to columns view — filter should persist
    board.press("v")
    screen = board.screenshot()
    expect(screen).toContain("Fix bug")
    expect(screen).not.toContain("Buy groceries")
  })

  test("Ctrl+/ closes filter panel when already open (toggle)", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    // Open
    board.press("ctrl+/")
    let screen = board.screenshot()
    expect(screen).toContain("Filter")

    // Close via Ctrl+/ again
    board.press("ctrl+/")
    screen = board.screenshot()
    expect(screen).not.toContain("Status")
  })
})

// =============================================================================
// Deep filter: embedded tasks use source node properties (km-tui.filter-embedded-source)
// =============================================================================

describe("deep filter: embedded tasks use source node properties (km-tui.filter-embedded-source)", () => {
  /**
   * Build a board with embedded tasks. The embed nodes have link_to pointing
   * to source nodes. The source nodes have task properties (status, priority,
   * due_at). The embed nodes themselves have minimal properties.
   *
   * Board structure:
   *   board > Tasks > [embed1(link_to=src1), embed2(link_to=src2), normalTask]
   *   src1: task_status=todo, priority=1
   *   src2: task_status=done, priority=2
   *   normalTask: task_status=todo (no link_to)
   */
  function buildEmbedBoard(): KNode[] {
    const now = Date.now()

    // Source nodes (exist elsewhere in the tree -- under a different parent)
    const srcParent: KNode = {
      id: "src-parent",
      type: "oi",
      fstype: "folder",
      content: undefined,
      data: { name: "Sources" },
      parent_id: "board",
      parent_idx: 1,
      link_to: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const src1: KNode = {
      id: "src1",
      type: "li",
      list_marker: "-",
      task_marker: "[ ]",
      task_status: "todo",
      priority: 1,
      content: "Source task 1 (todo P1)",
      data: {},
      parent_id: "src-parent",
      parent_idx: 0,
      link_to: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const src2: KNode = {
      id: "src2",
      type: "li",
      list_marker: "-",
      task_marker: "[x]",
      task_status: "done",
      priority: 2,
      content: "Source task 2 (done P2)",
      data: {},
      parent_id: "src-parent",
      parent_idx: 1,
      link_to: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    // Tasks column
    const tasksCol: KNode = {
      id: "Tasks",
      type: "oi",
      fstype: "folder",
      content: undefined,
      data: { name: "Tasks" },
      parent_id: "board",
      parent_idx: 0,
      link_to: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    // Embed nodes (point to source nodes via link_to)
    // Embeds have no task_status/priority themselves — they inherit from source
    const embed1: KNode = {
      id: "embed1",
      type: "li",
      list_marker: "-",
      content: "![[src1]]",
      data: {},
      parent_id: "Tasks",
      parent_idx: 0,
      link_to: "src1",
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const embed2: KNode = {
      id: "embed2",
      type: "li",
      list_marker: "-",
      content: "![[src2]]",
      data: {},
      parent_id: "Tasks",
      parent_idx: 1,
      link_to: "src2",
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    // A normal (non-embed) task for comparison
    const normalTask: KNode = {
      id: "normalTask",
      type: "li",
      list_marker: "-",
      task_marker: "[ ]",
      task_status: "todo",
      content: "Normal task (todo)",
      data: {},
      parent_id: "Tasks",
      parent_idx: 2,
      link_to: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    // Board root
    const board: KNode = {
      id: "board",
      type: "oi",
      fstype: "folder",
      content: undefined,
      data: { name: "board" },
      parent_id: null,
      parent_idx: 0,
      link_to: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    return [board, tasksCol, embed1, embed2, normalTask, srcParent, src1, src2]
  }

  test("filtering by 'todo' status includes embed whose source is todo", () => {
    const { board, store } = testEnv(() => buildEmbedBoard(), {
      columns: 120,
      rows: 24,
      checkIncremental: false,
    })

    // Verify all cards are visible initially
    let screen = board.screenshot()
    expect(screen).toContain("Source task 1") // embed1 resolves to src1's display
    expect(screen).toContain("Normal task")

    // Apply 'todo' status filter
    board.press("ctrl+/") // open filter
    board.press(" ")       // toggle todo
    board.press("Escape")  // close filter

    screen = board.screenshot()
    // embed1 links to src1 which is task_status=todo → should be visible
    // embed2 links to src2 which is task_status=done → should be hidden
    // normalTask is task_status=todo → should be visible
    expect(screen).toContain("Source task 1")
    expect(screen).toContain("Normal task")
    expect(screen).not.toContain("Source task 2")
  })

  test("filtering by 'done' status includes embed whose source is done", () => {
    const { board } = testEnv(() => buildEmbedBoard(), {
      columns: 120,
      rows: 24,
      checkIncremental: false,
    })

    // Apply 'done' status filter
    board.press("ctrl+/") // open filter
    // Navigate to 'done' value: h/l through values
    // Status row values: todo, wip, blocked, done, dropped
    board.press("l").press("l").press("l") // move to 'done'
    board.press(" ")       // toggle done
    board.press("Escape")  // close filter

    const screen = board.screenshot()
    // embed2 links to src2 which is task_status=done → should be visible
    // embed1 links to src1 which is task_status=todo → should be hidden
    // normalTask is task_status=todo → should be hidden
    expect(screen).toContain("Source task 2")
    expect(screen).not.toContain("Source task 1")
    expect(screen).not.toContain("Normal task")
  })
})
