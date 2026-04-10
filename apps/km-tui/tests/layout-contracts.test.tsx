/**
 * Layout Measurement Contract Tests
 *
 * Integration tests that render real components and verify measured values.
 * These tests caught the curswantY bug that unit tests with mocked data missed.
 *
 * Why integration tests > unit tests for layout:
 * - Unit tests used hardcoded headHeight=1, missing the bug
 * - Integration tests render actual components, catching measurement issues
 * - createDriverTest() is fast (~50-200ms), so no performance penalty
 *
 * @see curswanty-regression.test.tsx - specific regression tests
 * @see docs/ref/ui.md#curswanty-cross-column-navigation-hl
 */
// FREEZE: all tests need white-box API (registry from createDriverTest) — registry is not exposed by createTestApp
import { describe, test, expect } from "vitest"
import { createDriverTest, item } from "./helpers/board-test.ts"

describe("Layout measurement contracts", () => {
  test("card with children: headHeight = 1 (title row), cardHeight > 1 (total)", () => {
    // This is THE critical contract that caught the curswantY bug
    const { registry } = createDriverTest(() =>
      item("board", item("col", item("parent", item("child1"), item("child2")))),
    )

    const pos = registry.getPosition(0, 0)
    const head = registry.getHead(0, 0)
    expect(pos).toBeDefined()

    // headHeight must always be 1 (single title row)
    expect(head?.height).toBe(1)
    // cardHeight includes children, so > 1
    expect(pos!.height).toBeGreaterThan(1)
    // They must NOT be equal (this was the bug)
    expect(head?.height).not.toBe(pos!.height)
  })

  test("leaf card (no children): headHeight = 1, cardHeight small", () => {
    const { registry } = createDriverTest(() => item("board", item("col", item("leaf-task"))))

    const pos = registry.getPosition(0, 0)
    const head = registry.getHead(0, 0)
    expect(pos).toBeDefined()

    // headHeight is always 1 (title row)
    expect(head?.height).toBe(1)
    // Leaf cards have minimal height (just title, possibly borders)
    // Should be much smaller than a card with children
    expect(pos!.height).toBeLessThanOrEqual(3)
  })

  test("curswantY is title midpoint, not card midpoint", () => {
    // curswantY should be near the top (title midpoint ~3-5)
    // NOT the card center (which would be much lower for tall cards)
    const { registry } = createDriverTest(
      () => item("board", item("col0", item("tall", item("c1"), item("c2"), item("c3"), item("c4")))),
      { rows: 40 },
    )

    const pos = registry.getPosition(0, 0)!
    const curswantY = registry.getItemMidY(0, 0)

    // Title midpoint should be near the top of the screen
    expect(curswantY).toBeLessThan(10)

    // Should NOT be at card center (which would be y + height/2)
    const cardCenterY = pos.y + pos.height / 2
    expect(curswantY).not.toBe(cardCenterY)
  })

  test("cards in same row have similar headY", () => {
    // Multiple columns with first card in each should start at similar Y
    const { registry } = createDriverTest(() =>
      item("board", item("col1", item("card1a"), item("card1b")), item("col2", item("card2a"), item("card2b"))),
    )

    const head1 = registry.getHead(0, 0)
    const head2 = registry.getHead(1, 0)

    // All first cards should have similar headY (within 1 row)
    expect(head1?.y).toBeDefined()
    expect(head2?.y).toBeDefined()

    expect(Math.abs(head1!.y - head2!.y)).toBeLessThan(2)
  })

  test("nested children increase cardHeight but not headHeight", () => {
    // Each additional child should increase cardHeight, not headHeight
    const { registry: reg1 } = createDriverTest(() => item("board", item("col", item("card", item("c1")))))

    const { registry: reg2 } = createDriverTest(() => item("board", item("col", item("card", item("c1"), item("c2")))))

    const { registry: reg3 } = createDriverTest(() =>
      item("board", item("col", item("card", item("c1"), item("c2"), item("c3")))),
    )

    const h1head = reg1.getHead(0, 0)
    const h2head = reg2.getHead(0, 0)
    const h3head = reg3.getHead(0, 0)
    const h1pos = reg1.getPosition(0, 0)!
    const h2pos = reg2.getPosition(0, 0)!
    const h3pos = reg3.getPosition(0, 0)!

    // headHeight stays constant at 1
    expect(h1head?.height).toBe(1)
    expect(h2head?.height).toBe(1)
    expect(h3head?.height).toBe(1)

    // cardHeight increases with more children
    expect(h2pos.height).toBeGreaterThan(h1pos.height)
    expect(h3pos.height).toBeGreaterThan(h2pos.height)
  })
})

