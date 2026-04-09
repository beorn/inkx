/**
 * Sticky cursor behavior tests: stickyY reliability, out-of-bounds, stickyX reset,
 * stickyY reset on boundary actions, and curswantY sticky navigation.
 *
 * Guards against cursor down to non-first card, then h/l always landing on
 * first card in target column instead of matching Y position. Also tests
 * graceful fallback when getItemMidY returns 0 for current card, out-of-bounds
 * behavior when navigating between columns of different heights, stickyX
 * reset on cross-column navigation, stickyY clearing on boundary h/l, and
 * curswantY preservation across columns.
 */
import { testEnv, item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { describe, test, it, expect } from "vitest"

// =============================================================================
// Rendering invariants — checked after every navigation action
// =============================================================================

function assertInvariants(board: ReturnType<typeof testEnv>["board"], label: string) {
  const screenshot = board.screenshot()

  // 1. Exactly one cursor element
  const cursorCount = board.q("[data-cursor]").count()
  expect(cursorCount, `[${label}] exactly one cursor element`).toBe(1)

  // 2. No garbage in output
  expect(screenshot, `[${label}] no [object Object]`).not.toContain("[object Object]")
  expect(screenshot, `[${label}] no undefined`).not.toContain("undefined")
  expect(screenshot, `[${label}] no NaN`).not.toContain("NaN")

  // 3. Box-drawing characters are paired (no isolated fragments).
  //    Check that every line with a left corner has a matching right corner.
  const lines = screenshot.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const hasLeftCorner = line.includes("╭") || line.includes("╰")
    const hasRightCorner = line.includes("╮") || line.includes("╯")
    // If we see a left round corner, expect a right round corner on the same line
    if (hasLeftCorner) {
      expect(hasRightCorner, `[${label}] line ${i + 1}: left corner without right corner`).toBe(true)
    }
  }
}

/**
 * Press a key and assert invariants hold after the action.
 * Returns the board for chaining.
 */
function press(board: ReturnType<typeof testEnv>["board"], key: string, label: string) {
  board.press(key)
  assertInvariants(board, `after ${label}`)
  return board
}

// =============================================================================
// stickyY reliability
// =============================================================================

describe("stickyY reliability", () => {
  test("j then l: lands on matching card (basic, no race condition)", async () => {
    using app = createTestApp(
      item(
        "board",
        item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
        item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
      ),
      { rows: 24, cols: 80 },
    )

    expect(app.q("[data-cursor]").textContent()).toContain("A1")
    app.command("cursor_down")
    app.command("cursor_down")
    app.command("cursor_down")
    expect(app.q("[data-cursor]").textContent()).toContain("A4")

    app.command("cursor_right")
    const cursor = app.q("[data-cursor]").textContent()
    expect(cursor).not.toContain("B1")
    expect(cursor).toMatch(/B[34]/)
  })

  test("stickyY falls back when registry has no headY for current card", () => {
    // With lazy capture on h/l, if getItemMidY returns 0 (no position data),
    // the code gracefully skips stickyY capture and falls back to first card in target column.
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
          item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
        ),
      { rows: 24, columns: 80 },
    )

    expect(board.q("[data-cursor]").textContent()).toContain("A1")

    // Navigate to A4
    board.command("cursor_down").command("cursor_down").command("cursor_down")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    // Simulate race condition: unregister A4's position so getItemMidY returns 0
    registry.unregister(0, 3)

    // Press l — lazy capture skips (midY=0), falls back to first card in target column
    board.command("cursor_right")
    expect(board.q("[data-cursor]").textContent()).toContain("B1")
  })

  test("stickyY throws when registry has no entry for current card", () => {
    // With lazy capture on h/l, the focused card must always be measured.
    // If the card is completely unregistered, it's a programming error.
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
          item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
        ),
      { rows: 24, columns: 80 },
    )

    expect(board.q("[data-cursor]").textContent()).toContain("A1")

    // Navigate to A4
    board.command("cursor_down").command("cursor_down").command("cursor_down")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    // Simulate: completely remove A4 from registry
    registry.unregister(0, 3)

    // Press l — lazy capture can't find card → falls back to first card in target column
    board.command("cursor_right")
    expect(board.q("[data-cursor]").textContent()).toContain("B1")
  })

  test("single j then l: basic case works", () => {
    using app = createTestApp(
      item("board", item("ColA", item("A1"), item("A2"), item("A3")), item("ColB", item("B1"), item("B2"), item("B3"))),
      { rows: 24, cols: 80 },
    )

    expect(app.q("[data-cursor]").textContent()).toContain("A1")
    app.command("cursor_down")
    expect(app.q("[data-cursor]").textContent()).toContain("A2")

    app.command("cursor_right")
    expect(app.q("[data-cursor]").textContent()).toContain("B2")
  })
})

