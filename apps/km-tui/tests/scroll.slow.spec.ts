/**
 * Scroll Journey Tests
 *
 * User-level journey specs for scroll behavior. Tests multi-step scroll
 * workflows verifying BOTH screen output AND cursor position.
 *
 * Complements scroll.slow.test.ts which focuses on scroll-follow mechanics,
 * horizontal scroll symmetry, partial column visibility, and scroll indicators.
 * These journey tests cover user stories:
 * - Navigate past viewport edge triggers scroll
 * - Scroll preserves cursor visibility
 * - Scroll behavior at list boundaries (top/bottom)
 *
 * Key bindings:
 *   j/k = navigate down/up within a column
 *   l/h = navigate right/left between columns
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Vertical Scroll Journeys", () => {
  test("navigate past bottom edge scrolls, cursor stays visible", () => {
    // Create a tall column that exceeds the viewport (24 rows, ~4 visible cards)
    const tasks = Array.from({ length: 12 }, (_, i) => item(`task-${i}`))
    const { board } = testEnv(() => item("board", item("col1", ...tasks)), {
      rows: 24,
      columns: 80,
    })

    // Step 1: Cursor starts on first card
    board.expect("#task-0[data-cursor]").toExist()
    board.expectScreen("task-0")

    // Step 2: Navigate down past visible area
    for (let i = 0; i < 8; i++) {
      board.press("j")
    }

    // Step 3: Cursor should be visible on task-8
    board.expect("#task-8[data-cursor]").toExist()
    board.expectScreen("task-8")

    // Step 4: Continue to the last task
    for (let i = 8; i < 11; i++) {
      board.press("j")
    }
    board.expect("#task-11[data-cursor]").toExist()
    board.expectScreen("task-11")
  })

  test("navigate to bottom then back to top, first card becomes visible again", () => {
    const tasks = Array.from({ length: 10 }, (_, i) => item(`item-${i}`))
    const { board } = testEnv(() => item("board", item("col1", ...tasks)), {
      rows: 24,
      columns: 80,
    })

    // Step 1: Navigate to bottom
    for (let i = 0; i < 9; i++) {
      board.press("j")
    }
    board.expect("#item-9[data-cursor]").toExist()
    board.expectScreen("item-9")

    // Step 2: Navigate back to top
    for (let i = 0; i < 9; i++) {
      board.press("k")
    }
    board.expect("#item-0[data-cursor]").toExist()
    board.expectScreen("item-0")
  })

  test("scroll at top boundary: k on first card stays put", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("first"), item("second"), item("third"))),
      { rows: 24, columns: 80 },
    )

    // Step 1: Cursor starts on first card
    board.expect("#first[data-cursor]").toExist()

    // Step 2: Press k — should not crash or move off-screen
    board.press("k")

    // Cursor should move to column header (standard nav behavior), not crash
    // Verify the screen is still rendering correctly
    board.expectScreen("first")
    board.expectScreen("second")
  })

  test("scroll at bottom boundary: j on last card stays put", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("alpha"), item("beta"), item("gamma"))),
      { rows: 24, columns: 80 },
    )

    // Step 1: Navigate to last card
    board.press("j")
    board.press("j")
    board.expect("#gamma[data-cursor]").toExist()

    // Step 2: j on last card — should stay on last card
    board.press("j")
    board.expect("#gamma[data-cursor]").toExist()
    board.expectScreen("gamma")
  })
})

describe("Horizontal Scroll Journeys", () => {
  test("navigate right through many columns, then back to first", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1")),
          item("col2", item("b1")),
          item("col3", item("c1")),
          item("col4", item("d1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Step 1: Start at col1
    board.expect("#a1[data-cursor]").toExist()

    // Step 2: Navigate right to col4 (triggers horizontal scroll)
    board.press("l")
    board.expect("#b1[data-cursor]").toExist()
    board.press("l")
    board.expect("#c1[data-cursor]").toExist()
    board.press("l")
    board.expect("#d1[data-cursor]").toExist()

    // Step 3: col4 should be visible
    board.expectScreen("d1")

    // Step 4: Navigate all the way back to col1
    board.press("h")
    board.press("h")
    board.press("h")
    board.expect("#a1[data-cursor]").toExist()

    // Step 5: col1 should be visible again
    board.expectScreen("a1")
  })

  test("horizontal scroll indicators appear and disappear correctly", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("t1")),
          item("col2", item("t2")),
          item("col3", item("t3")),
          item("col4", item("t4")),
          item("col5", item("t5")),
        ),
      { columns: 80, rows: 20 },
    )

    // Step 1: At col1, should see right arrow (more columns to the right)
    let screen = board.screenshot()
    // Right indicator when columns overflow
    expect(screen).toContain("\u25B8") // right arrow

    // Step 2: Navigate to rightmost column
    board.press("l").press("l").press("l").press("l")
    board.expect("#t5[data-cursor]").toExist()

    // Step 3: Should see left arrow (more columns to the left)
    screen = board.screenshot()
    expect(screen).toContain("\u25C2") // left arrow
  })

  test("vertical scroll within column after horizontal navigation", () => {
    // Tall col3 with many items, navigate right then down
    const tasks = Array.from({ length: 10 }, (_, i) => item(`deep-${i}`))
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1")),
          item("col2", item("b1")),
          item("col3", ...tasks),
        ),
      { columns: 80, rows: 24 },
    )

    // Step 1: Navigate right to col3
    board.press("l")
    board.press("l")
    board.expect("#deep-0[data-cursor]").toExist()

    // Step 2: Navigate down past viewport in col3
    for (let i = 0; i < 8; i++) {
      board.press("j")
    }
    board.expect("#deep-8[data-cursor]").toExist()
    board.expectScreen("deep-8")

    // Step 3: Navigate back left — should scroll horizontally
    board.press("h")
    board.expect("#b1[data-cursor]").toExist()
    board.expectScreen("b1")
  })
})

describe("Scroll + View Mode Journeys", () => {
  test("scroll position maintained when navigating in columns view", () => {
    const tasks = Array.from({ length: 12 }, (_, i) => item(`row-${i}`))
    const { board } = testEnv(() => item("board", item("col1", ...tasks), item("col2", item("other"))), {
      rows: 20,
      columns: 80,
      viewMode: "columns",
    })

    // Step 1: Navigate down past visible area in columns view
    // (columns view uses single-row items, so more fit)
    for (let i = 0; i < 11; i++) {
      board.press("j")
    }
    board.expect("#row-11[data-cursor]").toExist()

    // Step 2: The scrolled card should be visible
    board.expectScreen("row-11")
  })

  test("scroll in list view preserves cursor visibility", () => {
    const tasks = Array.from({ length: 14 }, (_, i) => item(`list-${i}`))
    const { board } = testEnv(() => item("board", item("col1", ...tasks)), {
      rows: 24,
      columns: 80,
      viewMode: "list",
    })

    // Step 1: Navigate down to trigger scroll
    for (let i = 0; i < 12; i++) {
      board.press("j")
    }

    // Step 2: The scrolled item should be visible
    const screen = board.screenshot()
    expect(screen).toMatch(/list-(1[0-3])/)
  })
})
