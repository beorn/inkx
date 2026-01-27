/**
 * Layout Registry and Visual Navigation Tests
 *
 * Tests for the LayoutRegistry system used for h/l cross-column navigation
 * with screen-relative Y coordinates.
 *
 * ## The Problem (bead km-nav-visual-scroll)
 *
 * h/l navigation should move to the visually-adjacent card in the target column.
 * This means finding the card at the same SCREEN Y position, not the same
 * content-relative Y position.
 *
 * When columns have different scroll positions:
 * - Column A scrolled down 10 rows: card at content Y=100 appears at screen Y=90
 * - Column B not scrolled: card at content Y=100 appears at screen Y=100
 * - h/l from A→B should find card at screen Y=90 in column B
 *
 * ## Test Coverage
 *
 * 1. Basic registry operations (registration, retrieval, sticky Y/X tracking)
 * 2. Visual navigation (findCardAtYVisual) with screen coordinates
 * 3. Integration tests simulating h/l navigation algorithm
 * 4. Edge cases and regression tests
 *
 * ## What's NOT Tested Here (Needs TUI Integration Tests)
 *
 * - useScreenRectCallback providing screen-relative coordinates
 * - handleCursorMove wiring registry to board state
 * - Scroll position changes triggering re-registration
 *
 * See bead km-nav-visual-scroll for full investigation.
 */

import { describe, it, expect, beforeEach } from "bun:test"
import {
  createLayoutRegistry,
  getCardMidY,
  type NodeLayout,
  type LayoutRegistry,
} from "../src/card-positions.ts"

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Helper to create a NodeLayout for testing.
 * Simulates what useScreenRectCallback would provide.
 */
function makeLayout(y: number, height = 3, x = 0): NodeLayout {
  return {
    x,
    y,
    cardWidth: 40,
    cardHeight: height,
  }
}

/**
 * Helper to create a NodeLayout with head position for testing.
 */
function makeLayoutWithHead(y: number, height = 3, headHeight = 1): NodeLayout {
  return {
    x: 0,
    y,
    cardWidth: 40,
    cardHeight: height,
    headY: y,
    headHeight,
  }
}

/**
 * Simulates what the Card component does: registers its screen position.
 * Also sets head position (required for getCardMidY to work).
 */
function registerCards(
  registry: LayoutRegistry,
  colIndex: number,
  cards: { id: string; y: number; height?: number }[],
): void {
  cards.forEach((card, idx) => {
    const height = card.height ?? 3
    registry.registerCard(colIndex, idx, card.id, makeLayout(card.y, height))
    registry.updateCardHead(colIndex, idx, card.y, 1)
  })
}

// =============================================================================
// Basic Registry Operations
// =============================================================================

