/**
 * Tests for text wrapping (Layer 2)
 */

import { describe, it, expect } from "bun:test";
import { wrapText } from "../../../src/tui/layout/wrap.ts";

describe("wrapText", () => {
  it("returns empty array for empty input", () => {
    expect(wrapText("", 10)).toEqual([]);
  });

  it("returns single line if text fits", () => {
    expect(wrapText("hello", 10)).toEqual(["hello"]);
  });

  it("wraps at word boundaries", () => {
    const result = wrapText("hello world", 6);
    expect(result).toEqual(["hello", "world"]);
  });

  it("wraps multiple words", () => {
    const result = wrapText("one two three four", 10);
    expect(result).toEqual(["one two", "three four"]);
  });

  it("handles very long words by breaking mid-word", () => {
    const result = wrapText("superlongword", 5);
    // Should break the word at width
    expect(result.length).toBeGreaterThan(1);
    expect(result[0]?.length).toBeLessThanOrEqual(5);
  });

  it("preserves newlines in input", () => {
    const result = wrapText("line1\nline2", 20);
    expect(result).toEqual(["line1", "line2"]);
  });

  it("wraps each line independently", () => {
    const result = wrapText("short\nthis is a longer line", 10);
    expect(result[0]).toBe("short");
    expect(result.length).toBeGreaterThan(2);
  });

  it("handles width of 1", () => {
    const result = wrapText("ab", 1);
    expect(result.length).toBe(2);
  });

  it("avoids leaving very short orphan fragments", () => {
    // Edge case: "Edge Cases (wiki links + text)" at width 25
    // Should not break to leave "text)" dangling alone
    const text = "Edge Cases (wiki links + text)";
    const result = wrapText(text, 25);

    // The second line should not be a tiny orphan fragment
    // Previously broke as ["Edge Cases (wiki links +", "text)"] (5 chars)
    // Now breaks as ["Edge Cases (wiki links", "+ text)"] (7 chars) or better
    expect(result.length).toBe(2);
    // Ensure the second line has at least MIN_CONTINUATION_LEN (6) chars
    expect(result[1]?.length).toBeGreaterThanOrEqual(6);
  });

  it("handles parenthesized content gracefully", () => {
    // Real-world case from TUI
    const text = "Edge Cases (wiki links + text)";

    // At various widths, check we get reasonable wrapping
    const result30 = wrapText(text, 30);
    expect(result30).toEqual(["Edge Cases (wiki links + text)"]);

    const result20 = wrapText(text, 20);
    expect(result20.length).toBe(2);
    // Both lines should have meaningful content
    expect(result20[0]?.length).toBeGreaterThan(10);
    expect(result20[1]?.length).toBeGreaterThan(5);
  });
});