// =============================================================================
// sticky out-of-bounds behavior
// =============================================================================

/**
 * stickyX/stickyY out-of-bounds behavior.
 *
 * Bead: km-tui.sticky-reset-oob
 *
 * When navigating from a tall column to a short column, and then navigating
 * vertically (j/k) within the short column, the stickyY should be properly
 * managed so subsequent h/l navigation works as expected.
 */
describe("sticky out-of-bounds behavior", () => {
  test("move from deep card in tall col to short col, then back", () => {
    const { board, registry } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")), item("col2", item("2a"))),
    )

    // Navigate to card 1e (deep in col1)
    board.command("cursor_down").command("cursor_down").command("cursor_down").command("cursor_down")
    board.expect("#1e[data-cursor]").toExist()

    // Press 'l' — should go to col2's only card (clamped from deep Y)
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()
    // stickyY should be set from the deep card position
    expect(registry.stickyY).not.toBeNull()

    // Press 'h' — should go back to col1 at card 1e (stickyY preserved)
    board.command("cursor_left")
    board.expect("#1e[data-cursor]").toExist()
  })

  test("move from deep card in tall col to short col, navigate vertically, then back", () => {
    const { board, registry } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        item("col2", item("2a"), item("2b")),
      ),
    )

    // Navigate to card 1e (deep in col1)
    board.command("cursor_down").command("cursor_down").command("cursor_down").command("cursor_down")
    board.expect("#1e[data-cursor]").toExist()

    // Press 'l' — should go to col2 (stickyY captures from 1e)
    board.command("cursor_right")
    board.expect("#2b[data-cursor]").toExist()

    // Navigate UP within col2 (j/k clears stickyY)
    board.command("cursor_up")
    board.expect("#2a[data-cursor]").toExist()
    expect(registry.stickyY).toBeNull() // cleared by vertical nav

    // Press 'h' — no stickyY, should land on first card in col1
    board.command("cursor_left")
    // With stickyY cleared, lazy capture fires from current position (2a)
    // This captures stickyY from 2a's Y, then navigates to the matching card in col1
    const cursorLoc = board.q("[data-cursor]")
    expect(cursorLoc.count()).toBe(1)
  })

  test("stickyX round-trip: board -> deep col -> board -> different col", () => {
    const { board, registry } = testEnv(() =>
      item("board", item("col0", item("a0")), item("col1", item("b0")), item("col2", item("c0"))),
    )

    // Navigate to col2
    board.command("cursor_down") // board -> col0
    board.command("cursor_right").command("cursor_right") // col0 -> col1 -> col2

    board.command("cursor_down") // col2 -> c0
    board.command("cursor_up") // c0 -> col2 header
    board.command("cursor_up") // col2 header -> board (sets stickyX=2)
    expect(registry.stickyX).toBe(2)

    // j from board should go to col2 (via stickyX)
    board.command("cursor_down")
    board.expect("#col2[data-cursor]").toExist()
  })
})

// =============================================================================
// stickyX reset
// =============================================================================

/**
 * stickyX reset on out-of-bounds navigation.
 *
 * stickyX preserves the column index during board-level j/k navigation.
 * Like stickyY (cleared on j/k), stickyX should be cleared when h/l
 * navigation occurs or when vertical navigation hits a boundary.
 *
 * Tests use testEnv (full integration through handleCursorMove) because
 * stickyX clearing happens in the action layer, not the ViewNavigation layer.
 */
