/**
 * Tests for chalk-x extended ANSI features
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
  hyperlink,
  supportsExtendedUnderline,
  setExtendedUnderlineSupport,
  stripAnsi,
  displayLength,
} from "../src/index.ts";

describe("chalk-x", () => {
  describe("terminal detection", () => {
    afterEach(() => {
      // Reset detection cache after each test
      setExtendedUnderlineSupport(null);
    });

    it("detects support via TERM=xterm-ghostty", () => {
      const originalTerm = process.env.TERM;
      process.env.TERM = "xterm-ghostty";
      setExtendedUnderlineSupport(null); // Clear cache

      expect(supportsExtendedUnderline()).toBe(true);

      process.env.TERM = originalTerm;
    });

    it("detects support via TERM=xterm-kitty", () => {
      const originalTerm = process.env.TERM;
      process.env.TERM = "xterm-kitty";
      setExtendedUnderlineSupport(null);

      expect(supportsExtendedUnderline()).toBe(true);

      process.env.TERM = originalTerm;
    });

    it("detects support via KITTY_WINDOW_ID", () => {
      const originalEnv = process.env.KITTY_WINDOW_ID;
      const originalTerm = process.env.TERM;
      process.env.TERM = "xterm-256color";
      process.env.KITTY_WINDOW_ID = "1";
      setExtendedUnderlineSupport(null);

      expect(supportsExtendedUnderline()).toBe(true);

      process.env.KITTY_WINDOW_ID = originalEnv;
      process.env.TERM = originalTerm;
    });
  });

  describe("extended underlines with support enabled", () => {
    beforeEach(() => {
      setExtendedUnderlineSupport(true);
    });

    afterEach(() => {
      setExtendedUnderlineSupport(null);
    });

    it("curlyUnderline applies SGR 4:3", () => {
      const result = curlyUnderline("wavy");
      expect(result).toContain("\x1b[4:3m");
      expect(result).toContain("wavy");
      expect(result).toContain("\x1b[4:0m"); // Reset
    });

    it("dottedUnderline applies SGR 4:4", () => {
      const result = dottedUnderline("dots");
      expect(result).toContain("\x1b[4:4m");
      expect(stripAnsi(result)).toBe("dots");
    });

    it("dashedUnderline applies SGR 4:5", () => {
      const result = dashedUnderline("dashes");
      expect(result).toContain("\x1b[4:5m");
      expect(stripAnsi(result)).toBe("dashes");
    });

    it("doubleUnderline applies SGR 4:2", () => {
      const result = doubleUnderline("double");
      expect(result).toContain("\x1b[4:2m");
      expect(stripAnsi(result)).toBe("double");
    });

    it("underlineColor applies SGR 58 with RGB", () => {
      const result = underlineColor(255, 0, 128, "colored");
      expect(result).toContain("\x1b[58:2::255:0:128m");
      expect(result).toContain("\x1b[59m"); // Color reset
      expect(stripAnsi(result)).toBe("colored");
    });

    it("styledUnderline combines style and color", () => {
      const result = styledUnderline("curly", [0, 255, 0], "styled");
      expect(result).toContain("\x1b[4:3m"); // Curly
      expect(result).toContain("\x1b[58:2::0:255:0m"); // Green
      expect(stripAnsi(result)).toBe("styled");
    });
  });

  describe("fallback behavior with support disabled", () => {
    beforeEach(() => {
      setExtendedUnderlineSupport(false);
    });

    afterEach(() => {
      setExtendedUnderlineSupport(null);
    });

    it("curlyUnderline falls back to regular underline (no extended codes)", () => {
      const result = curlyUnderline("text");
      // Should NOT use extended underline codes
      expect(result).not.toContain("\x1b[4:3m");
      // Text should be preserved
      expect(stripAnsi(result)).toBe("text");
    });

    it("dottedUnderline falls back to regular underline (no extended codes)", () => {
      const result = dottedUnderline("text");
      expect(result).not.toContain("\x1b[4:4m");
      expect(stripAnsi(result)).toBe("text");
    });

    it("underlineColor falls back to regular underline (no color)", () => {
      const result = underlineColor(255, 0, 0, "text");
      // Should NOT use extended color codes
      expect(result).not.toContain("\x1b[58:");
      expect(stripAnsi(result)).toBe("text");
    });

    it("styledUnderline falls back to regular underline", () => {
      const result = styledUnderline("dashed", [255, 128, 0], "text");
      expect(result).not.toContain("\x1b[4:5m");
      expect(result).not.toContain("\x1b[58:");
      expect(stripAnsi(result)).toBe("text");
    });
  });

  describe("hyperlink", () => {
    it("creates OSC 8 hyperlink", () => {
      const result = hyperlink("Click here", "https://example.com");
      expect(result).toContain("\x1b]8;;https://example.com\x1b\\");
      expect(result).toContain("Click here");
      expect(result).toContain("\x1b]8;;\x1b\\"); // Closing tag
    });

    it("preserves text content", () => {
      const result = hyperlink("Link Text", "https://test.com");
      // Strip OSC 8 sequences (different from ANSI SGR)
      const textOnly = result.replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "");
      expect(textOnly).toBe("Link Text");
    });
  });

  describe("ANSI utilities", () => {
    beforeEach(() => {
      setExtendedUnderlineSupport(true);
    });

    afterEach(() => {
      setExtendedUnderlineSupport(null);
    });

    it("stripAnsi removes extended underline codes", () => {
      const styled = curlyUnderline("hello");
      expect(stripAnsi(styled)).toBe("hello");
    });

    it("stripAnsi removes underline color codes", () => {
      const styled = underlineColor(100, 100, 100, "world");
      expect(stripAnsi(styled)).toBe("world");
    });

    it("displayLength calculates correct length excluding ANSI codes", () => {
      const styled = curlyUnderline("hello");
      expect(displayLength(styled)).toBe(5);
    });

    it("displayLength works with underline color", () => {
      const styled = underlineColor(255, 0, 0, "test");
      expect(displayLength(styled)).toBe(4);
    });
  });
});
