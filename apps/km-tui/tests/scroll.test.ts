/**
 * Scroll and horizontal scroll tests
 *
 * Consolidated from:
 * - scroll-follow.test.ts (scroll follows cursor)
 * - hscroll-asymmetric.test.ts (km-qlib7: symmetric horizontal scroll)
 * - hscroll-partial.test.ts (km-tui.hscroll-partial: partial column visibility)
 * - horiz-scroll-indicator.test.ts (horizontal scroll indicators)
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"

describe("Scroll Follow", () => {
  // Create a board with enough items to require scrolling on a 24-row terminal
  function createLargeBoard() {
    const inboxItems = []
    for (let i = 0; i < 20; i++) {
      inboxItems.push(item("Task " + (i + 1)))
    }
    const inbox = item("inbox", ...inboxItems)

    const projectItems = []
    for (let i = 0; i < 15; i++) {
      projectItems.push(item("Project " + (i + 1)))
    }
    const projects = item("projects", ...projectItems)

    return item.root("board", inbox, projects)
  }

  test("list view scroll follows cursor past bottom", () => {
    const { board } = testEnv(createLargeBoard, {
      rows: 24,
      columns: 80,
      viewMode: "list",
    })

    // Navigate down past visible area
    for (let i = 0; i < 18; i++) {
      board.press("j")
    }

    const screenshot = board.screenshot()

    // Should see Task 15-20 range (scroll followed cursor)
    expect(screenshot).toMatch(/Task (1[5-9]|20)/)
  })

  test("cards view scroll follows cursor past bottom", () => {
    const { board } = testEnv(createLargeBoard, {
      rows: 24,
      columns: 80,
      viewMode: "cards",
    })

    // Navigate into first column then down
    board.press("j") // to column header
    board.press("j") // to first card

    // Navigate down past visible area
    for (let i = 0; i < 18; i++) {
      board.press("j")
    }

    const screenshot = board.screenshot()

    // Should see higher numbered tasks (scroll followed)
    expect(screenshot).toMatch(/Task (1[5-9]|20)/)
  })

  test("columns view scroll follows cursor past bottom", () => {
    const { board } = testEnv(createLargeBoard, {
      rows: 24,
      columns: 80,
      viewMode: "columns",
    })

    // Navigate into first column
    board.press("j") // to column header
    board.press("j") // to first card

    // Navigate down past visible area
    for (let i = 0; i < 18; i++) {
      board.press("j")
    }

    const screenshot = board.screenshot()

    // Should see higher numbered tasks (scroll followed)
    // The breadcrumb should show the current item
    expect(screenshot).toMatch(/Task (1[5-9]|20)/)
  })
})

describe("km-qlib7: asymmetric horizontal scroll", () => {
  test("navigating left restores viewport symmetrically", () => {
    // 4 columns in 80-wide terminal: only 2 columns visible at once
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1")),
          item("col2", item("B1")),
          item("col3", item("C1")),
          item("col4", item("D1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Start at col1's first card (A1)
    board.expect("#A1[data-cursor]").toExist()

    // col1 and col2 should be visible initially
    const col1Initial = board.q("#col1").boundingBox()
    const col2Initial = board.q("#col2").boundingBox()
    expect(col1Initial).not.toBeNull()
    expect(col2Initial).not.toBeNull()

    // Press l -> col2
    board.press("l")
    board.expect("#B1[data-cursor]").toExist()
    // col1 and col2 still visible (no scroll needed)
    expect(board.q("#col1").boundingBox()).not.toBeNull()
    expect(board.q("#col2").boundingBox()).not.toBeNull()

    // Press l -> col3 (scrolls right, viewport shows col2+col3)
    board.press("l")
    board.expect("#C1[data-cursor]").toExist()
    // col3 should be visible now
    expect(board.q("#col3").boundingBox()).not.toBeNull()

    // Press h -> col2 (BUG: viewport stays at col2+col3 instead of scrolling back to col1+col2)
    board.press("h")
    board.expect("#B1[data-cursor]").toExist()

    // col1 should be visible again after scrolling back
    // This is the assertion that fails — viewport doesn't scroll back
    const col1After = board.q("#col1").boundingBox()
    expect(col1After, "col1 should be visible after navigating back to col2").not.toBeNull()
  })

  test("back-and-forth navigation maintains symmetric scroll positions", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1")),
          item("col2", item("B1")),
          item("col3", item("C1")),
          item("col4", item("D1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Navigate right: col1 -> col2 -> col3
    board.press("l").press("l")
    board.expect("#C1[data-cursor]").toExist()

    // Navigate left: col3 -> col2 -> col1
    board.press("h").press("h")
    board.expect("#A1[data-cursor]").toExist()

    // col1 must be visible (we're on it!)
    const col1Box = board.q("#col1").boundingBox()
    expect(col1Box, "col1 must be visible when cursor is on col1").not.toBeNull()

    // Navigate right again: col1 -> col2
    board.press("l")
    board.expect("#B1[data-cursor]").toExist()

    // Both col1 and col2 should be visible (same as initial state)
    expect(board.q("#col1").boundingBox(), "col1 visible with cursor on col2").not.toBeNull()
    expect(board.q("#col2").boundingBox(), "col2 visible with cursor on col2").not.toBeNull()
  })
})

describe("km-tui.hscroll-partial: partial column visibility triggers scroll", () => {
  // Test at widths where maxCols >= 2 (columns narrower than viewport).
  // Widths 60, 65 have maxCols=1 and column width > viewport — a separate issue.
  for (const width of [73, 75, 77, 85]) {
    test(`width=${width}: cursor column is fully visible after navigating right`, () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("A1")),
            item("col2", item("B1")),
            item("col3", item("C1")),
          ),
        { columns: width, rows: 20 },
      )

      // Start at col1's first card
      board.expect("#A1[data-cursor]").toExist()

      // Navigate right to col2
      board.press("l")
      board.expect("#B1[data-cursor]").toExist()

      // Navigate right to col3
      board.press("l")
      board.expect("#C1[data-cursor]").toExist()

      // col3 must be fully visible — its bounding box right edge must be
      // within the terminal viewport width
      const col3Box = board.q("#col3").boundingBox()
      expect(col3Box, `col3 should be rendered at width=${width}`).not.toBeNull()
      if (col3Box) {
        expect(
          col3Box.x + col3Box.width,
          `col3 right edge (${col3Box.x + col3Box.width}) should be <= viewport width (${width}) at width=${width}`,
        ).toBeLessThanOrEqual(width)
      }
    })
  }

  test("navigating to last column and back preserves full visibility", () => {
    // Use width=73 (a known failing width before the fix)
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1")),
          item("col2", item("B1")),
          item("col3", item("C1")),
        ),
      { columns: 73, rows: 20 },
    )

    // Navigate right twice to col3
    board.press("l").press("l")
    board.expect("#C1[data-cursor]").toExist()

    // col3 must be fully visible
    const col3Box = board.q("#col3").boundingBox()
    expect(col3Box).not.toBeNull()
    if (col3Box) {
      expect(col3Box.x + col3Box.width).toBeLessThanOrEqual(73)
    }

    // Navigate back to col2
    board.press("h")
    board.expect("#B1[data-cursor]").toExist()

    // col2 must be fully visible
    const col2Box = board.q("#col2").boundingBox()
    expect(col2Box).not.toBeNull()
    if (col2Box) {
      expect(col2Box.x + col2Box.width).toBeLessThanOrEqual(73)
    }
  })

  test("widths where column fits: scroll ensures full visibility at various sizes", () => {
    // Broader range of widths where columns should be narrower than viewport
    for (const width of [70, 72, 74, 76, 78, 80, 90, 100, 120]) {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("A1")),
            item("col2", item("B1")),
            item("col3", item("C1")),
          ),
        { columns: width, rows: 20 },
      )

      board.press("l").press("l")
      board.expect("#C1[data-cursor]").toExist()

      const col3Box = board.q("#col3").boundingBox()
      expect(col3Box, `col3 should be rendered at width=${width}`).not.toBeNull()
      if (col3Box) {
        expect(
          col3Box.x + col3Box.width,
          `col3 right edge at width=${width}`,
        ).toBeLessThanOrEqual(width)
      }
    }
  })
})

describe("Horizontal scroll indicators", () => {
  test("shows right scroll indicator when more columns exist to the right", () => {
    const nodes = item.root(
      "board",
      item("col1", item("t1")),
      item("col2", item("t2")),
      item("col3", item("t3")),
      item("col4", item("t4")),
      item("col5", item("t5")),
      item("col6", item("t6")),
    )
    // Width 80 => maxCols = floor(80/35) = 2. 6 columns > 2 => right indicator
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board", {
      columns: 80,
      rows: 20,
    })
    // Check DOM for the indicator component
    const rightIndicator = driver.locator('[data-scroll-indicator="right"]')
    expect(rightIndicator.count()).toBe(1)
    // Check that the arrow character appears somewhere
    expect(rightIndicator.textContent()).toContain("▸")
  })

  test("shows left arrow after scrolling right", async () => {
    const nodes = item.root(
      "board",
      item("col1", item("t1")),
      item("col2", item("t2")),
      item("col3", item("t3")),
      item("col4", item("t4")),
      item("col5", item("t5")),
      item("col6", item("t6")),
    )
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board", {
      columns: 80,
      rows: 20,
    })

    // Navigate right past visible columns to trigger scroll
    await driver.press("l") // col 1
    await driver.press("l") // col 2 - should trigger scroll
    await driver.press("l") // col 3 - definitely scrolled

    const ansi = driver.ansi
    const text = driver.text
    const hasArrowInAnsi = ansi.includes("◂")
    const hasArrowInText = text.includes("◂")
    expect(hasArrowInAnsi || hasArrowInText).toBe(true)
  })

  test("no indicators when all columns fit", () => {
    const nodes = item.root("board", item("col1", item("t1")), item("col2", item("t2")))
    // Width 80 => maxCols = 2. 2 columns = 2 => no overflow
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board", {
      columns: 80,
      rows: 20,
    })
    const screen = driver.text
    expect(screen).not.toContain("◂")
    expect(screen).not.toContain("▸")
  })
})
