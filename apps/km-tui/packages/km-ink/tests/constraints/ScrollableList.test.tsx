/**
 * ScrollableList Component Tests
 */

import { describe, it, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";
import {
  ScrollableList,
  calculateScrollState,
  ConstraintRoot,
} from "../../src/constraints/index.ts";

describe("calculateScrollState", () => {
  it("shows all items when they fit", () => {
    const items = ["a", "b", "c"];
    const state = calculateScrollState(items, 0, 10, 1, 0, true);

    expect(state.visible.length).toBe(3);
    expect(state.overflowTop).toBe(0);
    expect(state.overflowBottom).toBe(0);
    expect(state.scrollOffset).toBe(0);
  });

  it("shows subset when items exceed height", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    // Height 5, item height 1, no gap, with indicators (reserves 2 lines for indicators)
    const state = calculateScrollState(items, 0, 5, 1, 0, true);

    // Should show 3 items (5 - 2 for indicators = 3)
    expect(state.visible.length).toBe(3);
    expect(state.overflowTop).toBe(0);
    expect(state.overflowBottom).toBe(7);
  });

  it("scrolls to keep selected item visible", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    // Select item 5 (index 5)
    const state = calculateScrollState(items, 5, 5, 1, 0, true);

    // Selected item should be in visible range
    const visibleIndices = state.visible.map((v) => v.index);
    expect(visibleIndices).toContain(5);
  });

  it("handles empty items", () => {
    const state = calculateScrollState([], 0, 10, 1, 0, true);

    expect(state.visible.length).toBe(0);
    expect(state.overflowTop).toBe(0);
    expect(state.overflowBottom).toBe(0);
  });

  it("handles single item", () => {
    const items = ["only"];
    const state = calculateScrollState(items, 0, 10, 1, 0, true);

    expect(state.visible.length).toBe(1);
    expect(state.overflowTop).toBe(0);
    expect(state.overflowBottom).toBe(0);
  });

  it("accounts for item height", () => {
    const items = ["a", "b", "c", "d", "e"];
    // Height 10, item height 3 = 3 items fit, but with 2 reserved for indicators = 2 items
    const state = calculateScrollState(items, 0, 10, 3, 0, true);

    // (10 - 2) / 3 = 2.67 -> 2 items
    expect(state.visible.length).toBe(2);
    expect(state.overflowBottom).toBe(3);
  });

  it("accounts for gap between items", () => {
    const items = ["a", "b", "c", "d", "e"];
    // Height 10, item height 1, gap 1 = effective 2 per item
    // 5 items fit easily (5 * 2 = 10), so no scrolling needed
    const state = calculateScrollState(items, 0, 10, 1, 1, true);

    // All 5 items fit, so no overflow
    expect(state.visible.length).toBe(5);
    expect(state.overflowBottom).toBe(0);
  });

  it("centers selected item when possible", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    // Height 12 with no indicators, item height 1 = 12 items
    // But we only have 10, so all fit. Let's use fewer.
    // Height 5, item height 1, no indicators = 5 items
    const state = calculateScrollState(items, 5, 7, 1, 0, false);

    // Can show 7 items, selected is 5
    // Should center around 5: indices 2-8 or thereabouts
    const visibleIndices = state.visible.map((v) => v.index);
    expect(visibleIndices).toContain(5);
    // Check it's roughly centered
    const positionInVisible = visibleIndices.indexOf(5);
    expect(positionInVisible).toBeGreaterThanOrEqual(2);
    expect(positionInVisible).toBeLessThanOrEqual(4);
  });

  it("clamps scroll at list end", () => {
    // More items to force scrolling
    const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    // Select last item (index 9), height allows ~3 with indicators
    const state = calculateScrollState(items, 9, 5, 1, 0, true);

    // Should show last few items including item 9
    const visibleIndices = state.visible.map((v) => v.index);
    expect(visibleIndices).toContain(9);
    expect(state.overflowBottom).toBe(0);
    expect(state.overflowTop).toBeGreaterThan(0);
  });

  it("clamps scroll at list start", () => {
    const items = ["a", "b", "c", "d", "e"];
    // Select first item
    const state = calculateScrollState(items, 0, 5, 1, 0, true);

    // Should show items 0, 1, 2 (first 3)
    const visibleIndices = state.visible.map((v) => v.index);
    expect(visibleIndices).toContain(0);
    expect(state.overflowTop).toBe(0);
  });

  it("without indicators fits more items", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const withIndicators = calculateScrollState(items, 0, 5, 1, 0, true);
    const withoutIndicators = calculateScrollState(items, 0, 5, 1, 0, false);

    // Without indicators should fit more items
    expect(withoutIndicators.visible.length).toBeGreaterThan(
      withIndicators.visible.length,
    );
  });
});

