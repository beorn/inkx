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

  test("stickyY falls back when registry has no headY for current card", () => {
    // With lazy capture on h/l, if headY is missing the code gracefully
    // skips stickyY capture and falls back to first card in target column.
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
    const cardLayout = registry.getNodeOptional("A4")
    if (cardLayout) {
      cardLayout.headY = undefined
      cardLayout.headHeight = undefined
    }

    // Press l — lazy capture skips (no headY), falls back to first card in target column
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("B1")
  })

  test("stickyY throws when registry has no entry for current card", () => {
    // With lazy capture on h/l, the focused card must always be measured.
    // If the card is completely unregistered, it's a programming error.
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

    // Simulate: completely remove A4 from registry
    registry.unregisterCard(0, 3)

    // Press l — lazy capture can't find card → falls back to first card in target column
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("B1")
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
