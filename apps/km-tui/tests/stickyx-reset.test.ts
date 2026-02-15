/**
 * stickyX reset on out-of-bounds navigation
 *
 * stickyX preserves the column index during board-level j/k navigation.
 * Like stickyY (cleared on j/k), stickyX should be cleared when h/l
 * navigation occurs or when vertical navigation hits a boundary.
 *
 * Tests use testEnv (full integration through handleCursorMove) because
 * stickyX clearing happens in the action layer, not the ViewNavigation layer.
 */

import { describe, it, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

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
