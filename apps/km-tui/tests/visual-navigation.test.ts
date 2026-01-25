/**
 * Visual Navigation Tests
 *
 * Tests for h/l cross-column navigation using screen-relative Y coordinates.
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
 * ## Test Strategy
 *
 * 1. Unit tests for LayoutRegistry with screen coordinates
 * 2. Integration tests simulating h/l navigation with the full flow:
 *    - Card renders and registers position via useScreenRectCallback
 *    - h/l key triggers handleCursorMove
 *    - handleCursorMove uses registry to find target card
 *
 * ## What's NOT Tested Here (Needs TUI Integration Tests)
 *
 * These tests verify the LayoutRegistry logic, but the full flow requires:
 *
 * 1. **useScreenRectCallback provides screen-relative coordinates**
 *    - inkx must correctly compute screenRect (not just contentRect)
 *    - Scroll offsets must be subtracted from content positions
 *    - Test: Create two columns with different scroll positions, verify
 *      registered Y coordinates reflect actual screen positions
 *
 * 2. **handleCursorMove correctly wires registry to board state**
 *    - Test: Press 'l' key, verify correct card is selected based on curswantY
 *    - This requires either:
 *      a) Full TUI integration test (render Board, use stdin.write)
 *      b) Unit test with mocked TUIContext
 *
 * 3. **Scroll position changes trigger position re-registration**
 *    - When user scrolls a column, positions should be re-registered
 *    - Test: Scroll column, verify new positions are registered
 *
 * See bead km-nav-visual-scroll for the full investigation.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  createLayoutRegistry,
  getCardMidY,
  type NodeLayout,
  type LayoutRegistry,
} from "../src/card-positions.ts";

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
  };
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
    const height = card.height ?? 3;
    registry.registerCard(colIndex, idx, card.id, makeLayout(card.y, height));
    // Set head position (head is at top of card, height 1)
    registry.updateCardHead(colIndex, idx, card.y, 1);
  });
}

// =============================================================================
// Visual Navigation: Same Screen Y Position
// =============================================================================

describe("Visual navigation: h/l finds card at same screen Y", () => {
  let registry: LayoutRegistry;

  beforeEach(() => {
    registry = createLayoutRegistry();
  });

  it("h/l to column with same card heights lands on visually-adjacent card", () => {
    // Column 0: cards at screen Y = 5, 10, 15
    registerCards(registry, 0, [
      { id: "a0", y: 5 },
      { id: "a1", y: 10 },
      { id: "a2", y: 15 },
    ]);

    // Column 1: cards at screen Y = 5, 10, 15 (same positions)
    registerCards(registry, 1, [
      { id: "b0", y: 5 },
      { id: "b1", y: 10 },
      { id: "b2", y: 15 },
    ]);

    // From card a1 (y=10), get its midpoint as curswantY
    const currentLayout = registry.getCard(0, 1);
    const curswantY = getCardMidY(currentLayout.layout);

    // Find target in column 1
    const targetIdx = registry.findCardAtYVisual(1, curswantY);

    // Should land on b1 (same visual row)
    expect(targetIdx).toBe(1);
    expect(registry.getCard(1, targetIdx).nodeId).toBe("b1");
  });

  it("h/l to column with offset card positions finds closest card", () => {
    // Column 0: cards at screen Y = 5, 10, 15
    registerCards(registry, 0, [
      { id: "a0", y: 5 },
      { id: "a1", y: 10 },
      { id: "a2", y: 15 },
    ]);

    // Column 1: cards at screen Y = 7, 14, 21 (different positions)
    registerCards(registry, 1, [
      { id: "b0", y: 7 },
      { id: "b1", y: 14 },
      { id: "b2", y: 21 },
    ]);

    // From card a1 (y=10, height=3, head midpoint=10.5)
    const currentLayout = registry.getCard(0, 1);
    const curswantY = getCardMidY(currentLayout.layout);
    expect(curswantY).toBe(10.5);

    // Find target in column 1
    // b0: box [7, 10), midpoint 8.5, dist = 3
    // b1: box [14, 17), midpoint 15.5, dist = 4
    // curswantY=11.5 doesn't intersect any box, so find closest by midpoint
    const targetIdx = registry.findCardAtYVisual(1, curswantY);

    // b0 midpoint (8.5) is closer to 11.5 than b1 midpoint (15.5)
    expect(targetIdx).toBe(0);
  });

  it("h/l to column with taller cards finds card whose box contains curswantY", () => {
    // Column 0: short cards at Y = 5, 10, 15 (height 3)
    registerCards(registry, 0, [
      { id: "a0", y: 5, height: 3 },
      { id: "a1", y: 10, height: 3 },
      { id: "a2", y: 15, height: 3 },
    ]);

    // Column 1: tall cards (height 8)
    // Card b0: y=2, box spans [2, 10)
    // Card b1: y=10, box spans [10, 18)
    registerCards(registry, 1, [
      { id: "b0", y: 2, height: 8 },
      { id: "b1", y: 10, height: 8 },
    ]);

    // From card a1 (y=10, height=3, head midpoint=10.5)
    const curswantY = getCardMidY(registry.getCard(0, 1).layout);
    expect(curswantY).toBe(10.5);

    // Find target: curswantY=11.5 is inside b1's box [10, 18)
    const targetIdx = registry.findCardAtYVisual(1, curswantY);
    expect(targetIdx).toBe(1);
    expect(registry.getCard(1, targetIdx).nodeId).toBe("b1");
  });
});

// =============================================================================
// Visual Navigation: Scroll Offset Handling
// =============================================================================

describe("Visual navigation: scroll offset handling", () => {
  let registry: LayoutRegistry;

  beforeEach(() => {
    registry = createLayoutRegistry();
  });

  it("CRITICAL: positions should be SCREEN relative, not content relative", () => {
    // This is the KEY test for the km-nav-visual-scroll issue.
    //
    // Scenario:
    // - Column 0: scrolled down, so card at content Y=100 appears at screen Y=50
    // - Column 1: not scrolled, card at content Y=50 appears at screen Y=50
    //
    // When useScreenRectCallback is used, both cards should report screen Y=50.
    // If useLayoutCallback (content rect) were used, they'd report different Y values.
    //
    // The test verifies that visual navigation works correctly when both cards
    // register the same SCREEN position (as useScreenRectCallback should provide).

    // Column 0: card at screen Y = 50 (regardless of content position)
    registry.registerCard(0, 0, "a0", {
      x: 0,
      y: 50, // Screen Y position
      cardWidth: 40,
      cardHeight: 5,
    });
    registry.updateCardHead(0, 0, 50, 1);

    // Column 1: card at screen Y = 50 (same screen position)
    registry.registerCard(1, 0, "b0", {
      x: 40,
      y: 50, // Same screen Y
      cardWidth: 40,
      cardHeight: 5,
    });
    registry.updateCardHead(1, 0, 50, 1);

    // Also add other cards at different positions
    registry.registerCard(1, 1, "b1", {
      x: 40,
      y: 60,
      cardWidth: 40,
      cardHeight: 5,
    });
    registry.updateCardHead(1, 1, 60, 1);
    registry.registerCard(1, 2, "b2", {
      x: 40,
      y: 70,
      cardWidth: 40,
      cardHeight: 5,
    });
    registry.updateCardHead(1, 2, 70, 1);

    // From a0 at screen Y=50, curswantY should be 50.5 (head midpoint)
    const curswantY = getCardMidY(registry.getCard(0, 0).layout);
    expect(curswantY).toBe(50.5);

    // Find target in column 1: should find b0 (whose box [50,55) contains 52.5)
    const targetIdx = registry.findCardAtYVisual(1, curswantY);
    expect(targetIdx).toBe(0);
    expect(registry.getCard(1, targetIdx).nodeId).toBe("b0");
  });

  it("different scroll positions: cards at same content Y but different screen Y", () => {
    // This tests what SHOULD happen if useScreenRectCallback works correctly.
    //
    // Scenario (what the screen looks like):
    // - Column 0 scrolled down 20px: card at content Y=100 → screen Y=80
    // - Column 1 not scrolled: card at content Y=80 → screen Y=80
    //
    // Both should appear at screen row 80, so h/l should connect them.

    // Simulate column 0: card appears at screen Y=80
    registry.registerCard(0, 0, "a-scrolled", {
      x: 0,
      y: 80,
      cardWidth: 40,
      cardHeight: 5,
    });
    registry.updateCardHead(0, 0, 80, 1);

    // Simulate column 1: card appears at screen Y=80
    registry.registerCard(1, 0, "b-at-80", {
      x: 40,
      y: 80,
      cardWidth: 40,
      cardHeight: 5,
    });
    registry.updateCardHead(1, 0, 80, 1);
    registry.registerCard(1, 1, "b-at-90", {
      x: 40,
      y: 90,
      cardWidth: 40,
      cardHeight: 5,
    });
    registry.updateCardHead(1, 1, 90, 1);

    // Navigation from a-scrolled should find b-at-80
    const curswantY = getCardMidY(registry.getCard(0, 0).layout);
    const targetIdx = registry.findCardAtYVisual(1, curswantY);

    expect(targetIdx).toBe(0);
    expect(registry.getCard(1, targetIdx).nodeId).toBe("b-at-80");
  });
});

// =============================================================================
// Sticky Y (curswantY) Behavior
// =============================================================================

describe("curswantY sticky behavior for h/l sequences", () => {
  let registry: LayoutRegistry;

  beforeEach(() => {
    registry = createLayoutRegistry();
  });

  it("curswantY is preserved across multiple h/l moves", () => {
    // Setup: 3 columns with cards at various positions
    // Column 0: card at Y=10
    registerCards(registry, 0, [{ id: "a0", y: 10 }]);

    // Column 1: cards at Y=5, 10, 15
    registerCards(registry, 1, [
      { id: "b0", y: 5 },
      { id: "b1", y: 10 },
      { id: "b2", y: 15 },
    ]);

    // Column 2: cards at Y=8, 18
    registerCards(registry, 2, [
      { id: "c0", y: 8 },
      { id: "c1", y: 18 },
    ]);

    // First h/l: from a0, set curswantY
    const curswantY = getCardMidY(registry.getCard(0, 0).layout);
    registry.setStickyY(curswantY);
    expect(curswantY).toBe(10.5); // y=10 + headHeight=1/2

    // First move: col 0 → col 1
    // curswantY=11.5 intersects b1's box [10, 13)
    const target1 = registry.findCardAtYVisual(1, registry.getStickyY()!);
    expect(target1).toBe(1);

    // Second move: col 1 → col 2 (sticky Y preserved)
    // curswantY=11.5: c0 box [8,11), c1 box [18,21)
    // 11.5 doesn't intersect either, find closest: c0 mid=9.5, c1 mid=19.5
    // |11.5 - 9.5| = 2, |11.5 - 19.5| = 8 → c0 wins
    const target2 = registry.findCardAtYVisual(2, registry.getStickyY()!);
    expect(target2).toBe(0);

    // curswantY should still be the original value
    expect(registry.getStickyY()).toBe(curswantY);
  });

  it("j/k clears curswantY", () => {
    registry.setStickyY(50);
    expect(registry.getStickyY()).toBe(50);

    // Simulate what handleCursorMove does on j/k
    registry.clearStickyY();
    expect(registry.getStickyY()).toBeNull();
  });

  it("curswantY survives moving through empty column", () => {
    // Column 0: card at Y=20
    registerCards(registry, 0, [{ id: "a0", y: 20 }]);

    // Column 1: empty (no cards registered)
    // Column 2: card at Y=20
    registerCards(registry, 2, [{ id: "c0", y: 20 }]);

    // Set curswantY from col 0
    const curswantY = getCardMidY(registry.getCard(0, 0).layout);
    registry.setStickyY(curswantY);

    // Move through empty col 1 (would land on column header)
    const target1 = registry.findCardAtYVisual(1, registry.getStickyY()!);
    expect(target1).toBe(-1); // -1 indicates landing on column header

    // curswantY should be preserved
    expect(registry.getStickyY()).toBe(curswantY);

    // Continue to col 2 - should find card at same Y
    const target2 = registry.findCardAtYVisual(2, registry.getStickyY()!);
    expect(target2).toBe(0);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("Visual navigation edge cases", () => {
  let registry: LayoutRegistry;

  beforeEach(() => {
    registry = createLayoutRegistry();
  });

  it("curswantY above all cards lands on first card (not header)", () => {
    // Cards start at Y=10
    registerCards(registry, 0, [
      { id: "a0", y: 10 },
      { id: "a1", y: 15 },
    ]);

    // curswantY at Y=5 (above all cards)
    const targetIdx = registry.findCardAtYVisual(0, 5);

    // Per implementation, returns -1 for "above all cards"
    // In board-actions.ts, this is clamped to 0 (first card)
    expect(targetIdx).toBe(-1);
  });

  it("curswantY below all cards lands on last card", () => {
    // Cards end at Y=18 (last card Y=15, height=3)
    registerCards(registry, 0, [
      { id: "a0", y: 10, height: 3 },
      { id: "a1", y: 15, height: 3 },
    ]);

    // curswantY at Y=100 (below all cards)
    const targetIdx = registry.findCardAtYVisual(0, 100);

    // Should find closest card (last one)
    expect(targetIdx).toBe(1);
  });

  it("single card column always lands on that card", () => {
    registerCards(registry, 0, [{ id: "only", y: 50 }]);

    // Any curswantY should land on the only card
    expect(registry.findCardAtYVisual(0, 0)).toBe(-1); // Above the card
    expect(registry.findCardAtYVisual(0, 51)).toBe(0); // Inside the card
    expect(registry.findCardAtYVisual(0, 100)).toBe(0); // Below the card
  });

  it("handles cards with varying heights correctly", () => {
    // Mix of tall and short cards
    registerCards(registry, 0, [
      { id: "short1", y: 0, height: 2 }, // box [0, 2)
      { id: "tall", y: 2, height: 10 }, // box [2, 12)
      { id: "short2", y: 12, height: 2 }, // box [12, 14)
    ]);

    // curswantY in middle of tall card
    expect(registry.findCardAtYVisual(0, 7)).toBe(1); // Inside tall card

    // curswantY at boundary
    expect(registry.findCardAtYVisual(0, 2)).toBe(1); // First pixel of tall card
    expect(registry.findCardAtYVisual(0, 11)).toBe(1); // Last pixel of tall card
    expect(registry.findCardAtYVisual(0, 12)).toBe(2); // First pixel of short2
  });
});

// =============================================================================
// Head Position Tests (for accurate visual targeting)
// =============================================================================

describe("Head position for visual targeting", () => {
  let registry: LayoutRegistry;

  beforeEach(() => {
    registry = createLayoutRegistry();
  });

  it("uses head midpoint when head is measured", () => {
    // Register card with full dimensions
    registry.registerCard(0, 0, "card", {
      x: 0,
      y: 10,
      cardWidth: 40,
      cardHeight: 20, // Tall card
    });

    // Update with head position (smaller area near top)
    registry.updateCardHead(0, 0, 11, 2); // Head at y=11, height=2

    // curswantY should be head midpoint, not card midpoint
    const layout = registry.getCard(0, 0).layout;
    const curswantY = getCardMidY(layout);

    // Head midpoint = 11 + 2/2 = 12
    expect(curswantY).toBe(12);

    // Without head, would be card midpoint = 10 + 20/2 = 20
    expect(curswantY).not.toBe(20);
  });

  it("throws when head not measured (programming error)", () => {
    registry.registerCard(0, 0, "card", {
      x: 0,
      y: 10,
      cardWidth: 40,
      cardHeight: 20,
    });

    // No updateCardHead called - this is a programming error

    const layout = registry.getCard(0, 0).layout;
    expect(() => getCardMidY(layout)).toThrow(
      "Head position not registered",
    );
  });
});

// =============================================================================
// handleCursorMove Integration
// =============================================================================

/**
 * These tests verify the logic flow from board-actions.ts handleCursorMove.
 * They test the algorithm without needing a full TUI context.
 */
