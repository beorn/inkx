/**
 * Tests for spatial (visual) navigation (h/l) with stickyY
 *
 * Core invariant: when pressing h/l, the cursor should land on the card
 * in the target column that is closest to the source card's Y position,
 * NOT always the first card.
 */
import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("spatial navigation: Y-position matching", () => {
  test("j then l: lands on Y-matched card, not first card", () => {
    const { board } = testEnv(
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

    board.press("l")
    const cursor = board.q("[data-cursor]").textContent()
    // Should match Y position of A4, not always land on B1
    expect(cursor).not.toContain("B1")
    expect(cursor).toMatch(/B[34]/)
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
    // Should match Y position, not always land on B1
    expect(cursor).not.toContain("B1")
    expect(cursor).toMatch(/B[34]/)
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
    const { board } = testEnv(
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

    // l to ColB (should be B4), then l to ColC (should be C4)
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toMatch(/B[34]/)

    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toMatch(/C[34]/)

    // h back should preserve position
    board.press("h")
    expect(board.q("[data-cursor]").textContent()).toMatch(/B[34]/)
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
})