describe("LayoutRegistry: basic operations", () => {
  it("should register and retrieve cards", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "card-0", makeLayout(0))
    registry.registerCard(0, 1, "card-1", makeLayout(10))
    registry.registerCard(0, 2, "card-2", makeLayout(20))

    expect(registry.getCard(0, 0).layout.y).toBe(0)
    expect(registry.getCard(0, 1).layout.y).toBe(10)
    expect(registry.getCard(0, 2).layout.y).toBe(20)
  })

  it("should return undefined for unregistered cards (optional getter)", () => {
    const registry = createLayoutRegistry()

    expect(registry.getCardOptional(0, 0)).toBeUndefined()
    expect(registry.getCardOptional(1, 5)).toBeUndefined()
  })

  it("should throw for unregistered cards (required getter)", () => {
    const registry = createLayoutRegistry()

    expect(() => registry.getCard(0, 0)).toThrow("Card layout not found")
  })

  it("should support multiple columns", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "col0-card0", makeLayout(0))
    registry.registerCard(0, 1, "col0-card1", makeLayout(10))
    registry.registerCard(1, 0, "col1-card0", makeLayout(0))
    registry.registerCard(1, 1, "col1-card1", makeLayout(15))
    registry.registerCard(1, 2, "col1-card2", makeLayout(30))

    expect(registry.getCard(0, 0).nodeId).toBe("col0-card0")
    expect(registry.getCard(0, 1).nodeId).toBe("col0-card1")
    expect(registry.getCard(1, 0).nodeId).toBe("col1-card0")
    expect(registry.getCard(1, 1).nodeId).toBe("col1-card1")
    expect(registry.getCard(1, 2).nodeId).toBe("col1-card2")
  })

  it("should register by node ID for lookup", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "test-node-id", makeLayout(42))

    const layout = registry.getNode("test-node-id")
    expect(layout.y).toBe(42)
  })

  it("should report column card count", () => {
    const registry = createLayoutRegistry()

    expect(registry.getCardCount(0)).toBe(0)
    expect(registry.hasCardsInColumn(0)).toBe(false)

    registry.registerCard(0, 0, "c0", makeLayout(0))
    registry.registerCard(0, 1, "c1", makeLayout(10))

    expect(registry.getCardCount(0)).toBe(2)
    expect(registry.hasCardsInColumn(0)).toBe(true)
  })

  it("should dump registry state for debugging", () => {
    const registry = createLayoutRegistry()
    let dump = registry.dump()

    expect(dump).toContain("stickyY=null")
    expect(dump).toContain("(no cards registered)")

    registry.registerCard(0, 0, "c0", makeLayout(0))
    registry.registerCard(0, 1, "c1", makeLayout(10))
    registry.registerCard(1, 0, "c2", makeLayout(5))
    registry.setStickyY(25)

    dump = registry.dump()

    expect(dump).toContain("stickyY=25")
    expect(dump).toContain("col[0]:")
    expect(dump).toContain("col[1]:")
  })
})

// =============================================================================
// Sticky Y and X Tracking
// =============================================================================

describe("LayoutRegistry: sticky Y tracking", () => {
  it("should track sticky Y for h/l sequences", () => {
    const registry = createLayoutRegistry()

    expect(registry.getStickyY()).toBeNull()

    registry.setStickyY(50)
    expect(registry.getStickyY()).toBe(50)

    registry.clearStickyY()
    expect(registry.getStickyY()).toBeNull()
  })

  it("should clear sticky Y on clear()", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "test", makeLayout(10))
    registry.setStickyY(50)

    registry.clear()

    expect(registry.getStickyY()).toBeNull()
    expect(registry.getCardOptional(0, 0)).toBeUndefined()
  })
})

describe("LayoutRegistry: sticky X tracking", () => {
  it("should track sticky X for board/column navigation", () => {
    const registry = createLayoutRegistry()

    expect(registry.getStickyX()).toBeNull()

    registry.setStickyX(2)
    expect(registry.getStickyX()).toBe(2)

    registry.clearStickyX()
    expect(registry.getStickyX()).toBeNull()
  })

  it("should clear sticky X on clear()", () => {
    const registry = createLayoutRegistry()

    registry.setStickyX(3)
    registry.clear()

    expect(registry.getStickyX()).toBeNull()
  })

  it("should include sticky X in dump", () => {
    const registry = createLayoutRegistry()
    registry.setStickyX(5)

    const dump = registry.dump()
    expect(dump).toContain("stickyX=5")
  })
})

// =============================================================================
// Head Position Management
// =============================================================================

describe("getCardMidY helper", () => {
  it("should throw when no head measured (programming error)", () => {
    const layout = makeLayout(10, 5)
    expect(() => getCardMidY(layout)).toThrow("Head position not registered")
  })

  it("should use measured head position when available", () => {
    const layout: NodeLayout = {
      x: 0,
      y: 10,
      cardWidth: 40,
      cardHeight: 10,
      headY: 11,
      headHeight: 1,
    }
    expect(getCardMidY(layout)).toBe(11.5)
  })

  it("should throw when head partially measured (programming error)", () => {
    const layout: NodeLayout = {
      x: 0,
      y: 20,
      cardWidth: 40,
      cardHeight: 6,
      headY: 21,
    }
    expect(() => getCardMidY(layout)).toThrow("Head position not registered")
  })
})

