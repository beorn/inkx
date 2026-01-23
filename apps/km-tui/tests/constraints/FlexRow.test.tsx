/**
 * FlexRow Component Tests
 */

import { describe, it, expect } from "bun:test";
import React from "react";
import { createTestRenderer } from "inkx/testing";

const render = createTestRenderer();
import { Text } from "inkx";
import {
  FlexRow,
  FlexItem,
  distributeSpace,
  ConstraintRoot,
  useComputedSize,
} from "../../src/constraints/index.ts";

describe("distributeSpace", () => {
  it("distributes equally among flex items", () => {
    const widths = distributeSpace(
      100,
      [{ flex: 1 }, { flex: 1 }, { flex: 1 }],
      0,
    );
    // 100 / 3 = 33.33... -> 33, 33, 33 + 1 remainder to first = 34, 33, 33
    expect(widths).toEqual([34, 33, 33]);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("respects fixed widths", () => {
    const widths = distributeSpace(100, [{ width: 20 }, { flex: 1 }], 0);
    expect(widths).toEqual([20, 80]);
  });

  it("handles gaps", () => {
    const widths = distributeSpace(100, [{ flex: 1 }, { flex: 1 }], 2);
    // 100 - 2 (one gap) = 98, split 49/49
    expect(widths).toEqual([49, 49]);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(98); // excluding gap
  });

  it("handles multiple gaps", () => {
    const widths = distributeSpace(
      100,
      [{ flex: 1 }, { flex: 1 }, { flex: 1 }],
      2,
    );
    // 100 - 4 (two gaps) = 96, split 32/32/32
    expect(widths).toEqual([32, 32, 32]);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(96);
  });

  it("respects different flex ratios", () => {
    const widths = distributeSpace(
      100,
      [{ flex: 2 }, { flex: 1 }, { flex: 1 }],
      0,
    );
    // Total flex: 4, so 2/4=50, 1/4=25, 1/4=25
    expect(widths).toEqual([50, 25, 25]);
  });

  it("handles fixed + flex combination", () => {
    const widths = distributeSpace(
      100,
      [{ width: 10 }, { flex: 2 }, { flex: 1 }],
      0,
    );
    // 100 - 10 = 90 for flex, split 60/30
    expect(widths).toEqual([10, 60, 30]);
  });

  it("handles empty configs", () => {
    const widths = distributeSpace(100, [], 0);
    expect(widths).toEqual([]);
  });

  it("handles single item", () => {
    const widths = distributeSpace(100, [{ flex: 1 }], 0);
    expect(widths).toEqual([100]);
  });

  it("applies minWidth constraint", () => {
    const widths = distributeSpace(
      100,
      [{ flex: 1, minWidth: 60 }, { flex: 1 }],
      0,
    );
    // Without constraint: 50/50
    // With minWidth: 60/50 (minWidth enforced, may exceed total)
    expect(widths[0]).toBeGreaterThanOrEqual(60);
  });

  it("applies maxWidth constraint", () => {
    const widths = distributeSpace(
      100,
      [{ flex: 1, maxWidth: 30 }, { flex: 1 }],
      0,
    );
    // Would be 50/50, but first is capped at 30
    expect(widths[0]).toBeLessThanOrEqual(30);
  });

  it("handles all fixed widths", () => {
    const widths = distributeSpace(100, [{ width: 30 }, { width: 40 }], 0);
    expect(widths).toEqual([30, 40]);
  });

  it("handles zero available space", () => {
    const widths = distributeSpace(0, [{ flex: 1 }, { flex: 1 }], 0);
    expect(widths).toEqual([0, 0]);
  });
});

describe("FlexRow", () => {
  // Helper component to display computed size
  function SizeDisplay(): React.ReactElement {
    const { width } = useComputedSize();
    return <Text>{`w=${width}`}</Text>;
  }

  it("renders children with computed widths", () => {
    const { lastFrame } = render(
      <ConstraintRoot>
        <FlexRow>
          <SizeDisplay />
          <SizeDisplay />
        </FlexRow>
      </ConstraintRoot>,
    );
    // Both children should show their computed width
    const frame = lastFrame() ?? "";
    expect(frame).toContain("w=");
  });

  it("respects FlexItem width prop", () => {
    const { lastFrame } = render(
      <ConstraintRoot>
        <FlexRow>
          <FlexItem width={10}>
            <SizeDisplay />
          </FlexItem>
          <FlexItem flex={1}>
            <SizeDisplay />
          </FlexItem>
        </FlexRow>
      </ConstraintRoot>,
    );
    const frame = lastFrame() ?? "";
    // Should have "w=10" for the fixed-width item
    expect(frame).toContain("w=10");
  });

  it("distributes remaining space to flex items", () => {
    // Verify flex item gets remaining space after fixed-width item
    const { lastFrame } = render(
      <ConstraintRoot>
        <FlexRow>
          <FlexItem width={20}>
            <Text>fixed</Text>
          </FlexItem>
          <FlexItem flex={1}>
            <SizeDisplay />
          </FlexItem>
        </FlexRow>
      </ConstraintRoot>,
    );
    const frame = lastFrame() ?? "";
    // Should contain both "fixed" and a width value
    expect(frame).toContain("fixed");
    // The flex item should have remaining width (total - 20)
    // Extract the width value and verify it's reasonable
    const match = frame.match(/w=(\d+)/);
    expect(match).not.toBeNull();
    const flexWidth = parseInt(match![1]!, 10);
    // Flex item should get more than half the terminal
    expect(flexWidth).toBeGreaterThan(40);
  });

  it("handles gap between items", () => {
    const { lastFrame } = render(
      <ConstraintRoot>
        <FlexRow gap={2}>
          <FlexItem flex={1}>
            <SizeDisplay />
          </FlexItem>
          <FlexItem flex={1}>
            <SizeDisplay />
          </FlexItem>
        </FlexRow>
      </ConstraintRoot>,
    );
    const frame = lastFrame() ?? "";
    // Both items should have equal width
    const matches = frame.match(/w=(\d+)/g) ?? [];
    expect(matches.length).toBe(2);
    // Extract widths and verify they're equal (or differ by at most 1 due to rounding)
    const widths = matches.map((m) => parseInt(m.replace("w=", ""), 10));
    expect(Math.abs(widths[0]! - widths[1]!)).toBeLessThanOrEqual(1);
  });

  it("works with non-FlexItem children", () => {
    const { lastFrame } = render(
      <ConstraintRoot>
        <FlexRow>
          <SizeDisplay />
          <SizeDisplay />
          <SizeDisplay />
        </FlexRow>
      </ConstraintRoot>,
    );
    const frame = lastFrame() ?? "";
    // Three children should each get a width
    const matches = frame.match(/w=(\d+)/g) ?? [];
    expect(matches.length).toBe(3);
    // All three should have roughly equal width (differ by at most 1)
    const widths = matches.map((m) => parseInt(m.replace("w=", ""), 10));
    expect(Math.abs(widths[0]! - widths[1]!)).toBeLessThanOrEqual(1);
    expect(Math.abs(widths[1]! - widths[2]!)).toBeLessThanOrEqual(1);
  });

  it("renders plain text children", () => {
    const { lastFrame } = render(
      <ConstraintRoot>
        <FlexRow>
          <FlexItem flex={1}>
            <Text>Hello</Text>
          </FlexItem>
          <FlexItem flex={1}>
            <Text>World</Text>
          </FlexItem>
        </FlexRow>
      </ConstraintRoot>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Hello");
    expect(frame).toContain("World");
  });
});
