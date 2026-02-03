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
          item(
            "ColA",
            item("A1"),
            item("A2"),
            item("A3"),
            item("A4"),
            item("A5"),
          ),
          item(
            "ColB",
            item("B1"),
            item("B2"),
            item("B3"),
            item("B4"),
            item("B5"),
          ),
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

    // The cursor should be on the last visible card in B (B5), NOT B1
    // Because A11 is at the bottom of the visible area, B5 should be closest
    // If it lands on B1, that's the bug
    expect(afterL).not.toContain("ColB") // Not on column header
    // With logical position preservation, should land on B5 (last card)
    // since A11 is at the bottom of the visible area
    expect(afterL).toContain("B5")
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
