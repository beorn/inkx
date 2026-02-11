/**
 * Regression tests for curswantY (stickyY) cross-column navigation.
 *
 * When navigating down (j) in a scrolled column, then right (l),
 * the cursor should land on a card at the same SCREEN position in
 * the target column, not at the same CONTENT position.
 *
 * Root cause (fixed): inkx notifyLayoutSubscribers only fired on
 * contentRect changes, missing screenRect changes from scrolling.
 * Card positions were registered in content space, making cross-column
 * navigation match wrong cards in columns with different scroll offsets.
 */
import { testEnv, item } from "./helpers/board-test.ts"
import { describe, test, expect } from "vitest"

/** Generate N items with prefix */
function items(prefix: string, count: number): ReturnType<typeof item>[] {
  return Array.from({ length: count }, (_, i) =>
    item(`${prefix}${String(i + 1).padStart(2, "0")}`),
  )
}

/** Extract card number from cursor text (e.g., "B03" → 3) */
function cursorCardNum(board: ReturnType<typeof testEnv>["board"]): {
  prefix: string
  num: number
} {
  const text = board.q("[data-cursor]").textContent()
  const match = text.match(/([A-Z])(\d+)/)
  if (!match) throw new Error(`Cannot parse cursor text: ${text}`)
  return { prefix: match[1]!, num: parseInt(match[2]!, 10) }
}

