/**
 * stickyY reset on boundary actions
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

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
// =============================================================================
// Rendering invariants — checked after every navigation action
// =============================================================================

function assertInvariants(
  board: ReturnType<typeof testEnv>["board"],
  label: string,
) {
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
function press(
  board: ReturnType<typeof testEnv>["board"],
  key: string,
  label: string,
) {
  board.press(key)
  assertInvariants(board, `after ${label}`)
  return board
}

// =============================================================================
// Tests
// =============================================================================

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

    // Press h — boundary (leftmost column). Lazy capture fires and sets stickyY.
    press(board, "h", "h boundary at leftmost")
    board.expect("#1e[data-cursor]").toExist()

    // stickyY should be cleared after boundary
    expect(registry.stickyY, "stickyY cleared after boundary h").toBeNull()
  })

  test("3-column cross-column navigation with boundary and invariants", () => {
    const { board, registry } = testEnv(() =>
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

    // Boundary h at leftmost — stickyY cleared again
    press(board, "h", "h boundary at col1")
    board.expect("#1a[data-cursor]").toExist()
    expect(registry.stickyY, "stickyY cleared after leftmost boundary").toBeNull()

    // l should fresh-capture from 1a
    press(board, "l", "l to col2 from 1a")
    board.expect("#2a[data-cursor]").toExist()
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

    // Press h — boundary (leftmost col). Lazy capture fires then is cleared.
    press(board, "h", "h boundary at 1c")
    board.expect("#1c[data-cursor]").toExist()
    expect(registry.stickyY, "stickyY null after boundary h").toBeNull()

    // Press l — lazy capture fires fresh from 1c, should land on 2c
    press(board, "l", "l from 1c to col2")
    board.expect("#2c[data-cursor]").toExist()
    expect(registry.stickyY, "stickyY set after successful l").not.toBeNull()

    // Navigate up to 2a, then h back — verify column alignment preserved
    press(board, "k", "k to 2b")
    press(board, "k", "k to 2a")
    board.expect("#2a[data-cursor]").toExist()

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
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a"), item("2b"), item("2c")),
      ),
    )

    assertInvariants(board, "initial")

    // Navigate to 1c
    press(board, "j", "j to 1b")
    press(board, "j", "j to 1c")
    board.expect("#1c[data-cursor]").toExist()

    // Boundary h — clears stickyY
    press(board, "h", "h boundary")
    expect(registry.stickyY).toBeNull()

    // j down — also clears stickyY (no error from clearing null)
    press(board, "j", "j boundary at bottom")
    board.expect("#1c[data-cursor]").toExist()
    expect(registry.stickyY).toBeNull()

    // k up then l — should work normally
    press(board, "k", "k to 1b")
    board.expect("#1b[data-cursor]").toExist()
    press(board, "l", "l to col2")
    board.expect("#2b[data-cursor]").toExist()
  })
})
