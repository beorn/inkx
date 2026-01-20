/**
 * Tests for ANSI string utilities
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ANSI_REGEX, stripAnsi, displayLength } from "../src/utils.js";
import { setExtendedUnderlineSupport, resetDetectionCache } from "../src/detection.js";
import { curlyUnderline, underlineColor } from "../src/underline.js";
import { hyperlink } from "../src/hyperlink.js";

describe("ANSI utilities", () => {
  describe("ANSI_REGEX", () => {
    it("matches standard SGR codes", () => {
      expect("\x1b[31m".match(ANSI_REGEX)).toBeTruthy();
      expect("\x1b[0m".match(ANSI_REGEX)).toBeTruthy();
      expect("\x1b[1;31m".match(ANSI_REGEX)).toBeTruthy();
    });

    it("matches extended SGR codes with colons", () => {
      expect("\x1b[4:3m".match(ANSI_REGEX)).toBeTruthy();
      expect("\x1b[58:2::255:0:0m".match(ANSI_REGEX)).toBeTruthy();
    });

    it("matches OSC 8 hyperlink sequences", () => {
      expect("\x1b]8;;https://example.com\x1b\\".match(ANSI_REGEX)).toBeTruthy();
      expect("\x1b]8;;\x1b\\".match(ANSI_REGEX)).toBeTruthy();
    });
  });

  describe("stripAnsi", () => {
    beforeEach(() => {
      setExtendedUnderlineSupport(true);
    });

    afterEach(() => {
      resetDetectionCache();
    });

    it("strips standard ANSI codes", () => {
      expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
      expect(stripAnsi("\x1b[1;34mbold blue\x1b[0m")).toBe("bold blue");
    });

    it("strips extended underline codes", () => {
      const styled = curlyUnderline("hello");
      expect(stripAnsi(styled)).toBe("hello");
    });

    it("strips underline color codes", () => {
      const styled = underlineColor(100, 100, 100, "world");
      expect(stripAnsi(styled)).toBe("world");
    });

    it("strips hyperlink codes", () => {
      const linked = hyperlink("click", "https://example.com");
      expect(stripAnsi(linked)).toBe("click");
    });

    it("handles multiple ANSI sequences", () => {
      const text = "\x1b[31m\x1b[1mred bold\x1b[0m normal \x1b[32mgreen\x1b[0m";
      expect(stripAnsi(text)).toBe("red bold normal green");
    });

    it("handles string with no ANSI codes", () => {
      expect(stripAnsi("plain text")).toBe("plain text");
    });

    it("handles empty string", () => {
      expect(stripAnsi("")).toBe("");
    });

    it("handles string that is only ANSI codes", () => {
      expect(stripAnsi("\x1b[31m\x1b[0m")).toBe("");
    });
  });

  describe("displayLength", () => {
    beforeEach(() => {
      setExtendedUnderlineSupport(true);
    });

    afterEach(() => {
      resetDetectionCache();
    });

    it("calculates length excluding ANSI codes", () => {
      const styled = curlyUnderline("hello");
      expect(displayLength(styled)).toBe(5);
    });

    it("works with underline color", () => {
      const styled = underlineColor(255, 0, 0, "test");
      expect(displayLength(styled)).toBe(4);
    });

    it("works with hyperlinks", () => {
      const linked = hyperlink("click me", "https://example.com");
      expect(displayLength(linked)).toBe(8);
    });

    it("works with plain text", () => {
      expect(displayLength("plain text")).toBe(10);
    });

    it("works with empty string", () => {
      expect(displayLength("")).toBe(0);
    });

    it("handles multiple styled segments", () => {
      const text = `${curlyUnderline("hello")} ${underlineColor(255, 0, 0, "world")}`;
      expect(displayLength(text)).toBe(11); // "hello world"
    });
  });

  describe("edge cases", () => {
    it("handles nested ANSI codes", () => {
      const nested = "\x1b[31m\x1b[4mred underline\x1b[24m\x1b[0m";
      expect(stripAnsi(nested)).toBe("red underline");
    });

    it("handles malformed ANSI codes gracefully", () => {
      // Incomplete escape sequence (not a valid ANSI code)
      const malformed = "\x1bhello";
      expect(stripAnsi(malformed)).toBe("\x1bhello");
    });

    it("handles CJK and emoji with correct display width", () => {
      // CJK characters are 2 cells wide each
      expect(displayLength("こんにちは")).toBe(10); // 5 chars × 2 cells
      expect(displayLength("한글")).toBe(4); // 2 chars × 2 cells
      // Emoji are 2 cells wide
      expect(displayLength("🎉🎊🎈")).toBe(6); // 3 emoji × 2 cells
      expect(displayLength("👋")).toBe(2);
    });
  });
});
