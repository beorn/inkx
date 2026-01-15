/**
 * Tests for text truncation and padding (Layer 2)
 */

import { describe, it, expect } from "bun:test";
import { truncateText, padText } from "../../../src/tui/layout/truncate.ts";
import { displayLength } from "../../../src/text/rich.ts";

describe("truncateText", () => {
  it("returns unchanged if text fits", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("adds ellipsis when truncating", () => {
    const result = truncateText("hello world", 6);
    expect(result).toContain("…");
    expect(displayLength(result)).toBeLessThanOrEqual(6);
  });

  it("truncates exactly to width", () => {
    const result = truncateText("hello world", 8);
    expect(displayLength(result)).toBeLessThanOrEqual(8);
  });

  it("handles very short width", () => {
    const result = truncateText("hello", 2);
    expect(displayLength(result)).toBeLessThanOrEqual(2);
    expect(result).toContain("…");
  });

  it("handles width of 1", () => {
    const result = truncateText("hello", 1);
    expect(displayLength(result)).toBeLessThanOrEqual(1);
  });

  it("handles empty string", () => {
    expect(truncateText("", 10)).toBe("");
  });
});

describe("padText", () => {
  it("pads short text to width", () => {
    const result = padText("hi", 5);
    expect(result).toBe("hi   ");
    expect(result.length).toBe(5);
  });

  it("does not pad if already at width", () => {
    expect(padText("hello", 5)).toBe("hello");
  });

  it("does not pad if longer than width", () => {
    expect(padText("hello world", 5)).toBe("hello world");
  });

  it("handles empty string", () => {
    const result = padText("", 5);
    expect(result).toBe("     ");
  });

  it("handles width of 0", () => {
    expect(padText("hi", 0)).toBe("hi");
  });
});
