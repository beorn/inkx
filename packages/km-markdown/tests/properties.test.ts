/**
 * Inline Properties Parsing Tests
 *
 * Tests for Logseq-style property:: value syntax parsing.
 */

import { describe, test, expect } from "bun:test";
import { parseInlineProperties } from "../src/parser.ts";

describe("parseInlineProperties", () => {
  describe("single property values", () => {
    test("should parse single link property", () => {
      const result = parseInlineProperties("blocks:: [[km-a1b2]]");
      expect(result.props.blocks).toEqual({
        type: "link",
        target: "km-a1b2",
      });
      expect(result.propsRaw.blocks).toBe("[[km-a1b2]]");
      expect(result.cleanText).toBe("");
    });

    test("should parse text property value", () => {
      const result = parseInlineProperties("reason:: Fixed in PR #123");
      expect(result.props.reason).toEqual({
        type: "text",
        value: "Fixed in PR #123",
      });
      expect(result.propsRaw.reason).toBe("Fixed in PR #123");
      expect(result.cleanText).toBe("");
    });

    test("should parse number property value (integer)", () => {
      const result = parseInlineProperties("rating:: 5");
      expect(result.props.rating).toEqual({
        type: "number",
        value: 5,
      });
      expect(result.propsRaw.rating).toBe("5");
      expect(result.cleanText).toBe("");
    });

    test("should parse number property value (decimal)", () => {
      const result = parseInlineProperties("score:: 3.14");
      expect(result.props.score).toEqual({
        type: "number",
        value: 3.14,
      });
      expect(result.propsRaw.score).toBe("3.14");
    });

    test("should parse date property value", () => {
      const result = parseInlineProperties("reviewed:: 2026-01-21");
      expect(result.props.reviewed).toEqual({
        type: "date",
        value: "2026-01-21",
      });
      expect(result.propsRaw.reviewed).toBe("2026-01-21");
      expect(result.cleanText).toBe("");
    });

    test("should parse wiki-link with alias", () => {
      const result = parseInlineProperties("author:: [[Alice Smith|Alice]]");
      expect(result.props.author).toEqual({
        type: "link",
        target: "Alice Smith",
        alias: "Alice",
      });
      expect(result.propsRaw.author).toBe("[[Alice Smith|Alice]]");
      expect(result.cleanText).toBe("");
    });
  });

  describe("property names", () => {
    test("should parse property name with hyphens", () => {
      const result = parseInlineProperties("blocked-by:: [[km-123]]");
      expect(result.props["blocked-by"]).toEqual({
        type: "link",
        target: "km-123",
      });
      expect(result.propsRaw["blocked-by"]).toBe("[[km-123]]");
    });

    test("should parse property name with underscores", () => {
      const result = parseInlineProperties("created_by:: [[John]]");
      expect(result.props["created_by"]).toEqual({
        type: "link",
        target: "John",
      });
    });

    test("should parse property name with numbers", () => {
      const result = parseInlineProperties("priority2:: high");
      expect(result.props.priority2).toEqual({
        type: "text",
        value: "high",
      });
    });

    test("should normalize property names to lowercase", () => {
      const result = parseInlineProperties("Priority:: 1");
      expect(result.props.priority).toEqual({
        type: "number",
        value: 1,
      });
      expect(result.propsRaw.priority).toBe("1");
    });
  });

  describe("multiple properties", () => {
    test("should parse multiple properties on same line", () => {
      const result = parseInlineProperties("blocks:: [[a]] priority:: 1");
      expect(result.props.blocks).toEqual({
        type: "link",
        target: "a",
      });
      expect(result.props.priority).toEqual({
        type: "number",
        value: 1,
      });
      expect(result.propsRaw.blocks).toBe("[[a]]");
      expect(result.propsRaw.priority).toBe("1");
      expect(result.cleanText).toBe("");
    });

    test("should parse three properties on same line", () => {
      const result = parseInlineProperties(
        "status:: done priority:: 2 assigned:: [[Bob]]",
      );
      expect(result.props.status).toEqual({ type: "text", value: "done" });
      expect(result.props.priority).toEqual({ type: "number", value: 2 });
      expect(result.props.assigned).toEqual({ type: "link", target: "Bob" });
    });
  });

  describe("list values", () => {
    test("should parse comma-separated list of links", () => {
      const result = parseInlineProperties("blocked-by:: [[a]], [[b]], [[c]]");
      expect(result.props["blocked-by"]).toEqual({
        type: "list",
        values: [
          { type: "link", target: "a" },
          { type: "link", target: "b" },
          { type: "link", target: "c" },
        ],
      });
      expect(result.propsRaw["blocked-by"]).toBe("[[a]], [[b]], [[c]]");
    });

    test("should parse two links as a list", () => {
      const result = parseInlineProperties(
        "depends-on:: [[task-1]], [[task-2]]",
      );
      expect(result.props["depends-on"]).toEqual({
        type: "list",
        values: [
          { type: "link", target: "task-1" },
          { type: "link", target: "task-2" },
        ],
      });
    });
  });

  describe("text with properties", () => {
    test("should extract property at start of line with preceding text stripped", () => {
      const result = parseInlineProperties("blocks:: [[x]]");
      expect(result.props.blocks).toEqual({
        type: "link",
        target: "x",
      });
      expect(result.cleanText).toBe("");
    });

    test("should extract property at end with preceding text", () => {
      const result = parseInlineProperties("My task blocks:: [[x]]");
      expect(result.props.blocks).toEqual({
        type: "link",
        target: "x",
      });
      expect(result.cleanText).toBe("My task");
    });

    test("should preserve preceding text and remove property", () => {
      const result = parseInlineProperties(
        "Complete the report priority:: 1 status:: pending",
      );
      expect(result.props.priority).toEqual({ type: "number", value: 1 });
      expect(result.props.status).toEqual({ type: "text", value: "pending" });
      expect(result.cleanText).toBe("Complete the report");
    });
  });

  describe("no properties", () => {
    test("should return empty props for text without properties", () => {
      const result = parseInlineProperties("Just a regular task");
      expect(result.props).toEqual({});
      expect(result.propsRaw).toEqual({});
      expect(result.cleanText).toBe("Just a regular task");
    });

    test("should return empty props for empty string", () => {
      const result = parseInlineProperties("");
      expect(result.props).toEqual({});
      expect(result.propsRaw).toEqual({});
      expect(result.cleanText).toBe("");
    });

    test("should not match single colon", () => {
      const result = parseInlineProperties("Note: this is important");
      expect(result.props).toEqual({});
      expect(result.cleanText).toBe("Note: this is important");
    });
  });

  describe("edge cases", () => {
    test("should handle multiple colons in value (URLs)", () => {
      const result = parseInlineProperties("url:: https://example.com");
      expect(result.props.url).toEqual({
        type: "text",
        value: "https://example.com",
      });
      expect(result.propsRaw.url).toBe("https://example.com");
    });

    test("should handle URL with port number", () => {
      const result = parseInlineProperties("url:: http://localhost:3000/path");
      expect(result.props.url).toEqual({
        type: "text",
        value: "http://localhost:3000/path",
      });
    });

    test("should handle negative numbers", () => {
      const result = parseInlineProperties("offset:: -5");
      expect(result.props.offset).toEqual({
        type: "number",
        value: -5,
      });
    });

    test("should handle property with empty-looking value as text", () => {
      // Property requires a value, trailing spaces are trimmed
      const result = parseInlineProperties("tag:: important-tag");
      expect(result.props.tag).toEqual({
        type: "text",
        value: "important-tag",
      });
    });

    test("should handle links with spaces in target", () => {
      const result = parseInlineProperties("project:: [[My Project Name]]");
      expect(result.props.project).toEqual({
        type: "link",
        target: "My Project Name",
      });
    });

    test("should handle links with path separators", () => {
      const result = parseInlineProperties("ref:: [[Projects/2026/Q1 Goals]]");
      expect(result.props.ref).toEqual({
        type: "link",
        target: "Projects/2026/Q1 Goals",
      });
    });
  });
});
