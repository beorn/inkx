/**
 * Tests for spatial (visual) navigation (h/l) with stickyY
 *
 * Core invariant: when pressing h/l, the cursor should land on the card
 * in the target column that is closest to the source card's Y position,
 * NOT always the first card.
 *
 * These tests rely on layout notifications being enabled in the test renderer
 * (run.tsx) so that useScreenRectCallback fires and populates the position
 * registry with real screen positions — the same path as production.
 */
import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("spatial navigation: Y-position matching", () => {
  test("position registry is populated by layout notifications", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3")),
          item("ColB", item("B1"), item("B2"), item("B3")),
        ),
      { rows: 24, columns: 80 },
    )

    // Registry should have sections for both columns (0 and 1)
    // This proves useScreenRectCallback fires during test renders
    expect(registry.hasSection(0)).toBe(true)
    expect(registry.hasSection(1)).toBe(true)

    // Each section should have the correct number of items
    expect(registry.getItemCount(0)).toBe(3)
    expect(registry.getItemCount(1)).toBe(3)

    // Positions should be real screen coordinates (not zero)
    const a1Pos = registry.getPosition(0, 0)
    expect(a1Pos).toBeDefined()
    expect(a1Pos!.y).toBeGreaterThan(0) // below the header row

    // Cards in the same column should have increasing Y positions
    const a2Pos = registry.getPosition(0, 1)
    const a3Pos = registry.getPosition(0, 2)
    expect(a2Pos!.y).toBeGreaterThan(a1Pos!.y)
    expect(a3Pos!.y).toBeGreaterThan(a2Pos!.y)

    // Corresponding cards across columns should have matching Y positions
    const b1Pos = registry.getPosition(1, 0)
    expect(b1Pos!.y).toBe(a1Pos!.y) // same row, different column

    // Suppress unused variable warning
    void board
  })

  test("j then l: lands on Y-matched card, not first card", () => {
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
    board.press("j").press("j").press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    // Verify stickyY is set from A4's position
    board.press("l")
    expect(registry.stickyY).not.toBeNull()

    const cursor = board.q("[data-cursor]").textContent()
    // With real positions, should land on exactly B4 (same Y as A4)
    expect(cursor).toContain("B4")
  })

  test("j then l with body column: Y-match still works", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("Some body text"),
          item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
          item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
        ),
      { rows: 24, columns: 120 },
    )

    // Navigate from body to ColA
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("A1")

    board.press("j").press("j").press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    board.press("l")
    const cursor = board.q("[data-cursor]").textContent()
    // With real positions, should land on exactly B4
    expect(cursor).toContain("B4")
  })

  test("3 columns: l from middle column matches Y position", () => {
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

    // Navigate to B3 (last card in ColB)
    board.press("l") // -> B1
    board.press("j").press("j") // -> B3
    expect(board.q("[data-cursor]").textContent()).toContain("B3")

    board.press("l")
    const cursor = board.q("[data-cursor]").textContent()
    // Should match Y position of B3 → C3
    expect(cursor).toContain("C3")
  })

  test("h preserves stickyY across multiple column hops", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
          item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
          item("ColC", item("C1"), item("C2"), item("C3"), item("C4"), item("C5")),
        ),
      { rows: 24, columns: 120 },
    )

    // Navigate to A4
    board.press("j").press("j").press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    // l to ColB → B4, then l to ColC → C4
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("B4")

    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("C4")

    // h back should preserve stickyY → B4
    board.press("h")
    expect(board.q("[data-cursor]").textContent()).toContain("B4")

    // stickyY should still be set
    expect(registry.stickyY).not.toBeNull()
  })

  test("many columns with varying card counts: Y-match with unequal columns", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5"), item("A6"), item("A7"), item("A8")),
          item("ColB", item("B1"), item("B2"), item("B3")),
        ),
      { rows: 24, columns: 80 },
    )

    // Navigate to A8 (last card in long column)
    for (let i = 0; i < 7; i++) board.press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A8")

    board.press("l")
    const cursor = board.q("[data-cursor]").textContent()
    // A8 is at the bottom, ColB only has 3 cards → should land on B3 (closest)
    expect(cursor).toContain("B3")
  })

  test("stickyY is cleared by vertical navigation (j/k)", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3")),
          item("ColB", item("B1"), item("B2"), item("B3")),
        ),
      { rows: 24, columns: 80 },
    )

    // Move down to A3 and then right → sets stickyY
    board.press("j").press("j")
    board.press("l")
    expect(registry.stickyY).not.toBeNull()

    // Move up (vertical nav) → should clear stickyY
    board.press("k")
    expect(registry.stickyY).toBeNull()
  })

  test("h from first column rings bell, l from last column rings bell", () => {
    const { board } = testEnv(() => item("board", item("ColA", item("A1")), item("ColB", item("B1"))), {
      rows: 24,
      columns: 80,
    })

    // h from first column → bell
    board.press("h")
    expect(board.bell).toBe(true)

    // Navigate to last column
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("B1")

    // l from last column → bell
    board.press("l")
    expect(board.bell).toBe(true)
  })
})
