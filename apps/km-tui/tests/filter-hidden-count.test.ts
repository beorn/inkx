/**
 * Filter hidden count indicator tests.
 *
 * When items are hidden by filters (text filter, property filters),
 * a dim "+N hidden" indicator appears at the bottom of each column.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/** Open and close filter dialog to flush Zustand → React render cycle */
function flushFilter(board: { press: (key: string) => void }) {
  board.press("V")
  board.press("Escape")
}

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
    flushFilter(board)

    screen = board.screenshot()
    // 2 of 4 cards match "Fix", so 2 are hidden
    expect(screen).toContain("+2 hidden")
  })

  test("hidden indicator disappears when filter is cleared", () => {
    const { board, store } = testEnv(
      () => item("board", item("Tasks", item("Buy groceries"), item("Fix bug"), item("Write docs"))),
      { columns: 80, rows: 24 },
    )

    // Apply filter
    store.getState().setUI({ filterText: "Fix" })
    flushFilter(board)

    let screen = board.screenshot()
    expect(screen).toContain("+2 hidden")

    // Clear filter
    store.getState().setUI({ filterText: "" })
    flushFilter(board)

    screen = board.screenshot()
    expect(screen).not.toContain("hidden")
  })

  test("no hidden indicator when all cards match filter", () => {
    const { board, store } = testEnv(() => item("board", item("Tasks", item("Fix bug"), item("Fix login"))), {
      columns: 80,
      rows: 24,
    })

    // Apply filter that matches all cards
    store.getState().setUI({ filterText: "Fix" })
    flushFilter(board)

    const screen = board.screenshot()
    expect(screen).not.toContain("hidden")
  })

  test("hidden indicator appears right after last card, not at screen bottom", () => {
    // With a tall terminal (40 rows) and only 2 visible cards, the "+N hidden"
    // indicator should appear right after the cards, not at row 39.
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item(
            "Tasks",
            item("Fix bug"),
            item("Buy milk"),
            item("Write docs"),
            item("Fix login"),
          ),
        ),
      { columns: 80, rows: 40 },
    )

    // Apply filter that shows 2 of 4 cards
    store.getState().setUI({ filterText: "Fix" })
    flushFilter(board)

    const screen = board.screenshot()
    expect(screen).toContain("+2 hidden")

    // Find the line containing "+2 hidden" — it should be near the top (after 2 cards),
    // not near the bottom of the 40-row terminal
    const lines = screen.split("\n")
    const hiddenLineIdx = lines.findIndex((l) => l.includes("+2 hidden"))
    expect(hiddenLineIdx).toBeGreaterThan(0) // Not first line
    // 2 cards at ~4 rows each + 2 header rows = ~10 rows. Should be well before row 30.
    expect(hiddenLineIdx).toBeLessThan(20)
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
    flushFilter(board)

    const screen = board.screenshot()
    // Both columns should show "+1 hidden"
    const matches = screen.match(/\+1 hidden/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBe(2)
  })
})