describe("handleCursorMove h/l navigation algorithm", () => {
  let registry: LayoutRegistry;

  beforeEach(() => {
    registry = createLayoutRegistry();
  });

  /**
   * Simulates the h/l navigation algorithm from board-actions.ts lines 479-590.
   * This is extracted for testability.
   */
  function simulateHLNavigation(
    registry: LayoutRegistry,
    currentColIndex: number,
    currentCardIndex: number,
    direction: "left" | "right",
    columns: { cards: { id: string }[] }[],
  ): {
    targetColIndex: number;
    targetCardIndex: number;
    curswantY: number | null;
  } {
    // Calculate target column
    const step = direction === "left" ? -1 : 1;
    let targetColIndex = currentColIndex + step;

    // Clamp to valid range
    targetColIndex = Math.max(0, Math.min(columns.length - 1, targetColIndex));

    if (targetColIndex === currentColIndex) {
      // No movement possible
      return {
        targetColIndex: currentColIndex,
        targetCardIndex: currentCardIndex,
        curswantY: registry.getStickyY(),
      };
    }

    const targetCol = columns[targetColIndex];
    if (!targetCol || targetCol.cards.length === 0) {
      // Empty column - go to column level (cardIndex = -1)
      return {
        targetColIndex,
        targetCardIndex: -1,
        curswantY: registry.getStickyY(),
      };
    }

    // Check if positions are registered
    const hasCurrentPositions = registry.hasCardsInColumn(currentColIndex);
    const hasTargetPositions = registry.hasCardsInColumn(targetColIndex);

    if (!hasCurrentPositions || !hasTargetPositions) {
      // Fall back to same index clamped
      const targetCardIndex = Math.min(
        currentCardIndex,
        targetCol.cards.length - 1,
      );
      return {
        targetColIndex,
        targetCardIndex: Math.max(0, targetCardIndex),
        curswantY: null,
      };
    }

    // Get or calculate curswantY
    let curswantY = registry.getStickyY();
    if (curswantY === null) {
      const currentLayout = registry.getCardOptional(
        currentColIndex,
        currentCardIndex,
      );
      if (!currentLayout) {
        // Current card not registered - fall back
        const targetCardIndex = Math.min(
          currentCardIndex,
          targetCol.cards.length - 1,
        );
        return {
          targetColIndex,
          targetCardIndex: Math.max(0, targetCardIndex),
          curswantY: null,
        };
      }
      curswantY = getCardMidY(currentLayout.layout);
      registry.setStickyY(curswantY);
    }

    // Find target card
    let targetCardIndex = registry.findCardAtYVisual(targetColIndex, curswantY);
    targetCardIndex = Math.max(0, targetCardIndex); // Clamp -1 to 0

    return {
      targetColIndex,
      targetCardIndex,
      curswantY,
    };
  }

  it("algorithm selects card at same visual Y position", () => {
    // Setup columns
    const columns = [
      { cards: [{ id: "a0" }, { id: "a1" }, { id: "a2" }] },
      { cards: [{ id: "b0" }, { id: "b1" }, { id: "b2" }] },
    ];

    // Register positions
    registerCards(registry, 0, [
      { id: "a0", y: 5 },
      { id: "a1", y: 10 },
      { id: "a2", y: 15 },
    ]);
    registerCards(registry, 1, [
      { id: "b0", y: 5 },
      { id: "b1", y: 10 },
      { id: "b2", y: 15 },
    ]);

    // Navigate from a1 (y=10) to column 1
    const result = simulateHLNavigation(registry, 0, 1, "right", columns);

    expect(result.targetColIndex).toBe(1);
    expect(result.targetCardIndex).toBe(1); // b1 at same Y
  });

  it("algorithm falls back when positions not registered", () => {
    const columns = [
      { cards: [{ id: "a0" }, { id: "a1" }] },
      { cards: [{ id: "b0" }, { id: "b1" }, { id: "b2" }] },
    ];

    // Only register column 0 positions
    registerCards(registry, 0, [
      { id: "a0", y: 5 },
      { id: "a1", y: 10 },
    ]);
    // Column 1 has NO positions registered

    // Navigate from a1 (index 1) to column 1
    const result = simulateHLNavigation(registry, 0, 1, "right", columns);

    expect(result.targetColIndex).toBe(1);
    expect(result.targetCardIndex).toBe(1); // Falls back to same index
    expect(result.curswantY).toBeNull(); // No curswantY set
  });

  it("algorithm preserves curswantY across moves", () => {
    const columns = [
      { cards: [{ id: "a0" }] },
      { cards: [{ id: "b0" }, { id: "b1" }] },
      { cards: [{ id: "c0" }, { id: "c1" }, { id: "c2" }] },
    ];

    registerCards(registry, 0, [{ id: "a0", y: 10 }]);
    registerCards(registry, 1, [
      { id: "b0", y: 5 },
      { id: "b1", y: 15 },
    ]);
    registerCards(registry, 2, [
      { id: "c0", y: 5 },
      { id: "c1", y: 10 },
      { id: "c2", y: 15 },
    ]);

    // First move: col 0 → col 1
    const result1 = simulateHLNavigation(registry, 0, 0, "right", columns);
    expect(result1.curswantY).toBe(10.5); // a0 head midpoint

    // Second move: col 1 → col 2 (use same curswantY)
    const result2 = simulateHLNavigation(
      registry,
      1,
      result1.targetCardIndex,
      "right",
      columns,
    );

    // curswantY should be preserved
    expect(result2.curswantY).toBe(10.5);
    // c1 at y=10 is closest to curswantY=10.5
    expect(result2.targetCardIndex).toBe(1);
  });
});

