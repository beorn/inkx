/**
 * Tests for text constraining (Layer 2)
 */

import { describe, it, expect } from "bun:test";
import { constrainText } from "../../src/layout/constrain.ts";
import { displayLength } from "../../src/text/rich.ts";

describe("constrainText", () => {
  it("returns single line for short text", () => {
    const result = constrainText("hello", 20, 5);
    expect(result.lines).toEqual(["hello"]);
    expect(result.truncated).toBe(false);
  });

  it("wraps text to width", () => {
    const result = constrainText("hello world", 6, 5);
    expect(result.lines).toEqual(["hello", "world"]);
    expect(result.truncated).toBe(false);
  });

  it("limits to maxLines", () => {
    const result = constrainText("one two three four five", 5, 2);
    expect(result.lines.length).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("sets truncated=true when content exceeds maxLines", () => {
    const result = constrainText("line1\nline2\nline3", 20, 2);
    expect(result.truncated).toBe(true);
    expect(result.lines.length).toBe(2);
  });

  it("handles single line that fits", () => {
    const result = constrainText("short", 20, 1);
    expect(result.lines).toEqual(["short"]);
    expect(result.truncated).toBe(false);
  });

  it("pads lines when pad=true", () => {
    const result = constrainText("hi", 10, 2, true);
    expect(result.lines[0]).toBe("hi        ");
    expect(displayLength(result.lines[0]!)).toBe(10);
  });

  it("does not pad when pad=false (default)", () => {
    const result = constrainText("hi", 10, 2);
    expect(result.lines[0]).toBe("hi");
  });

  it("handles empty input", () => {
    const result = constrainText("", 10, 2);
    expect(result.lines).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});
