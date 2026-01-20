import { describe, expect, it } from "bun:test";
import { distributeSpace, type FlexItemConfig } from "./FlexRow.tsx";

describe("distributeSpace", () => {
  it("returns empty array for empty configs", () => {
    expect(distributeSpace(100, [], 0)).toEqual([]);
  });

  it("handles single fixed-width item", () => {
    const configs: FlexItemConfig[] = [{ width: 50 }];
    expect(distributeSpace(100, configs, 0)).toEqual([50]);
  });

  it("handles single flex item (takes all space)", () => {
    const configs: FlexItemConfig[] = [{ flex: 1 }];
    expect(distributeSpace(100, configs, 0)).toEqual([100]);
  });

  it("handles multiple flex items with equal flex", () => {
    const configs: FlexItemConfig[] = [{ flex: 1 }, { flex: 1 }, { flex: 1 }];
    const widths = distributeSpace(99, configs, 0);
    expect(widths).toEqual([33, 33, 33]);
  });

  it("handles flex items with different flex ratios", () => {
    const configs: FlexItemConfig[] = [{ flex: 2 }, { flex: 1 }];
    const widths = distributeSpace(90, configs, 0);
    expect(widths[0]).toBe(60); // 2/3 of 90
    expect(widths[1]).toBe(30); // 1/3 of 90
  });

  it("distributes remainder to first flex items", () => {
    // 100 / 3 = 33 remainder 1
    const configs: FlexItemConfig[] = [{ flex: 1 }, { flex: 1 }, { flex: 1 }];
    const widths = distributeSpace(100, configs, 0);
    // First item gets the extra char
    expect(widths).toEqual([34, 33, 33]);
  });

  it("handles mixed fixed and flex items", () => {
    const configs: FlexItemConfig[] = [
      { width: 10 }, // Fixed 10
      { flex: 2 }, // 2/3 of remaining (90) = 60
      { flex: 1 }, // 1/3 of remaining (90) = 30
    ];
    const widths = distributeSpace(100, configs, 0);
    expect(widths[0]).toBe(10);
    expect(widths[1]).toBe(60);
    expect(widths[2]).toBe(30);
  });

  it("accounts for gap between items", () => {
    const configs: FlexItemConfig[] = [{ flex: 1 }, { flex: 1 }];
    // Total 100, 1 gap of 2 = 98 available, split evenly = 49 each
    const widths = distributeSpace(100, configs, 2);
    expect(widths).toEqual([49, 49]);
  });

  it("accounts for multiple gaps", () => {
    const configs: FlexItemConfig[] = [{ flex: 1 }, { flex: 1 }, { flex: 1 }];
    // Total 100, 2 gaps of 1 each = 98 available
    const widths = distributeSpace(100, configs, 1);
    expect(widths[0] + widths[1] + widths[2]).toBe(98);
  });

  it("applies minWidth constraint", () => {
    const configs: FlexItemConfig[] = [{ flex: 1, minWidth: 50 }, { flex: 1 }];
    const widths = distributeSpace(60, configs, 0);
    // Without minWidth, each would get 30
    // With minWidth: 50, first item gets 50
    expect(widths[0]).toBe(50);
  });

  it("applies maxWidth constraint", () => {
    const configs: FlexItemConfig[] = [{ flex: 1, maxWidth: 20 }, { flex: 1 }];
    const widths = distributeSpace(100, configs, 0);
    // Without maxWidth, each would get 50
    // With maxWidth: 20, first item capped at 20
    expect(widths[0]).toBe(20);
    expect(widths[1]).toBe(50); // Still gets its fair share
  });

  it("allows squish below minWidth when specified", () => {
    const configs: FlexItemConfig[] = [
      { flex: 1, minWidth: 50, squish: true },
      { flex: 1 },
    ];
    const widths = distributeSpace(40, configs, 0);
    // With squish: true, minWidth is ignored when space is tight
    expect(widths[0]).toBe(20);
    expect(widths[1]).toBe(20);
  });

  it("handles zero total space", () => {
    const configs: FlexItemConfig[] = [{ flex: 1 }, { flex: 1 }];
    const widths = distributeSpace(0, configs, 0);
    expect(widths).toEqual([0, 0]);
  });

  it("handles negative available space (gap exceeds total)", () => {
    const configs: FlexItemConfig[] = [{ flex: 1 }, { flex: 1 }];
    // Total 10, but gap of 20 between 2 items
    const widths = distributeSpace(10, configs, 20);
    // Should handle gracefully - available becomes 0
    expect(widths).toEqual([0, 0]);
  });

  it("handles items with no flex or width (defaults to flex: 1)", () => {
    const configs: FlexItemConfig[] = [{}, {}];
    const widths = distributeSpace(100, configs, 0);
    expect(widths).toEqual([50, 50]);
  });

  it("fixed width takes precedence over flex", () => {
    const configs: FlexItemConfig[] = [{ width: 30, flex: 2 }, { flex: 1 }];
    const widths = distributeSpace(100, configs, 0);
    // Fixed width 30 is used, ignoring flex
    expect(widths[0]).toBe(30);
    expect(widths[1]).toBe(70); // Takes remaining
  });
});
