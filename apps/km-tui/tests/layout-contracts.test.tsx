/**
 * Layout Measurement Contract Tests
 *
 * Integration tests that render real components and verify measured values.
 * These tests caught the curswantY bug that unit tests with mocked data missed.
 *
 * Why integration tests > unit tests for layout:
 * - Unit tests used hardcoded headHeight=1, missing the bug
 * - Integration tests render actual components, catching measurement issues
 * - testEnv() is fast (~50-200ms), so no performance penalty
 *
 * @see curswanty-regression.test.tsx - specific regression tests
 * @see docs/ref/ui.md#curswanty-cross-column-navigation-hl
 */
import { describe, test, expect } from "vitest"
import { testEnv, item, getCardMidY } from "./helpers/board-test.ts"

describe("Layout measurement contracts", () => {
  test("card with children: headHeight = 1 (title row), cardHeight > 1 (total)", () => {
    // This is THE critical contract that caught the curswantY bug
    const { registry } = testEnv(() =>
      item(
        "board",
        item("col", item("parent", item("child1"), item("child2"))),
      ),
    )

    const card = registry.getCard(0, 0)
    expect(card).toBeDefined()

    // headHeight must always be 1 (single title row)
    expect(card.layout.headHeight).toBe(1)
    // cardHeight includes children, so > 1
    expect(card.layout.cardHeight).toBeGreaterThan(1)
    // They must NOT be equal (this was the bug)
    expect(card.layout.headHeight).not.toBe(card.layout.cardHeight)
  })

  test("leaf card (no children): headHeight = 1, cardHeight small", () => {
    const { registry } = testEnv(() =>
      item("board", item("col", item("leaf-task"))),
    )

    const card = registry.getCard(0, 0)
    expect(card).toBeDefined()

    // headHeight is always 1 (title row)
    expect(card.layout.headHeight).toBe(1)
    // Leaf cards have minimal height (just title, possibly borders)
    // Should be much smaller than a card with children
    expect(card.layout.cardHeight).toBeLessThanOrEqual(3)
  })

  test("curswantY is title midpoint, not card midpoint", () => {
    // curswantY should be near the top (title midpoint ~3-5)
    // NOT the card center (which would be much lower for tall cards)
    const { registry } = testEnv(
      () =>
        item(
          "board",
          item(
            "col0",
            item("tall", item("c1"), item("c2"), item("c3"), item("c4")),
          ),
        ),
      { rows: 40 },
    )

    const card = registry.getCard(0, 0)
    const curswantY = getCardMidY(card.layout)

    // Title midpoint should be near the top of the screen
    expect(curswantY).toBeLessThan(10)

    // Should NOT be at card center (which would be y + cardHeight/2)
    const cardCenterY = card.layout.y + card.layout.cardHeight / 2
    expect(curswantY).not.toBe(cardCenterY)
  })

  test("cards in same row have similar headY", () => {
    // Multiple columns with first card in each should start at similar Y
    const { registry } = testEnv(() =>
      item(
        "board",
        item("col1", item("card1a"), item("card1b")),
        item("col2", item("card2a"), item("card2b")),
      ),
    )

    const card1 = registry.getCard(0, 0)
    const card2 = registry.getCard(1, 0)

    // All first cards should have similar headY (within 1 row)
    expect(card1.layout.headY).toBeDefined()
    expect(card2.layout.headY).toBeDefined()

    expect(Math.abs(card1.layout.headY! - card2.layout.headY!)).toBeLessThan(2)
  })

  test("nested children increase cardHeight but not headHeight", () => {
    // Each additional child should increase cardHeight, not headHeight
    const { registry: reg1 } = testEnv(() =>
      item("board", item("col", item("card", item("c1")))),
    )

    const { registry: reg2 } = testEnv(() =>
      item("board", item("col", item("card", item("c1"), item("c2")))),
    )

    const { registry: reg3 } = testEnv(() =>
      item(
        "board",
        item("col", item("card", item("c1"), item("c2"), item("c3"))),
      ),
    )

    const h1 = reg1.getCard(0, 0).layout
    const h2 = reg2.getCard(0, 0).layout
    const h3 = reg3.getCard(0, 0).layout

    // headHeight stays constant at 1
    expect(h1.headHeight).toBe(1)
    expect(h2.headHeight).toBe(1)
    expect(h3.headHeight).toBe(1)

    // cardHeight increases with more children
    expect(h2.cardHeight).toBeGreaterThan(h1.cardHeight)
    expect(h3.cardHeight).toBeGreaterThan(h2.cardHeight)
  })
})

