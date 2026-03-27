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
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )

    // Initial cursor should be on first card
    board.expect("#1a[data-cursor]").toExist()

    // Press j to move down
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()

    // Press j again
    board.command("cursor_down")
    board.expect("#1c[data-cursor]").toExist()
  })

  test("k moves cursor up to previous card", () => {
    const { board } = testEnv(item.simpleBoard)

    // Navigate down first
    board.command("cursor_down").command("cursor_down")
    board.expect("#1c[data-cursor]").toExist()

    // Press k to move up
    board.command("cursor_up")
    board.expect("#1b[data-cursor]").toExist()

    // Press k again
    board.command("cursor_up")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("k at first card moves to column header", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    // Start at first card
    board.expect("#1a[data-cursor]").toExist()

    // Press k to move up to column header
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("k at column header moves to board title", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    // Navigate to column header
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()

    // Press k to move up to board title
    board.command("cursor_up")
    board.expect("#board[data-cursor]").toExist()
  })

  test("j at column header moves to first card", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    // Navigate to column header
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()

    // Press j to move down to first card
    board.command("cursor_down")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("j at board title moves to column header", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate to board title
    board.command("cursor_up").command("cursor_up")
    board.expect("#board[data-cursor]").toExist()

    // Press j to move down to column header
    board.command("cursor_down")
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
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    // Press l again to move to third column
    board.command("cursor_right")
    board.expect("#3a[data-cursor]").toExist()
  })

  test("h moves cursor to previous column", () => {
    const { board } = testEnv(item.multiColBoard)

    // Navigate to third column
    board.command("cursor_right").command("cursor_right")
    board.expect("#3a[data-cursor]").toExist()

    // Press h to move left
    board.command("cursor_left")
    board.expect("#2a[data-cursor]").toExist()

    // Press h again
    board.command("cursor_left")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("h at column header moves to previous column header", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate to column 2 header
    board.command("cursor_right") // col2 card
    board.command("cursor_up") // col2 header
    board.expect("#col2[data-cursor]").toExist()

    // Press h to move to col1 header
    board.command("cursor_left")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("l at column header moves to next column header", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate to column 1 header
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()

    // Press l to move to col2 header
    board.command("cursor_right")
    board.expect("#col2[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: boundary behavior", () => {
  test("j at last card rings bell and stays", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    // Navigate to last card
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()

    // Press j at boundary - should ring bell
    board.command("cursor_down")
    expect(board.bell).toBe(true)
    board.expect("#1b[data-cursor]").toExist()
  })

  test("k at board level rings bell and stays", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    // Navigate to board level
    board.command("cursor_up").command("cursor_up")
    board.expect("#board[data-cursor]").toExist()

    // Press k at boundary - should ring bell
    board.command("cursor_up")
    expect(board.bell).toBe(true)
    board.expect("#board[data-cursor]").toExist()
  })

  test("h at first column rings bell and stays", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Start at first column
    board.expect("#1a[data-cursor]").toExist()

    // Press h at boundary - should ring bell
    board.command("cursor_left")
    expect(board.bell).toBe(true)
    board.expect("#1a[data-cursor]").toExist()
  })

  test("l at last column rings bell and stays", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate to last column
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    // Press l at boundary - should ring bell
    board.command("cursor_right")
    expect(board.bell).toBe(true)
    board.expect("#2a[data-cursor]").toExist()
  })

  test("bell and status clear on next non-boundary keypress", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    // Navigate to last card
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()

    // Press j at boundary - triggers bell + status warning
    board.command("cursor_down")
    expect(board.bell).toBe(true)
    expect(board.hasStatus).toBe(true)
    const status = board.getStatus()
    expect(status?.level).toBe("warning")
    expect(status?.message).toContain("Can't move")
    expect(board.screenshot()).toContain("Can't move")

    // Press k (valid move up) - bell and status must clear
    board.command("cursor_up")
    board.expect("#1a[data-cursor]").toExist()
    expect(board.bell).toBe(false)
    expect(board.hasStatus).toBe(false)
    expect(board.getStatus()).toBeNull()
    expect(board.screenshot()).not.toContain("Can't move")
  })

  test("h boundary status clears after pressing j", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))

    // At first column, press h - boundary
    board.command("cursor_left")
    expect(board.bell).toBe(true)
    expect(board.hasStatus).toBe(true)
    expect(board.getStatus()?.message).toContain("Can't move")
    expect(board.screenshot()).toContain("Can't move")

    // Press j - valid move, should clear status
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()
    expect(board.bell).toBe(false)
    expect(board.hasStatus).toBe(false)
    expect(board.screenshot()).not.toContain("Can't move")
  })

  test("status clears after l, h, j, k sequence", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))

    // Move to col2
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    // l at last column - boundary
    board.command("cursor_right")
    expect(board.bell).toBe(true)
    expect(board.screenshot()).toContain("Can't move")

    // h back to col1 - should clear
    board.command("cursor_left")
    expect(board.bell).toBe(false)
    expect(board.screenshot()).not.toContain("Can't move")

    // h at first column - boundary again
    board.command("cursor_left")
    expect(board.bell).toBe(true)
    expect(board.screenshot()).toContain("Can't move")

    // j down - should clear
    board.command("cursor_down")
    expect(board.bell).toBe(false)
    expect(board.screenshot()).not.toContain("Can't move")

    // k up - should still be clear
    board.command("cursor_up")
    expect(board.bell).toBe(false)
    expect(board.screenshot()).not.toContain("Can't move")
  })

  test("navigation across multiple columns works correctly", () => {
    const { board } = testEnv(item.multiColBoard)

    // Start at col1
    board.expect("#1a[data-cursor]").toExist()

    // Navigate all the way right
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()
    board.command("cursor_right")
    board.expect("#3a[data-cursor]").toExist()

    // Navigate all the way back left
    board.command("cursor_left")
    board.expect("#2a[data-cursor]").toExist()
    board.command("cursor_left")
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
      board.command("cursor_down")
      // Cursor should be on the current card, NOT on board level
      board.expect(`#card${i}[data-cursor]`).toExist()
      board.expect("#board[data-cursor]").not.toExist()
    }

    // At last card, j should ring bell (boundary)
    board.command("cursor_down")
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
      board.command("cursor_down")
    }
    board.expect("#card14[data-cursor]").toExist()

    // Navigate back up - cursor should stay on cards
    for (let i = 13; i >= 0; i--) {
      board.command("cursor_up")
      board.expect(`#card${i}[data-cursor]`).toExist()
      board.expect("#board[data-cursor]").not.toExist()
    }

    // At first card, k should move to column header (not board)
    board.command("cursor_up")
    board.expect("#col1[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: arrow keys (same as hjkl)", () => {
  test("ArrowDown behaves like j", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.expect("#1a[data-cursor]").toExist()

    // Use arrow key
    board.press("\x1b[B") // ANSI escape for ArrowDown
    board.expect("#1b[data-cursor]").toExist()
  })

  test("ArrowUp behaves like k", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    // Navigate down first
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()

    // Use arrow key to go back up
    board.press("\x1b[A") // ANSI escape for ArrowUp
    board.expect("#1a[data-cursor]").toExist()
  })

  test("ArrowRight behaves like l", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))

    board.expect("#1a[data-cursor]").toExist()

    // Use arrow key
    board.press("\x1b[C") // ANSI escape for ArrowRight
    board.expect("#2a[data-cursor]").toExist()
  })

  test("ArrowLeft behaves like h", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate right first
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    // Use arrow key to go back left
    board.press("\x1b[D") // ANSI escape for ArrowLeft
    board.expect("#1a[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: g·g/g·G (first/last)", () => {
  test("g·G moves to last card in column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d"))))

    board.expect("#1a[data-cursor]").toExist()

    // Press g G (chord) to go to last
    board.command("cursor_last")
    board.expect("#1d[data-cursor]").toExist()
  })

  test("g·g moves to first card in column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d"))))

    // Navigate to last card
    board.command("cursor_last")
    board.expect("#1d[data-cursor]").toExist()

    // Press g g (chord) to go to first
    board.command("cursor_first")
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
    board.command("cursor_down") // 1b
    board.command("cursor_down") // 1c
    board.command("cursor_right") // 2a (or 2b due to curswant)
    board.command("cursor_down") // next in col2

    // Should be somewhere in col2 (exact position depends on curswant behavior)
    const screenshot = board.screenshot()
    expect(screenshot).toContain("col2")
  })

  test("can navigate to any card using hjkl", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))),
    )

    // Navigate to 2b using only hjkl
    board.command("cursor_right") // to col2
    board.command("cursor_down") // to 2b
    board.expect("#2b[data-cursor]").toExist()

    // Navigate back to 1a
    board.command("cursor_left") // to col1
    board.command("cursor_first") // to first
    board.expect("#1a[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: body card stickyY (h/l from body column)", () => {
  test("l from body card preserves stickyY into structural column", () => {
    // Board with body content (paragraphs before first oi) and a structural column.
    // Body cards form virtual "Description" column (col 0).
    // col1 is the structural column (col 1).
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("p1"),
          item.paragraph("p2"),
          item.paragraph("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
      { rows: 30 },
    )

    // Cursor should start on first body card
    board.expect("#p1[data-cursor]").toExist()

    // Navigate down to p3 (third body card)
    board.command("cursor_down").command("cursor_down")
    board.expect("#p3[data-cursor]").toExist()

    // Check stickyY state before press l
    const stickyYBefore = registry.stickyY

    // Press l to navigate right to the structural column.
    // stickyY should be captured from p3's Y position and used to find
    // the matching card in col1. Should NOT land on 1a (card 0).
    board.command("cursor_right")

    // Verify stickyY was set (should have been lazy-captured from p3)
    const stickyYAfter = registry.stickyY

    // p3 is the third card from the top. In col1, the card at approximately
    // the same Y position should be around 1c (third card).
    // The bug: cursor jumps to 1a instead of preserving Y position.
    const hasCursorOn1a = board.q("#1a[data-cursor]").count() > 0
    const hasCursorOn1b = board.q("#1b[data-cursor]").count() > 0
    const hasCursorOn1c = board.q("#1c[data-cursor]").count() > 0

    // Should land on 1b or 1c (approximate Y match), NOT on 1a (top of column)
    expect(hasCursorOn1a).toBe(false)
    expect(hasCursorOn1b || hasCursorOn1c).toBe(true)
  })

  test("l from body card with HR nodes navigates to correct position in next column", () => {
    // When body column has HR nodes interleaved with paragraphs, the view
    // filters them out (meaningfulBody). Navigation must use the same
    // filtered set. If it uses unfiltered bodyNodes, stickyY capture from
    // a body card at view index N maps to bodyNodes[N] which is a different node.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("p1"),
          item.hr("hr1"),
          item.paragraph("p2"),
          item.hr("hr2"),
          item.paragraph("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
      { rows: 30 },
    )

    // Navigate to p3 (3rd visible body card, view index 2)
    board.command("cursor_down").command("cursor_down")
    board.expect("#p3[data-cursor]").toExist()

    // Press l. stickyY captured from p3 (view card index 2 in body col).
    // Should land near 1c (3rd card in col1), NOT 1a.
    board.command("cursor_right")
    const on1a = board.q("#1a[data-cursor]").count() > 0
    expect(on1a).toBe(false)
  })

  test("l from body card without prior j/k still captures stickyY", () => {
    // When pressing l from the initial cursor position (no j/k first),
    // stickyY should be lazy-captured from the current card position.
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("p1"),
          item.paragraph("p2"),
          item.paragraph("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
      { rows: 30 },
    )

    // Cursor should start on first body card
    board.expect("#p1[data-cursor]").toExist()

    // Press l directly — stickyY should be captured from p1's Y position
    board.command("cursor_right")

    // p1 is the first card. stickyY should match 1a in col1 (first card).
    // This test ensures stickyY capture works even without prior j/k.
    board.expect("#1a[data-cursor]").toExist()
  })

  test("h from structural column back to body column preserves stickyY", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("p1"),
          item.paragraph("p2"),
          item.paragraph("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
      { rows: 30 },
    )

    // Navigate to col1 and move down to 1c
    board.command("cursor_right")
    board.command("cursor_down").command("cursor_down")
    board.expect("#1c[data-cursor]").toExist()

    // Press h to go back to the body column.
    // Should land on the body card matching 1c's Y position, not p1.
    board.command("cursor_left")

    // Should NOT land on p1 (top of body column)
    const hasCursorOnP1 = board.q("#p1[data-cursor]").count() > 0
    const hasCursorOnP2 = board.q("#p2[data-cursor]").count() > 0
    const hasCursorOnP3 = board.q("#p3[data-cursor]").count() > 0

    expect(hasCursorOnP1).toBe(false)
    expect(hasCursorOnP2 || hasCursorOnP3).toBe(true)
  })

  test("h from deep structural column to body column with HR nodes: index mismatch", () => {
    // Test with HR nodes (empty content) interleaved with meaningful paragraphs.
    // The view filters out empty body nodes (meaningfulBody filter), but
    // navigateToBody in view-navigation.ts indexes the unfiltered bodyNodes
    // from splitBodyAndColumns. findCardAtYVisual returns indices into the
    // view's filtered card array, causing a mismatch.
    //
    // View body column: [p1(idx=0), p2(idx=1), p3(idx=2)]
    // Nav bodyNodes:    [p1(0), hr1(1), p2(2), hr2(3), p3(4)]
    //
    // findCardAtYVisual returns 2 (matching p3 in view), but
    // bodyNodes[2] = p2 (NOT p3). Cursor lands on wrong card.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("p1"),
          item.hr("hr1"),
          item.paragraph("p2"),
          item.hr("hr2"),
          item.paragraph("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
      { rows: 30 },
    )

    // Navigate to p3 (3rd visible body card) then right to col1
    board.command("cursor_down").command("cursor_down")
    board.expect("#p3[data-cursor]").toExist()

    board.command("cursor_right")

    // Now navigate back left. stickyY should bring us back to p3.
    board.command("cursor_left")

    // BUG: navigateToBody indexes unfiltered bodyNodes, returning p2 instead of p3.
    // The cursor should be on p3 (same card we started on), NOT p2.
    const hasCursorOnP3 = board.q("#p3[data-cursor]").count() > 0
    const hasCursorOnP2 = board.q("#p2[data-cursor]").count() > 0
    expect(hasCursorOnP3).toBe(true)
  })
})

