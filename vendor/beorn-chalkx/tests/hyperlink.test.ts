/**
 * Tests for OSC 8 hyperlink functions
 */

import { describe, it, expect } from "bun:test";
import { hyperlink } from "../src/hyperlink.js";

describe("hyperlink", () => {
  describe("basic functionality", () => {
    it("creates OSC 8 hyperlink", () => {
      const result = hyperlink("Click here", "https://example.com");
      expect(result).toContain("\x1b]8;;https://example.com\x1b\\");
      expect(result).toContain("Click here");
      expect(result).toContain("\x1b]8;;\x1b\\"); // Closing tag
    });

    it("preserves text content", () => {
      const result = hyperlink("Link Text", "https://test.com");
      // Strip OSC 8 sequences
      const textOnly = result.replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "");
      expect(textOnly).toBe("Link Text");
    });
  });

  describe("URL protocols", () => {
    it("handles https URLs", () => {
      const result = hyperlink("Secure", "https://secure.example.com");
      expect(result).toContain("https://secure.example.com");
    });

    it("handles http URLs", () => {
      const result = hyperlink("HTTP", "http://example.com");
      expect(result).toContain("http://example.com");
    });

    it("handles file URLs", () => {
      const result = hyperlink("File", "file:///path/to/file.txt");
      expect(result).toContain("file:///path/to/file.txt");
    });

    it("handles mailto URLs", () => {
      const result = hyperlink("Email", "mailto:test@example.com");
      expect(result).toContain("mailto:test@example.com");
    });

    it("handles vscode URLs", () => {
      const result = hyperlink("Open in VS Code", "vscode://file/path/to/file:10:5");
      expect(result).toContain("vscode://file/path/to/file:10:5");
    });
  });

  describe("edge cases", () => {
    it("handles empty text", () => {
      const result = hyperlink("", "https://example.com");
      expect(result).toContain("https://example.com");
      const textOnly = result.replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "");
      expect(textOnly).toBe("");
    });

    it("handles URL with query parameters", () => {
      const result = hyperlink("Search", "https://example.com/search?q=test&page=1");
      expect(result).toContain("https://example.com/search?q=test&page=1");
    });

    it("handles URL with special characters", () => {
      const result = hyperlink("Special", "https://example.com/path%20with%20spaces");
      expect(result).toContain("https://example.com/path%20with%20spaces");
    });

    it("handles URL with fragment", () => {
      const result = hyperlink("Section", "https://example.com/page#section");
      expect(result).toContain("https://example.com/page#section");
    });

    it("handles text with special characters", () => {
      const result = hyperlink("→ Click ★", "https://example.com");
      const textOnly = result.replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "");
      expect(textOnly).toBe("→ Click ★");
    });

    it("handles very long URL", () => {
      const longUrl = "https://example.com/" + "a".repeat(1000);
      const result = hyperlink("Long", longUrl);
      expect(result).toContain(longUrl);
    });
  });
});
