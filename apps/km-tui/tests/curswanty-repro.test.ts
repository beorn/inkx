/**
 * Reproduce stickyY bug: cursor down to non-first card, then h/l always
 * lands on first card in target column instead of matching Y position.
 *
 * Root cause: In the real app, React renders asynchronously. When you press
 * j (move down) then l (move right) quickly, VirtualList may not have
 * re-rendered the new card yet. The layout registry doesn't have the card's
 * headY, so stickyY capture fails, and navigation falls back to first card.
 *
 * In tests, act() forces synchronous rendering, masking this race condition.
 * We reproduce it by clearing the registry's headY for the current card before
 * pressing l, simulating the "not yet rendered" state.
 */
import { testEnv, item } from "./helpers/board-test.ts"
import { describe, test, expect } from "vitest"

describe("stickyY reliability", () => {
  test("j then l: lands on matching card (basic, no race condition)", () => {
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
        ),
      { rows: 24, columns: 80 },
    )

    expect(board.q("[data-cursor]").textContent()).toContain("A1")
    board.press("j").press("j").press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    board.press("l")
    const cursor = board.q("[data-cursor]").textContent()
    expect(cursor).not.toContain("B1")
    expect(cursor).toMatch(/B[34]/)
  })

  test("stickyY fallback when registry has no headY for current card", () => {
    // Simulates the real-app race condition: j moves cardIndex but React
    // hasn't re-rendered, so the card at the new index has no headY in registry.
    const { board, registry } = testEnv(
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
        ),
      { rows: 24, columns: 80 },
    )

    expect(board.q("[data-cursor]").textContent()).toContain("A1")

    // Navigate to A4
    board.press("j").press("j").press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    // Simulate race condition: clear current card's headY from registry
    // (as if VirtualList hasn't rendered it yet after scroll)
    const cardEntry = registry.getCardOptional(0, 3) // colIndex=0, cardIndex=3 (A4)
    if (cardEntry) {
      cardEntry.layout.headY = undefined
      cardEntry.layout.headHeight = undefined
    }

    // Press l — stickyY capture will fail (no headY), but should NOT
    // fall back to first card. Should use index-based fallback.
    board.press("l")
    const cursor = board.q("[data-cursor]").textContent()

    // BUG: Without fix, this lands on B1 (first card) because stickyY is null
    // and navigateHorizontal falls through to cardAt(targetCards, 0)
    expect(cursor).not.toContain("B1")
    expect(cursor).toMatch(/B[34]/)
  })

  test("stickyY fallback when registry has no entry for current card", () => {
    // Even more extreme: the card isn't registered at all (VirtualList
    // unmounted the old card and hasn't mounted the new one yet)
    const { board, registry } = testEnv(
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
        ),
      { rows: 24, columns: 80 },
    )

    expect(board.q("[data-cursor]").textContent()).toContain("A1")

    // Navigate to A4
    board.press("j").press("j").press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    // Simulate: completely remove A4 from registry (as if not rendered yet)
    registry.unregisterCard(0, 3)

    // Press l — should use index-based fallback, NOT first card
    board.press("l")
    const cursor = board.q("[data-cursor]").textContent()

    // BUG: Without fix, lands on B1
    expect(cursor).not.toContain("B1")
    expect(cursor).toMatch(/B[34]/)
  })

  test("single j then l: basic case works", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3")),
          item("ColB", item("B1"), item("B2"), item("B3")),
        ),
      { rows: 24, columns: 80 },
    )

    expect(board.q("[data-cursor]").textContent()).toContain("A1")
    board.press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A2")

    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("B2")
  })
})