describe("ScrollableList", () => {
  it("renders items", () => {
    const items = ["Item 1", "Item 2", "Item 3"];
    const { lastFrame } = render(
      <ConstraintRoot>
        <ScrollableList
          items={items}
          selectedIndex={0}
          renderItem={(item) => <Text>{item}</Text>}
        />
      </ConstraintRoot>,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Item 1");
    expect(frame).toContain("Item 2");
    expect(frame).toContain("Item 3");
  });

  it("passes isSelected to renderItem", () => {
    const items = ["a", "b", "c"];
    const { lastFrame } = render(
      <ConstraintRoot>
        <ScrollableList
          items={items}
          selectedIndex={1}
          renderItem={(item, _idx, isSelected) => (
            <Text>{isSelected ? `[${item}]` : item}</Text>
          )}
        />
      </ConstraintRoot>,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("[b]"); // Selected
    expect(frame).toContain("a"); // Not selected
    expect(frame).not.toContain("[a]");
  });

  it("passes correct index to renderItem", () => {
    const items = ["zero", "one", "two"];
    const { lastFrame } = render(
      <ConstraintRoot>
        <ScrollableList
          items={items}
          selectedIndex={0}
          renderItem={(item, idx) => (
            <Text>
              {idx}:{item}
            </Text>
          )}
        />
      </ConstraintRoot>,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("0:zero");
    expect(frame).toContain("1:one");
    expect(frame).toContain("2:two");
  });

  it("shows overflow indicators when needed", () => {
    // Create many items that won't fit
    const items = Array.from({ length: 50 }, (_, i) => `Item ${i}`);
    const { lastFrame } = render(
      <ConstraintRoot>
        <ScrollableList
          items={items}
          selectedIndex={25}
          height={10}
          renderItem={(item) => <Text>{item}</Text>}
        />
      </ConstraintRoot>,
    );

    const frame = lastFrame() ?? "";
    // Should have overflow indicators
    expect(frame).toMatch(/[▲▼]/);
    expect(frame).toContain("more");
  });

  it("uses custom overflow renderer", () => {
    const items = Array.from({ length: 50 }, (_, i) => `Item ${i}`);
    const { lastFrame } = render(
      <ConstraintRoot>
        <ScrollableList
          items={items}
          selectedIndex={25}
          height={10}
          renderItem={(item) => <Text>{item}</Text>}
          renderOverflow={(dir, count) => (
            <Text>
              {dir === "top" ? "UP" : "DOWN"}: {count}
            </Text>
          )}
        />
      </ConstraintRoot>,
    );

    const frame = lastFrame() ?? "";
    // Should have both UP and DOWN indicators with counts
    expect(frame).toContain("UP:");
    expect(frame).toContain("DOWN:");
  });

  it("handles empty list", () => {
    const { lastFrame } = render(
      <ConstraintRoot>
        <ScrollableList
          items={[]}
          selectedIndex={0}
          renderItem={(item) => <Text>{item}</Text>}
        />
      </ConstraintRoot>,
    );

    const frame = lastFrame() ?? "";
    // Should render without crashing, just empty
    expect(frame).toBeDefined();
  });
});