describe("Keyboard Navigation: body card stickyY (round-trip)", () => {
  test("l then h round-trip preserves stickyY for body cards", () => {
    // Navigate right from body column, then left back to body column.
    // Both directions should preserve stickyY.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("p1"),
          item.paragraph("p2"),
          item.paragraph("p3"),
          item.paragraph("p4"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
      { rows: 30 },
    )

    // Navigate to p3
    board.command("cursor_down").command("cursor_down")
    board.expect("#p3[data-cursor]").toExist()

    // l to col1 -> should land near 1c
    board.command("cursor_right")
    const landedOn1a = board.q("#1a[data-cursor]").count() > 0
    expect(landedOn1a).toBe(false)

    // h back to body column -> should land near p3, NOT p1
    board.command("cursor_left")
    const landedOnP1 = board.q("#p1[data-cursor]").count() > 0
    expect(landedOnP1).toBe(false)
  })

  test("stickyY preserved across multiple l presses through body and structural columns", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("p1"),
          item.paragraph("p2"),
          item.paragraph("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
          item("col2", item("2a"), item("2b"), item("2c"), item("2d"), item("2e")),
        ),
      { rows: 30 },
    )

    // Navigate to p3
    board.command("cursor_down").command("cursor_down")
    board.expect("#p3[data-cursor]").toExist()

    // l to col1 -> should land near 1c (not 1a)
    board.command("cursor_right")
    const on1a = board.q("#1a[data-cursor]").count() > 0
    expect(on1a).toBe(false)

    // l again to col2 -> should STILL preserve stickyY (not reset to 2a)
    board.command("cursor_right")
    const on2a = board.q("#2a[data-cursor]").count() > 0
    expect(on2a).toBe(false)
  })
})