describe("updateCardHead", () => {
  it("should update head position for registered card", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "card-0", makeLayout(10, 8))
    registry.updateCardHead(0, 0, 11, 1)

    const entry = registry.getCard(0, 0)
    expect(entry.layout.headY).toBe(11)
    expect(entry.layout.headHeight).toBe(1)
  })

  it("should silently ignore unregistered cards", () => {
    const registry = createLayoutRegistry()

    registry.updateCardHead(0, 0, 11, 1)

    expect(registry.getCardOptional(0, 0)).toBeUndefined()
  })

  it("should update getCardMidY result", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "card-0", makeLayout(5, 10))
    registry.updateCardHead(0, 0, 5, 1)
    expect(getCardMidY(registry.getCard(0, 0).layout)).toBe(5.5)

    registry.updateCardHead(0, 0, 6, 2)
    expect(getCardMidY(registry.getCard(0, 0).layout)).toBe(7)
  })

  it("uses head midpoint when head is measured", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "card", {
      x: 0,
      y: 10,
      cardWidth: 40,
      cardHeight: 20,
    })

    registry.updateCardHead(0, 0, 11, 2)

    const layout = registry.getCard(0, 0).layout
    const curswantY = getCardMidY(layout)

    expect(curswantY).toBe(12)
    expect(curswantY).not.toBe(20)
  })
})

// =============================================================================
// findCardAtY (closest card by Y position)
// =============================================================================

describe("findCardAtY", () => {
  it("should find card closest to target Y", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "c0", makeLayout(0))
    registry.registerCard(0, 1, "c1", makeLayout(10))
    registry.registerCard(0, 2, "c2", makeLayout(20))
    registry.registerCard(0, 3, "c3", makeLayout(30))

    expect(registry.findCardAtY(0, 0)).toBe(0)
    expect(registry.findCardAtY(0, 10)).toBe(1)
    expect(registry.findCardAtY(0, 20)).toBe(2)
    expect(registry.findCardAtY(0, 30)).toBe(3)

    expect(registry.findCardAtY(0, 5)).toBe(0)
    expect(registry.findCardAtY(0, 6)).toBe(1)
    expect(registry.findCardAtY(0, 14)).toBe(1)
    expect(registry.findCardAtY(0, 16)).toBe(2)
  })

  it("should throw if column has no cards registered", () => {
    const registry = createLayoutRegistry()

    expect(() => registry.findCardAtY(0, 10)).toThrow(
      "No cards registered for column 0",
    )
  })

  it("should find visually equivalent card in target column", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "s0", makeLayout(0))
    registry.registerCard(0, 1, "s1", makeLayout(15))
    registry.registerCard(0, 2, "s2", makeLayout(30))
    registry.registerCard(0, 3, "s3", makeLayout(45))

    registry.registerCard(1, 0, "t0", makeLayout(0))
    registry.registerCard(1, 1, "t1", makeLayout(10))
    registry.registerCard(1, 2, "t2", makeLayout(20))
    registry.registerCard(1, 3, "t3", makeLayout(30))
    registry.registerCard(1, 4, "t4", makeLayout(40))

    const targetCard = registry.findCardAtY(1, 30)
    expect(targetCard).toBe(3)

    const targetCard2 = registry.findCardAtY(1, 15)
    expect(targetCard2).toBe(1)
  })

  it("should handle columns with different card heights", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "s0", makeLayout(0, 20))
    registry.registerCard(0, 1, "s1", makeLayout(20, 20))

    registry.registerCard(1, 0, "t0", makeLayout(0, 10))
    registry.registerCard(1, 1, "t1", makeLayout(10, 10))
    registry.registerCard(1, 2, "t2", makeLayout(20, 10))
    registry.registerCard(1, 3, "t3", makeLayout(30, 10))

    expect(registry.findCardAtY(1, 0)).toBe(0)
    expect(registry.findCardAtY(1, 20)).toBe(2)
  })
})

