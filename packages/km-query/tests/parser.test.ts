/**
 * Query Language Parser Tests
 *
 * Tests for parseQuery() and mapFieldName() functions.
 */

import { describe, it, expect } from "bun:test";
import { parseQuery, mapFieldName } from "../src/parser.ts";

describe("parseQuery", () => {
  describe("empty queries", () => {
    it("returns empty AST for empty string", () => {
      const ast = parseQuery("");
      expect(ast.conditions).toEqual([]);
      expect(ast.refs).toEqual([]);
      expect(ast.paths).toEqual([]);
      expect(ast.text).toEqual([]);
      expect(ast.phrases).toEqual([]);
    });

    it("returns empty AST for whitespace-only string", () => {
      const ast = parseQuery("   ");
      expect(ast.conditions).toEqual([]);
      expect(ast.refs).toEqual([]);
    });
  });

  describe("field:value conditions", () => {
    it("parses status:open", () => {
      const ast = parseQuery("status:open");
      expect(ast.conditions).toHaveLength(1);
      expect(ast.conditions[0].field).toBe("task_status");
      expect(ast.conditions[0].value).toBe("open");
      expect(ast.conditions[0].op).toBe("=");
    });

    it("parses priority:1", () => {
      const ast = parseQuery("priority:1");
      expect(ast.conditions).toHaveLength(1);
      expect(ast.conditions[0].field).toBe("priority");
      expect(ast.conditions[0].value).toBe("1");
    });

    it("parses negated condition -status:done", () => {
      const ast = parseQuery("-status:done");
      expect(ast.conditions).toHaveLength(1);
      expect(ast.conditions[0].negated).toBe(true);
      expect(ast.conditions[0].value).toBe("done");
    });

    it("parses due date", () => {
      const ast = parseQuery("due:2026-01-20");
      expect(ast.conditions).toHaveLength(1);
      expect(ast.conditions[0].field).toBe("due_date");
      expect(ast.conditions[0].value).toBe("2026-01-20");
    });

    it("parses comparison operators with explicit op", () => {
      const ast = parseQuery("priority>2");
      expect(ast.conditions).toHaveLength(1);
      expect(ast.conditions[0].op).toBe(">");
      expect(ast.conditions[0].value).toBe("2");
    });

    it("parses less than operator", () => {
      const ast = parseQuery("priority<3");
      expect(ast.conditions).toHaveLength(1);
      expect(ast.conditions[0].op).toBe("<");
    });

    it("parses not equals operator", () => {
      const ast = parseQuery("status!=done");
      expect(ast.conditions).toHaveLength(1);
      expect(ast.conditions[0].op).toBe("!=");
    });
  });

  describe("reference filters", () => {
    it("parses @mention", () => {
      const ast = parseQuery("@john");
      expect(ast.refs).toHaveLength(1);
      expect(ast.refs[0].type).toBe("person");
      expect(ast.refs[0].value).toBe("john");
    });

    it("parses #tag", () => {
      const ast = parseQuery("#urgent");
      expect(ast.refs).toHaveLength(1);
      expect(ast.refs[0].type).toBe("tag");
      expect(ast.refs[0].value).toBe("urgent");
    });

    it("parses +project", () => {
      const ast = parseQuery("+km");
      expect(ast.refs).toHaveLength(1);
      expect(ast.refs[0].type).toBe("project");
      expect(ast.refs[0].value).toBe("km");
    });

    it("parses negated reference -#tag", () => {
      const ast = parseQuery("-#wip");
      expect(ast.refs).toHaveLength(1);
      expect(ast.refs[0].negated).toBe(true);
      expect(ast.refs[0].value).toBe("wip");
    });
  });

  describe("text search", () => {
    it("parses plain text as full-text search", () => {
      const ast = parseQuery("hello world");
      expect(ast.text).toContain("hello");
      expect(ast.text).toContain("world");
    });

    it("parses quoted phrases", () => {
      const ast = parseQuery('"hello world"');
      expect(ast.phrases).toHaveLength(1);
      expect(ast.phrases[0]).toBe("hello world");
    });

    it("preserves phrase term offsets", () => {
      const ast = parseQuery('"exact match"');
      expect(ast.phraseTerms).toHaveLength(1);
      expect(ast.phraseTerms[0].value).toBe("exact match");
      expect(ast.phraseTerms[0].offset).toBeDefined();
    });
  });

  describe("path filters", () => {
    it("parses path ending with /", () => {
      const ast = parseQuery("projects/");
      expect(ast.paths).toHaveLength(1);
      expect(ast.paths[0].pattern).toBe("projects/");
    });

    it("parses relative path ./", () => {
      const ast = parseQuery("./src/");
      expect(ast.paths).toHaveLength(1);
      expect(ast.paths[0].pattern).toBe("./src/");
    });

    it("parses absolute path", () => {
      const ast = parseQuery("/home/user/docs/");
      expect(ast.paths).toHaveLength(1);
      expect(ast.paths[0].pattern).toBe("/home/user/docs/");
    });

    it("parses recursive path pattern **", () => {
      const ast = parseQuery("projects/**");
      expect(ast.paths).toHaveLength(1);
      expect(ast.paths[0].recursive).toBe(true);
      expect(ast.paths[0].pattern).toBe("projects");
    });
  });

  describe("complex queries", () => {
    it("parses combined query with multiple filters", () => {
      const ast = parseQuery("status:open @john #urgent fix bug");
      expect(ast.conditions).toHaveLength(1);
      expect(ast.refs).toHaveLength(2);
      expect(ast.text.length).toBeGreaterThan(0);
    });

    it("tracks offsets for syntax highlighting", () => {
      const ast = parseQuery("status:open @john");
      expect(ast.conditions[0].offset).toBeDefined();
      expect(ast.conditions[0].offset?.start).toBe(0);
      expect(ast.refs[0].offset).toBeDefined();
    });
  });
});

describe("mapFieldName", () => {
  it("maps status to task_status", () => {
    expect(mapFieldName("status")).toBe("task_status");
  });

  it("maps p to priority", () => {
    expect(mapFieldName("p")).toBe("priority");
  });

  it("maps due to due_date", () => {
    expect(mapFieldName("due")).toBe("due_date");
  });

  it("maps scheduled to scheduled_date", () => {
    expect(mapFieldName("scheduled")).toBe("scheduled_date");
  });

  it("returns unknown fields as-is", () => {
    expect(mapFieldName("unknown")).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(mapFieldName("STATUS")).toBe("task_status");
    expect(mapFieldName("DUE")).toBe("due_date");
  });
});
