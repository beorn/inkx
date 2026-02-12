/**
 * Test for curswantY sticky navigation bug
 *
 * Bug: When navigating right (l) from a card lower in a column,
 * cursor goes to column header instead of finding a card at similar Y.
 */
import { testEnv, item } from "./helpers/board-test.ts"
import { describe, test, expect } from "vitest"

describe("curswantY sticky navigation", () => {
  test("navigating right preserves Y position (no scroll)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
          item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
          item("ColC", item("C1"), item("C2"), item("C3")),
        ),
      { rows: 24, columns: 80 },
    )

    // Start at first card in first column
    let cursorText = board.q("[data-cursor]").textContent()
    expect(cursorText).toContain("A1")

    // Navigate down to A3
    board.press("j")
    board.press("j")
    cursorText = board.q("[data-cursor]").textContent()
    expect(cursorText).toContain("A3")

    // Navigate right - should land on B3 (or closest card at same Y)
    board.press("l")
    cursorText = board.q("[data-cursor]").textContent()

    // Should NOT be on column header
    expect(cursorText).not.toContain("ColB")

    // Should be on B3 or nearby (same Y position)
    expect(cursorText).toMatch(/B[23]/)

    // Navigate right again - should preserve Y
    board.press("l")
    const cursorText2 = board.q("[data-cursor]").textContent()

    // Should be on C2 or C3 (closest to Y position)
    expect(cursorText2).toMatch(/C[23]/)
  })

  test("navigating right preserves logical position when columns scrolled differently", () => {
    // This test simulates the real-world bug:
    // - Column A has many cards, scrolled so card 10 is visible
    // - Column B has fewer cards, not scrolled
    // - Navigating right from card 10 should find closest card in B
    const { board } = testEnv(
      () =>
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
      { rows: 16, columns: 80 }, // Smaller viewport to force scrolling
    )

    // Navigate down many times to scroll column A
    for (let i = 0; i < 10; i++) {
      board.press("j")
    }

    const cursorText = board.q("[data-cursor]").textContent()
    expect(cursorText).toContain("A11")

    // Navigate right - this is where the bug manifests
    board.press("l")
    const afterL = board.q("[data-cursor]").textContent()

    // The cursor should be on a card near the bottom of B, NOT B1
    // Because A11 is at the bottom of the visible area, stickyY should
    // match a card near the bottom of column B.
    // If it lands on B1, that's the bug (stale/wrong stickyY).
    expect(afterL).not.toContain("ColB") // Not on column header
    expect(afterL).toMatch(/B[45]/) // Near bottom of column B
  })

  test("j/k resets stickyY so next h/l uses new position", () => {
    // j/k resets curswantY to current card's position.
    // h/l keeps curswantY and uses it for cross-column navigation.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
          item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
          item("ColC", item("C1"), item("C2"), item("C3"), item("C4")),
        ),
      { rows: 24, columns: 120 },
    )

    // Start at A1, navigate down to A3
    board.press("j")
    board.press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A3")

    // Move right — stickyY from A3, lands on B3 area
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toMatch(/B[23]/)

    // Move down within column B — j/k RESETS stickyY to new position
    board.press("j")
    board.press("j")
    expect(board.q("[data-cursor]").textContent()).toMatch(/B[45]/)

    // Move right again — stickyY was reset by j, so lands near B5's Y
    board.press("l")
    const afterSecondL = board.q("[data-cursor]").textContent()
    // Should land near bottom (C3 or C4), matching the j/k-updated position
    expect(afterSecondL).toMatch(/C[34]/)
  })

  test("h/l preserves stickyY across multiple columns", () => {
    // When only pressing h/l (no j/k), stickyY stays the same.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3")),
          item("ColB", item("B1"), item("B2"), item("B3")),
          item("ColC", item("C1"), item("C2"), item("C3")),
        ),
      { rows: 24, columns: 120 },
    )

    // Navigate down to A3
    board.press("j")
    board.press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A3")

    // l → B3, l → C3, h → B3 — stickyY preserved throughout
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toMatch(/B[23]/)
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toMatch(/C[23]/)
    board.press("h")
    expect(board.q("[data-cursor]").textContent()).toMatch(/B[23]/)
  })

  test("stickyY persists when navigating through empty columns", () => {
    // This tests the real-world bug:
    // 1. Start on card at Y position
    // 2. Navigate right to empty column (stickyY should be captured)
    // 3. Navigate right again to column with cards
    // 4. Should land on card at original Y position, not first card
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3")),
          item("ColB"), // Empty column
          item("ColC", item("C1"), item("C2"), item("C3")),
        ),
      { rows: 24, columns: 80 },
    )

    // Start at first card
    let cursorText = board.q("[data-cursor]").textContent()
    expect(cursorText).toContain("A1")

    // Navigate down to A3 (bottom of column)
    board.press("j")
    board.press("j")
    cursorText = board.q("[data-cursor]").textContent()
    expect(cursorText).toContain("A3")

    // Navigate right - lands on empty column header
    board.press("l")
    cursorText = board.q("[data-cursor]").textContent()
    expect(cursorText).toContain("ColB")

    // Navigate right again - should use stickyY to land on C3 (same Y as A3)
    board.press("l")
    cursorText = board.q("[data-cursor]").textContent()

    // Should be on C3 (same position as A3), NOT C1 or column header
    expect(cursorText).not.toContain("ColC")
    expect(cursorText).toContain("C3")
  })
})
