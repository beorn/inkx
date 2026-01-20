/**
 * Tests for extended underline functions
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import chalk from "chalk";
import {
  underline,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
} from "../src/underline.js";
import { setExtendedUnderlineSupport, resetDetectionCache } from "../src/detection.js";
import { stripAnsi } from "../src/utils.js";

describe("extended underlines", () => {
  describe("with support enabled", () => {
    beforeEach(() => {
      setExtendedUnderlineSupport(true);
      // Force chalk to output ANSI in test environment
      chalk.level = 3;
    });

    afterEach(() => {
      resetDetectionCache();
    });

    it("underline with style='single' uses chalk underline", () => {
      const result = underline("text", "single");
      // Single style should fall through to chalk.underline
      expect(result).toContain("\x1b[4m");
      expect(stripAnsi(result)).toBe("text");
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
  });

  describe("fallback with support disabled", () => {
    beforeEach(() => {
      setExtendedUnderlineSupport(false);
      // Force chalk to output ANSI in test environment
      chalk.level = 3;
    });

    afterEach(() => {
      resetDetectionCache();
    });

    it("curlyUnderline falls back to regular underline", () => {
      const result = curlyUnderline("text");
      expect(result).not.toContain("\x1b[4:3m");
      expect(result).toContain("\x1b[4m"); // Standard underline
      expect(stripAnsi(result)).toBe("text");
    });

    it("dottedUnderline falls back to regular underline", () => {
      const result = dottedUnderline("text");
      expect(result).not.toContain("\x1b[4:4m");
      expect(stripAnsi(result)).toBe("text");
    });

    it("dashedUnderline falls back to regular underline", () => {
      const result = dashedUnderline("text");
      expect(result).not.toContain("\x1b[4:5m");
      expect(stripAnsi(result)).toBe("text");
    });

    it("doubleUnderline falls back to regular underline", () => {
      const result = doubleUnderline("text");
      expect(result).not.toContain("\x1b[4:2m");
      expect(stripAnsi(result)).toBe("text");
    });
  });

  describe("edge cases", () => {
    beforeEach(() => {
      setExtendedUnderlineSupport(true);
    });

    afterEach(() => {
      resetDetectionCache();
    });

    it("handles empty string", () => {
      const result = curlyUnderline("");
      expect(stripAnsi(result)).toBe("");
    });

    it("handles string with spaces", () => {
      const result = curlyUnderline("hello world");
      expect(stripAnsi(result)).toBe("hello world");
    });

    it("handles multi-line string", () => {
      const result = curlyUnderline("line1\nline2");
      expect(stripAnsi(result)).toBe("line1\nline2");
    });

    it("handles special characters", () => {
      const result = curlyUnderline("→ ★ © ®");
      expect(stripAnsi(result)).toBe("→ ★ © ®");
    });
  });
});

describe("underline color", () => {
  describe("with support enabled", () => {
    beforeEach(() => {
      setExtendedUnderlineSupport(true);
    });

    afterEach(() => {
      resetDetectionCache();
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

    it("handles different RGB values", () => {
      const black = underlineColor(0, 0, 0, "black");
      expect(black).toContain("\x1b[58:2::0:0:0m");

      const white = underlineColor(255, 255, 255, "white");
      expect(white).toContain("\x1b[58:2::255:255:255m");
    });
  });

  describe("fallback with support disabled", () => {
    beforeEach(() => {
      setExtendedUnderlineSupport(false);
    });

    afterEach(() => {
      resetDetectionCache();
    });

    it("underlineColor falls back to regular underline", () => {
      const result = underlineColor(255, 0, 0, "text");
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
});
