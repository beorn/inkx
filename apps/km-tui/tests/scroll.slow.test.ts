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
import { compareBuffers, formatMismatch } from "@silvery/test"
import { testEnv, item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("Scroll Follow", () => {
  // Create a board with enough items to require scrolling on a 24-row terminal.
  // 14 items suffice: ~19 visible rows minus header/breadcrumb, so cursor at
  // item 12+ forces a scroll. Second column kept small (2 items) since we only
  // scroll the first.
  function createLargeBoard() {
    const inboxItems = []
    for (let i = 0; i < 14; i++) {
      inboxItems.push(item("Task " + (i + 1)))
    }
    const inbox = item("inbox", ...inboxItems)

    const projects = item("projects", item("Project 1"), item("Project 2"))

    return item.root("board", inbox, projects)
  }

  test("list view scroll follows cursor past bottom", () => {
    using app = createTestApp(createLargeBoard(), {
      rows: 24,
      cols: 80,
      viewMode: "list",
    })

    // Navigate down past visible area (12 presses to force scroll)
    for (let i = 0; i < 12; i++) {
      app.press("j")
    }

    // Should see Task 10-14 range (scroll followed cursor)
    expect(app.text).toMatch(/Task (1[0-4])/)
  })

  test("cards view scroll follows cursor past bottom", () => {
    using app = createTestApp(createLargeBoard(), {
      rows: 24,
      cols: 80,
      viewMode: "cards",
    })

    // Navigate into first column then down
    app.press("j") // to column header
    app.press("j") // to first card

    // Navigate down past visible area (12 presses to force scroll)
    for (let i = 0; i < 12; i++) {
      app.press("j")
    }

    // Should see higher numbered tasks (scroll followed)
    expect(app.text).toMatch(/Task (1[0-4])/)
  })

  test("columns view scroll follows cursor past bottom", () => {
    using app = createTestApp(createLargeBoard(), {
      rows: 24,
      cols: 80,
      viewMode: "columns",
    })

    // Navigate into first column
    app.press("j") // to column header
    app.press("j") // to first card

    // Navigate down past visible area (12 presses to force scroll)
    for (let i = 0; i < 12; i++) {
      app.press("j")
    }

    // Should see higher numbered tasks (scroll followed)
    // The breadcrumb should show the current item
    expect(app.text).toMatch(/Task (1[0-4])/)
  })
})

describe("km-qlib7: asymmetric horizontal scroll", () => {
  test("navigating left restores viewport symmetrically", () => {
    // 4 columns in 80-wide terminal: only 2 columns visible at once
    using app = createTestApp(
      item(
        "board",
        item("col1", item("A1")),
        item("col2", item("B1")),
        item("col3", item("C1")),
        item("col4", item("D1")),
      ),
      { cols: 80, rows: 20 },
    )

    // Start at col1's first card (A1)
    app.expect("#A1[data-cursor]").toExist()

    // col1 and col2 should be visible initially
    const col1Initial = app.q("#col1").boundingBox()
    const col2Initial = app.q("#col2").boundingBox()
    expect(col1Initial).not.toBeNull()
    expect(col2Initial).not.toBeNull()

    // Press l -> col2
    app.press("l")
    app.expect("#B1[data-cursor]").toExist()
    // col1 and col2 still visible (no scroll needed)
    expect(app.q("#col1").boundingBox()).not.toBeNull()
    expect(app.q("#col2").boundingBox()).not.toBeNull()

    // Press l -> col3 (scrolls right, viewport shows col2+col3)
    app.press("l")
    app.expect("#C1[data-cursor]").toExist()
    // col3 should be visible now
    expect(app.q("#col3").boundingBox()).not.toBeNull()

    // Press h -> col2 (BUG: viewport stays at col2+col3 instead of scrolling back to col1+col2)
    app.press("h")
    app.expect("#B1[data-cursor]").toExist()

    // col1 should be visible again after scrolling back
    // This is the assertion that fails — viewport doesn't scroll back
    const col1After = app.q("#col1").boundingBox()
    expect(col1After, "col1 should be visible after navigating back to col2").not.toBeNull()
  })

  test("back-and-forth navigation maintains symmetric scroll positions", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("A1")),
        item("col2", item("B1")),
        item("col3", item("C1")),
        item("col4", item("D1")),
      ),
      { cols: 80, rows: 20 },
    )

    // Navigate right: col1 -> col2 -> col3
    app.press("l").press("l")
    app.expect("#C1[data-cursor]").toExist()

    // Navigate left: col3 -> col2 -> col1
    app.press("h").press("h")
    app.expect("#A1[data-cursor]").toExist()

    // col1 must be visible (we're on it!)
    const col1Box = app.q("#col1").boundingBox()
    expect(col1Box, "col1 must be visible when cursor is on col1").not.toBeNull()

    // Navigate right again: col1 -> col2
    app.press("l")
    app.expect("#B1[data-cursor]").toExist()

    // Both col1 and col2 should be visible (same as initial state)
    expect(app.q("#col1").boundingBox(), "col1 visible with cursor on col2").not.toBeNull()
    expect(app.q("#col2").boundingBox(), "col2 visible with cursor on col2").not.toBeNull()
  })
})

