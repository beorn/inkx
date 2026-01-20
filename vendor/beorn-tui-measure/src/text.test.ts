import { describe, expect, it } from "bun:test";
import { wrapText, constrainText, displayLength, truncateText } from "./text.ts";

describe("wrapText", () => {
  it("handles simple text", () => {
    expect(wrapText("Hello world", 20)).toEqual(["Hello world"]);
  });

  it("wraps long lines", () => {
    expect(wrapText("This is a long line that needs wrapping", 15)).toEqual([
      "This is a long",
      "line that needs",
      "wrapping",
    ]);
  });

  it("handles empty input", () => {
    expect(wrapText("", 20)).toEqual([]);
  });

  it("strips trailing empty lines from trailing newlines", () => {
    // Bug fix: trailing newlines should not create blank lines
    expect(wrapText("Hello world\n", 20)).toEqual(["Hello world"]);
    expect(wrapText("Line one\nLine two\n", 20)).toEqual(["Line one", "Line two"]);
  });

  it("preserves intentional blank lines in the middle", () => {
    // Paragraph breaks with double newlines should be preserved
    expect(wrapText("Paragraph one\n\nParagraph two", 20)).toEqual([
      "Paragraph one",
      "",
      "Paragraph two",
    ]);
  });

  it("handles multiple trailing newlines", () => {
    expect(wrapText("Hello\n\n\n", 20)).toEqual(["Hello"]);
  });

  it("handles content with ANSI codes", () => {
    const input = "\x1b[31mRed text\x1b[0m";
    const result = wrapText(input, 20);
    expect(result).toEqual(["\x1b[31mRed text\x1b[0m"]);
  });
});

describe("constrainText", () => {
  it("constrains lines to maxLines", () => {
    const input = "Line 1\nLine 2\nLine 3\nLine 4";
    const result = constrainText(input, 20, 2);
    expect(result.lines.length).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.lines[1]).toContain("…");
  });

  it("does not add ellipsis when not truncated", () => {
    const input = "Line 1\nLine 2";
    const result = constrainText(input, 20, 3);
    expect(result.lines).toEqual(["Line 1", "Line 2"]);
    expect(result.truncated).toBe(false);
  });

  it("strips trailing empty lines", () => {
    // Bug fix: trailing newlines should not create blank lines
    const result = constrainText("Hello world\n", 20, 3);
    expect(result.lines).toEqual(["Hello world"]);
  });

  it("preserves middle blank lines", () => {
    const result = constrainText("Para 1\n\nPara 2", 20, 5);
    expect(result.lines).toEqual(["Para 1", "", "Para 2"]);
  });
});

describe("displayLength", () => {
  it("measures plain text correctly", () => {
    expect(displayLength("Hello")).toBe(5);
  });

  it("ignores ANSI escape codes", () => {
    expect(displayLength("\x1b[31mRed\x1b[0m")).toBe(3);
  });

  it("counts emoji width correctly", () => {
    // Most emoji are 2 cells wide
    expect(displayLength("👋")).toBe(2);
  });
});

describe("truncateText", () => {
  it("truncates long text with ellipsis", () => {
    const result = truncateText("Hello World", 8);
    expect(displayLength(result)).toBeLessThanOrEqual(8);
    expect(result).toContain("…");
  });

  it("leaves short text unchanged", () => {
    expect(truncateText("Hi", 10)).toBe("Hi");
  });
});