// =============================================================================
// Regression Tests for Known Bugs
// =============================================================================

describe("Regression: km-nav-visual-scroll scenarios", () => {
  let registry: LayoutRegistry;

  beforeEach(() => {
    registry = createLayoutRegistry();
  });

  it("scenario: card index fallback when positions not registered", () => {
    // When cards haven't registered positions yet (first render race condition),
    // the code should fall back to index-based navigation.

    // Column 0 has positions
    registerCards(registry, 0, [{ id: "a0", y: 10 }]);

    // Column 1 has NO positions registered
    // hasCardsInColumn(1) should return false
    expect(registry.hasCardsInColumn(1)).toBe(false);

    // In this case, board-actions.ts falls back to same index, clamped
    // This test documents the expected fallback behavior
  });

  it("scenario: proportional vs visual navigation", () => {
    // Old behavior (board reducer): uses ratio-based proportional mapping
    // - Card 2 in 3-card column = ratio 2/3
    // - Target in 2-card column = round(2/3 * 2) = round(1.33) = 1
    //
    // New behavior (TUI with registry): uses visual Y position
    // - Card 2 at screen Y=20, find card at Y=20 in target column

    // Column 0: 3 cards, equal spacing
    registerCards(registry, 0, [
      { id: "a0", y: 5 },
      { id: "a1", y: 10 },
      { id: "a2", y: 15 },
    ]);

    // Column 1: 2 cards, same positions as first 2 cards of column 0
    registerCards(registry, 1, [
      { id: "b0", y: 5 },
      { id: "b1", y: 10 },
    ]);

    // From a2 (y=15), old behavior would map to b1 (ratio 2/3 → index 1)
    // With visual navigation, should find closest: b1 at y=10 is closest to y=15
    const curswantY = getCardMidY(registry.getCard(0, 2).layout); // 16.5
    const targetIdx = registry.findCardAtYVisual(1, curswantY);

    // b0: box [5,8), mid=6.5, dist=10
    // b1: box [10,13), mid=11.5, dist=5
    // b1 is closer
    expect(targetIdx).toBe(1);
  });
});