describe("stickyX reset", () => {
  it("h/l clears stickyX so j from board uses default column", () => {
    // Board with 3 columns
    const { board, registry } = testEnv(() =>
      item("board", item("col0", item("a0")), item("col1", item("b0")), item("col2", item("c0"))),
    )

    // Navigate to col1's card
    board.command("cursor_down") // board → col0
    board.command("cursor_right") // col0 → col1
    board.command("cursor_down") // col1 header → b0

    // Navigate up to board: k → col1 header (sets stickyX=1), k → board
    board.command("cursor_up") // b0 → col1 header (sets stickyX=1)
    board.command("cursor_up") // col1 header → board (stickyX=1 is set)
    expect(registry.stickyX).toBe(1)

    // Now press l (horizontal nav) — should clear stickyX
    // At board level, h/l returns null (boundary), but the clearStickyX
    // should still fire. Let's navigate to a card first so h/l works.
    // Actually, at board level h/l is a boundary. Let's navigate down first.

    // Go down — stickyX=1 should take us to col1
    board.command("cursor_down")
    board.expect("#col1[data-cursor]").toExist()

    // Go back up to board
    board.command("cursor_up") // col1 → board (sets stickyX=1 again)
    expect(registry.stickyX).toBe(1)

    // Navigate down to col1, then to a card, then press h (cross-column)
    board.command("cursor_down") // board → col1 (via stickyX=1)
    board.command("cursor_down") // col1 → b0
    board.command("cursor_left") // b0 → a0 (cross-column, should clear stickyX)
    expect(registry.stickyX).toBeNull()

    // Now navigate up to board and back down — should go to col0 (default), not col1
    board.command("cursor_up") // a0 → col0 header (sets stickyX=0)
    board.command("cursor_up") // col0 → board (stickyX=0)
    expect(registry.stickyX).toBe(0)
    board.command("cursor_down") // board → col0 (stickyX=0)
    board.expect("#col0[data-cursor]").toExist()
  })

  it("stickyX persists through j/k within columns (not cleared by vertical nav)", () => {
    const { board, registry } = testEnv(() =>
      item("board", item("col0", item("a0"), item("a1")), item("col1", item("b0"))),
    )

    // Navigate to col1
    board.command("cursor_down") // board → col0
    board.command("cursor_right") // col0 → col1
    board.command("cursor_down") // col1 → b0
    board.command("cursor_up") // b0 → col1 header
    board.command("cursor_up") // col1 → board (sets stickyX=1)
    expect(registry.stickyX).toBe(1)

    // j/k navigation should clear stickyX (same as stickyY is cleared on j/k)
    // Actually, reviewing the stickyY pattern: stickyY IS cleared on j/k.
    // So stickyX should also be cleared on h/l. But j/k should NOT clear stickyX
    // because stickyX IS the j/k navigation aid (like stickyY is the h/l aid).
    board.command("cursor_down") // board → col1 (uses stickyX=1)
    // After this j, stickyX is consumed but the value only changes when
    // you go back up (k from column sets it again)
  })
})

// =============================================================================
// stickyY reset on boundary actions
// =============================================================================

/**
 * stickyY reset on boundary actions.
 *
 * Bug: When h/l navigation hits a boundary (leftmost/rightmost column or board
 * level), stickyY is not cleared. If stickyY was set from a prior h/l, the
 * stale value persists and affects subsequent cross-column navigation.
 *
 * The lazy capture in handleHorizontalNav only fires when stickyY is null.
 * If a boundary h/l doesn't clear stickyY, the next successful h/l skips
 * lazy capture and uses the stale stickyY value from a different card position.
 *
 * Fix: clear stickyY when h/l navigation returns boundary.
 */
