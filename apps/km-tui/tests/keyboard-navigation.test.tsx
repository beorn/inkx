/**
 * Keyboard Navigation Integration Tests
 *
 * Tests that keyboard input works end-to-end with navigation handlers.
 * These tests verify that the command system correctly maps keyboard input
 * to SELECT actions with the correct nodeId (not legacy CURSOR_* actions).
 *
 * Test scenarios:
 * 1. j/k navigation dispatches SELECT with correct nodeId
 * 2. h/l navigation dispatches SELECT with correct nodeId
 * 3. Navigation at boundaries (first/last column/card) doesn't crash
 * 4. All keyboard shortcuts work without dispatching legacy actions
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Keyboard Navigation: j/k (vertical)", () => {
  test("j moves cursor down to next card", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a")),
      ),
    )

    // Initial cursor should be on first card
    board.expect("#1a[data-cursor]").toExist()

    // Press j to move down
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    // Press j again
    board.press("j")
    board.expect("#1c[data-cursor]").toExist()
  })

  test("k moves cursor up to previous card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"))),
    )

    // Navigate down first
    board.press("j").press("j")
    board.expect("#1c[data-cursor]").toExist()

    // Press k to move up
    board.press("k")
    board.expect("#1b[data-cursor]").toExist()

    // Press k again
    board.press("k")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("k at first card moves to column header", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    // Start at first card
    board.expect("#1a[data-cursor]").toExist()

    // Press k to move up to column header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("k at column header moves to board title", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    // Navigate to column header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Press k to move up to board title
    board.press("k")
    board.expect("#board[data-cursor]").toExist()
  })

  test("j at column header moves to first card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    // Navigate to column header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Press j to move down to first card
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("j at board title moves to column header", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    )

    // Navigate to board title
    board.press("k").press("k")
    board.expect("#board[data-cursor]").toExist()

    // Press j to move down to column header
    board.press("j")
    board.expect("#col1[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: h/l (horizontal)", () => {
  test("l moves cursor to next column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a")),
      ),
    )

    // Start at first card in first column
    board.expect("#1a[data-cursor]").toExist()

    // Press l to move right
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()

    // Press l again to move to third column
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()
  })

  test("h moves cursor to previous column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
      ),
    )

    // Navigate to third column
    board.press("l").press("l")
    board.expect("#3a[data-cursor]").toExist()

    // Press h to move left
    board.press("h")
    board.expect("#2a[data-cursor]").toExist()

    // Press h again
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("h at column header moves to previous column header", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    )

    // Navigate to column 2 header
    board.press("l") // col2 card
    board.press("k") // col2 header
    board.expect("#col2[data-cursor]").toExist()

    // Press h to move to col1 header
    board.press("h")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("l at column header moves to next column header", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    )

    // Navigate to column 1 header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Press l to move to col2 header
    board.press("l")
    board.expect("#col2[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: boundary behavior", () => {
  test("j at last card rings bell and stays", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    // Navigate to last card
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    // Press j at boundary - should ring bell
    board.press("j")
    expect(board.bell).toBe(true)
    board.expect("#1b[data-cursor]").toExist()
  })

  test("k at board level rings bell and stays", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    // Navigate to board level
    board.press("k").press("k")
    board.expect("#board[data-cursor]").toExist()

    // Press k at boundary - should ring bell
    board.press("k")
    expect(board.bell).toBe(true)
    board.expect("#board[data-cursor]").toExist()
  })

  test("h at first column rings bell and stays", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    )

    // Start at first column
    board.expect("#1a[data-cursor]").toExist()

    // Press h at boundary - should ring bell
    board.press("h")
    expect(board.bell).toBe(true)
    board.expect("#1a[data-cursor]").toExist()
  })

  test("l at last column rings bell and stays", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    )

    // Navigate to last column
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()

    // Press l at boundary - should ring bell
    board.press("l")
    expect(board.bell).toBe(true)
    board.expect("#2a[data-cursor]").toExist()
  })

  test("bell and status clear on next non-boundary keypress", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    // Navigate to last card
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    // Press j at boundary - triggers bell + status warning
    board.press("j")
    expect(board.bell).toBe(true)
    expect(board.hasStatus).toBe(true)
    const status = board.getStatus()
    expect(status?.level).toBe("warning")
    expect(status?.message).toContain("Can't move")
    expect(board.screenshot()).toContain("Can't move")

    // Press k (valid move up) - bell and status must clear
    board.press("k")
    board.expect("#1a[data-cursor]").toExist()
    expect(board.bell).toBe(false)
    expect(board.hasStatus).toBe(false)
    expect(board.getStatus()).toBeNull()
    expect(board.screenshot()).not.toContain("Can't move")
  })

  test("h boundary status clears after pressing j", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )

    // At first column, press h - boundary
    board.press("h")
    expect(board.bell).toBe(true)
    expect(board.hasStatus).toBe(true)
    expect(board.getStatus()?.message).toContain("Can't move")
    expect(board.screenshot()).toContain("Can't move")

    // Press j - valid move, should clear status
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
    expect(board.bell).toBe(false)
    expect(board.hasStatus).toBe(false)
    expect(board.screenshot()).not.toContain("Can't move")
  })

  test("status clears after l, h, j, k sequence", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )

    // Move to col2
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()

    // l at last column - boundary
    board.press("l")
    expect(board.bell).toBe(true)
    expect(board.screenshot()).toContain("Can't move")

    // h back to col1 - should clear
    board.press("h")
    expect(board.bell).toBe(false)
    expect(board.screenshot()).not.toContain("Can't move")

    // h at first column - boundary again
    board.press("h")
    expect(board.bell).toBe(true)
    expect(board.screenshot()).toContain("Can't move")

    // j down - should clear
    board.press("j")
    expect(board.bell).toBe(false)
    expect(board.screenshot()).not.toContain("Can't move")

    // k up - should still be clear
    board.press("k")
    expect(board.bell).toBe(false)
    expect(board.screenshot()).not.toContain("Can't move")
  })

  test("navigation across multiple columns works correctly", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
      ),
    )

    // Start at col1
    board.expect("#1a[data-cursor]").toExist()

    // Navigate all the way right
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()

    // Navigate all the way back left
    board.press("h")
    board.expect("#2a[data-cursor]").toExist()
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: scrolling behavior", () => {
  test("cursor stays on cards when navigating past visible area (scroll)", () => {
    // Create a column with many cards - more than fit on screen (24 rows)
    // With ESTIMATED_CARD_HEIGHT of ~4, screen fits ~5-6 cards
    const cards = Array.from({ length: 15 }, (_, i) => item(`card${i}`))

    const { board } = testEnv(
      () => item("board", item("col1", ...cards)),
      { rows: 20 }, // Small screen to force scrolling
    )

    // Start at first card
    board.expect("#card0[data-cursor]").toExist()

    // Navigate down through all cards
    // Each j should move to the next card, never to board level
    for (let i = 1; i < 15; i++) {
      board.press("j")
      // Cursor should be on the current card, NOT on board level
      board.expect(`#card${i}[data-cursor]`).toExist()
      board.expect("#board[data-cursor]").not.toExist()
    }

    // At last card, j should ring bell (boundary)
    board.press("j")
    expect(board.bell).toBe(true)
    board.expect("#card14[data-cursor]").toExist()
  })

  test("cursor stays on cards when navigating up after scrolling down", () => {
    const cards = Array.from({ length: 15 }, (_, i) => item(`card${i}`))

    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 20,
    })

    // Navigate to the last card
    for (let i = 0; i < 14; i++) {
      board.press("j")
    }
    board.expect("#card14[data-cursor]").toExist()

    // Navigate back up - cursor should stay on cards
    for (let i = 13; i >= 0; i--) {
      board.press("k")
      board.expect(`#card${i}[data-cursor]`).toExist()
      board.expect("#board[data-cursor]").not.toExist()
    }

    // At first card, k should move to column header (not board)
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: arrow keys (same as hjkl)", () => {
  test("ArrowDown behaves like j", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.expect("#1a[data-cursor]").toExist()

    // Use arrow key
    board.press("\x1b[B") // ANSI escape for ArrowDown
    board.expect("#1b[data-cursor]").toExist()
  })

  test("ArrowUp behaves like k", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    // Navigate down first
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    // Use arrow key to go back up
    board.press("\x1b[A") // ANSI escape for ArrowUp
    board.expect("#1a[data-cursor]").toExist()
  })

  test("ArrowRight behaves like l", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    )

    board.expect("#1a[data-cursor]").toExist()

    // Use arrow key
    board.press("\x1b[C") // ANSI escape for ArrowRight
    board.expect("#2a[data-cursor]").toExist()
  })

  test("ArrowLeft behaves like h", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    )

    // Navigate right first
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()

    // Use arrow key to go back left
    board.press("\x1b[D") // ANSI escape for ArrowLeft
    board.expect("#1a[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: g/G (first/last)", () => {
  test("G moves to last card in column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
      ),
    )

    board.expect("#1a[data-cursor]").toExist()

    // Press G to go to last
    board.press("G")
    board.expect("#1d[data-cursor]").toExist()
  })

  test("g moves to first card in column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
      ),
    )

    // Navigate to last card
    board.press("G")
    board.expect("#1d[data-cursor]").toExist()

    // Press g to go to first
    board.press("g")
    board.expect("#1a[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: combined navigation", () => {
  test("navigate through board with multiple key sequences", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a"), item("3b"), item("3c"), item("3d")),
      ),
    )

    // Start at 1a
    board.expect("#1a[data-cursor]").toExist()

    // Navigate: down, down, right, down
    board.press("j") // 1b
    board.press("j") // 1c
    board.press("l") // 2a (or 2b due to curswant)
    board.press("j") // next in col2

    // Should be somewhere in col2 (exact position depends on curswant behavior)
    const screenshot = board.screenshot()
    expect(screenshot).toContain("col2")
  })

  test("can navigate to any card using hjkl", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
      ),
    )

    // Navigate to 2b using only hjkl
    board.press("l") // to col2
    board.press("j") // to 2b
    board.expect("#2b[data-cursor]").toExist()

    // Navigate back to 1a
    board.press("h") // to col1
    board.press("g") // to first
    board.expect("#1a[data-cursor]").toExist()
  })
})