describe("curswantY: scrolled column navigation", () => {
  test("scrolled source → unscrolled target: lands near screen Y, not content Y", () => {
    // Small viewport forces scrolling: 12 rows, cards ~3 rows each,
    // only ~3 cards visible. Column A has 15 cards.
    const { board, registry } = testEnv(
      () =>
        item("board", item("ColA", ...items("A", 15)), item("ColB", ...items("B", 15))),
      { rows: 12, columns: 80 },
    )

    expect(board.q("[data-cursor]").textContent()).toContain("A01")

    // Navigate down 10 times — forces column A to scroll
    for (let i = 0; i < 10; i++) board.press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("A11")

    // Navigate right — should land at screen-relative position in column B
    board.press("l")
    const landed = board.q("[data-cursor]").textContent()

    // Extract card number from text (e.g., "B03" → 3)
    const match = landed.match(/B(\d+)/)
    expect(match).not.toBeNull()
    const landedCardNum = parseInt(match![1]!, 10)

    // With screen-relative positions: should land on B03-B04 (visible in column B)
    // With content-relative positions (the bug): would land on B11 (off-screen)
    expect(landedCardNum).toBeLessThanOrEqual(5)
  })

  test("card positions update after scrolling (screen-relative, not content-relative)", () => {
    const { board, registry } = testEnv(
      () =>
        item("board", item("ColA", ...items("A", 20)), item("ColB", ...items("B", 10))),
      { rows: 12, columns: 80 },
    )

    // Record initial position
    const initial = registry.getNodeOptional("A01")?.y
    expect(initial).toBeDefined()

    // Scroll down
    for (let i = 0; i < 12; i++) board.press("j")

    // Card 0 should now have a different (lower) Y — it scrolled off screen
    const afterScroll = registry.getNodeOptional("A01")?.y
    // With screen positions: y decreases (scrolled up/off screen)
    // With content positions (the bug): y stays the same
    expect(afterScroll).not.toBe(initial)
  })

  test("round-trip: j×N → l → h returns to same card", () => {
    // This is the exact pattern that fails in the real TUI:
    // navigate down to card N, go right, go left — should return to card N.
    const { board, registry } = testEnv(
      () =>
        item("board", item("ColA", ...items("A", 10)), item("ColB", ...items("B", 10))),
      { rows: 20, columns: 80 },
    )

    expect(cursorCardNum(board)).toEqual({ prefix: "A", num: 1 })

    // Navigate down 4 times → card A05
    for (let i = 0; i < 4; i++) board.press("j")
    expect(cursorCardNum(board)).toEqual({ prefix: "A", num: 5 })

    // Press l to go right
    board.press("l")
    const rightCard = cursorCardNum(board)
    expect(rightCard.prefix).toBe("B")

    // Press h to go back left — should return to A05 (same screen Y)
    board.press("h")
    const backCard = cursorCardNum(board)
    expect(backCard.prefix).toBe("A")
    expect(backCard.num).toBe(5) // Must return to same card
  })

  test("round-trip with scrolling: j×N → l → h returns to same card", () => {
    // Smaller viewport to force scrolling (12 rows, ~3 cards visible)
    const { board, registry } = testEnv(
      () =>
        item("board", item("ColA", ...items("A", 15)), item("ColB", ...items("B", 15))),
      { rows: 12, columns: 80 },
    )

    expect(cursorCardNum(board)).toEqual({ prefix: "A", num: 1 })

    // Navigate down 6 times → card A07 (will scroll)
    for (let i = 0; i < 6; i++) board.press("j")
    expect(cursorCardNum(board)).toEqual({ prefix: "A", num: 7 })

    // Diagnostic: what's stickyY right now?
    const stickyAfterJ = registry.getStickyY()

    // Press l to go right
    board.press("l")
    const rightCard = cursorCardNum(board)
    expect(rightCard.prefix).toBe("B")

    // Press h to go back left — should return to A07
    board.press("h")
    const backCard = cursorCardNum(board)
    expect(backCard.prefix).toBe("A")

    // After round-trip, should return to same card (or very close)
    // Bug: without proper screen-relative positions, returns to A01 or other wrong card
    expect(backCard.num).toBeGreaterThanOrEqual(5)
    expect(backCard.num).toBeLessThanOrEqual(9)
  })

  test("stickyY preserved across multiple h/l moves", () => {
    // j×N sets stickyY, then l l l should all preserve the same Y
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("ColA", ...items("A", 10)),
          item("ColB", ...items("B", 10)),
          item("ColC", ...items("C", 10)),
        ),
      { rows: 20, columns: 120 },
    )

    // Navigate down 3 times → card A04
    for (let i = 0; i < 3; i++) board.press("j")
    expect(cursorCardNum(board)).toEqual({ prefix: "A", num: 4 })

    // Press l to go to column B
    board.press("l")
    const bCard = cursorCardNum(board)
    expect(bCard.prefix).toBe("B")
    const bNum = bCard.num

    // Press l again to go to column C
    board.press("l")
    const cCard = cursorCardNum(board)
    expect(cCard.prefix).toBe("C")

    // All three columns should land at roughly the same card index
    // (±1 due to different card heights is acceptable)
    expect(cCard.num).toBeGreaterThanOrEqual(bNum - 1)
    expect(cCard.num).toBeLessThanOrEqual(bNum + 1)

    // Now h h back — should return through same cards
    board.press("h")
    expect(cursorCardNum(board).prefix).toBe("B")
    expect(cursorCardNum(board).num).toBe(bNum)

    board.press("h")
    expect(cursorCardNum(board)).toEqual({ prefix: "A", num: 4 })
  })

  test("diagnostic: position state at each round-trip step", () => {
    // Trace exact registry state at every step of j×4 → l → h
    const { board, registry } = testEnv(
      () =>
        item("board", item("ColA", ...items("A", 10)), item("ColB", ...items("B", 10))),
      { rows: 20, columns: 80 },
    )

    // Step 1: initial state
    expect(cursorCardNum(board)).toEqual({ prefix: "A", num: 1 })

    // Step 2: j×4
    for (let i = 0; i < 4; i++) board.press("j")
    expect(cursorCardNum(board)).toEqual({ prefix: "A", num: 5 })

    // Capture positions of ALL cards in col 0 at this point
    const positionsBeforeL: Record<string, { y: number; headY?: number; cardHeight: number }> = {}
    for (let i = 1; i <= 10; i++) {
      const id = `A${String(i).padStart(2, "0")}`
      const layout = registry.getNodeOptional(id)
      if (layout) {
        positionsBeforeL[id] = { y: layout.y, headY: layout.headY, cardHeight: layout.cardHeight }
      }
    }

    // Step 3: l (go right)
    board.press("l")
    const stickyY = registry.getStickyY()
    const rightCard = cursorCardNum(board)
    expect(rightCard.prefix).toBe("B")

    // Capture positions of ALL cards in col 0 AFTER l (cursor in col 1 now)
    const positionsAfterL: Record<string, { y: number; headY?: number; cardHeight: number }> = {}
    for (let i = 1; i <= 10; i++) {
      const id = `A${String(i).padStart(2, "0")}`
      const layout = registry.getNodeOptional(id)
      if (layout) {
        positionsAfterL[id] = { y: layout.y, headY: layout.headY, cardHeight: layout.cardHeight }
      }
    }

    // Step 4: h (go back)
    board.press("h")
    const backCard = cursorCardNum(board)

    // Verify positions didn't change when cursor left col 0
    for (const [idx, posBefore] of Object.entries(positionsBeforeL)) {
      const posAfter = positionsAfterL[Number(idx)]
      if (posBefore && posAfter) {
        // Positions should be identical (scroll frozen on deselection)
        expect(posAfter.y).toBe(posBefore.y)
        if (posBefore.headY !== undefined) {
          expect(posAfter.headY).toBe(posBefore.headY)
        }
      }
    }

    // stickyY should match A05's head midpoint
    const a05 = positionsBeforeL[4]
    if (a05?.headY !== undefined) {
      const expectedStickyY = a05.headY + 0.5 // headHeight is always 1
      expect(stickyY).toBe(expectedStickyY)
    }

    // Round-trip should return to A05
    expect(backCard).toEqual({ prefix: "A", num: 5 })
  })

  test("round-trip with very tall cards (real-world reproduction)", () => {
    // Reproduce exact real-TUI scenario: first card is massive, forcing heavy scroll.
    // Each child adds ~3 rows to parent card, so 10 children ≈ 30+ rows.
    const manyChildren = Array.from({ length: 10 }, (_, i) =>
      item(`child${i + 1}`),
    )

    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item(
            "ColA",
            item("A01-huge", ...manyChildren), // ~35 rows (fills 30-row viewport)
            item("A02", item("x1"), item("x2")),
            item("A03", item("x3"), item("x4")),
            item("A04", item("x5"), item("x6")),
            item("A05", item("x7"), item("x8")),
          ),
          item("ColB", ...items("B", 5)),
        ),
      { rows: 30, columns: 100 },
    )

    expect(board.q("[data-cursor]").textContent()).toContain("A01")

    // j×4 to A05 — must scroll past the massive A01 card
    for (let i = 0; i < 4; i++) board.press("j")
    const afterJ = board.q("[data-cursor]").textContent()
    expect(afterJ).toContain("A05")

    // Snapshot card positions before l
    const a05Before = registry.getNodeOptional("A05")

    // l → go right
    board.press("l")
    const stickyAfterL = registry.getStickyY()
    const landedRight = board.q("[data-cursor]").textContent()

    // h → go back
    board.press("h")
    const landedBack = board.q("[data-cursor]").textContent()

    // Diagnostic: dump state on failure
    if (!landedBack.includes("A05")) {
      const a05After = registry.getNodeOptional("A05")
      const a01After = registry.getNodeOptional("A01")
      throw new Error(
        `Round-trip failed! Landed on "${landedBack}" instead of A05\n` +
          `  stickyY after l: ${stickyAfterL}\n` +
          `  A01 pos (after h): y=${a01After?.y} headY=${a01After?.headY} cardH=${a01After?.cardHeight}\n` +
          `  A05 pos (before l): y=${a05Before?.y} headY=${a05Before?.headY}\n` +
          `  A05 pos (after h): y=${a05After?.y} headY=${a05After?.headY}\n` +
          `  landed right: "${landedRight}"\n` +
          `  registry dump:\n${registry.dump()}`,
      )
    }

    expect(landedBack).toContain("A05")
  })

  test("stale registry entries from unmounted cards don't corrupt navigation", () => {
    // Reproduce the real-TUI bug: card 0 is very tall, gets unmounted by VirtualList
    // after scrolling, but its stale registry entry (with large cardHeight) causes
    // findCardAtYVisual to return card 0 instead of the correct card.
    //
    // Requires enough cards (40+) to push card 0 out of VirtualList's overscan
    // window (OVERSCAN=15, so need cursor beyond index 18+ for card 0 to unmount).

    // Card 0: 15 children ≈ 45+ rows, fills multiple screens
    const hugeChildren = Array.from({ length: 15 }, (_, i) =>
      item(`child${i + 1}`),
    )

    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item(
            "ColA",
            item("A00-huge", ...hugeChildren), // Very tall card
            ...Array.from({ length: 39 }, (_, i) =>
              item(`A${String(i + 1).padStart(2, "0")}`),
            ), // 39 more normal cards (total 40)
          ),
          item("ColB", ...items("B", 20)),
        ),
      { rows: 12, columns: 80 },
    )

    expect(board.q("[data-cursor]").textContent()).toContain("A00")

    // Navigate down 25 times — well past overscan range for card 0
    for (let i = 0; i < 25; i++) board.press("j")
    const cursorAfterJ = board.q("[data-cursor]").textContent()
    const cursorMatch = cursorAfterJ.match(/A(\d+)/)
    expect(cursorMatch).not.toBeNull()
    const cursorIdx = parseInt(cursorMatch![1]!, 10)
    expect(cursorIdx).toBeGreaterThanOrEqual(20)

    // Card 0 should have been unmounted by VirtualList (beyond overscan).
    // With the fix: its registry entry was cleaned up.
    // Without the fix: stale entry with {y: ~2, cardHeight: ~45} remains.

    // Press l — capture stickyY from current card's position
    board.press("l")
    const stickyY = registry.getStickyY()
    expect(stickyY).not.toBeNull()

    // Press h — should return to the same card (or very close)
    board.press("h")
    const backText = board.q("[data-cursor]").textContent()
    const backMatch = backText.match(/A(\d+)/)
    expect(backMatch).not.toBeNull()
    const backIdx = parseInt(backMatch![1]!, 10)

    // Should return to roughly the same card (±2 due to position matching)
    // BUG (without fix): returns to card 0 because stale entry's huge bounding
    // box intersects stickyY in findCardAtYVisual
    expect(backIdx).toBeGreaterThanOrEqual(cursorIdx - 2)
    expect(backIdx).toBeLessThanOrEqual(cursorIdx + 2)
  })

  test("stickyY lazy capture: null after j, set on first h/l", () => {
    // stickyY should be null after j (cleared to avoid stale pre-scroll values).
    // It gets captured lazily from the current card when h/l is pressed,
    // by which time positions are up-to-date (post-render).
    const { board, registry } = testEnv(
      () =>
        item("board", item("ColA", ...items("A", 15)), item("ColB", ...items("B", 15))),
      { rows: 12, columns: 80 },
    )

    // Navigate down 5 times to force some scrolling
    for (let i = 0; i < 5; i++) board.press("j")
    expect(cursorCardNum(board)).toEqual({ prefix: "A", num: 6 })

    // stickyY should be null after j (lazy capture semantics)
    expect(registry.getStickyY()).toBeNull()

    // Press l — stickyY gets captured from current card's up-to-date position
    board.press("l")
    const stickyAfterL = registry.getStickyY()
    expect(stickyAfterL).not.toBeNull()

    // The captured stickyY should match the source card's current screen position
    const sourceLayout = registry.getNodeOptional("A06")
    if (sourceLayout && stickyAfterL !== null) {
      const headY = sourceLayout.headY
      const headHeight = sourceLayout.headHeight
      if (headY !== undefined && headHeight !== undefined) {
        const expectedStickyY = headY + headHeight / 2
        expect(stickyAfterL).toBe(expectedStickyY)
      }
    }
  })
})