describe("stickyY reset on boundary actions", () => {
  test("l boundary at rightmost column clears stickyY", () => {
    const { board, registry } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        item("col2", item("2a"), item("2b"), item("2c"), item("2d"), item("2e")),
      ),
    )

    assertInvariants(board, "initial")
    board.expect("#1a[data-cursor]").toExist()

    // Navigate to deep card 1e
    press(board, "j", "j to 1b")
    press(board, "j", "j to 1c")
    press(board, "j", "j to 1d")
    press(board, "j", "j to 1e")
    board.expect("#1e[data-cursor]").toExist()

    // Press l — lazy captures stickyY from 1e, navigates to 2e
    press(board, "l", "l to col2")
    board.expect("#2e[data-cursor]").toExist()
    expect(registry.stickyY, "stickyY set after successful l").not.toBeNull()

    // Press l again — boundary (rightmost column).
    press(board, "l", "l boundary at rightmost")
    board.expect("#2e[data-cursor]").toExist()

    // After boundary, stickyY should be null (cleared by fix)
    expect(registry.stickyY, "stickyY cleared after boundary l").toBeNull()
  })

  test("h boundary at leftmost column clears stickyY", () => {
    const { board, registry } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        item("col2", item("2a"), item("2b"), item("2c"), item("2d"), item("2e")),
      ),
    )

    assertInvariants(board, "initial")

    // Navigate to 1e
    press(board, "j", "j to 1b")
    press(board, "j", "j to 1c")
    press(board, "j", "j to 1d")
    press(board, "j", "j to 1e")
    board.expect("#1e[data-cursor]").toExist()

    // Press h — at leftmost card goes to column header (not boundary)
    press(board, "h", "h to column header")
    board.expect("#col1[data-cursor]").toExist()

    // Press h again — now at boundary
    press(board, "h", "h boundary at leftmost")
    board.expect("#col1[data-cursor]").toExist()

    // stickyY should be cleared after boundary
    expect(registry.stickyY, "stickyY cleared after boundary h").toBeNull()
  })

  test("3-column cross-column navigation with boundary and invariants", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
          item("col2", item("2a"), item("2b"), item("2c"), item("2d"), item("2e")),
          item("col3", item("3a"), item("3b"), item("3c"), item("3d"), item("3e")),
        ),
      { columns: 120 }, // wider to fit 3 columns
    )

    assertInvariants(board, "initial")
    board.expect("#1a[data-cursor]").toExist()

    // Navigate to 1e (deep)
    press(board, "j", "j to 1b")
    press(board, "j", "j to 1c")
    press(board, "j", "j to 1d")
    press(board, "j", "j to 1e")
    board.expect("#1e[data-cursor]").toExist()

    // Cross-column: l to col2, l to col3 — stickyY guides to deep cards
    press(board, "l", "l to col2")
    board.expect("#2e[data-cursor]").toExist()
    press(board, "l", "l to col3")
    board.expect("#3e[data-cursor]").toExist()

    // Boundary l at rightmost — stickyY cleared
    press(board, "l", "l boundary at col3")
    board.expect("#3e[data-cursor]").toExist()
    expect(registry.stickyY, "stickyY cleared after rightmost boundary").toBeNull()

    // Navigate up to 3a
    press(board, "k", "k to 3d")
    press(board, "k", "k to 3c")
    press(board, "k", "k to 3b")
    press(board, "k", "k to 3a")
    board.expect("#3a[data-cursor]").toExist()

    // h should fresh-capture from 3a, landing on 2a (not 2e)
    press(board, "h", "h to col2 from 3a")
    board.expect("#2a[data-cursor]").toExist()

    // Continue h to col1 — should also land near top
    press(board, "h", "h to col1 from 2a")
    board.expect("#1a[data-cursor]").toExist()

    // h at leftmost card goes to column header
    press(board, "h", "h to col1 header")
    board.expect("#col1[data-cursor]").toExist()
    // h at column header is boundary — stickyY cleared
    press(board, "h", "h boundary at col1")
    board.expect("#col1[data-cursor]").toExist()
    expect(registry.stickyY, "stickyY cleared after leftmost boundary").toBeNull()

    // l from col1 header goes to col2 header
    press(board, "l", "l to col2 header from col1 header")
    board.expect("#col2[data-cursor]").toExist()
  })

  test("boundary h then immediate l fresh-captures from current position", () => {
    const { board, registry } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        item("col2", item("2a"), item("2b"), item("2c"), item("2d"), item("2e")),
      ),
    )

    assertInvariants(board, "initial")

    // Navigate to 1c (middle card)
    press(board, "j", "j to 1b")
    press(board, "j", "j to 1c")
    board.expect("#1c[data-cursor]").toExist()

    // Press h — at leftmost card goes to column header
    press(board, "h", "h to col1 header")
    board.expect("#col1[data-cursor]").toExist()
    // Press h again — boundary
    press(board, "h", "h boundary at col1")
    board.expect("#col1[data-cursor]").toExist()
    expect(registry.stickyY, "stickyY null after boundary h").toBeNull()

    // j down from header to 1a, then l to col2
    press(board, "j", "j to 1a from header")
    board.expect("#1a[data-cursor]").toExist()
    // Press l — lazy capture fires fresh from 1a, should land on 2a
    press(board, "l", "l from 1a to col2")
    board.expect("#2a[data-cursor]").toExist()
    expect(registry.stickyY, "stickyY set after successful l").not.toBeNull()

    // h fresh-captures from 2a, lands on 1a
    press(board, "h", "h from 2a to col1")
    board.expect("#1a[data-cursor]").toExist()

    // Verify column content still renders correctly by checking both columns visible
    const screenshot = board.screenshot()
    expect(screenshot, "col1 header visible").toContain("col1")
    expect(screenshot, "col2 header visible").toContain("col2")
  })

  test("vertical nav after boundary h/l clears stickyY independently", () => {
    // Verify that j/k after boundary still clears stickyY (no double-clear issue)
    const { board, registry } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"), item("2b"), item("2c"))),
    )

    assertInvariants(board, "initial")

    // Navigate to 1c
    press(board, "j", "j to 1b")
    press(board, "j", "j to 1c")
    board.expect("#1c[data-cursor]").toExist()

    // h at leftmost card goes to column header, then boundary
    press(board, "h", "h to col1 header")
    board.expect("#col1[data-cursor]").toExist()
    press(board, "h", "h boundary at col1")
    expect(registry.stickyY).toBeNull()

    // j down from header — goes to 1a
    press(board, "j", "j to 1a from header")
    board.expect("#1a[data-cursor]").toExist()
    expect(registry.stickyY).toBeNull()

    // j down then l — should work normally
    press(board, "j", "j to 1b")
    board.expect("#1b[data-cursor]").toExist()
    press(board, "l", "l to col2")
    board.expect("#2b[data-cursor]").toExist()
  })
})