// =============================================================================
// findCardAtYVisual (visual navigation with box intersection)
// =============================================================================

describe("findCardAtYVisual", () => {
  it("should find card whose box intersects targetY", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "c0", makeLayout(2, 5))
    registry.registerCard(0, 1, "c1", makeLayout(7, 5))
    registry.registerCard(0, 2, "c2", makeLayout(12, 5))

    expect(registry.findCardAtYVisual(0, 4)).toBe(0)
    expect(registry.findCardAtYVisual(0, 9)).toBe(1)
    expect(registry.findCardAtYVisual(0, 14)).toBe(2)
  })

  it("should find closest card when targetY doesn't intersect any box", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "c0", makeLayout(0, 3))
    registry.registerCard(0, 1, "c1", makeLayout(10, 3))

    expect(registry.findCardAtYVisual(0, 5)).toBe(0)
    expect(registry.findCardAtYVisual(0, 8)).toBe(1)
  })

  it("should return -1 when targetY is above all cards (column header)", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "c0", makeLayout(5, 3))
    registry.registerCard(0, 1, "c1", makeLayout(8, 3))

    expect(registry.findCardAtYVisual(0, 2)).toBe(-1)
  })

  it("should return -1 for empty column", () => {
    const registry = createLayoutRegistry()

    expect(registry.findCardAtYVisual(0, 10)).toBe(-1)
  })
})

// =============================================================================
// findInsertionSlot
// =============================================================================

describe("findInsertionSlot", () => {
  it("should find correct slot for insertion", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "c0", makeLayout(2, 5))
    registry.registerCard(0, 1, "c1", makeLayout(7, 5))
    registry.registerCard(0, 2, "c2", makeLayout(12, 5))

    expect(registry.findInsertionSlot(0, 0)).toBe(0)
    expect(registry.findInsertionSlot(0, 1)).toBe(0)

    expect(registry.findInsertionSlot(0, 3)).toBe(1)
    expect(registry.findInsertionSlot(0, 6)).toBe(1)

    expect(registry.findInsertionSlot(0, 8)).toBe(2)
    expect(registry.findInsertionSlot(0, 11)).toBe(2)

    expect(registry.findInsertionSlot(0, 15)).toBe(3)
    expect(registry.findInsertionSlot(0, 100)).toBe(3)
  })

  it("should return 0 for empty column", () => {
    const registry = createLayoutRegistry()
    expect(registry.findInsertionSlot(0, 10)).toBe(0)
  })
})

// =============================================================================
// Visual Navigation: h/l Same Screen Y Position
// =============================================================================

describe("Visual navigation: h/l finds card at same screen Y", () => {
  let registry: LayoutRegistry

  beforeEach(() => {
    registry = createLayoutRegistry()
  })

  it("h/l to column with same card heights lands on visually-adjacent card", () => {
    registerCards(registry, 0, [
      { id: "a0", y: 5 },
      { id: "a1", y: 10 },
      { id: "a2", y: 15 },
    ])

    registerCards(registry, 1, [
      { id: "b0", y: 5 },
      { id: "b1", y: 10 },
      { id: "b2", y: 15 },
    ])

    const currentLayout = registry.getCard(0, 1)
    const curswantY = getCardMidY(currentLayout.layout)

    const targetIdx = registry.findCardAtYVisual(1, curswantY)

    expect(targetIdx).toBe(1)
    expect(registry.getCard(1, targetIdx).nodeId).toBe("b1")
  })

  it("h/l to column with offset card positions finds closest card", () => {
    registerCards(registry, 0, [
      { id: "a0", y: 5 },
      { id: "a1", y: 10 },
      { id: "a2", y: 15 },
    ])

    registerCards(registry, 1, [
      { id: "b0", y: 7 },
      { id: "b1", y: 14 },
      { id: "b2", y: 21 },
    ])

    const currentLayout = registry.getCard(0, 1)
    const curswantY = getCardMidY(currentLayout.layout)
    expect(curswantY).toBe(10.5)

    const targetIdx = registry.findCardAtYVisual(1, curswantY)

    expect(targetIdx).toBe(0)
  })

  it("h/l to column with taller cards finds card whose box contains curswantY", () => {
    registerCards(registry, 0, [
      { id: "a0", y: 5, height: 3 },
      { id: "a1", y: 10, height: 3 },
      { id: "a2", y: 15, height: 3 },
    ])

    registerCards(registry, 1, [
      { id: "b0", y: 2, height: 8 },
      { id: "b1", y: 10, height: 8 },
    ])

    const curswantY = getCardMidY(registry.getCard(0, 1).layout)
    expect(curswantY).toBe(10.5)

    const targetIdx = registry.findCardAtYVisual(1, curswantY)
    expect(targetIdx).toBe(1)
    expect(registry.getCard(1, targetIdx).nodeId).toBe("b1")
  })
})

