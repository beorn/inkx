/**
 * Board Acceptance Tests - Navigation
 *
 * Tests for cursor movement: j/k (up/down), h/l (left/right columns),
 * g/G (first/last), arrow keys, boundary behavior, and stickyY.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

// =============================================================================
// Vertical Navigation (j/k)
// =============================================================================

describe("Vertical Navigation", () => {
  test("j moves cursor down to next card", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("k moves cursor up to previous card", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.press("j") // Move to 1b
    board.expect("#1b[data-cursor]").toExist()

    board.press("k")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("j traverses all cards in column", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"), item("1d"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    board.press("j")
    board.expect("#1c[data-cursor]").toExist()

    board.press("j")
    board.expect("#1d[data-cursor]").toExist()
  })

  test("k traverses all cards in column upward", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    // Navigate to bottom
    board.press("j").press("j")
    board.expect("#1c[data-cursor]").toExist()

    board.press("k")
    board.expect("#1b[data-cursor]").toExist()

    board.press("k")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("j then k returns to same card", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    board.press("k")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("j at bottom of column does not move cursor", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.press("j") // Move to 1b (last card)
    board.expect("#1b[data-cursor]").toExist()

    board.press("j") // Try to go past bottom
    board.expect("#1b[data-cursor]").toExist()
  })

  test("k at first card navigates to column header", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    // k at first card moves up to column header (3-level: board→column→card)
    board.press("k")
    board.expect("#1a[data-cursor]").not.toExist()

    // j from column header goes back to first card
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("ArrowDown behaves like j", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("ArrowDown")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("ArrowUp behaves like k", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    board.press("ArrowUp")
    board.expect("#1a[data-cursor]").toExist()
  })
})

// =============================================================================
// Horizontal Navigation (h/l)
// =============================================================================

describe("Horizontal Navigation", () => {
  test("l moves cursor to next column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("l")
    board.expect("#2a[data-cursor]").toExist()
  })

  test("h moves cursor to previous column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.press("l") // Move to col2
    board.expect("#2a[data-cursor]").toExist()

    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("l traverses all columns", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("l")
    board.expect("#2a[data-cursor]").toExist()

    board.press("l")
    board.expect("#3a[data-cursor]").toExist()
  })

  test("h traverses all columns backward", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    board.press("l").press("l") // Move to col3
    board.expect("#3a[data-cursor]").toExist()

    board.press("h")
    board.expect("#2a[data-cursor]").toExist()

    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("l then h returns to same column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("l")
    board.expect("#2a[data-cursor]").toExist()

    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("l at rightmost column does not move cursor", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.press("l") // Move to col2 (last column)
    board.expect("#2a[data-cursor]").toExist()

    board.press("l") // Try to go past right
    board.expect("#2a[data-cursor]").toExist()
  })

  test("h at leftmost column does not move cursor", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("h") // Try to go past left
    board.expect("#1a[data-cursor]").toExist()
  })

  test("ArrowRight behaves like l", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("ArrowRight")
    board.expect("#2a[data-cursor]").toExist()
  })

  test("ArrowLeft behaves like h", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()

    board.press("ArrowLeft")
    board.expect("#1a[data-cursor]").toExist()
  })
})

// =============================================================================
// Jump to First/Last (g/G)
// =============================================================================

describe("First/Last Jump", () => {
  test("G jumps to last card in column", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("G")
    board.expect("#1c[data-cursor]").toExist()
  })

  test("g jumps to first card in column", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.press("j").press("j") // Navigate to 1c
    board.expect("#1c[data-cursor]").toExist()

    board.press("g").press("g")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("g at first card is a no-op", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("g").press("g")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("G at last card is a no-op", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    board.press("G")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("G then g round-trips", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.expect("#1a[data-cursor]").toExist()

    board.press("G")
    board.expect("#1c[data-cursor]").toExist()

    board.press("g").press("g")
    board.expect("#1a[data-cursor]").toExist()
  })
})

// =============================================================================
// StickyY (cursor preserves row position across columns)
// =============================================================================

describe("StickyY", () => {
  test("h/l preserves card index when columns have same length", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"), item("2b"), item("2c"))),
    )
    // Navigate to second card in col1
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    // Move to col2 — should land on 2b (same index)
    board.press("l")
    board.expect("#2b[data-cursor]").toExist()

    // Move back — should return to 1b
    board.press("h")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("l clamps to last card when target column is shorter", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )
    // Navigate to last card in col1
    board.press("j").press("j")
    board.expect("#1c[data-cursor]").toExist()

    // Move to col2 — only has 1 card, should land on 2a
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()
  })
})

// =============================================================================
// Combined Navigation Workflows
// =============================================================================

describe("Combined Navigation", () => {
  test("navigate through a 2x3 grid", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"), item("2b"), item("2c"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    // Navigate to bottom-right
    board.press("j").press("j") // col1: 1c
    board.expect("#1c[data-cursor]").toExist()

    board.press("l") // col2: 2c (stickyY)
    board.expect("#2c[data-cursor]").toExist()

    // Navigate back to top-left
    board.press("k").press("k") // col2: 2a
    board.expect("#2a[data-cursor]").toExist()

    board.press("h") // col1: 1a
    board.expect("#1a[data-cursor]").toExist()
  })

  test("single card: j boundary, k goes to column header, j returns", () => {
    const { board } = testEnv(() => item("board", item("col", item("only"))))
    board.expect("#only[data-cursor]").toExist()

    // j at only card: boundary (no next sibling)
    board.press("j")
    board.expect("#only[data-cursor]").toExist()

    // k at first card: navigates up to column header
    board.press("k")
    board.expect("#only[data-cursor]").not.toExist()

    // j from column header: returns to card
    board.press("j")
    board.expect("#only[data-cursor]").toExist()

    // h/l: boundary (single column)
    board.press("h")
    board.expect("#only[data-cursor]").toExist()

    board.press("l")
    board.expect("#only[data-cursor]").toExist()
  })

  test("G then l then g navigates to top of second column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"), item("2b"))),
    )
    board.press("G") // Jump to 1c
    board.expect("#1c[data-cursor]").toExist()

    board.press("l") // Move to col2
    // Could be 2b (stickyY) or 2a, depends on clamping
    const cursor2a = board.q("#2a[data-cursor]").count()
    const cursor2b = board.q("#2b[data-cursor]").count()
    expect(cursor2a + cursor2b).toBe(1) // Cursor is on one of them

    board.press("g").press("g") // Jump to first in col2
    board.expect("#2a[data-cursor]").toExist()
  })
})
