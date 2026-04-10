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
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("Keyboard Navigation: j/k (vertical)", () => {
  test("j moves cursor down to next card", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))))

    // Initial cursor should be on first card
    app.expect("#1a[data-cursor]").toExist()

    // Press j to move down
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    // Press j again
    app.command("cursor_down")
    app.expect("#1c[data-cursor]").toExist()
  })

  test("k moves cursor up to previous card", () => {
    using app = createTestApp(item.simpleBoard())

    // Navigate down first
    app.command("cursor_down").command("cursor_down")
    app.expect("#1c[data-cursor]").toExist()

    // Press k to move up
    app.command("cursor_up")
    app.expect("#1b[data-cursor]").toExist()

    // Press k again
    app.command("cursor_up")
    app.expect("#1a[data-cursor]").toExist()
  })

  test("k at first card moves to column header", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

    // Start at first card
    app.expect("#1a[data-cursor]").toExist()

    // Press k to move up to column header
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()
  })

  test("k at column header moves to board title", () => {
    using app = createTestApp(item("board", item("col1", item("1a"))))

    // Navigate to column header
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    // Press k to move up to board title
    app.command("cursor_up")
    app.expect("#board[data-cursor]").toExist()
  })

  test("j at column header moves to first card", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

    // Navigate to column header
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    // Press j to move down to first card
    app.command("cursor_down")
    app.expect("#1a[data-cursor]").toExist()
  })

  test("j at board title moves to column header", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate to board title
    app.command("cursor_up").command("cursor_up")
    app.expect("#board[data-cursor]").toExist()

    // Press j to move down to column header
    app.command("cursor_down")
    app.expect("#col1[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: h/l (horizontal)", () => {
  test("l moves cursor to next column", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a")),
      ),
    )

    // Start at first card in first column
    app.expect("#1a[data-cursor]").toExist()

    // Press l to move right
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Press l again to move to third column
    app.command("cursor_right")
    app.expect("#3a[data-cursor]").toExist()
  })

  test("h moves cursor to previous column", () => {
    using app = createTestApp(item.multiColBoard())

    // Navigate to third column
    app.command("cursor_right").command("cursor_right")
    app.expect("#3a[data-cursor]").toExist()

    // Press h to move left
    app.command("cursor_left")
    app.expect("#2a[data-cursor]").toExist()

    // Press h again
    app.command("cursor_left")
    app.expect("#1a[data-cursor]").toExist()
  })

  test("h at column header moves to previous column header", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate to column 2 header
    app.command("cursor_right") // col2 card
    app.command("cursor_up") // col2 header
    app.expect("#col2[data-cursor]").toExist()

    // Press h to move to col1 header
    app.command("cursor_left")
    app.expect("#col1[data-cursor]").toExist()
  })

  test("l at column header moves to next column header", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate to column 1 header
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    // Press l to move to col2 header
    app.command("cursor_right")
    app.expect("#col2[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: boundary behavior", () => {
  test("j at last card rings bell and stays", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

    // Navigate to last card
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    // Press j at boundary - should ring bell
    app.command("cursor_down")
    expect(app.bell).toBe(true)
    app.expect("#1b[data-cursor]").toExist()
  })

  test("k at board level rings bell and stays", () => {
    using app = createTestApp(item("board", item("col1", item("1a"))))

    // Navigate to board level
    app.command("cursor_up").command("cursor_up")
    app.expect("#board[data-cursor]").toExist()

    // Press k at boundary - should ring bell
    app.command("cursor_up")
    expect(app.bell).toBe(true)
    app.expect("#board[data-cursor]").toExist()
  })

  test("h at first column card goes to header, then boundary rings bell", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Start at first column
    app.expect("#1a[data-cursor]").toExist()

    // Press h at first card goes to column header (not boundary)
    app.command("cursor_left")
    expect(app.bell).toBe(false)
    app.expect("#col1[data-cursor]").toExist()

    // Press h at column header is boundary
    app.command("cursor_left")
    expect(app.bell).toBe(true)
    app.expect("#col1[data-cursor]").toExist()
  })

  test("l at last column rings bell and stays", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate to last column
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Press l at boundary - should ring bell
    app.command("cursor_right")
    expect(app.bell).toBe(true)
    app.expect("#2a[data-cursor]").toExist()
  })

  test("bell and status clear on next non-boundary keypress", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

    // Navigate to last card
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    // Press j at boundary - triggers bell + status warning
    app.command("cursor_down")
    expect(app.bell).toBe(true)
    expect(app.hasStatus).toBe(true)
    const status = app.getStatus()
    expect(status?.level).toBe("warning")
    expect(status?.message).toContain("Can't move")
    app.expectScreen("Can't move")

    // Press k (valid move up) - bell and status must clear
    app.command("cursor_up")
    app.expect("#1a[data-cursor]").toExist()
    expect(app.bell).toBe(false)
    expect(app.hasStatus).toBe(false)
    expect(app.getStatus()).toBeNull()
    app.expectScreenNot("Can't move")
  })

  test("h boundary status clears after pressing j", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))

    // At first column card, h goes to column header first
    app.command("cursor_left") // 1a → col1
    expect(app.bell).toBe(false)

    // h at column header is boundary
    app.command("cursor_left")
    expect(app.bell).toBe(true)
    expect(app.hasStatus).toBe(true)
    expect(app.getStatus()?.message).toContain("Can't move")
    app.expectScreen("Can't move")

    // Press j - valid move, should clear status
    app.command("cursor_down")
    app.expect("#1a[data-cursor]").toExist()
    expect(app.bell).toBe(false)
    expect(app.hasStatus).toBe(false)
    app.expectScreenNot("Can't move")
  })

  test("status clears after l, h, j, k sequence", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))

    // Move to col2
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // l at last column - boundary
    app.command("cursor_right")
    expect(app.bell).toBe(true)
    app.expectScreen("Can't move")

    // h back to col1 - should clear
    app.command("cursor_left")
    expect(app.bell).toBe(false)
    app.expectScreenNot("Can't move")

    // h at first column card goes to column header
    app.command("cursor_left") // 1a → col1
    expect(app.bell).toBe(false)

    // h at column header is boundary
    app.command("cursor_left")
    expect(app.bell).toBe(true)
    app.expectScreen("Can't move")

    // j down - should clear
    app.command("cursor_down")
    expect(app.bell).toBe(false)
    app.expectScreenNot("Can't move")

    // k up - should still be clear
    app.command("cursor_up")
    expect(app.bell).toBe(false)
    app.expectScreenNot("Can't move")
  })

  test("navigation across multiple columns works correctly", () => {
    using app = createTestApp(item.multiColBoard())

    // Start at col1
    app.expect("#1a[data-cursor]").toExist()

    // Navigate all the way right
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()
    app.command("cursor_right")
    app.expect("#3a[data-cursor]").toExist()

    // Navigate all the way back left
    app.command("cursor_left")
    app.expect("#2a[data-cursor]").toExist()
    app.command("cursor_left")
    app.expect("#1a[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: scrolling behavior", () => {
  test("cursor stays on cards when navigating past visible area (scroll)", () => {
    // Create a column with many cards - more than fit on screen (24 rows)
    // With ESTIMATED_CARD_HEIGHT of ~4, screen fits ~5-6 cards
    const cards = Array.from({ length: 15 }, (_, i) => item(`card${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), { rows: 20 })

    // Start at first card
    app.expect("#card0[data-cursor]").toExist()

    // Navigate down through all cards
    // Each j should move to the next card, never to board level
    for (let i = 1; i < 15; i++) {
      app.command("cursor_down")
      // Cursor should be on the current card, NOT on board level
      app.expect(`#card${i}[data-cursor]`).toExist()
      app.expect("#board[data-cursor]").not.toExist()
    }

    // At last card, j should ring bell (boundary)
    app.command("cursor_down")
    expect(app.bell).toBe(true)
    app.expect("#card14[data-cursor]").toExist()
  })

  test("cursor stays on cards when navigating up after scrolling down", () => {
    const cards = Array.from({ length: 15 }, (_, i) => item(`card${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), { rows: 20 })

    // Navigate to the last card
    for (let i = 0; i < 14; i++) {
      app.command("cursor_down")
    }
    app.expect("#card14[data-cursor]").toExist()

    // Navigate back up - cursor should stay on cards
    for (let i = 13; i >= 0; i--) {
      app.command("cursor_up")
      app.expect(`#card${i}[data-cursor]`).toExist()
      app.expect("#board[data-cursor]").not.toExist()
    }

    // At first card, k should move to column header (not board)
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: arrow keys (same as hjkl)", () => {
  test("ArrowDown behaves like j", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

    app.expect("#1a[data-cursor]").toExist()

    // Use arrow key
    app.press("\x1b[B") // ANSI escape for ArrowDown
    app.expect("#1b[data-cursor]").toExist()
  })

  test("ArrowUp behaves like k", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

    // Navigate down first
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    // Use arrow key to go back up
    app.press("\x1b[A") // ANSI escape for ArrowUp
    app.expect("#1a[data-cursor]").toExist()
  })

  test("ArrowRight behaves like l", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

    app.expect("#1a[data-cursor]").toExist()

    // Use arrow key
    app.press("\x1b[C") // ANSI escape for ArrowRight
    app.expect("#2a[data-cursor]").toExist()
  })

  test("ArrowLeft behaves like h", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate right first
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Use arrow key to go back left
    app.press("\x1b[D") // ANSI escape for ArrowLeft
    app.expect("#1a[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: g·g/g·G (first/last)", () => {
  test("g·G moves to last card in column", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d"))))

    app.expect("#1a[data-cursor]").toExist()

    // Press g G (chord) to go to last
    app.command("cursor_last")
    app.expect("#1d[data-cursor]").toExist()
  })

  test("g·g moves to first card in column", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d"))))

    // Navigate to last card
    app.command("cursor_last")
    app.expect("#1d[data-cursor]").toExist()

    // Press g g (chord) to go to first
    app.command("cursor_first")
    app.expect("#1a[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: combined navigation", () => {
  test("navigate through board with multiple key sequences", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a"), item("3b"), item("3c"), item("3d")),
      ),
    )

    // Start at 1a
    app.expect("#1a[data-cursor]").toExist()

    // Navigate: down, down, right, down
    app.command("cursor_down") // 1b
    app.command("cursor_down") // 1c
    app.command("cursor_right") // 2a (or 2b due to curswant)
    app.command("cursor_down") // next in col2

    // Should be somewhere in col2 (exact position depends on curswant behavior)
    app.expectScreen("col2")
  })

  test("can navigate to any card using hjkl", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))))

    // Navigate to 2b using only hjkl
    app.command("cursor_right") // to col2
    app.command("cursor_down") // to 2b
    app.expect("#2b[data-cursor]").toExist()

    // Navigate back to 1a
    app.command("cursor_left") // to col1
    app.command("cursor_first") // to first
    app.expect("#1a[data-cursor]").toExist()
  })
})