// =============================================================================
// Visual Navigation: Scroll Offset Handling
// =============================================================================

describe("Visual navigation: scroll offset handling", () => {
  let registry: LayoutRegistry

  beforeEach(() => {
    registry = createLayoutRegistry()
  })

  it("CRITICAL: positions should be SCREEN relative, not content relative", () => {
    registry.registerCard(0, 0, "a0", {
      x: 0,
      y: 50,
      cardWidth: 40,
      cardHeight: 5,
    })
    registry.updateCardHead(0, 0, 50, 1)

    registry.registerCard(1, 0, "b0", {
      x: 40,
      y: 50,
      cardWidth: 40,
      cardHeight: 5,
    })
    registry.updateCardHead(1, 0, 50, 1)

    registry.registerCard(1, 1, "b1", {
      x: 40,
      y: 60,
      cardWidth: 40,
      cardHeight: 5,
    })
    registry.updateCardHead(1, 1, 60, 1)

    registry.registerCard(1, 2, "b2", {
      x: 40,
      y: 70,
      cardWidth: 40,
      cardHeight: 5,
    })
    registry.updateCardHead(1, 2, 70, 1)

    const curswantY = getCardMidY(registry.getCard(0, 0).layout)
    expect(curswantY).toBe(50.5)

    const targetIdx = registry.findCardAtYVisual(1, curswantY)
    expect(targetIdx).toBe(0)
    expect(registry.getCard(1, targetIdx).nodeId).toBe("b0")
  })

  it("different scroll positions: cards at same content Y but different screen Y", () => {
    registry.registerCard(0, 0, "a-scrolled", {
      x: 0,
      y: 80,
      cardWidth: 40,
      cardHeight: 5,
    })
    registry.updateCardHead(0, 0, 80, 1)

    registry.registerCard(1, 0, "b-at-80", {
      x: 40,
      y: 80,
      cardWidth: 40,
      cardHeight: 5,
    })
    registry.updateCardHead(1, 0, 80, 1)

    registry.registerCard(1, 1, "b-at-90", {
      x: 40,
      y: 90,
      cardWidth: 40,
      cardHeight: 5,
    })
    registry.updateCardHead(1, 1, 90, 1)

    const curswantY = getCardMidY(registry.getCard(0, 0).layout)
    const targetIdx = registry.findCardAtYVisual(1, curswantY)

    expect(targetIdx).toBe(0)
    expect(registry.getCard(1, targetIdx).nodeId).toBe("b-at-80")
  })
})

// =============================================================================
// Sticky Y (curswantY) Behavior
// =============================================================================