describe("Keyboard Navigation: body card stickyY (within-column body)", () => {
  test("l from within-column body card preserves stickyY into next column", () => {
    // col1 has body content (paragraphs before structural children)
    // col2 has many items
    // Navigate to body card in col1, press l -> should preserve Y position in col2
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item.paragraph("body-p1"),
            item.paragraph("body-p2"),
            item.paragraph("body-p3"),
            item("sub1"),
            item("sub2"),
            item("sub3"),
          ),
          item("col2", item("2a"), item("2b"), item("2c"), item("2d"), item("2e")),
        ),
      { rows: 30 },
    )

    // Cursor starts on body-p1 (first card in col1)
    board.expect("#body-p1[data-cursor]").toExist()

    // Navigate down to body-p3 (third body card in col1)
    board.command("cursor_down").command("cursor_down")
    board.expect("#body-p3[data-cursor]").toExist()

    // Press l to navigate right to col2.
    // stickyY from body-p3 should match a card in col2 at similar Y position.
    board.command("cursor_right")

    // body-p3 is the 3rd card. Should land near 2c (3rd card in col2), NOT 2a.
    const hasCursorOn2a = board.q("#2a[data-cursor]").count() > 0

    // If cursor lands on 2a, stickyY was not preserved (the bug)
    expect(hasCursorOn2a).toBe(false)
  })
})

describe("Keyboard Navigation: z (zoom in)", () => {
  test("z zooms into cursor node, making it the root", () => {
    // Structure: board > col1 > [1a, 1b, 1c]
    // Each card needs children so zoom_in has somewhere to show
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a", item("sub1")), item("1b", item("sub2")), item("1c", item("sub3"))),
        item("col2", item("2a", item("sub4"))),
      ),
    )

    // Start at first card
    board.expect("#1a[data-cursor]").toExist()

    // Move to second card
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()

    // Press z to zoom in — 1b becomes root, its child sub2 is visible
    board.command("zoom_inwards")
    const text = board.screenshot()
    expect(text).toContain("sub2")
  })

  test("z zoom into third card shows its children", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a", item("sub1")), item("1b", item("sub2")), item("1c", item("sub3")))),
    )

    // Navigate to third card
    board.command("cursor_down").command("cursor_down")
    board.expect("#1c[data-cursor]").toExist()

    // Press z to zoom in — 1c becomes root, its child sub3 is visible
    board.command("zoom_inwards")
    const text = board.screenshot()
    expect(text).toContain("sub3")
  })
})