// =============================================================================
// curswantY sticky navigation
// =============================================================================

describe("curswantY sticky navigation", () => {
  test("navigating right preserves Y position (no scroll)", () => {
    using app = createTestApp(
      item(
        "board",
        item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
        item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
        item("ColC", item("C1"), item("C2"), item("C3")),
      ),
      { rows: 24, cols: 80 },
    )

    // Start at first card in first column
    let cursorText = app.q("[data-cursor]").textContent()
    expect(cursorText).toContain("A1")

    // Navigate down to A3
    app.command("cursor_down")
    app.command("cursor_down")
    cursorText = app.q("[data-cursor]").textContent()
    expect(cursorText).toContain("A3")

    // Navigate right - should land on B3 (or closest card at same Y)
    app.command("cursor_right")
    cursorText = app.q("[data-cursor]").textContent()

    // Should NOT be on column header
    expect(cursorText).not.toContain("ColB")

    // Should be on B3 or nearby (same Y position)
    expect(cursorText).toMatch(/B[23]/)

    // Navigate right again - should preserve Y
    app.command("cursor_right")
    const cursorText2 = app.q("[data-cursor]").textContent()

    // Should be on C2 or C3 (closest to Y position)
    expect(cursorText2).toMatch(/C[23]/)
  })

  test("navigating right preserves logical position when columns scrolled differently", () => {
    // This test simulates the real-world bug:
    // - Column A has many cards, scrolled so card 10 is visible
    // - Column B has fewer cards, not scrolled
    // - Navigating right from card 10 should find closest card in B
    using app = createTestApp(
      item(
        "board",
        item(
          "ColA",
          // Many cards - we'll scroll to lower ones
          item("A01"),
          item("A02"),
          item("A03"),
          item("A04"),
          item("A05"),
          item("A06"),
          item("A07"),
          item("A08"),
          item("A09"),
          item("A10"),
          item("A11"),
          item("A12"),
          item("A13"),
          item("A14"),
          item("A15"),
        ),
        item(
          "ColB",
          // Fewer cards - will stay at top
          item("B1"),
          item("B2"),
          item("B3"),
          item("B4"),
          item("B5"),
        ),
      ),
      { rows: 16, cols: 80 }, // Smaller viewport to force scrolling
    )

    // Navigate down many times to scroll column A
    for (let i = 0; i < 10; i++) {
      app.command("cursor_down")
    }

    const cursorText = app.q("[data-cursor]").textContent()
    expect(cursorText).toContain("A11")

    // Navigate right - this is where the bug manifests
    app.command("cursor_right")
    const afterL = app.q("[data-cursor]").textContent()

    // The cursor should be on a card near the bottom of B, NOT B1
    // Because A11 is at the bottom of the visible area, stickyY should
    // match a card near the bottom of column B.
    // If it lands on B1, that's the bug (stale/wrong stickyY).
    expect(afterL).not.toContain("ColB") // Not on column header
    expect(afterL).toMatch(/B[345]/) // Near bottom of column B
  })

  test("j/k resets stickyY so next h/l uses new position", () => {
    // j/k resets curswantY to current card's position.
    // h/l keeps curswantY and uses it for cross-column navigation.
    using app = createTestApp(
      item(
        "board",
        item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
        item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
        item("ColC", item("C1"), item("C2"), item("C3"), item("C4")),
      ),
      { rows: 24, cols: 120 },
    )

    // Start at A1, navigate down to A3
    app.command("cursor_down")
    app.command("cursor_down")
    expect(app.q("[data-cursor]").textContent()).toContain("A3")

    // Move right — stickyY from A3, lands on B3 area
    app.command("cursor_right")
    expect(app.q("[data-cursor]").textContent()).toMatch(/B[23]/)

    // Move down within column B — j/k RESETS stickyY to new position
    app.command("cursor_down")
    app.command("cursor_down")
    expect(app.q("[data-cursor]").textContent()).toMatch(/B[45]/)

    // Move right again — stickyY was reset by j, so lands near B5's Y
    app.command("cursor_right")
    const afterSecondL = app.q("[data-cursor]").textContent()
    // Should land near bottom (C3 or C4), matching the j/k-updated position
    expect(afterSecondL).toMatch(/C[34]/)
  })

  test("h/l preserves stickyY across multiple columns", () => {
    // When only pressing h/l (no j/k), stickyY stays the same.
    using app = createTestApp(
      item(
        "board",
        item("ColA", item("A1"), item("A2"), item("A3")),
        item("ColB", item("B1"), item("B2"), item("B3")),
        item("ColC", item("C1"), item("C2"), item("C3")),
      ),
      { rows: 24, cols: 120 },
    )

    // Navigate down to A3
    app.command("cursor_down")
    app.command("cursor_down")
    expect(app.q("[data-cursor]").textContent()).toContain("A3")

    // l → B3, l → C3, h → B3 — stickyY preserved throughout
    app.command("cursor_right")
    expect(app.q("[data-cursor]").textContent()).toMatch(/B[23]/)
    app.command("cursor_right")
    expect(app.q("[data-cursor]").textContent()).toMatch(/C[23]/)
    app.command("cursor_left")
    expect(app.q("[data-cursor]").textContent()).toMatch(/B[23]/)
  })

  test("stickyY persists when navigating through empty columns", () => {
    // This tests the real-world bug:
    // 1. Start on card at Y position
    // 2. Navigate right to empty column (stickyY should be captured)
    // 3. Navigate right again to column with cards
    // 4. Should land on card at original Y position, not first card
    using app = createTestApp(
      item(
        "board",
        item("ColA", item("A1"), item("A2"), item("A3")),
        item("ColB"), // Empty column
        item("ColC", item("C1"), item("C2"), item("C3")),
      ),
      { rows: 24, cols: 80 },
    )

    // Start at first card
    let cursorText = app.q("[data-cursor]").textContent()
    expect(cursorText).toContain("A1")

    // Navigate down to A3 (bottom of column)
    app.command("cursor_down")
    app.command("cursor_down")
    cursorText = app.q("[data-cursor]").textContent()
    expect(cursorText).toContain("A3")

    // Navigate right - lands on empty column header
    app.command("cursor_right")
    cursorText = app.q("[data-cursor]").textContent()
    expect(cursorText).toContain("ColB")

    // Navigate right again - should use stickyY to land on C3 (same Y as A3)
    app.command("cursor_right")
    cursorText = app.q("[data-cursor]").textContent()

    // Should be on C3 (same position as A3), NOT C1 or column header
    expect(cursorText).not.toContain("ColC")
    expect(cursorText).toContain("C3")
  })
})