describe("Keyboard Navigation: body card stickyY (h/l from body column)", () => {
  test("l from body card preserves stickyY into structural column", () => {
    // Board with body content (paragraphs before first oi) and a structural column.
    // Body cards form virtual "Description" column (col 0).
    // col1 is the structural column (col 1).
    using app = createTestApp(
      item(
        "board",
        item.p("p1"),
        item.p("p2"),
        item.p("p3"),
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
      ),
      { rows: 30 },
    )

    // Cursor should start on first body card
    app.expect("#p1[data-cursor]").toExist()

    // Navigate down to p3 (third body card)
    app.command("cursor_down").command("cursor_down")
    app.expect("#p3[data-cursor]").toExist()

    // Press l to navigate right to the structural column.
    // stickyY should be captured from p3's Y position and used to find
    // the matching card in col1. Should NOT land on 1a (card 0).
    app.command("cursor_right")

    // p3 is the third card from the top. In col1, the card at approximately
    // the same Y position should be around 1c (third card).
    // The bug: cursor jumps to 1a instead of preserving Y position.
    const hasCursorOn1a = app.q("#1a[data-cursor]").count() > 0
    const hasCursorOn1b = app.q("#1b[data-cursor]").count() > 0
    const hasCursorOn1c = app.q("#1c[data-cursor]").count() > 0

    // Should land on 1b or 1c (approximate Y match), NOT on 1a (top of column)
    expect(hasCursorOn1a).toBe(false)
    expect(hasCursorOn1b || hasCursorOn1c).toBe(true)
  })

  test("l from body card with HR nodes navigates to correct position in next column", () => {
    // When body column has HR nodes interleaved with paragraphs, the view
    // filters them out (meaningfulBody). Navigation must use the same
    // filtered set. If it uses unfiltered bodyNodes, stickyY capture from
    // a body card at view index N maps to bodyNodes[N] which is a different node.
    using app = createTestApp(
      item(
        "board",
        item.p("p1"),
        item.hr("hr1"),
        item.p("p2"),
        item.hr("hr2"),
        item.p("p3"),
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
      ),
      { rows: 30 },
    )

    // Navigate to p3 (3rd visible body card, view index 2)
    app.command("cursor_down").command("cursor_down")
    app.expect("#p3[data-cursor]").toExist()

    // Press l. stickyY captured from p3 (view card index 2 in body col).
    // Should land near 1c (3rd card in col1), NOT 1a.
    app.command("cursor_right")
    const on1a = app.q("#1a[data-cursor]").count() > 0
    expect(on1a).toBe(false)
  })

  test("l from body card without prior j/k still captures stickyY", () => {
    // When pressing l from the initial cursor position (no j/k first),
    // stickyY should be lazy-captured from the current card position.
    using app = createTestApp(
      item(
        "board",
        item.p("p1"),
        item.p("p2"),
        item.p("p3"),
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
      ),
      { rows: 30 },
    )

    // Cursor should start on first body card
    app.expect("#p1[data-cursor]").toExist()

    // Press l directly — stickyY should be captured from p1's Y position
    app.command("cursor_right")

    // p1 is the first card. stickyY should match 1a in col1 (first card).
    // This test ensures stickyY capture works even without prior j/k.
    app.expect("#1a[data-cursor]").toExist()
  })

  test("h from structural column back to body column preserves stickyY", () => {
    using app = createTestApp(
      item(
        "board",
        item.p("p1"),
        item.p("p2"),
        item.p("p3"),
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
      ),
      { rows: 30 },
    )

    // Navigate to col1 and move down to 1c
    app.command("cursor_right")
    app.command("cursor_down").command("cursor_down")
    app.expect("#1c[data-cursor]").toExist()

    // Press h to go back to the body column.
    // Should land on the body card matching 1c's Y position, not p1.
    app.command("cursor_left")

    // Should NOT land on p1 (top of body column)
    const hasCursorOnP1 = app.q("#p1[data-cursor]").count() > 0
    const hasCursorOnP2 = app.q("#p2[data-cursor]").count() > 0
    const hasCursorOnP3 = app.q("#p3[data-cursor]").count() > 0

    expect(hasCursorOnP1).toBe(false)
    expect(hasCursorOnP2 || hasCursorOnP3).toBe(true)
  })

  test("h from deep structural column to body column with HR nodes: index mismatch", () => {
    // Test with HR nodes (empty content) interleaved with meaningful paragraphs.
    // The view filters out empty body nodes (meaningfulBody filter).
    // ViewNode navigation uses the filtered tree directly, so
    // findCardAtYVisual indices match the visible card array.
    //
    // View body column: [p1(idx=0), p2(idx=1), p3(idx=2)]
    // Nav bodyNodes:    [p1(0), hr1(1), p2(2), hr2(3), p3(4)]
    //
    // findCardAtYVisual returns 2 (matching p3 in view), but
    // bodyNodes[2] = p2 (NOT p3). Cursor lands on wrong card.
    using app = createTestApp(
      item(
        "board",
        item.p("p1"),
        item.hr("hr1"),
        item.p("p2"),
        item.hr("hr2"),
        item.p("p3"),
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
      ),
      { rows: 30 },
    )

    // Navigate to p3 (3rd visible body card) then right to col1
    app.command("cursor_down").command("cursor_down")
    app.expect("#p3[data-cursor]").toExist()

    app.command("cursor_right")

    // Now navigate back left. stickyY should bring us back to p3.
    app.command("cursor_left")

    // The cursor should be on p3 (same card we started on).
    const hasCursorOnP3 = app.q("#p3[data-cursor]").count() > 0
    const hasCursorOnP2 = app.q("#p2[data-cursor]").count() > 0
    expect(hasCursorOnP3).toBe(true)
  })
})

