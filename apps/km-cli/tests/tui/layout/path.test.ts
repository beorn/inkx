/**
 * Tests for path rendering (Layer 2)
 */

import { describe, it, expect } from "bun:test";
import {
  calcPathLength,
  renderPath,
  renderParentPath,
  type PathSegment,
} from "../../../src/tui/layout/path.ts";

describe("calcPathLength", () => {
  it("returns 0 for empty array", () => {
    expect(calcPathLength([])).toBe(0);
  });

  it("calculates length with separators", () => {
    const segments: PathSegment[] = [
      { name: "foo", sep: "/", isWithinBoard: false },
      { name: "bar", sep: "", isWithinBoard: false },
    ];
    // "foo" + " / " (3) + "bar" = 3 + 3 + 3 = 9
    expect(calcPathLength(segments)).toBe(9);
  });

  it("handles segment without separator", () => {
    const segments: PathSegment[] = [
      { name: "only", sep: "", isWithinBoard: false },
    ];
    expect(calcPathLength(segments)).toBe(4);
  });
});

describe("renderPath", () => {
  it("returns all segments if they fit", () => {
    const segments: PathSegment[] = [
      { name: "a", sep: "/", isWithinBoard: false },
      { name: "b", sep: "", isWithinBoard: false },
    ];
    const result = renderPath(segments, 100);
    expect(result).toEqual(segments);
  });

  it("returns all segments if no width specified", () => {
    const segments: PathSegment[] = [
      { name: "very-long-segment", sep: "/", isWithinBoard: false },
      { name: "another-long-one", sep: "", isWithinBoard: false },
    ];
    const result = renderPath(segments);
    expect(result).toEqual(segments);
  });

  it("truncates within-board segments first", () => {
    const segments: PathSegment[] = [
      { name: "root", sep: "/", isWithinBoard: false },
      { name: "child1", sep: "/", isWithinBoard: true },
      { name: "child2", sep: "", isWithinBoard: true },
    ];
    const result = renderPath(segments, 20);
    // Should truncate board segments before root
    expect(result.some((s) => s.name.startsWith("…"))).toBe(true);
  });

  it("adds ellipsis when truncating", () => {
    const segments: PathSegment[] = [
      { name: "one", sep: "/", isWithinBoard: false },
      { name: "two", sep: "/", isWithinBoard: false },
      { name: "three", sep: "", isWithinBoard: false },
    ];
    const result = renderPath(segments, 10);
    expect(result.some((s) => s.name.includes("…"))).toBe(true);
  });
});

describe("renderParentPath", () => {
  it("right-aligns path when it fits", () => {
    const result = renderParentPath("foo/bar", 10);
    expect(result).toBe("   foo/bar");
    expect(result.length).toBe(10);
  });

  it("returns path as-is if width matches length", () => {
    const result = renderParentPath("exact", 5);
    expect(result).toBe("exact");
  });

  it("left-truncates when too long", () => {
    const result = renderParentPath("path/to/file", 8);
    expect(result).toBe("…to/file");
    expect(result.length).toBe(8);
  });

  it("handles very short width", () => {
    const result = renderParentPath("long/path", 3);
    expect(result.length).toBe(3);
    expect(result.startsWith("…")).toBe(true);
  });
});