describe("Visual navigation with measured layouts", () => {
  test("h/l from first card lands on first card of target column", () => {
    // When curswantY is near the top (title midpoint of first card),
    // navigation should land on the first card of the target column
    const { registry } = testEnv(() =>
      item(
        "board",
        item("col0", item("card0a"), item("card0b")),
        item("col1", item("card1a"), item("card1b"), item("card1c")),
      ),
    )

    const sourceCard = registry.getCard(0, 0)
    const curswantY = getCardMidY(sourceCard.layout)

    // Find target card in column 1 at this curswantY
    const targetIdx = registry.findCardAtYVisual(1, curswantY)

    // Should land on first card (index 0)
    expect(targetIdx).toBe(0)
  })

  test("h/l navigation uses title midpoint, not card center", () => {
    // A tall card's title is near the top, so h/l should land on
    // a card near the top of the target column
    const { registry } = testEnv(
      () =>
        item(
          "board",
          item(
            "col0",
            item("tall", item("c1"), item("c2"), item("c3"), item("c4")),
          ),
          item("col1", item("short1"), item("short2"), item("short3")),
        ),
      { rows: 40 },
    )

    const tallCard = registry.getCard(0, 0)
    const curswantY = getCardMidY(tallCard.layout)

    // curswantY should be near top (title midpoint)
    expect(curswantY).toBeLessThan(10)

    // Navigation should land on first card, not middle card
    const targetIdx = registry.findCardAtYVisual(1, curswantY)
    expect(targetIdx).toBe(0)
  })

  test("findCardAtYVisual returns -1 for empty columns", () => {
    const { registry } = testEnv(
      () => item("board", item("col0", item("card")), item("col1")), // empty column
    )

    const result = registry.findCardAtYVisual(1, 10)
    expect(result).toBe(-1)
  })
})

describe("Registry state after rendering", () => {
  test("all visible cards are registered", () => {
    const { registry } = testEnv(() =>
      item(
        "board",
        item("col0", item("a"), item("b")),
        item("col1", item("c"), item("d"), item("e")),
      ),
    )

    // Column 0 should have 2 cards
    expect(registry.getCardCount(0)).toBe(2)
    expect(registry.hasCardsInColumn(0)).toBe(true)

    // Column 1 should have 3 cards
    expect(registry.getCardCount(1)).toBe(3)
    expect(registry.hasCardsInColumn(1)).toBe(true)

    // All cards should be retrievable
    expect(registry.getCardOptional(0, 0)).toBeDefined()
    expect(registry.getCardOptional(0, 1)).toBeDefined()
    expect(registry.getCardOptional(1, 0)).toBeDefined()
    expect(registry.getCardOptional(1, 1)).toBeDefined()
    expect(registry.getCardOptional(1, 2)).toBeDefined()
  })

  test("headY and headHeight are populated for all cards", () => {
    const { registry } = testEnv(() =>
      item("board", item("col", item("parent", item("child")), item("leaf"))),
    )

    const parent = registry.getCard(0, 0)
    const leaf = registry.getCard(0, 1)

    // Both should have head measurements
    expect(parent.layout.headY).toBeDefined()
    expect(parent.layout.headHeight).toBe(1)

    expect(leaf.layout.headY).toBeDefined()
    expect(leaf.layout.headHeight).toBe(1)

    // getCardMidY should work without throwing
    expect(() => getCardMidY(parent.layout)).not.toThrow()
    expect(() => getCardMidY(leaf.layout)).not.toThrow()
  })
})

describe("Sticky Y behavior (curswantY)", () => {
  test("stickyY is set on first h/l navigation (lazy capture)", () => {
    const { board, registry } = testEnv(() =>
      item(
        "board",
        item("col0", item("a"), item("b"), item("c")),
        item("col1", item("x"), item("y")),
      ),
    )

    // Initially no stickyY
    expect(registry.getStickyY()).toBeNull()

    // Move down to card[1] — j/k clears stickyY (lazy capture semantics)
    board.press("j")
    expect(registry.getStickyY()).toBeNull()

    // Move right — h/l captures stickyY from current card, then uses it
    board.press("l")
    expect(registry.getStickyY()).not.toBeNull()
  })

  test("stickyY is preserved across multiple h/l moves", () => {
    const { board, registry } = testEnv(() =>
      item(
        "board",
        item("col0", item("a"), item("b"), item("c")),
        item("col1", item("x"), item("y")),
        item("col2", item("p"), item("q")),
      ),
    )

    // Navigate down then right
    board.press("j")
    board.press("l")

    const firstStickyY = registry.getStickyY()
    expect(firstStickyY).not.toBeNull()

    // Move right again
    board.press("l")

    // stickyY should be preserved
    expect(registry.getStickyY()).toBe(firstStickyY)

    // Move left
    board.press("h")

    // Still preserved
    expect(registry.getStickyY()).toBe(firstStickyY)
  })

  test("stickyY is cleared on j/k navigation", () => {
    const { board, registry } = testEnv(() =>
      item(
        "board",
        item("col0", item("a"), item("b"), item("c")),
        item("col1", item("x"), item("y")),
      ),
    )

    // Set up stickyY via h/l
    board.press("j")
    board.press("l")
    expect(registry.getStickyY()).not.toBeNull()

    // Move down — stickyY should be cleared (lazy capture: j/k always clears)
    board.press("j")
    expect(registry.getStickyY()).toBeNull()
  })

  test("h/l from mid-column lands on visually-aligned card", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("col0", item("a"), item("b"), item("c"), item("d")),
          item("col1", item("w"), item("x"), item("y"), item("z")),
        ),
      { rows: 40 },
    )

    // Navigate to card[2] (third card) in column 0
    board.press("j").press("j")

    // Get curswantY from card[2]
    const sourceCard = registry.getCard(0, 2)
    const expectedY = getCardMidY(sourceCard.layout)

    // Navigate right
    board.press("l")

    // Check that stickyY matches source card's title midpoint
    expect(registry.getStickyY()).toBe(expectedY)

    // The target card should be at a similar Y position
    const targetIdx = registry.findCardAtYVisual(1, expectedY)
    expect(targetIdx).toBe(2) // Should land on third card in column 1
  })
})