describe("Keyboard Navigation: body card stickyY (round-trip)", () => {
  test("l then h round-trip preserves stickyY for body cards", () => {
    // Navigate right from body column, then left back to body column.
    // Both directions should preserve stickyY.
    using app = createTestApp(
      item(
        "board",
        item.p("p1"),
        item.p("p2"),
        item.p("p3"),
        item.p("p4"),
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
      ),
      { rows: 30 },
    )

    // Navigate to p3
    app.command("cursor_down").command("cursor_down")
    app.expect("#p3[data-cursor]").toExist()

    // l to col1 -> should land near 1c
    app.command("cursor_right")
    const landedOn1a = app.q("#1a[data-cursor]").count() > 0
    expect(landedOn1a).toBe(false)

    // h back to body column -> should land near p3, NOT p1
    app.command("cursor_left")
    const landedOnP1 = app.q("#p1[data-cursor]").count() > 0
    expect(landedOnP1).toBe(false)
  })

  test("stickyY preserved across multiple l presses through body and structural columns", () => {
    using app = createTestApp(
      item(
        "board",
        item.p("p1"),
        item.p("p2"),
        item.p("p3"),
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        item("col2", item("2a"), item("2b"), item("2c"), item("2d"), item("2e")),
      ),
      { rows: 30 },
    )

    // Navigate to p3
    app.command("cursor_down").command("cursor_down")
    app.expect("#p3[data-cursor]").toExist()

    // l to col1 -> should land near 1c (not 1a)
    app.command("cursor_right")
    const on1a = app.q("#1a[data-cursor]").count() > 0
    expect(on1a).toBe(false)

    // l again to col2 -> should STILL preserve stickyY (not reset to 2a)
    app.command("cursor_right")
    const on2a = app.q("#2a[data-cursor]").count() > 0
    expect(on2a).toBe(false)
  })
})

