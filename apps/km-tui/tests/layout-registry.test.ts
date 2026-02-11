/**
 * Layout Registry Unit Tests
 *
 * Low-level unit tests for LayoutRegistry edge cases and error handling.
 * Most visual navigation behavior is tested in layout-contracts.test.tsx
 * with real rendered components.
 *
 * ## What's tested here:
 * - Error handling (throws on missing data, programming errors)
 * - findInsertionSlot algorithm (used for drag-drop)
 * - Sticky Y/X state management
 *
 * ## What's tested in layout-contracts.test.tsx instead:
 * - headHeight/cardHeight contracts (with real components)
 * - curswantY calculation (with real measurements)
 * - Visual navigation landing (with real rendering)
 *
 * @see layout-contracts.test.tsx - integration tests with real components
 */

import { describe, it, expect } from "vitest"
import {
  createLayoutRegistry,
  getCardMidY,
  type NodeLayout,
} from "../src/card-positions.ts"

// =============================================================================
// Test Helpers
// =============================================================================

function makeLayout(y: number, height = 3, x = 0): NodeLayout {
  return {
    x,
    y,
    cardWidth: 40,
    cardHeight: height,
  }
}

// =============================================================================
// Error Handling
// =============================================================================

describe("LayoutRegistry: error handling", () => {
  it("throws for unregistered cards (required getter)", () => {
    const registry = createLayoutRegistry()
    expect(() => registry.getCard(0, 0)).toThrow("Card layout not found")
  })

  it("returns undefined for unregistered cards (optional getter)", () => {
    const registry = createLayoutRegistry()
    expect(registry.getCardOptional(0, 0)).toBeUndefined()
  })

  it("throws for unregistered nodes", () => {
    const registry = createLayoutRegistry()
    expect(() => registry.getNode("nonexistent")).toThrow(
      "Node layout not found",
    )
  })

  it("findCardAtY throws for empty column", () => {
    const registry = createLayoutRegistry()
    expect(() => registry.findCardAtY(0, 10)).toThrow(
      "No cards registered for column 0",
    )
  })
})

describe("getCardMidY: throws when head not measured", () => {
  it("throws when head not measured at all", () => {
    const layout = makeLayout(10, 5)
    expect(() => getCardMidY(layout)).toThrow("headY/headHeight not registered")
  })

  it("throws when headHeight missing (partial measurement)", () => {
    const layout: NodeLayout = {
      x: 0,
      y: 20,
      cardWidth: 40,
      cardHeight: 6,
      headY: 21,
      // headHeight missing
    }
    expect(() => getCardMidY(layout)).toThrow("headY/headHeight not registered")
  })

  it("calculates midpoint when head is measured", () => {
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
})

// =============================================================================
// Sticky Y/X State
// =============================================================================

describe("LayoutRegistry: sticky state", () => {
  it("sticky Y: set, get, clear", () => {
    const registry = createLayoutRegistry()

    expect(registry.getStickyY()).toBeNull()

    registry.setStickyY(50)
    expect(registry.getStickyY()).toBe(50)

    registry.clearStickyY()
    expect(registry.getStickyY()).toBeNull()
  })

  it("sticky X: set, get, clear", () => {
    const registry = createLayoutRegistry()

    expect(registry.getStickyX()).toBeNull()

    registry.setStickyX(2)
    expect(registry.getStickyX()).toBe(2)

    registry.clearStickyX()
    expect(registry.getStickyX()).toBeNull()
  })

  it("clear() resets all state", () => {
    const registry = createLayoutRegistry()

    registry.registerCard(0, 0, "test", makeLayout(10))
    registry.setStickyY(50)
    registry.setStickyX(3)

    registry.clear()

    expect(registry.getStickyY()).toBeNull()
    expect(registry.getStickyX()).toBeNull()
    expect(registry.getCardOptional(0, 0)).toBeUndefined()
  })
})

// =============================================================================
// findInsertionSlot (Drag-Drop)
// =============================================================================

describe("findInsertionSlot", () => {
  it("finds correct slot for insertion between cards", () => {
    const registry = createLayoutRegistry()

    // Cards at y=2, y=7, y=12 (height=5 each)
    registry.registerCard(0, 0, "c0", makeLayout(2, 5))
    registry.registerCard(0, 1, "c1", makeLayout(7, 5))
    registry.registerCard(0, 2, "c2", makeLayout(12, 5))

    // Before first card
    expect(registry.findInsertionSlot(0, 0)).toBe(0)
    expect(registry.findInsertionSlot(0, 1)).toBe(0)

    // Between first and second
    expect(registry.findInsertionSlot(0, 3)).toBe(1)
    expect(registry.findInsertionSlot(0, 6)).toBe(1)

    // Between second and third
    expect(registry.findInsertionSlot(0, 8)).toBe(2)
    expect(registry.findInsertionSlot(0, 11)).toBe(2)

    // After last card
    expect(registry.findInsertionSlot(0, 15)).toBe(3)
    expect(registry.findInsertionSlot(0, 100)).toBe(3)
  })

  it("returns 0 for empty column", () => {
    const registry = createLayoutRegistry()
    expect(registry.findInsertionSlot(0, 10)).toBe(0)
  })
})

// =============================================================================
// findCardAtYVisual Edge Cases
// =============================================================================

describe("findCardAtYVisual: edge cases", () => {
  it("returns -1 for empty column", () => {
    const registry = createLayoutRegistry()
    expect(registry.findCardAtYVisual(0, 10)).toBe(-1)
  })

  it("returns -1 when targetY above all cards (column header)", () => {
    const registry = createLayoutRegistry()
    registry.registerCard(0, 0, "c0", makeLayout(5, 3))
    registry.registerCard(0, 1, "c1", makeLayout(8, 3))

    expect(registry.findCardAtYVisual(0, 2)).toBe(-1)
  })

  it("finds last card when targetY below all cards", () => {
    const registry = createLayoutRegistry()
    registry.registerCard(0, 0, "c0", makeLayout(10, 3))
    registry.registerCard(0, 1, "c1", makeLayout(15, 3))

    expect(registry.findCardAtYVisual(0, 100)).toBe(1)
  })

  it("handles cards with varying heights", () => {
    const registry = createLayoutRegistry()
    registry.registerCard(0, 0, "short1", makeLayout(0, 2))
    registry.registerCard(0, 1, "tall", makeLayout(2, 10))
    registry.registerCard(0, 2, "short2", makeLayout(12, 2))

    // Inside tall card
    expect(registry.findCardAtYVisual(0, 7)).toBe(1)

    // Card boundaries
    expect(registry.findCardAtYVisual(0, 2)).toBe(1)
    expect(registry.findCardAtYVisual(0, 11)).toBe(1)
    expect(registry.findCardAtYVisual(0, 12)).toBe(2)
  })
})

// =============================================================================
// Debug Utilities
// =============================================================================

describe("dump: debugging output", () => {
  it("includes sticky state and card positions", () => {
    const registry = createLayoutRegistry()

    let dump = registry.dump()
    expect(dump).toContain("stickyY=null")
    expect(dump).toContain("(no cards registered)")

    registry.registerCard(0, 0, "c0", makeLayout(0))
    registry.registerCard(0, 1, "c1", makeLayout(10))
    registry.setStickyY(25)
    registry.setStickyX(5)

    dump = registry.dump()
    expect(dump).toContain("stickyY=25")
    expect(dump).toContain("stickyX=5")
    expect(dump).toContain("col[0]:")
  })
})
