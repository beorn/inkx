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
