/**
 * Tests for terminal capability detection
 */

import { describe, it, expect, afterEach } from "bun:test";
import {
  supportsExtendedUnderline,
  setExtendedUnderlineSupport,
  resetDetectionCache,
} from "../src/detection.js";

describe("terminal detection", () => {
  afterEach(() => {
    // Reset detection cache after each test
    resetDetectionCache();
  });

  describe("TERM variable detection", () => {
    it("detects support via TERM=xterm-ghostty", () => {
      const originalTerm = process.env.TERM;
      process.env.TERM = "xterm-ghostty";
      resetDetectionCache();

      expect(supportsExtendedUnderline()).toBe(true);

      process.env.TERM = originalTerm;
    });

    it("detects support via TERM=xterm-kitty", () => {
      const originalTerm = process.env.TERM;
      process.env.TERM = "xterm-kitty";
      resetDetectionCache();

      expect(supportsExtendedUnderline()).toBe(true);

      process.env.TERM = originalTerm;
    });

    it("detects support via TERM=wezterm", () => {
      const originalTerm = process.env.TERM;
      process.env.TERM = "wezterm";
      resetDetectionCache();

      expect(supportsExtendedUnderline()).toBe(true);

      process.env.TERM = originalTerm;
    });
  });

  describe("KITTY_WINDOW_ID detection", () => {
    it("detects support via KITTY_WINDOW_ID", () => {
      const originalEnv = process.env.KITTY_WINDOW_ID;
      const originalTerm = process.env.TERM;
      process.env.TERM = "xterm-256color";
      process.env.KITTY_WINDOW_ID = "1";
      resetDetectionCache();

      expect(supportsExtendedUnderline()).toBe(true);

      process.env.KITTY_WINDOW_ID = originalEnv;
      process.env.TERM = originalTerm;
    });
  });

  describe("TERM_PROGRAM detection", () => {
    it("detects support via TERM_PROGRAM=iTerm.app", () => {
      const originalProgram = process.env.TERM_PROGRAM;
      const originalTerm = process.env.TERM;
      process.env.TERM = "xterm-256color";
      process.env.TERM_PROGRAM = "iTerm.app";
      resetDetectionCache();

      expect(supportsExtendedUnderline()).toBe(true);

      process.env.TERM_PROGRAM = originalProgram;
      process.env.TERM = originalTerm;
    });

    it("does not detect support for Apple_Terminal", () => {
      const originalProgram = process.env.TERM_PROGRAM;
      const originalTerm = process.env.TERM;
      const originalKitty = process.env.KITTY_WINDOW_ID;
      // Use a non-matching TERM value
      process.env.TERM = "xterm";
      process.env.TERM_PROGRAM = "Apple_Terminal";
      delete process.env.KITTY_WINDOW_ID;
      resetDetectionCache();

      expect(supportsExtendedUnderline()).toBe(false);

      process.env.TERM_PROGRAM = originalProgram;
      process.env.TERM = originalTerm;
      if (originalKitty) process.env.KITTY_WINDOW_ID = originalKitty;
    });
  });

  describe("manual override", () => {
    it("setExtendedUnderlineSupport(true) forces support", () => {
      setExtendedUnderlineSupport(true);
      expect(supportsExtendedUnderline()).toBe(true);
    });

    it("setExtendedUnderlineSupport(false) forces no support", () => {
      setExtendedUnderlineSupport(false);
      expect(supportsExtendedUnderline()).toBe(false);
    });

    it("setExtendedUnderlineSupport(null) re-enables detection", () => {
      setExtendedUnderlineSupport(true);
      expect(supportsExtendedUnderline()).toBe(true);

      setExtendedUnderlineSupport(null);
      // Will re-detect based on env vars
    });
  });

  describe("caching", () => {
    it("caches detection result", () => {
      const originalTerm = process.env.TERM;
      process.env.TERM = "xterm-ghostty";
      resetDetectionCache();

      // First call detects
      const first = supportsExtendedUnderline();
      expect(first).toBe(true);

      // Change env (shouldn't affect cached result)
      process.env.TERM = "dumb";

      // Should return cached result
      const second = supportsExtendedUnderline();
      expect(second).toBe(true);

      process.env.TERM = originalTerm;
    });
  });
});