describe("Visual navigation with measured layouts", () => {
  test("h/l from first card lands on first card of target column", () => {
    // When curswantY is near the top (title midpoint of first card),
    // navigation should land on the first card of the target column
    const { registry } = createDriverTest(() =>
      item(
        "board",
        item("col0", item("card0a"), item("card0b")),
        item("col1", item("card1a"), item("card1b"), item("card1c")),
      ),
    )

    const curswantY = registry.getItemMidY(0, 0)

    // Find target card in column 1 at this curswantY
    const targetIdx = registry.findItemAtY(1, curswantY)

    // Should land on first card (index 0)
    expect(targetIdx).toBe(0)
  })

  test("h/l navigation uses title midpoint, not card center", () => {
    // A tall card's title is near the top, so h/l should land on
    // a card near the top of the target column
    const { registry } = createDriverTest(
      () =>
        item(
          "board",
          item("col0", item("tall", item("c1"), item("c2"), item("c3"), item("c4"))),
          item("col1", item("short1"), item("short2"), item("short3")),
        ),
      { rows: 40 },
    )

    const curswantY = registry.getItemMidY(0, 0)

    // curswantY should be near top (title midpoint)
    expect(curswantY).toBeLessThan(10)

    // Navigation should land on first card, not middle card
    const targetIdx = registry.findItemAtY(1, curswantY)
    expect(targetIdx).toBe(0)
  })

  test("findItemAtY returns -1 for empty columns", () => {
    const { registry } = createDriverTest(
      () => item("board", item("col0", item("card")), item("col1")), // empty column
    )

    const result = registry.findItemAtY(1, 10)
    expect(result).toBe(-1)
  })
})

describe("Registry state after rendering", () => {
  test("all visible cards are registered", () => {
    const { registry } = createDriverTest(() =>
      item("board", item("col0", item("a"), item("b")), item("col1", item("c"), item("d"), item("e"))),
    )

    // Column 0 should have 2 cards
    expect(registry.getItemCount(0)).toBe(2)
    expect(registry.hasSection(0)).toBe(true)

    // Column 1 should have 3 cards
    expect(registry.getItemCount(1)).toBe(3)
    expect(registry.hasSection(1)).toBe(true)

    // All cards should be retrievable by section+item index
    expect(registry.getPosition(0, 0)).toBeDefined()
    expect(registry.getPosition(0, 1)).toBeDefined()
    expect(registry.getPosition(1, 0)).toBeDefined()
    expect(registry.getPosition(1, 1)).toBeDefined()
    expect(registry.getPosition(1, 2)).toBeDefined()
  })

  test("headY and headHeight are populated for all cards", () => {
    const { registry } = createDriverTest(() => item("board", item("col", item("parent", item("child")), item("leaf"))))

    const parentHead = registry.getHead(0, 0)
    const leafHead = registry.getHead(0, 1)

    // Both should have head measurements
    expect(parentHead?.y).toBeDefined()
    expect(parentHead?.height).toBe(1)

    expect(leafHead?.y).toBeDefined()
    expect(leafHead?.height).toBe(1)

    // getItemMidY should work without throwing
    expect(() => registry.getItemMidY(0, 0)).not.toThrow()
    expect(() => registry.getItemMidY(0, 1)).not.toThrow()
  })
})

describe("Sticky Y behavior (curswantY)", () => {
  test("stickyY is set on first h/l navigation (lazy capture)", () => {
    const { board, registry } = createDriverTest(() =>
      item("board", item("col0", item("a"), item("b"), item("c")), item("col1", item("x"), item("y"))),
    )

    // Initially no stickyY
    expect(registry.stickyY).toBeNull()

    // Move down to card[1] — j/k clears stickyY (lazy capture semantics)
    board.command("cursor_down")
    expect(registry.stickyY).toBeNull()

    // Move right — h/l captures stickyY from current card, then uses it
    board.command("cursor_right")
    expect(registry.stickyY).not.toBeNull()
  })

  test("stickyY is preserved across multiple h/l moves", () => {
    const { board, registry } = createDriverTest(() =>
      item(
        "board",
        item("col0", item("a"), item("b"), item("c")),
        item("col1", item("x"), item("y")),
        item("col2", item("p"), item("q")),
      ),
    )

    // Navigate down then right
    board.command("cursor_down")
    board.command("cursor_right")

    const firstStickyY = registry.stickyY
    expect(firstStickyY).not.toBeNull()

    // Move right again
    board.command("cursor_right")

    // stickyY should be preserved
    expect(registry.stickyY).toBe(firstStickyY)

    // Move left
    board.command("cursor_left")

    // Still preserved
    expect(registry.stickyY).toBe(firstStickyY)
  })

  test("stickyY is cleared on j/k navigation", () => {
    const { board, registry } = createDriverTest(() =>
      item("board", item("col0", item("a"), item("b"), item("c")), item("col1", item("x"), item("y"))),
    )

    // Set up stickyY via h/l
    board.command("cursor_down")
    board.command("cursor_right")
    expect(registry.stickyY).not.toBeNull()

    // Move down — stickyY should be cleared (lazy capture: j/k always clears)
    board.command("cursor_down")
    expect(registry.stickyY).toBeNull()
  })

  test("h/l from mid-column lands on visually-aligned card", () => {
    const { board, registry } = createDriverTest(
      () =>
        item(
          "board",
          item("col0", item("a"), item("b"), item("c"), item("d")),
          item("col1", item("w"), item("x"), item("y"), item("z")),
        ),
      { rows: 40 },
    )

    // Navigate to card[2] (third card) in column 0
    board.command("cursor_down").command("cursor_down")

    // Get curswantY from card[2] in column 0
    const expectedY = registry.getItemMidY(0, 2)

    // Navigate right
    board.command("cursor_right")

    // Check that stickyY matches source card's title midpoint
    expect(registry.stickyY).toBe(expectedY)

    // The target card should be at a similar Y position
    const targetIdx = registry.findItemAtY(1, expectedY)
    expect(targetIdx).toBe(2) // Should land on third card in column 1
  })
})
