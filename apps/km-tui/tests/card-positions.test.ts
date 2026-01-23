/**
 * Tests for Layout Registry
 *
 * Verifies that:
 * 1. Cards can register their positions and dimensions
 * 2. Cross-column navigation uses registered positions
 * 3. Sticky Y tracking works for h/l sequences
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  createLayoutRegistry,
  getCardMidY,
  type NodeLayout,
} from "../src/card-positions.ts";

// Helper to create a NodeLayout for testing
function makeLayout(y: number, height = 3): NodeLayout {
  return {
    x: 0,
    y,
    cardWidth: 40,
    cardHeight: height,
  };
}

describe("LayoutRegistry", () => {
  describe("basic card operations", () => {
    it("should register and retrieve cards", () => {
      const registry = createLayoutRegistry();

      registry.registerCard(0, 0, "card-0", makeLayout(0));
      registry.registerCard(0, 1, "card-1", makeLayout(10));
      registry.registerCard(0, 2, "card-2", makeLayout(20));

      expect(registry.getCard(0, 0).layout.y).toBe(0);
      expect(registry.getCard(0, 1).layout.y).toBe(10);
      expect(registry.getCard(0, 2).layout.y).toBe(20);
    });

    it("should return undefined for unregistered cards (optional getter)", () => {
      const registry = createLayoutRegistry();

      expect(registry.getCardOptional(0, 0)).toBeUndefined();
      expect(registry.getCardOptional(1, 5)).toBeUndefined();
    });

    it("should throw for unregistered cards (required getter)", () => {
      const registry = createLayoutRegistry();

      expect(() => registry.getCard(0, 0)).toThrow("Card layout not found");
    });

    it("should support multiple columns", () => {
      const registry = createLayoutRegistry();

      registry.registerCard(0, 0, "col0-card0", makeLayout(0));
      registry.registerCard(0, 1, "col0-card1", makeLayout(10));
      registry.registerCard(1, 0, "col1-card0", makeLayout(0));
      registry.registerCard(1, 1, "col1-card1", makeLayout(15));
      registry.registerCard(1, 2, "col1-card2", makeLayout(30));

      expect(registry.getCard(0, 0).nodeId).toBe("col0-card0");
      expect(registry.getCard(0, 1).nodeId).toBe("col0-card1");
      expect(registry.getCard(1, 0).nodeId).toBe("col1-card0");
      expect(registry.getCard(1, 1).nodeId).toBe("col1-card1");
      expect(registry.getCard(1, 2).nodeId).toBe("col1-card2");
    });

    it("should also register by node ID", () => {
      const registry = createLayoutRegistry();

      registry.registerCard(0, 0, "test-node-id", makeLayout(42));

      const layout = registry.getNode("test-node-id");
      expect(layout.y).toBe(42);
    });
  });

  describe("findCardAtY", () => {
    it("should find card closest to target Y", () => {
      const registry = createLayoutRegistry();

      // Column with cards at y=0, 10, 20, 30
      registry.registerCard(0, 0, "c0", makeLayout(0));
      registry.registerCard(0, 1, "c1", makeLayout(10));
      registry.registerCard(0, 2, "c2", makeLayout(20));
      registry.registerCard(0, 3, "c3", makeLayout(30));

      // Exact matches
      expect(registry.findCardAtY(0, 0)).toBe(0);
      expect(registry.findCardAtY(0, 10)).toBe(1);
      expect(registry.findCardAtY(0, 20)).toBe(2);
      expect(registry.findCardAtY(0, 30)).toBe(3);

      // Between cards - should find closest
      expect(registry.findCardAtY(0, 5)).toBe(0); // closer to 0 than 10
      expect(registry.findCardAtY(0, 6)).toBe(1); // closer to 10 than 0
      expect(registry.findCardAtY(0, 14)).toBe(1); // closer to 10 than 20
      expect(registry.findCardAtY(0, 16)).toBe(2); // closer to 20 than 10
    });

    it("should throw if column has no cards registered", () => {
      const registry = createLayoutRegistry();

      expect(() => registry.findCardAtY(0, 10)).toThrow(
        "No cards registered for column 0",
      );
    });
  });

  describe("sticky Y", () => {
    it("should track sticky Y for h/l sequences", () => {
      const registry = createLayoutRegistry();

      expect(registry.getStickyY()).toBeNull();

      registry.setStickyY(50);
      expect(registry.getStickyY()).toBe(50);

      registry.clearStickyY();
      expect(registry.getStickyY()).toBeNull();
    });

    it("should clear sticky Y on clear()", () => {
      const registry = createLayoutRegistry();

      registry.registerCard(0, 0, "test", makeLayout(10));
      registry.setStickyY(50);

      registry.clear();

      expect(registry.getStickyY()).toBeNull();
      expect(registry.getCardOptional(0, 0)).toBeUndefined();
    });
  });

  describe("utility methods", () => {
    it("should report column card count", () => {
      const registry = createLayoutRegistry();

      expect(registry.getCardCount(0)).toBe(0);
      expect(registry.hasCardsInColumn(0)).toBe(false);

      registry.registerCard(0, 0, "c0", makeLayout(0));
      registry.registerCard(0, 1, "c1", makeLayout(10));

      expect(registry.getCardCount(0)).toBe(2);
      expect(registry.hasCardsInColumn(0)).toBe(true);
    });

    it("should dump registry state", () => {
      const registry = createLayoutRegistry();
      let dump = registry.dump();

      expect(dump).toContain("stickyY=null");
      expect(dump).toContain("(no cards registered)");

      registry.registerCard(0, 0, "c0", makeLayout(0));
      registry.registerCard(0, 1, "c1", makeLayout(10));
      registry.registerCard(1, 0, "c2", makeLayout(5));
      registry.setStickyY(25);

      dump = registry.dump();

      expect(dump).toContain("stickyY=25");
      expect(dump).toContain("col[0]:");
      expect(dump).toContain("col[1]:");
    });
  });
});

describe("Cross-column navigation with positions", () => {
  it("should find visually equivalent card in target column", () => {
    const registry = createLayoutRegistry();

    // Source column: cards at y=0, 15, 30, 45
    registry.registerCard(0, 0, "s0", makeLayout(0));
    registry.registerCard(0, 1, "s1", makeLayout(15));
    registry.registerCard(0, 2, "s2", makeLayout(30));
    registry.registerCard(0, 3, "s3", makeLayout(45));

    // Target column: cards at y=0, 10, 20, 30, 40
    registry.registerCard(1, 0, "t0", makeLayout(0));
    registry.registerCard(1, 1, "t1", makeLayout(10));
    registry.registerCard(1, 2, "t2", makeLayout(20));
    registry.registerCard(1, 3, "t3", makeLayout(30));
    registry.registerCard(1, 4, "t4", makeLayout(40));

    // From source card at y=30, find closest in target
    const targetCard = registry.findCardAtY(1, 30);
    expect(targetCard).toBe(3); // card at y=30

    // From source card at y=15, find closest in target
    const targetCard2 = registry.findCardAtY(1, 15);
    expect(targetCard2).toBe(1); // card at y=10 is closer than y=20
  });

  it("should handle columns with different card heights", () => {
    const registry = createLayoutRegistry();

    // Source column: 2 tall cards
    registry.registerCard(0, 0, "s0", makeLayout(0, 20)); // height 20
    registry.registerCard(0, 1, "s1", makeLayout(20, 20)); // height 20

    // Target column: 4 short cards
    registry.registerCard(1, 0, "t0", makeLayout(0, 10)); // height 10
    registry.registerCard(1, 1, "t1", makeLayout(10, 10));
    registry.registerCard(1, 2, "t2", makeLayout(20, 10));
    registry.registerCard(1, 3, "t3", makeLayout(30, 10));

    // From first card (y=0), should find first card in target
    expect(registry.findCardAtY(1, 0)).toBe(0);

    // From second card (y=20), should find third card in target
    expect(registry.findCardAtY(1, 20)).toBe(2);
  });
});

describe("Visual navigation (findCardAtYVisual)", () => {
  it("should find card whose box intersects targetY", () => {
    const registry = createLayoutRegistry();

    // Cards with height=5: card box spans y to y+5
    // Card 0: y=2, spans 2-7
    // Card 1: y=7, spans 7-12
    // Card 2: y=12, spans 12-17
    registry.registerCard(0, 0, "c0", makeLayout(2, 5));
    registry.registerCard(0, 1, "c1", makeLayout(7, 5));
    registry.registerCard(0, 2, "c2", makeLayout(12, 5));

    // targetY=4 is inside card 0's box (2-7)
    expect(registry.findCardAtYVisual(0, 4)).toBe(0);

    // targetY=9 is inside card 1's box (7-12)
    expect(registry.findCardAtYVisual(0, 9)).toBe(1);

    // targetY=14 is inside card 2's box (12-17)
    expect(registry.findCardAtYVisual(0, 14)).toBe(2);
  });

  it("should find closest card when targetY doesn't intersect any box", () => {
    const registry = createLayoutRegistry();

    // Cards with gaps between them
    // Card 0: y=0, height=3, spans 0-3
    // Card 1: y=10, height=3, spans 10-13
    registry.registerCard(0, 0, "c0", makeLayout(0, 3));
    registry.registerCard(0, 1, "c1", makeLayout(10, 3));

    // targetY=5 is in the gap - should find closest (card 0 midpoint=1.5, card 1 midpoint=11.5)
    // 5 is closer to 1.5 (dist=3.5) than 11.5 (dist=6.5)
    expect(registry.findCardAtYVisual(0, 5)).toBe(0);

    // targetY=8 is in the gap - closer to card 1
    expect(registry.findCardAtYVisual(0, 8)).toBe(1);
  });

  it("should return -1 when targetY is above all cards (column header)", () => {
    const registry = createLayoutRegistry();

    // Cards start at y=5
    registry.registerCard(0, 0, "c0", makeLayout(5, 3));
    registry.registerCard(0, 1, "c1", makeLayout(8, 3));

    // targetY=2 is above all cards
    expect(registry.findCardAtYVisual(0, 2)).toBe(-1);
  });

  it("should return -1 for empty column", () => {
    const registry = createLayoutRegistry();

    // No cards registered
    expect(registry.findCardAtYVisual(0, 10)).toBe(-1);
  });
});

describe("Insertion slots (findInsertionSlot)", () => {
  it("should find correct slot for insertion", () => {
    const registry = createLayoutRegistry();

    // Cards: y=2, y=7, y=12 (height=5 each)
    registry.registerCard(0, 0, "c0", makeLayout(2, 5));
    registry.registerCard(0, 1, "c1", makeLayout(7, 5));
    registry.registerCard(0, 2, "c2", makeLayout(12, 5));

    // Slot 0: before first card (y < 2)
    expect(registry.findInsertionSlot(0, 0)).toBe(0);
    expect(registry.findInsertionSlot(0, 1)).toBe(0);

    // Slot 1: after card 0, before card 1 (2 <= y < 7)
    expect(registry.findInsertionSlot(0, 3)).toBe(1);
    expect(registry.findInsertionSlot(0, 6)).toBe(1);

    // Slot 2: after card 1, before card 2 (7 <= y < 12)
    expect(registry.findInsertionSlot(0, 8)).toBe(2);
    expect(registry.findInsertionSlot(0, 11)).toBe(2);

    // Slot 3: after card 2 (y >= 12)
    expect(registry.findInsertionSlot(0, 15)).toBe(3);
    expect(registry.findInsertionSlot(0, 100)).toBe(3);
  });

  it("should return 0 for empty column", () => {
    const registry = createLayoutRegistry();
    expect(registry.findInsertionSlot(0, 10)).toBe(0);
  });
});

describe("Sticky X (curswantX)", () => {
  it("should track sticky X for board/column navigation", () => {
    const registry = createLayoutRegistry();

    expect(registry.getStickyX()).toBeNull();

    registry.setStickyX(2);
    expect(registry.getStickyX()).toBe(2);

    registry.clearStickyX();
    expect(registry.getStickyX()).toBeNull();
  });

  it("should clear sticky X on clear()", () => {
    const registry = createLayoutRegistry();

    registry.setStickyX(3);
    registry.clear();

    expect(registry.getStickyX()).toBeNull();
  });

  it("should include sticky X in dump", () => {
    const registry = createLayoutRegistry();
    registry.setStickyX(5);

    const dump = registry.dump();
    expect(dump).toContain("stickyX=5");
  });
});

describe("getCardMidY helper", () => {
  it("should calculate card vertical center when no head measured", () => {
    // Card at y=10, height=5
    // Card center = 10 + 5/2 = 12.5
    const layout = makeLayout(10, 5);
    expect(getCardMidY(layout)).toBe(12.5);
  });

  it("should use measured head position when available", () => {
    // Card at y=10, height=10, but head at y=11, height=1
    const layout: NodeLayout = {
      x: 0,
      y: 10,
      cardWidth: 40,
      cardHeight: 10,
      headY: 11,
      headHeight: 1,
    };
    // Head center = 11 + 1/2 = 11.5
    expect(getCardMidY(layout)).toBe(11.5);
  });

  it("should fallback to card center when head partially measured", () => {
    // Only headY set, no headHeight
    const layout: NodeLayout = {
      x: 0,
      y: 20,
      cardWidth: 40,
      cardHeight: 6,
      headY: 21,
    };
    // Falls back to card center = 20 + 6/2 = 23
    expect(getCardMidY(layout)).toBe(23);
  });
});

describe("updateCardHead", () => {
  it("should update head position for registered card", () => {
    const registry = createLayoutRegistry();

    registry.registerCard(0, 0, "card-0", makeLayout(10, 8));
    registry.updateCardHead(0, 0, 11, 1);

    const entry = registry.getCard(0, 0);
    expect(entry.layout.headY).toBe(11);
    expect(entry.layout.headHeight).toBe(1);
  });

  it("should silently ignore unregistered cards", () => {
    const registry = createLayoutRegistry();

    // Should not throw
    registry.updateCardHead(0, 0, 11, 1);

    expect(registry.getCardOptional(0, 0)).toBeUndefined();
  });

  it("should update getCardMidY result", () => {
    const registry = createLayoutRegistry();

    // Card at y=5, height=10 → card center = 10
    registry.registerCard(0, 0, "card-0", makeLayout(5, 10));
    expect(getCardMidY(registry.getCard(0, 0).layout)).toBe(10);

    // Update head: y=6, height=2 → head center = 7
    registry.updateCardHead(0, 0, 6, 2);
    expect(getCardMidY(registry.getCard(0, 0).layout)).toBe(7);
  });
});

describe("Visual navigation scenarios", () => {
  it("h/l from tall card should land on card that visually aligns", () => {
    const registry = createLayoutRegistry();

    // Column 0: One tall card with many subitems
    // y=2, height=15 (lots of subitems)
    registry.registerCard(0, 0, "tall", makeLayout(2, 15));

    // Column 1: Multiple short cards
    // y=2, height=4
    // y=6, height=4
    // y=10, height=4
    // y=14, height=4
    registry.registerCard(1, 0, "short0", makeLayout(2, 4));
    registry.registerCard(1, 1, "short1", makeLayout(6, 4));
    registry.registerCard(1, 2, "short2", makeLayout(10, 4));
    registry.registerCard(1, 3, "short3", makeLayout(14, 4));

    // Card center of tall card: y=2, height=15, center = 2 + 15/2 = 9.5
    const curswantY = getCardMidY(makeLayout(2, 15));
    expect(curswantY).toBe(9.5);

    // This should land on short1 (box [6, 10) contains 9.5)
    expect(registry.findCardAtYVisual(1, curswantY)).toBe(1);
  });

  it("h/l should preserve visual position across multiple columns", () => {
    const registry = createLayoutRegistry();

    // Set up 3 columns with varying card sizes
    // Column 0: 2 cards
    registry.registerCard(0, 0, "c0-0", makeLayout(2, 5)); // y=2-7
    registry.registerCard(0, 1, "c0-1", makeLayout(7, 5)); // y=7-12

    // Column 1: 4 smaller cards
    registry.registerCard(1, 0, "c1-0", makeLayout(2, 3)); // y=2-5
    registry.registerCard(1, 1, "c1-1", makeLayout(5, 3)); // y=5-8
    registry.registerCard(1, 2, "c1-2", makeLayout(8, 3)); // y=8-11
    registry.registerCard(1, 3, "c1-3", makeLayout(11, 3)); // y=11-14

    // Column 2: 2 cards same as column 0
    registry.registerCard(2, 0, "c2-0", makeLayout(2, 5)); // y=2-7
    registry.registerCard(2, 1, "c2-1", makeLayout(7, 5)); // y=7-12

    // Start on column 0, card 1 (y=7-12)
    // Card center = 7 + 5/2 = 9.5
    const curswantY = getCardMidY(makeLayout(7, 5));
    expect(curswantY).toBe(9.5);

    // Move to column 1: should land on card 2 (y=8-11 contains 9.5)
    expect(registry.findCardAtYVisual(1, curswantY)).toBe(2);

    // Move to column 2: should land on card 1 (y=7-12 contains 9.5)
    expect(registry.findCardAtYVisual(2, curswantY)).toBe(1);
  });
});
