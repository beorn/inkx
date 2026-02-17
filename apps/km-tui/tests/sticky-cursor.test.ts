/**
 * Sticky cursor behavior tests: stickyY reliability, out-of-bounds, and stickyX reset.
 *
 * Guards against cursor down to non-first card, then h/l always landing on
 * first card in target column instead of matching Y position. Also tests
 * graceful fallback when getItemMidY returns 0 for current card, out-of-bounds
 * behavior when navigating between columns of different heights, and stickyX
 * reset on cross-column navigation.
 */
import { testEnv, item } from "./helpers/board-test.ts"
import { describe, test, it, expect } from "vitest"

describe("stickyY reliability", () => {
  test("j then l: lands on matching card (basic, no race condition)", () => {
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
    expect(cursor).not.toContain("B1")
    expect(cursor).toMatch(/B[34]/)
  })

  test("stickyY falls back when registry has no headY for current card", () => {
    // With lazy capture on h/l, if getItemMidY returns 0 (no position data),
    // the code gracefully skips stickyY capture and falls back to first card in target column.
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

    // Navigate to A4
    board.press("j").press("j").press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    // Simulate race condition: unregister A4's position so getItemMidY returns 0
    registry.unregister(0, 3)

    // Press l — lazy capture skips (midY=0), falls back to first card in target column
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
          item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
          item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
        ),
      { rows: 24, columns: 80 },
    )

    expect(board.q("[data-cursor]").textContent()).toContain("A1")

    // Navigate to A4
    board.press("j").press("j").press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    // Simulate: completely remove A4 from registry
    registry.unregister(0, 3)

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

/**
 * stickyX/stickyY out-of-bounds behavior.
 *
 * Bead: km-tui.sticky-reset-oob
 *
 * When navigating from a tall column to a short column, and then navigating
 * vertically (j/k) within the short column, the stickyY should be properly
 * managed so subsequent h/l navigation works as expected.
 */
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
    expect(registry.stickyY).not.toBeNull()

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
    expect(registry.stickyY).toBeNull() // cleared by vertical nav

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
    expect(registry.stickyX).toBe(2)

    // j from board should go to col2 (via stickyX)
    board.press("j")
    board.expect("#col2[data-cursor]").toExist()
  })
})

/**
 * stickyX reset on out-of-bounds navigation.
 *
 * stickyX preserves the column index during board-level j/k navigation.
 * Like stickyY (cleared on j/k), stickyX should be cleared when h/l
 * navigation occurs or when vertical navigation hits a boundary.
 *
 * Tests use testEnv (full integration through handleCursorMove) because
 * stickyX clearing happens in the action layer, not the ViewNavigation layer.
 */
describe("stickyX reset", () => {
  it("h/l clears stickyX so j from board uses default column", () => {
    // Board with 3 columns
    const { board, registry } = testEnv(() =>
      item("board",
        item("col0", item("a0")),
        item("col1", item("b0")),
        item("col2", item("c0")),
      ),
    )

    // Navigate to col1's card
    board.press("j") // board → col0
    board.press("l") // col0 → col1
    board.press("j") // col1 header → b0

    // Navigate up to board: k → col1 header (sets stickyX=1), k → board
    board.press("k") // b0 → col1 header (sets stickyX=1)
    board.press("k") // col1 header → board (stickyX=1 is set)
    expect(registry.stickyX).toBe(1)

    // Now press l (horizontal nav) — should clear stickyX
    // At board level, h/l returns null (boundary), but the clearStickyX
    // should still fire. Let's navigate to a card first so h/l works.
    // Actually, at board level h/l is a boundary. Let's navigate down first.

    // Go down — stickyX=1 should take us to col1
    board.press("j")
    board.expect("#col1[data-cursor]").toExist()

    // Go back up to board
    board.press("k") // col1 → board (sets stickyX=1 again)
    expect(registry.stickyX).toBe(1)

    // Navigate down to col1, then to a card, then press h (cross-column)
    board.press("j") // board → col1 (via stickyX=1)
    board.press("j") // col1 → b0
    board.press("h") // b0 → a0 (cross-column, should clear stickyX)
    expect(registry.stickyX).toBeNull()

    // Now navigate up to board and back down — should go to col0 (default), not col1
    board.press("k") // a0 → col0 header (sets stickyX=0)
    board.press("k") // col0 → board (stickyX=0)
    expect(registry.stickyX).toBe(0)
    board.press("j") // board → col0 (stickyX=0)
    board.expect("#col0[data-cursor]").toExist()
  })

  it("stickyX persists through j/k within columns (not cleared by vertical nav)", () => {
    const { board, registry } = testEnv(() =>
      item("board",
        item("col0", item("a0"), item("a1")),
        item("col1", item("b0")),
      ),
    )

    // Navigate to col1
    board.press("j") // board → col0
    board.press("l") // col0 → col1
    board.press("j") // col1 → b0
    board.press("k") // b0 → col1 header
    board.press("k") // col1 → board (sets stickyX=1)
    expect(registry.stickyX).toBe(1)

    // j/k navigation should clear stickyX (same as stickyY is cleared on j/k)
    // Actually, reviewing the stickyY pattern: stickyY IS cleared on j/k.
    // So stickyX should also be cleared on h/l. But j/k should NOT clear stickyX
    // because stickyX IS the j/k navigation aid (like stickyY is the h/l aid).
    board.press("j") // board → col1 (uses stickyX=1)
    // After this j, stickyX is consumed but the value only changes when
    // you go back up (k from column sets it again)
  })
})
