import { describe, expect, it } from "bun:test";
import { calculateScrollState } from "./ScrollableList.tsx";

describe("calculateScrollState", () => {
  describe("empty list", () => {
    it("returns empty state for empty items", () => {
      const result = calculateScrollState([], 0, 10, 1, 0, true);
      expect(result).toEqual({
        visible: [],
        scrollOffset: 0,
        overflowTop: 0,
        overflowBottom: 0,
      });
    });
  });

  describe("all items fit", () => {
    it("shows all items when they fit without scrolling", () => {
      const items = ["a", "b", "c"];
      const result = calculateScrollState(items, 0, 10, 1, 0, true);
      expect(result.visible.length).toBe(3);
      expect(result.scrollOffset).toBe(0);
      expect(result.overflowTop).toBe(0);
      expect(result.overflowBottom).toBe(0);
    });

    it("includes all items in visible array with correct indices", () => {
      const items = ["a", "b", "c"];
      const result = calculateScrollState(items, 1, 10, 1, 0, true);
      expect(result.visible).toEqual([
        { item: "a", index: 0 },
        { item: "b", index: 1 },
        { item: "c", index: 2 },
      ]);
    });
  });

  describe("fixed-height scrolling", () => {
    it("centers selected item when possible", () => {
      const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
      // Height 5, item height 1, no gap, with indicators
      // Selecting item 5 (index 4) should try to center it
      const result = calculateScrollState(items, 4, 5, 1, 0, true);
      // With indicators taking space, we need to account for that
      expect(result.visible.some((v) => v.index === 4)).toBe(true);
    });

    it("handles selection at the start", () => {
      const items = ["a", "b", "c", "d", "e"];
      const result = calculateScrollState(items, 0, 3, 1, 0, false);
      expect(result.scrollOffset).toBe(0);
      expect(result.overflowTop).toBe(0);
    });

    it("handles selection at the end", () => {
      const items = ["a", "b", "c", "d", "e"];
      const result = calculateScrollState(items, 4, 3, 1, 0, false);
      expect(result.visible.some((v) => v.index === 4)).toBe(true);
      expect(result.overflowBottom).toBe(0);
    });

    it("calculates overflow counts correctly", () => {
      const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
      // 10 items, height 3, selecting middle
      const result = calculateScrollState(items, 5, 3, 1, 0, false);
      expect(result.overflowTop + result.visible.length + result.overflowBottom).toBe(10);
    });
  });

  describe("with gaps", () => {
    it("accounts for gap in item height calculation", () => {
      const items = ["a", "b", "c", "d"];
      // Height 6, item height 1, gap 1 = effective item height 2
      // Should fit 3 items (6 / 2 = 3)
      const result = calculateScrollState(items, 0, 6, 1, 1, false);
      expect(result.visible.length).toBe(3);
    });
  });

  describe("with overflow indicators", () => {
    it("reserves space for top indicator when scrolled", () => {
      const items = ["a", "b", "c", "d", "e", "f"];
      // When hasOverflowIndicator is true, space is reserved
      const result = calculateScrollState(items, 3, 4, 1, 0, true);
      // Should show fewer items due to indicator space
      expect(result.overflowTop).toBeGreaterThan(0);
    });

    it("reserves space for bottom indicator when more items below", () => {
      const items = ["a", "b", "c", "d", "e", "f"];
      const result = calculateScrollState(items, 0, 4, 1, 0, true);
      expect(result.overflowBottom).toBeGreaterThan(0);
    });
  });

  describe("variable-height items", () => {
    it("handles items with different heights", () => {
      const items = [
        { name: "a", height: 1 },
        { name: "b", height: 2 },
        { name: "c", height: 1 },
        { name: "d", height: 3 },
      ];
      const getItemHeight = (item: { height: number }) => item.height;
      const result = calculateScrollState(items, 0, 10, 1, 0, true, getItemHeight);
      // All items should fit: 1 + 2 + 1 + 3 = 7 < 10
      expect(result.visible.length).toBe(4);
    });

    it("scrolls to show selected variable-height item", () => {
      const items = [
        { name: "a", height: 3 },
        { name: "b", height: 3 },
        { name: "c", height: 3 },
        { name: "d", height: 3 },
        { name: "e", height: 3 },
      ];
      const getItemHeight = (item: { height: number }) => item.height;
      // Total height 15, available 6, select last item
      const result = calculateScrollState(items, 4, 6, 1, 0, true, getItemHeight);
      expect(result.visible.some((v) => v.index === 4)).toBe(true);
    });

    it("handles off-screen selection above viewport", () => {
      const items = ["a", "b", "c", "d", "e", "f", "g"];
      const getItemHeight = () => 2;
      // Start at index 3, then select index 0
      // First calculate with index 3 selected to get a scroll state
      const initialResult = calculateScrollState(items, 3, 5, 1, 0, true, getItemHeight);
      // Now if we select something above the current view
      const result = calculateScrollState(items, 0, 5, 1, 0, true, getItemHeight);
      expect(result.visible.some((v) => v.index === 0)).toBe(true);
    });

    it("handles off-screen selection below viewport", () => {
      const items = ["a", "b", "c", "d", "e", "f", "g"];
      const getItemHeight = () => 2;
      // Select last item when starting from top
      const result = calculateScrollState(items, 6, 5, 1, 0, true, getItemHeight);
      expect(result.visible.some((v) => v.index === 6)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles selectedIndex beyond items length", () => {
      const items = ["a", "b", "c"];
      // Select index 10 when only 3 items exist
      const result = calculateScrollState(items, 10, 5, 1, 0, true);
      // Should clamp to valid range
      expect(result.visible.length).toBeGreaterThan(0);
    });

    it("handles very small available height", () => {
      const items = ["a", "b", "c"];
      // Height of 1 should show at least 1 item
      const result = calculateScrollState(items, 1, 1, 1, 0, false);
      expect(result.visible.length).toBeGreaterThanOrEqual(1);
    });

    it("handles single item", () => {
      const items = ["a"];
      const result = calculateScrollState(items, 0, 10, 1, 0, true);
      expect(result.visible.length).toBe(1);
      expect(result.scrollOffset).toBe(0);
      expect(result.overflowTop).toBe(0);
      expect(result.overflowBottom).toBe(0);
    });
  });
});
