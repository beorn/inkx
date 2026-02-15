/**
 * Verification: km-tui.sticky-reset-oob
 *
 * Bug: navigating to edges, moving out of bounds — stickyX/stickyY values
 * may become stale or incorrect.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"

describe("sticky reset on out-of-bounds (km-tui.sticky-reset-oob)", () => {
  test("stickyX does not cause jump after boundary hit on left edge", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("col0", item("a0"), item("a1")),
          item("col1", item("b0"), item("b1")),
          item("col2", item("c0"), item("c1")),
        ),
      { columns: 100, rows: 24 },
    )

    // Navigate to col2
    board.press("l").press("l")
    board.expect("#c0[data-cursor]").toExist()

    // Navigate back to col0
    board.press("h").press("h")
    board.expect("#a0[data-cursor]").toExist()

    // Hit left boundary
    board.press("h")
    // Should still be on a0 (boundary)
    board.expect("#a0[data-cursor]").toExist()

    // Now navigate down and up — stickyX should not cause unexpected jumps
    board.press("j")
    board.expect("#a1[data-cursor]").toExist()

    board.press("k")
    board.expect("#a0[data-cursor]").toExist()
  })

  test("stickyY does not cause jump after boundary hit on top edge", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col0", item("a0"), item("a1"), item("a2")),
          item("col1", item("b0"), item("b1")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate down to a2
    board.press("j").press("j")
    board.expect("#a2[data-cursor]").toExist()

    // Navigate up to top
    board.press("k").press("k")
    board.expect("#a0[data-cursor]").toExist()

    // Hit top boundary
    board.press("k")
    // Should go to column header or board level, not crash
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)

    // Navigate right — should work normally
    board.press("l")
    const afterRight = board.q("[data-cursor]").textContent()
    // Should be in col1 somewhere
    expect(afterRight).toMatch(/b0|b1|col1/)
  })

  test("stickyX persists correctly through board level navigation", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("col0", item("a0")),
          item("col1", item("b0")),
          item("col2", item("c0")),
        ),
      { columns: 100, rows: 24 },
    )

    // Navigate to col2's card
    board.press("l").press("l")
    board.expect("#c0[data-cursor]").toExist()

    // Go to col2 header
    board.press("k")
    board.expect("#col2[data-cursor]").toExist()

    // Go to board level
    board.press("k")
    board.expect("#board[data-cursor]").toExist()

    // stickyX should be 2 (col2)
    expect(registry.getStickyX()).toBe(2)

    // j from board should go back to col2 via stickyX
    board.press("j")
    board.expect("#col2[data-cursor]").toExist()
  })
})