describe("curswantY sticky behavior for h/l sequences", () => {
  let registry: LayoutRegistry

  beforeEach(() => {
    registry = createLayoutRegistry()
  })

  it("curswantY is preserved across multiple h/l moves", () => {
    registerCards(registry, 0, [{ id: "a0", y: 10 }])

    registerCards(registry, 1, [
      { id: "b0", y: 5 },
      { id: "b1", y: 10 },
      { id: "b2", y: 15 },
    ])

    registerCards(registry, 2, [
      { id: "c0", y: 8 },
      { id: "c1", y: 18 },
    ])

    const curswantY = getCardMidY(registry.getCard(0, 0).layout)
    registry.setStickyY(curswantY)
    expect(curswantY).toBe(10.5)

    const target1 = registry.findCardAtYVisual(1, registry.getStickyY()!)
    expect(target1).toBe(1)

    const target2 = registry.findCardAtYVisual(2, registry.getStickyY()!)
    expect(target2).toBe(0)

    expect(registry.getStickyY()).toBe(curswantY)
  })

  it("j/k clears curswantY", () => {
    const registry = createLayoutRegistry()

    registry.setStickyY(50)
    expect(registry.getStickyY()).toBe(50)

    registry.clearStickyY()
    expect(registry.getStickyY()).toBeNull()
  })

  it("curswantY survives moving through empty column", () => {
    const registry = createLayoutRegistry()

    registerCards(registry, 0, [{ id: "a0", y: 20 }])
    registerCards(registry, 2, [{ id: "c0", y: 20 }])

    const curswantY = getCardMidY(registry.getCard(0, 0).layout)
    registry.setStickyY(curswantY)

    const target1 = registry.findCardAtYVisual(1, registry.getStickyY()!)
    expect(target1).toBe(-1)

    expect(registry.getStickyY()).toBe(curswantY)

    const target2 = registry.findCardAtYVisual(2, registry.getStickyY()!)
    expect(target2).toBe(0)
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe("Visual navigation edge cases", () => {
  let registry: LayoutRegistry

  beforeEach(() => {
    registry = createLayoutRegistry()
  })

  it("curswantY above all cards lands on first card (not header)", () => {
    registerCards(registry, 0, [
      { id: "a0", y: 10 },
      { id: "a1", y: 15 },
    ])

    const targetIdx = registry.findCardAtYVisual(0, 5)

    expect(targetIdx).toBe(-1)
  })

  it("curswantY below all cards lands on last card", () => {
    registerCards(registry, 0, [
      { id: "a0", y: 10, height: 3 },
      { id: "a1", y: 15, height: 3 },
    ])

    const targetIdx = registry.findCardAtYVisual(0, 100)

    expect(targetIdx).toBe(1)
  })

  it("single card column always lands on that card", () => {
    const registry = createLayoutRegistry()

    registerCards(registry, 0, [{ id: "only", y: 50 }])

    expect(registry.findCardAtYVisual(0, 0)).toBe(-1)
    expect(registry.findCardAtYVisual(0, 51)).toBe(0)
    expect(registry.findCardAtYVisual(0, 100)).toBe(0)
  })

  it("handles cards with varying heights correctly", () => {
    const registry = createLayoutRegistry()

    registerCards(registry, 0, [
      { id: "short1", y: 0, height: 2 },
      { id: "tall", y: 2, height: 10 },
      { id: "short2", y: 12, height: 2 },
    ])

    expect(registry.findCardAtYVisual(0, 7)).toBe(1)

    expect(registry.findCardAtYVisual(0, 2)).toBe(1)
    expect(registry.findCardAtYVisual(0, 11)).toBe(1)
    expect(registry.findCardAtYVisual(0, 12)).toBe(2)
  })
})

// =============================================================================
// Visual Navigation Scenarios
// =============================================================================

describe("Visual navigation scenarios", () => {
  it("h/l from tall card should land on card that visually aligns", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "tall", makeLayout(2, 15))
    registry.updateCardHead(0, 0, 2, 1)

    registry.registerCard(1, 0, "short0", makeLayout(2, 4))
    registry.updateCardHead(1, 0, 2, 1)
    registry.registerCard(1, 1, "short1", makeLayout(6, 4))
    registry.updateCardHead(1, 1, 6, 1)
    registry.registerCard(1, 2, "short2", makeLayout(10, 4))
    registry.updateCardHead(1, 2, 10, 1)
    registry.registerCard(1, 3, "short3", makeLayout(14, 4))
    registry.updateCardHead(1, 3, 14, 1)

    const curswantY = getCardMidY(makeLayoutWithHead(2, 15, 1))
    expect(curswantY).toBe(2.5)

    expect(registry.findCardAtYVisual(1, curswantY)).toBe(0)
  })

  it("h/l should preserve visual position across multiple columns", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "c0-0", makeLayout(2, 5))
    registry.updateCardHead(0, 0, 2, 1)
    registry.registerCard(0, 1, "c0-1", makeLayout(7, 5))
    registry.updateCardHead(0, 1, 7, 1)

    registry.registerCard(1, 0, "c1-0", makeLayout(2, 3))
    registry.updateCardHead(1, 0, 2, 1)
    registry.registerCard(1, 1, "c1-1", makeLayout(5, 3))
    registry.updateCardHead(1, 1, 5, 1)
    registry.registerCard(1, 2, "c1-2", makeLayout(8, 3))
    registry.updateCardHead(1, 2, 8, 1)
    registry.registerCard(1, 3, "c1-3", makeLayout(11, 3))
    registry.updateCardHead(1, 3, 11, 1)

    registry.registerCard(2, 0, "c2-0", makeLayout(2, 5))
    registry.updateCardHead(2, 0, 2, 1)
    registry.registerCard(2, 1, "c2-1", makeLayout(7, 5))
    registry.updateCardHead(2, 1, 7, 1)

    const curswantY = getCardMidY(makeLayoutWithHead(7, 5, 1))
    expect(curswantY).toBe(7.5)

    expect(registry.findCardAtYVisual(1, curswantY)).toBe(1)
    expect(registry.findCardAtYVisual(2, curswantY)).toBe(1)
  })
})

