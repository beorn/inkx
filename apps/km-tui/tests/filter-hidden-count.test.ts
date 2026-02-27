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
      () => item("board", item("Tasks", item("Fix bug"), item("Buy milk"), item("Write docs"), item("Fix login"))),
      { columns: 80, rows: 40 },
    )

    // Apply filter that shows 2 of 4 cards
    store.getState().setUI({ filterText: "Fix" })
    flushFilter(board)

    const screen = board.screenshot()
    expect(screen).toContain("+2 hidden")

    // Find the line containing "+2 hidden" — it should appear right after the 2 visible cards.
    // Layout: top bar (1) + spacer (1) + header (1) + separator (1) + 2 cards * ~5 rows = ~14.
    // Plus 1 blank line in the hidden indicator = ~15. Allow margin for spacing.
    const lines = screen.split("\n")
    const hiddenLineIdx = lines.findIndex((l) => l.includes("+2 hidden"))
    expect(hiddenLineIdx).toBeGreaterThan(0) // Not first line
    expect(hiddenLineIdx).toBeLessThan(18) // Right after the 2 cards, not at screen bottom
  })

  test("shows +N hidden when vd (toggle hide done) hides done tasks", () => {
    // Create a board with 2 todo tasks and 1 done task
    const nodes = item("board", item("Tasks", item("todo1"), item("todo2"), item("doneTask")))
    const doneNode = nodes.find((n) => n.id === "doneTask")!
    doneNode.task_status = "done"
    doneNode.task_marker = "[x]"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // No hidden indicator initially
    let screen = board.screenshot()
    expect(screen).not.toContain("hidden")
    expect(screen).toContain("doneTask")

    // Press vd to hide done tasks
    board.press("v").press("d")

    screen = board.screenshot()
    expect(screen).toContain("todo1")
    expect(screen).toContain("todo2")
    expect(screen).not.toContain("doneTask")
    expect(screen).toContain("+1 hidden")

    // Verify the indicator appears right after the cards, not with a large gap.
    // Layout: top bar (1) + spacer (1) + header (1) + separator (1) + 2 cards * ~5 rows = ~14.
    const lines = screen.split("\n")
    const hiddenLineIdx = lines.findIndex((l) => l.includes("+1 hidden"))
    expect(hiddenLineIdx).toBeLessThan(18)
  })

  test("shows hidden count for done descendants inside heading cards", () => {
    // Simulates Asana vault structure: heading cards contain done task children.
    // Top-level cards (headings) don't have task_status, so card-level filter
    // doesn't remove them. But done children within are hidden by TreeNode filter.
    // The hidden count should reflect these descendant-level hidden items.
    const nodes = item("board", item("Col", item("Section A", item("todoChild"), item("doneChild"))))
    const doneNode = nodes.find((n) => n.id === "doneChild")!
    doneNode.task_status = "done"
    doneNode.task_marker = "[x]"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // No hidden indicator initially
    expect(board.screenshot()).not.toContain("hidden")

    // Press vd to hide done tasks
    board.press("v").press("d")

    const screen = board.screenshot()
    // The done child should be hidden, so we should see +1 hidden
    expect(screen).toContain("+1 hidden")
    // The todo child should still be visible
    expect(screen).toContain("todoChild")
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

  test("hidden indicator positioned near cards, not at screen bottom (tall terminal, few visible)", () => {
    // 6 cards total, filter leaves only 2 visible. With rows=40, the +4 hidden
    // indicator should appear right after the 2 visible cards, not at the bottom.
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item(
            "Tasks",
            item("Fix auth bug"),
            item("Buy groceries"),
            item("Fix login page"),
            item("Write documentation"),
            item("Clean kitchen"),
            item("Read book"),
          ),
        ),
      { columns: 80, rows: 40 },
    )

    // No hidden indicator initially
    let screen = board.screenshot()
    expect(screen).not.toContain("hidden")

    // Apply text filter that shows only the 2 "Fix" cards, hiding 4
    store.getState().setUI({ filterText: "Fix" })
    flushFilter(board)

    screen = board.screenshot()
    expect(screen).toContain("+4 hidden")

    // The indicator should be near the top of the screen (close to the 2 visible cards),
    // not near the bottom (row 39). With header + separator + 2 cards, expect it
    // somewhere around rows 8-15, definitely not past row 20.
    const lines = screen.split("\n")
    const hiddenLineIdx = lines.findIndex((l) => l.includes("+4 hidden"))
    expect(hiddenLineIdx).toBeGreaterThan(0)
    expect(hiddenLineIdx).toBeLessThan(20) // Well above the screen bottom (row 39)

    // Also verify it's NOT near the screen bottom
    expect(hiddenLineIdx).toBeLessThan(lines.length - 10)
  })

  test("VirtualList overflow indicator and hidden count both appear with many cards", () => {
    // 15 cards total, filter hides 5, leaving 10 visible. With rows=24,
    // 10 cards won't all fit, so VirtualList should show ▼ overflow indicator.
    // The +5 hidden indicator should also appear.
    const cards = [
      item("Fix bug 1"),
      item("Fix bug 2"),
      item("Fix bug 3"),
      item("Fix bug 4"),
      item("Fix bug 5"),
      item("Fix bug 6"),
      item("Fix bug 7"),
      item("Fix bug 8"),
      item("Fix bug 9"),
      item("Fix bug 10"),
      item("Buy milk"),
      item("Buy bread"),
      item("Buy eggs"),
      item("Read novel"),
      item("Clean house"),
    ]
    const { board, store } = testEnv(() => item("board", item("Tasks", ...cards)), {
      columns: 80,
      rows: 24,
    })

    // Apply text filter — 10 "Fix" cards visible, 5 others hidden
    store.getState().setUI({ filterText: "Fix" })
    flushFilter(board)

    const screen = board.screenshot()

    // Hidden count should show +5 hidden
    expect(screen).toContain("+5 hidden")

    // VirtualList overflow indicator ▼ should appear since 10 cards
    // won't fit in 24 rows
    expect(screen).toContain("▼")

    // Both indicators should be near the bottom of the visible area
    const lines = screen.split("\n")
    const overflowIdx = lines.findIndex((l) => l.includes("▼"))
    const hiddenIdx = lines.findIndex((l) => l.includes("+5 hidden"))

    // Both should be in the lower portion of the screen (past the halfway point)
    expect(overflowIdx).toBeGreaterThan(10)
    expect(hiddenIdx).toBeGreaterThan(10)

    // Both should be near the bottom (within last ~5 lines of the screen)
    expect(overflowIdx).toBeGreaterThan(lines.length - 6)
    expect(hiddenIdx).toBeGreaterThan(lines.length - 6)
  })
})