describe("km-tui.hscroll-partial: partial column visibility triggers scroll", () => {
  // Test at widths where maxCols >= 2 (columns narrower than viewport).
  // Widths 60, 65 have maxCols=1 and column width > viewport — a separate issue.
  test.each([73, 75, 77, 85])("width=%d: cursor column is fully visible after navigating right", (width) => {
    using app = createTestApp(
      item("board", item("col1", item("A1")), item("col2", item("B1")), item("col3", item("C1"))),
      { cols: width, rows: 20 },
    )

    // Start at col1's first card
    app.expect("#A1[data-cursor]").toExist()

    // Navigate right to col2
    app.press("l")
    app.expect("#B1[data-cursor]").toExist()

    // Navigate right to col3
    app.press("l")
    app.expect("#C1[data-cursor]").toExist()

    // col3 must be fully visible — its bounding box right edge must be
    // within the terminal viewport width
    const col3Box = app.q("#col3").boundingBox()
    expect(col3Box, `col3 should be rendered at width=${width}`).not.toBeNull()
    if (col3Box) {
      expect(
        col3Box.x + col3Box.width,
        `col3 right edge (${col3Box.x + col3Box.width}) should be <= viewport width (${width}) at width=${width}`,
      ).toBeLessThanOrEqual(width)
    }
  })

  test("navigating to last column and back preserves full visibility", () => {
    // Use width=73 (a known failing width before the fix)
    using app = createTestApp(
      item("board", item("col1", item("A1")), item("col2", item("B1")), item("col3", item("C1"))),
      { cols: 73, rows: 20 },
    )

    // Navigate right twice to col3
    app.press("l").press("l")
    app.expect("#C1[data-cursor]").toExist()

    // col3 must be fully visible
    const col3Box = app.q("#col3").boundingBox()
    expect(col3Box).not.toBeNull()
    if (col3Box) {
      expect(col3Box.x + col3Box.width).toBeLessThanOrEqual(73)
    }

    // Navigate back to col2
    app.press("h")
    app.expect("#B1[data-cursor]").toExist()

    // col2 must be fully visible
    const col2Box = app.q("#col2").boundingBox()
    expect(col2Box).not.toBeNull()
    if (col2Box) {
      expect(col2Box.x + col2Box.width).toBeLessThanOrEqual(73)
    }
  })

  test.each([70, 80, 100, 120])("scroll ensures full visibility at width=%d", (width) => {
    using app = createTestApp(
      item("board", item("col1", item("A1")), item("col2", item("B1")), item("col3", item("C1"))),
      { cols: width, rows: 20 },
    )

    app.press("l").press("l")
    app.expect("#C1[data-cursor]").toExist()

    const col3Box = app.q("#col3").boundingBox()
    expect(col3Box, `col3 should be rendered at width=${width}`).not.toBeNull()
    if (col3Box) {
      expect(col3Box.x + col3Box.width, `col3 right edge at width=${width}`).toBeLessThanOrEqual(width)
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
    using app = createTestApp(nodes, { cols: 80, rows: 20 })
    // Check DOM for the indicator component
    const rightIndicator = app.locator('[data-scroll-indicator="right"]')
    expect(rightIndicator.count()).toBe(1)
    // Check that the arrow character appears somewhere
    expect(rightIndicator.textContent()).toContain("▸")
  })

  test("shows left arrow after scrolling right", () => {
    const nodes = item.root(
      "board",
      item("col1", item("t1")),
      item("col2", item("t2")),
      item("col3", item("t3")),
      item("col4", item("t4")),
      item("col5", item("t5")),
      item("col6", item("t6")),
    )
    using app = createTestApp(nodes, { cols: 80, rows: 20 })

    // Navigate right past visible columns to trigger scroll
    app.press("l") // col 1
    app.press("l") // col 2 - should trigger scroll
    app.press("l") // col 3 - definitely scrolled

    const ansi = app.driver.ansi
    const text = app.text
    const hasArrowInAnsi = ansi.includes("◂")
    const hasArrowInText = text.includes("◂")
    expect(hasArrowInAnsi || hasArrowInText).toBe(true)
  })

  test("no indicators when all columns fit", () => {
    const nodes = item.root("board", item("col1", item("t1")), item("col2", item("t2")))
    // Width 80 => maxCols = 2. 2 columns = 2 => no overflow
    using app = createTestApp(nodes, { cols: 80, rows: 20 })
    const screen = app.text
    expect(screen).not.toContain("◂")
    expect(screen).not.toContain("▸")
  })
})

// =============================================================================
// header-j-scroll (km-tui.header-j-scroll)
// =============================================================================

describe("header-j-scroll (km-tui.header-j-scroll)", () => {
  /**
   * Create a board with enough columns that some are off-screen.
   * At 80 columns width, ~2 columns fit (each ~35+ chars wide).
   */
  function createWideBoard() {
    return item.root(
      "board",
      item("col-a", item("a1"), item("a2")),
      item("col-b", item("b1"), item("b2")),
      item("col-c", item("c1"), item("c2")),
      item("col-d", item("d1"), item("d2")),
      item("col-e", item("e1"), item("e2")),
    )
  }

  test("j from board header scrolls to remembered off-screen column", () => {
    using app = createTestApp(createWideBoard(), {
      cols: 80,
      rows: 24,
    })

    // Initial state: cursor on first card in first column
    app.expect("#a1[data-cursor]").toExist()

    // Navigate right to col-e (off-screen column)
    app.press("l").press("l").press("l").press("l")
    // Should now be on e1
    app.expect("#e1[data-cursor]").toExist()
    // col-e should be visible
    app.expectScreen("e1")

    // Navigate up to column header
    app.press("k")
    // Navigate up to board header
    app.press("k")
    // Verify we're at board level
    app.expect("[data-board][data-cursor]").toExist()

    // Now press j — should return to col-e (via stickyX) and scroll to it
    app.press("j")

    // The cursor should be on col-e's header
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // stickyX should have returned us to col-e
    expect(cursor.textContent()).toContain("col-e")

    // AND the column should be visible on screen (this is the bug —
    // the cursor enters col-e but the viewport doesn't scroll to show it)
    // Check that col-e's cards are visible in the rendered output
    expect(app.text).toContain("e1")
    expect(app.text).toContain("e2")
  })

  test("j from board header to first column does not need scrolling", () => {
    using app = createTestApp(createWideBoard(), {
      cols: 80,
      rows: 24,
    })

    // Navigate up to board header from first column
    app.press("k").press("k")

    // j should enter first column (no stickyX set)
    app.press("j")

    // First column should be visible (it already was)
    app.expectScreen("a1")
    app.expectScreen("a2")
  })

  test("j from board header after visiting far column via h/l", () => {
    using app = createTestApp(createWideBoard(), {
      cols: 80,
      rows: 24,
    })

    // Navigate to col-d column header
    app.press("k") // to col-a header
    app.press("l").press("l").press("l") // to col-d header

    // Go up to board
    app.press("k")

    // j should return to col-d and scroll to show it
    app.press("j")

    // col-d should be visible
    expect(app.text).toContain("d1")
  })
})

// =============================================================================
// Column shift with virtual body column (Description column)
// =============================================================================

describe("column shift with body column", () => {
  test("opt+l shifts column right when body column exists — cursor follows", () => {
    using app = createTestApp(
      item(
        "board",
        item.p("some description text"),
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
      ),
      { cols: 160, rows: 24 },
    )

    // Navigate to col1 header: l -> col1 card, k -> col1 header
    app.press("l")
    app.press("k")
    app.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    app.press("opt+l")

    // Cursor should stay on col1
    app.expect("#col1[data-cursor]").toExist()

    // Navigate down into the column — should enter col1's cards
    app.press("j")
    app.expect("#1a[data-cursor]").toExist()
  })

  test("opt+h shifts column left when body column exists — cursor follows", () => {
    using app = createTestApp(
      item(
        "board",
        item.p("some description text"),
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
      ),
      { cols: 160, rows: 24 },
    )

    // Navigate to col2 header: l -> col1 card, l -> col2 card, k -> col2 header
    app.press("l").press("l").press("k")
    app.expect("#col2[data-cursor]").toExist()

    // Shift col2 left
    app.press("opt+h")

    // Cursor should stay on col2
    app.expect("#col2[data-cursor]").toExist()

    // Navigate down — should enter col2's cards
    app.press("j")
    app.expect("#2a[data-cursor]").toExist()
  })

  test("shifting towards body column — should swap with body column or boundary", () => {
    using app = createTestApp(
      item("board", item.p("some description text"), item("col1", item("1a")), item("col2", item("2a"))),
      { cols: 120, rows: 24 },
    )

    // Navigate to col1 header (adjacent to Description)
    app.press("l").press("k")
    app.expect("#col1[data-cursor]").toExist()

    // Shift col1 left — target is body column (virtual, not in repo)
    // This should either boundary or handle gracefully
    app.press("opt+h")

    // Cursor should still be on col1 (not crash, not move to wrong place)
    app.expect("#col1[data-cursor]").toExist()
  })

  test("visual order correct after shift with body column", () => {
    using app = createTestApp(
      item("board", item.p("desc text"), item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      { cols: 200, rows: 24 },
    )

    // Navigate to col1 header: l -> col1 card, k -> col1 header
    app.press("l").press("k")
    app.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    app.press("opt+l")

    // After shift: visual order should be Description, col2, col1, col3
    const col1Box = app.q("#col1").boundingBox()
    const col2Box = app.q("#col2").boundingBox()
    const col3Box = app.q("#col3").boundingBox()
    expect(col1Box).not.toBeNull()
    expect(col2Box).not.toBeNull()
    expect(col3Box).not.toBeNull()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
    expect(col1Box!.x).toBeLessThan(col3Box!.x)
  })

  test("shift right then navigate — enters correct column cards", () => {
    using app = createTestApp(
      item(
        "board",
        item.p("desc text"),
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
        item("col3", item("3a")),
      ),
      { cols: 160, rows: 24 },
    )

    // Navigate to col1 header: l -> col1 card, k -> col1 header
    app.press("l").press("k")
    app.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    app.press("opt+l")
    app.expect("#col1[data-cursor]").toExist()

    // Navigate down — should be in col1's cards, not col2's
    app.press("j")
    app.expect("#1a[data-cursor]").toExist()

    // Navigate right — should go to col3 (now the right neighbor)
    app.press("l")
    app.expect("#3a[data-cursor]").toExist()
  })
})

describe("column shift with collapsed columns", () => {
  test("shift collapsed column right — cursor follows", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a")), item("col3", item("3a"))),
      { cols: 120, rows: 24 },
    )

    // Navigate to col1 header and collapse it
    app.press("k")
    app.expect("#col1[data-cursor]").toExist()
    app.press("c")

    // Shift collapsed col1 right
    app.press("opt+l")

    // Cursor should still be on col1
    app.expect("#col1[data-cursor]").toExist()
  })

  test("shift column right past collapsed column — cursor follows", () => {
    using app = createTestApp(item.multiColBoard(), { cols: 120, rows: 24 })

    // Start on col1 card, go to header, collapse col2 from col1 side is complex.
    // Instead: go to col1 header first
    app.press("k")
    app.expect("#col1[data-cursor]").toExist()

    // Shift col1 right (swaps with col2)
    app.press("opt+l")
    app.expect("#col1[data-cursor]").toExist()

    // Shift col1 right again (swaps with col3, col1 now at end)
    app.press("opt+l")
    app.expect("#col1[data-cursor]").toExist()

    // Navigate down into col1 should show col1's cards
    app.press("j")
    app.expect("#1a[data-cursor]").toExist()
  })

  test("shift non-collapsed column when some columns are collapsed", () => {
    using app = createTestApp(item.multiColBoard(), { cols: 120, rows: 24 })

    // Navigate to col1 header and collapse it
    app.press("k")
    app.expect("#col1[data-cursor]").toExist()
    app.press("c")

    // Navigate to col2 header
    app.press("l")
    app.expect("#col2[data-cursor]").toExist()

    // Shift col2 right
    app.press("opt+l")

    // Cursor should stay on col2
    app.expect("#col2[data-cursor]").toExist()

    // Navigate down into col2
    app.press("j")
    app.expect("#2a[data-cursor]").toExist()
  })
})

