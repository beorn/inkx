/**
 * Tests for query parser
 */
import { describe, test, expect } from "vitest"
import { parseQuery, mapFieldName } from "../../src/query/parser.ts"

describe("mapFieldName", () => {
  test("normalizes 'status' to 'task_status'", () => {
    expect(mapFieldName("status")).toBe("task_status")
  })

  test("normalizes 'due' to 'due_at'", () => {
    expect(mapFieldName("due")).toBe("due_at")
  })

  test("normalizes 'start' to 'start_at'", () => {
    expect(mapFieldName("start")).toBe("start_at")
  })

  test("normalizes 'scheduled' to 'start_at'", () => {
    expect(mapFieldName("scheduled")).toBe("start_at")
  })

  test("normalizes 'assigned' to 'assigned_to'", () => {
    expect(mapFieldName("assigned")).toBe("assigned_to")
  })

  test("normalizes 'priority' to 'priority'", () => {
    expect(mapFieldName("priority")).toBe("priority")
  })

  test("'p' is not aliased (alias removed)", () => {
    expect(mapFieldName("p")).toBe("p")
  })

  test("normalizes 'type' to 'type'", () => {
    expect(mapFieldName("type")).toBe("type")
  })

  test("is case-insensitive: 'STATUS' to 'task_status'", () => {
    expect(mapFieldName("STATUS")).toBe("task_status")
  })

  test("is case-insensitive: 'Due' to 'due_at'", () => {
    expect(mapFieldName("Due")).toBe("due_at")
  })

  test("unknown fields returned unchanged", () => {
    expect(mapFieldName("custom_field")).toBe("custom_field")
  })

  test("empty string returned as-is", () => {
    expect(mapFieldName("")).toBe("")
  })
})

describe("parseQuery - field conditions", () => {
  test("parses 'status:open'", () => {
    const ast = parseQuery("status:open")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.conditions[0]).toMatchObject({
      field: "task_status",
      op: "=",
      value: "open",
    })
  })

  test("parses 'priority:1'", () => {
    const ast = parseQuery("priority:1")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.conditions[0]).toMatchObject({
      field: "priority",
      op: "=",
      value: "1",
    })
  })

  test("parses 'due:2026-01-21'", () => {
    const ast = parseQuery("due:2026-01-21")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.conditions[0]).toMatchObject({
      field: "due_at",
      op: "=",
      value: "2026-01-21",
    })
  })

  test("parses comma-separated values: 'status:open,blocked'", () => {
    const ast = parseQuery("status:open,blocked")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.conditions[0]).toMatchObject({
      field: "task_status",
      value: "open,blocked",
    })
  })

  test("parses negated: '-status:done'", () => {
    const ast = parseQuery("-status:done")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.conditions[0]).toMatchObject({
      field: "task_status",
      value: "done",
      negated: true,
    })
  })

  test("parses '!=' operator: 'status!=done'", () => {
    const ast = parseQuery("status!=done")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.conditions[0]).toMatchObject({
      field: "task_status",
      op: "!=",
      value: "done",
    })
  })

  test("parses '>' operator: 'priority>1'", () => {
    const ast = parseQuery("priority>1")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.conditions[0]).toMatchObject({
      field: "priority",
      op: ">",
      value: "1",
    })
  })

  test("parses '>=' operator: 'priority>=2'", () => {
    const ast = parseQuery("priority>=2")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.conditions[0]).toMatchObject({
      field: "priority",
      op: ">=",
      value: "2",
    })
  })

  test("parses '<=' operator: 'priority<=3'", () => {
    const ast = parseQuery("priority<=3")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.conditions[0]).toMatchObject({
      field: "priority",
      op: "<=",
      value: "3",
    })
  })
})

describe("parseQuery - references", () => {
  test("parses @mention: '@alice'", () => {
    const ast = parseQuery("@alice")
    expect(ast.refs).toHaveLength(1)
    expect(ast.refs[0]).toMatchObject({
      type: "person",
      value: "alice",
    })
  })

  test("parses #tag: '#urgent'", () => {
    const ast = parseQuery("#urgent")
    expect(ast.refs).toHaveLength(1)
    expect(ast.refs[0]).toMatchObject({
      type: "tag",
      value: "urgent",
    })
  })

  test("parses +project: '+website'", () => {
    const ast = parseQuery("+website")
    expect(ast.refs).toHaveLength(1)
    expect(ast.refs[0]).toMatchObject({
      type: "project",
      value: "website",
    })
  })

  test("parses negated @mention: '-@bob'", () => {
    const ast = parseQuery("-@bob")
    expect(ast.refs).toHaveLength(1)
    expect(ast.refs[0]).toMatchObject({
      type: "person",
      value: "bob",
      negated: true,
    })
  })

  test("parses negated #tag: '-#blocked'", () => {
    const ast = parseQuery("-#blocked")
    expect(ast.refs).toHaveLength(1)
    expect(ast.refs[0]).toMatchObject({
      type: "tag",
      value: "blocked",
      negated: true,
    })
  })

  test("parses multiple refs: '@alice #urgent +project'", () => {
    const ast = parseQuery("@alice #urgent +project")
    expect(ast.refs).toHaveLength(3)
    expect(ast.refs[0]?.type).toBe("person")
    expect(ast.refs[1]?.type).toBe("tag")
    expect(ast.refs[2]?.type).toBe("project")
  })
})

