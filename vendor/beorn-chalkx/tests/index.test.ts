/**
 * Integration tests for @beorn/chalkx
 *
 * Tests the main index exports work correctly together.
 * Detailed unit tests are in separate files:
 * - detection.test.ts
 * - underline.test.ts
 * - hyperlink.test.ts
 * - utils.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// Test that all exports are accessible from main index
import {
  // Types
  type UnderlineStyle,
  type RGB,
  // Utilities
  ANSI_REGEX,
  stripAnsi,
  displayLength,
  // Detection
  supportsExtendedUnderline,
  setExtendedUnderlineSupport,
  resetDetectionCache,
  // Underline functions
  underline,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
  // Hyperlinks
  hyperlink,
  // InkX compatibility
  bgOverride,
  // Chalk re-export
  chalk,
  // Convenience object
  chalkX,
} from "../src/index.js";

describe("@beorn/chalkx integration", () => {
  beforeEach(() => {
    setExtendedUnderlineSupport(true);
    // Force chalk to output colors in test environment
    chalk.level = 3;
  });

  afterEach(() => {
    resetDetectionCache();
  });

  describe("exports", () => {
    it("exports all expected functions", () => {
      expect(typeof curlyUnderline).toBe("function");
      expect(typeof dottedUnderline).toBe("function");
      expect(typeof dashedUnderline).toBe("function");
      expect(typeof doubleUnderline).toBe("function");
      expect(typeof underline).toBe("function");
      expect(typeof underlineColor).toBe("function");
      expect(typeof styledUnderline).toBe("function");
      expect(typeof hyperlink).toBe("function");
      expect(typeof bgOverride).toBe("function");
      expect(typeof stripAnsi).toBe("function");
      expect(typeof displayLength).toBe("function");
      expect(typeof supportsExtendedUnderline).toBe("function");
      expect(typeof setExtendedUnderlineSupport).toBe("function");
      expect(typeof resetDetectionCache).toBe("function");
    });

    it("exports chalk", () => {
      expect(chalk).toBeDefined();
      expect(typeof chalk.red).toBe("function");
      expect(typeof chalk.bold).toBe("function");
    });

    it("exports chalkX convenience object", () => {
      expect(chalkX).toBeDefined();
      expect(typeof chalkX.curlyUnderline).toBe("function");
      expect(typeof chalkX.hyperlink).toBe("function");
      expect(typeof chalkX.bgOverride).toBe("function");
      // Note: chalk methods on chalkX may not work due to proxy limitations
      // Use chalk directly for color methods
      expect(typeof chalkX.stripAnsi).toBe("function");
    });

    it("exports ANSI_REGEX", () => {
      expect(ANSI_REGEX).toBeInstanceOf(RegExp);
    });
  });

  describe("chalk integration", () => {
    it("chalk colors work correctly", () => {
      const red = chalk.red("error");
      expect(red).toContain("\x1b[31m");
      expect(stripAnsi(red)).toBe("error");
    });

    it("can combine chalk colors with extended underlines", () => {
      const styled = chalk.red(curlyUnderline("error message"));
      expect(styled).toContain("\x1b[31m"); // Red
      expect(styled).toContain("\x1b[4:3m"); // Curly
      expect(stripAnsi(styled)).toBe("error message");
    });
  });

  describe("end-to-end styling", () => {
    it("creates a complete styled output", () => {
      // Simulate IDE-style error display
      const errorLine = `${chalk.red(curlyUnderline("typo"))} in ${hyperlink("file.ts:10", "vscode://file/path/to/file.ts:10")}`;

      // Verify structure
      expect(errorLine).toContain("\x1b[31m"); // Red color
      expect(errorLine).toContain("\x1b[4:3m"); // Curly underline
      expect(errorLine).toContain("\x1b]8;;"); // Hyperlink

      // Verify readable text
      const text = stripAnsi(errorLine);
      expect(text).toBe("typo in file.ts:10");
    });

    it("displayLength works with complex styled text", () => {
      const styled = `${chalk.bold(curlyUnderline("Hello"))} ${underlineColor(255, 0, 0, "World")}!`;
      expect(displayLength(styled)).toBe(12); // "Hello World!"
    });
  });

  describe("type safety", () => {
    it("UnderlineStyle type works", () => {
      const style: UnderlineStyle = "curly";
      const result = underline("text", style);
      expect(stripAnsi(result)).toBe("text");
    });

    it("RGB type works", () => {
      const color: RGB = [255, 128, 64];
      const result = styledUnderline("dashed", color, "text");
      expect(stripAnsi(result)).toBe("text");
    });
  });

  describe("bgOverride", () => {
    it("wraps text with private SGR code 9999", () => {
      const result = bgOverride("test");
      expect(result).toBe("\x1b[9999mtest");
    });

    it("works with chalk backgrounds", () => {
      const result = bgOverride(chalk.bgBlack("styled"));
      expect(result).toContain("\x1b[9999m");
      expect(result).toContain("\x1b[40m"); // bgBlack code
      expect(stripAnsi(result)).toBe("styled");
    });

    it("is available on chalkX", () => {
      const result = chalkX.bgOverride("test");
      expect(result).toBe("\x1b[9999mtest");
    });
  });
});
