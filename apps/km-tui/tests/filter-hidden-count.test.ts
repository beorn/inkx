/**
 * Filter hidden count indicator tests.
 *
 * When items are hidden by filters (text filter, property filters),
 * a dim "+N hidden" indicator appears at the bottom of each column.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("filter hidden count indicator", () => {
  test("shows +N hidden when text filter hides cards", () => {
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
      { columns: 80, rows: 24 },
    )

    // No hidden indicator initially
    let screen = board.screenshot()
    expect(screen).not.toContain("hidden")

    // Apply text filter that hides 2 of 4 cards
    store.getState().setUI({ filterText: "Fix" })
    board.press("ctrl+/")
    board.press("Escape")

    screen = board.screenshot()
    // 2 of 4 cards match "Fix", so 2 are hidden
    expect(screen).toContain("+2 hidden")
  })

  test("hidden indicator disappears when filter is cleared", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("Tasks", item("Buy groceries"), item("Fix bug"), item("Write docs")),
        ),
      { columns: 80, rows: 24 },
    )

    // Apply filter
    store.getState().setUI({ filterText: "Fix" })
    board.press("ctrl+/")
    board.press("Escape")

    let screen = board.screenshot()
    expect(screen).toContain("+2 hidden")

    // Clear filter
    store.getState().setUI({ filterText: "" })
    board.press("ctrl+/")
    board.press("Escape")

    screen = board.screenshot()
    expect(screen).not.toContain("hidden")
  })

  test("no hidden indicator when all cards match filter", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("Tasks", item("Fix bug"), item("Fix login")),
        ),
      { columns: 80, rows: 24 },
    )

    // Apply filter that matches all cards
    store.getState().setUI({ filterText: "Fix" })
    board.press("ctrl+/")
    board.press("Escape")

    const screen = board.screenshot()
    expect(screen).not.toContain("hidden")
  })

  test("shows hidden indicator per column independently", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("Tasks", item("Fix bug"), item("Buy milk"), item("Fix login")),
          item("Notes", item("Fix design"), item("Meeting notes")),
        ),
      { columns: 120, rows: 24 },
    )

    // Apply filter "Fix" — Tasks: 1 hidden (Buy milk), Notes: 1 hidden (Meeting notes)
    store.getState().setUI({ filterText: "Fix" })
    board.press("ctrl+/")
    board.press("Escape")

    const screen = board.screenshot()
    // Both columns should show "+1 hidden"
    const matches = screen.match(/\+1 hidden/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBe(2)
  })
})