/**
 * Regression: incremental rendering mismatch with scrolling boards.
 *
 * Sequence G, g, h, g on a scrolling board with 3 columns (12+10+8 items)
 * at 80x16. The final "g" opens a chord overlay (absolute positioned) that
 * was missing from the incremental render because STRICT output verification threw
 * during the output phase, preventing the render-phase buffer from being
 * saved to instance.prevBuffer.
 *
 * Bug: km-silvery.scroll-incr-fuzz
 */
describe("scroll-incr-chord: absolute overlay after scroll", () => {
  function scrollingFixture() {
    return () =>
      item(
        "board",
        item("col1", ...Array.from({ length: 12 }, (_, i) => item(`1-${String.fromCharCode(97 + i)}`))),
        item("col2", ...Array.from({ length: 10 }, (_, i) => item(`2-${String.fromCharCode(97 + i)}`))),
        item("col3", ...Array.from({ length: 8 }, (_, i) => item(`3-${String.fromCharCode(97 + i)}`))),
      )
  }

  // FREEZE: needs board._result.lastBuffer() / freshRender() — no createTestApp equivalent
  test("G, g, h, g — chord overlay present in incremental buffer", () => {
    const { board } = testEnv(scrollingFixture(), {
      columns: 80,
      rows: 16,
      viewMode: "cards",
      incremental: true,
      checkIncremental: false,
    })

    const steps = ["G", "g", "h", "g"]
    for (let i = 0; i < steps.length; i++) {
      const key = steps[i]!
      board.press(key)
      const inc = board._result.lastBuffer()
      if (!inc) continue
      const fresh = board._result.freshRender()
      const mismatch = compareBuffers(inc, fresh)
      if (mismatch) {
        const msg = formatMismatch(mismatch, { key, incrementalText: "", freshText: "" })
        expect.fail(`Step ${i} (${key}): incremental/fresh mismatch\n${msg}`)
      }
    }
  })
})
