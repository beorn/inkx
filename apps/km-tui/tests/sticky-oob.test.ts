/**
 * stickyX/stickyY out-of-bounds behavior test.
 *
 * Bead: km-tui.sticky-reset-oob
 *
 * When navigating from a tall column to a short column, and then navigating
 * vertically (j/k) within the short column, the stickyY should be properly
 * managed so subsequent h/l navigation works as expected.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("sticky out-of-bounds behavior", () => {
  test("move from deep card in tall col to short col, then back", () => {
    const { board, registry } = testEnv(() =>
      item("board",
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        item("col2", item("2a")),
      ),
    )

    // Navigate to card 1e (deep in col1)
    board.press("j").press("j").press("j").press("j")
    board.expect("#1e[data-cursor]").toExist()

    // Press 'l' — should go to col2's only card (clamped from deep Y)
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()
    // stickyY should be set from the deep card position
    expect(registry.getStickyY()).not.toBeNull()

    // Press 'h' — should go back to col1 at card 1e (stickyY preserved)
    board.press("h")
    board.expect("#1e[data-cursor]").toExist()
  })

  test("move from deep card in tall col to short col, navigate vertically, then back", () => {
    const { board, registry } = testEnv(() =>
      item("board",
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        item("col2", item("2a"), item("2b")),
      ),
    )

    // Navigate to card 1e (deep in col1)
    board.press("j").press("j").press("j").press("j")
    board.expect("#1e[data-cursor]").toExist()

    // Press 'l' — should go to col2 (stickyY captures from 1e)
    board.press("l")
    board.expect("#2b[data-cursor]").toExist()

    // Navigate UP within col2 (j/k clears stickyY)
    board.press("k")
    board.expect("#2a[data-cursor]").toExist()
    expect(registry.getStickyY()).toBeNull() // cleared by vertical nav

    // Press 'h' — no stickyY, should land on first card in col1
    board.press("h")
    // With stickyY cleared, lazy capture fires from current position (2a)
    // This captures stickyY from 2a's Y, then navigates to the matching card in col1
    const cursorLoc = board.q("[data-cursor]")
    expect(cursorLoc.count()).toBe(1)
  })

  test("stickyX round-trip: board -> deep col -> board -> different col", () => {
    const { board, registry } = testEnv(() =>
      item("board",
        item("col0", item("a0")),
        item("col1", item("b0")),
        item("col2", item("c0")),
      ),
    )

    // Navigate to col2
    board.press("j") // board -> col0
    board.press("l").press("l") // col0 -> col1 -> col2

    board.press("j") // col2 -> c0
    board.press("k") // c0 -> col2 header
    board.press("k") // col2 header -> board (sets stickyX=2)
    expect(registry.getStickyX()).toBe(2)

    // j from board should go to col2 (via stickyX)
    board.press("j")
    board.expect("#col2[data-cursor]").toExist()
  })
})