describe("parseQuery - quoted phrases", () => {
  test("parses simple quoted phrase: '\"hello world\"'", () => {
    const ast = parseQuery('"hello world"')
    expect(ast.phrases).toContain("hello world")
    expect(ast.phraseTerms).toHaveLength(1)
    expect(ast.phraseTerms[0]?.value).toBe("hello world")
  })

  test('parses multiple phrases: \'"foo bar" "baz"\'', () => {
    const ast = parseQuery('"foo bar" "baz"')
    expect(ast.phrases).toHaveLength(2)
    expect(ast.phrases).toContain("foo bar")
    expect(ast.phrases).toContain("baz")
  })
})

describe("parseQuery - path patterns", () => {
  test("parses relative path: './docs/project'", () => {
    const ast = parseQuery("./docs/project")
    expect(ast.paths).toHaveLength(1)
    expect(ast.paths[0]).toMatchObject({
      pattern: "./docs/project",
      recursive: false,
    })
  })

  test("parses recursive relative: './docs/**'", () => {
    const ast = parseQuery("./docs/**")
    expect(ast.paths).toHaveLength(1)
    expect(ast.paths[0]?.recursive).toBe(true)
  })

  test("parses absolute path: '/inbox'", () => {
    const ast = parseQuery("/inbox")
    expect(ast.paths).toHaveLength(1)
    expect(ast.paths[0]?.pattern).toBe("/inbox")
  })

  test("parses single-level glob: './inbox/*'", () => {
    const ast = parseQuery("./inbox/*")
    expect(ast.paths).toHaveLength(1)
    expect(ast.paths[0]).toMatchObject({
      pattern: "./inbox$",
      recursive: false,
    })
  })

  test("parses negated path: '-./archive/**'", () => {
    const ast = parseQuery("-./archive/**")
    expect(ast.paths).toHaveLength(1)
    expect(ast.paths[0]?.negated).toBe(true)
  })
})

describe("parseQuery - property queries", () => {
  test("parses existence: 'metadata::*'", () => {
    const ast = parseQuery("metadata::*")
    expect(ast.propConditions).toHaveLength(1)
    expect(ast.propConditions[0]).toMatchObject({
      prop: "metadata",
      op: "exists",
    })
  })

  test("parses string value: 'author::alice'", () => {
    const ast = parseQuery("author::alice")
    expect(ast.propConditions).toHaveLength(1)
    expect(ast.propConditions[0]).toMatchObject({
      prop: "author",
      op: "=",
      value: "alice",
    })
  })

  test("parses numeric value: 'score::95'", () => {
    const ast = parseQuery("score::95")
    expect(ast.propConditions).toHaveLength(1)
    expect(ast.propConditions[0]?.value).toBe(95)
  })

  test("parses comparison: 'attempts::>3'", () => {
    const ast = parseQuery("attempts::>3")
    expect(ast.propConditions).toHaveLength(1)
    expect(ast.propConditions[0]).toMatchObject({
      prop: "attempts",
      op: ">",
      value: 3,
    })
  })
})

describe("parseQuery - special conditions", () => {
  test("parses 'blocked:true'", () => {
    const ast = parseQuery("blocked:true")
    expect(ast.specials).toHaveLength(1)
    expect(ast.specials[0]).toMatchObject({
      type: "blocked",
      value: true,
    })
  })

  test("parses 'blocked:false'", () => {
    const ast = parseQuery("blocked:false")
    expect(ast.specials).toHaveLength(1)
    expect(ast.specials[0]).toMatchObject({
      type: "blocked",
      value: false,
    })
  })
})

describe("parseQuery - plain text search", () => {
  test("parses simple text: 'hello'", () => {
    const ast = parseQuery("hello")
    expect(ast.text).toContain("hello")
    expect(ast.textTerms).toHaveLength(1)
  })

  test("parses negated text: '-error'", () => {
    const ast = parseQuery("-error")
    expect(ast.textTerms).toHaveLength(1)
    expect(ast.textTerms[0]?.negated).toBe(true)
  })

  test("parses mixed query: 'status:open hello @alice'", () => {
    const ast = parseQuery("status:open hello @alice")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.text).toContain("hello")
    expect(ast.refs).toHaveLength(1)
  })

  test("empty query returns empty AST", () => {
    const ast = parseQuery("")
    expect(ast.conditions).toHaveLength(0)
    expect(ast.refs).toHaveLength(0)
    expect(ast.text).toHaveLength(0)
    expect(ast.paths).toHaveLength(0)
  })

  test("whitespace-only query returns empty AST", () => {
    const ast = parseQuery("   ")
    expect(ast.conditions).toHaveLength(0)
    expect(ast.refs).toHaveLength(0)
    expect(ast.text).toHaveLength(0)
  })
})

describe("parseQuery - edge cases", () => {
  test("handles multiple spaces between tokens", () => {
    const ast = parseQuery("status:open   @alice")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.refs).toHaveLength(1)
  })

  test("handles leading/trailing spaces", () => {
    const ast = parseQuery("  status:open  ")
    expect(ast.conditions).toHaveLength(1)
    expect(ast.conditions[0]?.field).toBe("task_status")
  })
})
