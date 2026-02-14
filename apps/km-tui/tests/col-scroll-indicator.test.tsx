/**
 * Test: Scroll indicators in COLUMNS view
 *
 * Verifies that:
 * 1. Vertical card overflow indicators (▲/▼) show when cards exceed viewport
 * 2. Horizontal column indicators (◂/▸) show when columns exceed viewport
 *
 * Bead: km-tui.col-scroll
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("col-scroll-indicator", () => {
  // ==========================================================================
  // Vertical card overflow indicators (▲/▼)
  // ==========================================================================

  test("▼ shows in columns view when cards exceed viewport", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))
    const { board } = testEnv(
      () => item("board", item("col1", ...cards)),
      { rows: 20, columns: 80, viewMode: "columns" },
    )

    const text = board.screenshot()
    expect(text).toContain("\u25bc")
  })

  test("▲ shows in columns view after scrolling down", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))
    const { board } = testEnv(
      () => item("board", item("col1", ...cards)),
      { rows: 20, columns: 80, viewMode: "columns" },
    )

    for (let i = 0; i < 15; i++) board.press("j")

    const text = board.screenshot()
    expect(text).toContain("\u25b2")
  })

  // ==========================================================================
  // Horizontal column scroll indicators (◂/▸)
  // ==========================================================================

  test("▸ shows in columns view when more columns exist to the right", () => {
    // maxCols = floor(80/35) = 2 columns fit. With 4 columns, right indicator should show.
    const cols = Array.from({ length: 4 }, (_, i) =>
      item(`col${i}`, item(`task${i}`)),
    )
    const { board } = testEnv(
      () => item("board", ...cols),
      { rows: 20, columns: 80, viewMode: "columns" },
    )

    const text = board.screenshot()
    // Right indicator (▸) should show since columns 2,3 are off-screen
    expect(text).toContain("\u25b8")
  })

  test("◂ shows in columns view after scrolling right", () => {
    const cols = Array.from({ length: 4 }, (_, i) =>
      item(`col${i}`, item(`task${i}`)),
    )
    const { board } = testEnv(
      () => item("board", ...cols),
      { rows: 20, columns: 80, viewMode: "columns" },
    )

    // Move right to next column to trigger horizontal scroll
    board.press("l").press("l")

    const text = board.screenshot()
    // Left indicator (◂) should show since columns before are off-screen
    expect(text).toContain("\u25c2")
  })
})
