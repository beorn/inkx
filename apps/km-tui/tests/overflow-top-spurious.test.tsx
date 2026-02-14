/**
 * Test: spurious ▲ overflow indicator when at top of column
 *
 * Verifies that overflow indicators don't show ▲ when the cursor is at the
 * first card in a column (nothing hidden above the viewport).
 *
 * Root cause: zero-height children in scroll containers were counted as
 * "hidden above" because `cp.bottom <= visibleTop` evaluates to `0 <= 0 = true`.
 * Fixed in inkx layout-phase by skipping zero-height children from hidden counts.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("overflow-top-spurious", () => {
  test("no spurious ▲ at top (cards view)", () => {
    const children = Array.from({ length: 30 }, (_, i) => item(`card-${i}`))
    const { board } = testEnv(
      () => item("board", item("col1", ...children)),
      { rows: 24, columns: 80 },
    )

    const text = board.screenshot()
    expect(text).not.toContain("\u25b2")
    expect(text).toContain("\u25bc")
  })

  test("no spurious ▲ at top (columns view)", () => {
    const children = Array.from({ length: 40 }, (_, i) => item(`card-${i}`))
    const { board } = testEnv(
      () => item("board", item("col1", ...children)),
      { rows: 24, columns: 80, viewMode: "columns" },
    )

    const text = board.screenshot()
    expect(text).not.toContain("\u25b2")
    expect(text).toContain("\u25bc")
  })

  test("▲ disappears after scrolling back to top", () => {
    const children = Array.from({ length: 30 }, (_, i) => item(`card-${i}`))
    const { board } = testEnv(
      () => item("board", item("col1", ...children)),
      { rows: 24, columns: 80 },
    )

    // Scroll down
    for (let i = 0; i < 10; i++) board.press("j")
    expect(board.screenshot()).toContain("\u25b2")

    // Scroll back to top
    for (let i = 0; i < 10; i++) board.press("k")
    expect(board.screenshot()).not.toContain("\u25b2")
  })
})