describe("Keyboard Navigation: body card stickyY (within-column body)", () => {
  test("l from within-column body card preserves stickyY into next column", () => {
    // col1 has body content (paragraphs before structural children)
    // col2 has many items
    // Navigate to body card in col1, press l -> should preserve Y position in col2
    using app = createTestApp(
      item(
        "board",
        item("col1", item.p("body-p1"), item.p("body-p2"), item.p("body-p3"), item("sub1"), item("sub2"), item("sub3")),
        item("col2", item("2a"), item("2b"), item("2c"), item("2d"), item("2e")),
      ),
      { rows: 30 },
    )

    // Cursor starts on body-p1 (first card in col1)
    app.expect("#body-p1[data-cursor]").toExist()

    // Navigate down to body-p3 (third body card in col1)
    app.command("cursor_down").command("cursor_down")
    app.expect("#body-p3[data-cursor]").toExist()

    // Press l to navigate right to col2.
    // stickyY from body-p3 should match a card in col2 at similar Y position.
    app.command("cursor_right")

    // body-p3 is the 3rd card. Should land near 2c (3rd card in col2), NOT 2a.
    const hasCursorOn2a = app.q("#2a[data-cursor]").count() > 0

    // If cursor lands on 2a, stickyY was not preserved (the bug)
    expect(hasCursorOn2a).toBe(false)
  })
})

describe("Keyboard Navigation: z (zoom in)", () => {
  test("z zooms into cursor node, making it the root", () => {
    // Structure: board > col1 > [1a, 1b, 1c]
    // Each card needs children so zoom_in has somewhere to show
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a", item("sub1")), item("1b", item("sub2")), item("1c", item("sub3"))),
        item("col2", item("2a", item("sub4"))),
      ),
    )

    // Start at first card
    app.expect("#1a[data-cursor]").toExist()

    // Move to second card
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    // Press z to zoom in — 1b becomes root, its child sub2 is visible
    app.command("zoom_inwards")
    app.expectScreen("sub2")
  })

  test("z zoom into third card shows its children", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a", item("sub1")), item("1b", item("sub2")), item("1c", item("sub3")))),
    )

    // Navigate to third card
    app.command("cursor_down").command("cursor_down")
    app.expect("#1c[data-cursor]").toExist()

    // Press z to zoom in — 1c becomes root, its child sub3 is visible
    app.command("zoom_inwards")
    app.expectScreen("sub3")
  })
})
