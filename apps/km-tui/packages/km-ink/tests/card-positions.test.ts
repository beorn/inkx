/**
 * Tests for Layout Registry
 *
 * Verifies that:
 * 1. Cards can register their positions and dimensions
 * 2. Cross-column navigation uses registered positions
 * 3. Sticky Y tracking works for h/l sequences
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createLayoutRegistry, type NodeLayout } from "../src/card-positions.ts";

// Helper to create a NodeLayout for testing
function makeLayout(y: number, height = 3): NodeLayout {
  return {
    x: 0,
    y,
    headHeight: 1,
    headWidth: 40,
    cardHeight: height,
    cardWidth: 40,
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