// =============================================================================
// handleCursorMove Integration
// =============================================================================

describe("handleCursorMove h/l navigation algorithm", () => {
  let registry: LayoutRegistry

  beforeEach(() => {
    registry = createLayoutRegistry()
  })

  function simulateHLNavigation(
    registry: LayoutRegistry,
    currentColIndex: number,
    currentCardIndex: number,
    direction: "left" | "right",
    columns: { cards: { id: string }[] }[],
  ): {
    targetColIndex: number
    targetCardIndex: number
    curswantY: number | null
  } {
    const step = direction === "left" ? -1 : 1
    let targetColIndex = currentColIndex + step

    targetColIndex = Math.max(0, Math.min(columns.length - 1, targetColIndex))

    if (targetColIndex === currentColIndex) {
      return {
        targetColIndex: currentColIndex,
        targetCardIndex: currentCardIndex,
        curswantY: registry.getStickyY(),
      }
    }

    const targetCol = columns[targetColIndex]
    if (!targetCol || targetCol.cards.length === 0) {
      return {
        targetColIndex,
        targetCardIndex: -1,
        curswantY: registry.getStickyY(),
      }
    }

    const hasCurrentPositions = registry.hasCardsInColumn(currentColIndex)
    const hasTargetPositions = registry.hasCardsInColumn(targetColIndex)

    if (!hasCurrentPositions || !hasTargetPositions) {
      const targetCardIndex = Math.min(
        currentCardIndex,
        targetCol.cards.length - 1,
      )
      return {
        targetColIndex,
        targetCardIndex: Math.max(0, targetCardIndex),
        curswantY: null,
      }
    }

    let curswantY = registry.getStickyY()
    if (curswantY === null) {
      const currentLayout = registry.getCardOptional(
        currentColIndex,
        currentCardIndex,
      )
      if (!currentLayout) {
        const targetCardIndex = Math.min(
          currentCardIndex,
          targetCol.cards.length - 1,
        )
        return {
          targetColIndex,
          targetCardIndex: Math.max(0, targetCardIndex),
          curswantY: null,
        }
      }
      curswantY = getCardMidY(currentLayout.layout)
      registry.setStickyY(curswantY)
    }

    let targetCardIndex = registry.findCardAtYVisual(targetColIndex, curswantY)
    targetCardIndex = Math.max(0, targetCardIndex)

    return {
      targetColIndex,
      targetCardIndex,
      curswantY,
    }
  }

  it("algorithm selects card at same visual Y position", () => {
    const columns = [
      { cards: [{ id: "a0" }, { id: "a1" }, { id: "a2" }] },
      { cards: [{ id: "b0" }, { id: "b1" }, { id: "b2" }] },
    ]

    registerCards(registry, 0, [
      { id: "a0", y: 5 },
      { id: "a1", y: 10 },
      { id: "a2", y: 15 },
    ])
    registerCards(registry, 1, [
      { id: "b0", y: 5 },
      { id: "b1", y: 10 },
      { id: "b2", y: 15 },
    ])

    const result = simulateHLNavigation(registry, 0, 1, "right", columns)

    expect(result.targetColIndex).toBe(1)
    expect(result.targetCardIndex).toBe(1)
  })

  it("algorithm falls back when positions not registered", () => {
    const columns = [
      { cards: [{ id: "a0" }, { id: "a1" }] },
      { cards: [{ id: "b0" }, { id: "b1" }, { id: "b2" }] },
    ]

    registerCards(registry, 0, [
      { id: "a0", y: 5 },
      { id: "a1", y: 10 },
    ])

    const result = simulateHLNavigation(registry, 0, 1, "right", columns)

    expect(result.targetColIndex).toBe(1)
    expect(result.targetCardIndex).toBe(1)
    expect(result.curswantY).toBeNull()
  })

  it("algorithm preserves curswantY across moves", () => {
    const columns = [
      { cards: [{ id: "a0" }] },
      { cards: [{ id: "b0" }, { id: "b1" }] },
      { cards: [{ id: "c0" }, { id: "c1" }, { id: "c2" }] },
    ]

    registerCards(registry, 0, [{ id: "a0", y: 10 }])
    registerCards(registry, 1, [
      { id: "b0", y: 5 },
      { id: "b1", y: 15 },
    ])
    registerCards(registry, 2, [
      { id: "c0", y: 5 },
      { id: "c1", y: 10 },
      { id: "c2", y: 15 },
    ])

    const result1 = simulateHLNavigation(registry, 0, 0, "right", columns)
    expect(result1.curswantY).toBe(10.5)

    const result2 = simulateHLNavigation(
      registry,
      1,
      result1.targetCardIndex,
      "right",
      columns,
    )

    expect(result2.curswantY).toBe(10.5)
    expect(result2.targetCardIndex).toBe(1)
  })
})

// =============================================================================
// Regression Tests for Known Bugs
// =============================================================================

describe("Regression: km-nav-visual-scroll scenarios", () => {
  let registry: LayoutRegistry

  beforeEach(() => {
    registry = createLayoutRegistry()
  })

  it("scenario: card index fallback when positions not registered", () => {
    registerCards(registry, 0, [{ id: "a0", y: 10 }])

    expect(registry.hasCardsInColumn(1)).toBe(false)
  })

  it("scenario: proportional vs visual navigation", () => {
    registerCards(registry, 0, [
      { id: "a0", y: 5 },
      { id: "a1", y: 10 },
      { id: "a2", y: 15 },
    ])

    registerCards(registry, 1, [
      { id: "b0", y: 5 },
      { id: "b1", y: 10 },
    ])

    const curswantY = getCardMidY(registry.getCard(0, 2).layout)
    const targetIdx = registry.findCardAtYVisual(1, curswantY)

    expect(targetIdx).toBe(1)
  })
})
