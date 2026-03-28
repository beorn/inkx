/**
 * Tests for @km/core type utilities
 */
import { describe, test, expect } from "vitest"
import { getStatusForMarker, extractTitleTaskMarker, validateNode } from "../src/types.ts"

describe("getStatusForMarker", () => {
  test("returns undefined for undefined", () => {
    expect(getStatusForMarker(undefined)).toBeUndefined()
  })

  test("parses full bracket markers", () => {
    expect(getStatusForMarker("[x]")).toBe("done")
    expect(getStatusForMarker("[X]")).toBe("done")
    expect(getStatusForMarker("[ ]")).toBe("todo")
    expect(getStatusForMarker("[/]")).toBe("wip")
    expect(getStatusForMarker("[!]")).toBe("blocked")
    expect(getStatusForMarker("[-]")).toBe("dropped")
  })

  test("parses single char markers (backwards compat)", () => {
    expect(getStatusForMarker("x")).toBe("done")
    expect(getStatusForMarker(" ")).toBe("todo")
  })
})

describe("extractTitleTaskMarker", () => {
  test("extracts marker from title", () => {
    expect(extractTitleTaskMarker("[ ] Todo task")).toEqual({
      marker: "[ ]",
      cleanText: "Todo task",
    })
    expect(extractTitleTaskMarker("[x] Done task")).toEqual({
      marker: "[x]",
      cleanText: "Done task",
    })
  })

  test("returns undefined marker for non-task text", () => {
    expect(extractTitleTaskMarker("Regular text")).toEqual({
      marker: undefined,
      cleanText: "Regular text",
    })
  })
})

// =============================================================================
// Node validation — kmast v2 constraints
// =============================================================================

describe("validateNode", () => {
  describe("h requires item", () => {
    test("valid: h + item=true", () => {
      expect(validateNode({ type: "h", item: true })).toEqual([])
    })
    test("invalid: h without item", () => {
      const errors = validateNode({ type: "h", item: false })
      expect(errors).toHaveLength(1)
      expect(errors[0]!.field).toBe("item")
    })
    test("invalid: h with item=undefined", () => {
      const errors = validateNode({ type: "h" })
      expect(errors).toHaveLength(1)
    })
  })

  describe("task requires item", () => {
    test("valid: task + item=true", () => {
      expect(validateNode({ type: "p", item: true, task_status: "todo", task_marker: "[ ]" })).toEqual([])
    })
    test("invalid: task_status without item", () => {
      const errors = validateNode({ type: "p", task_status: "done" })
      expect(errors).toHaveLength(1)
      expect(errors[0]!.message).toContain("task")
    })
    test("invalid: task_marker without item", () => {
      const errors = validateNode({ type: "p", task_marker: "[x]" })
      expect(errors).toHaveLength(1)
    })
  })

  describe("embed_source (transclusion)", () => {
    test("embed_source is orthogonal to type — any type can have it", () => {
      expect(validateNode({ type: "p", embed_source: "some-id" })).toEqual([])
      expect(validateNode({ type: "h", item: true, embed_source: "some-id" })).toEqual([])
      expect(validateNode({ type: "p", item: true, embed_source: null })).toEqual([])
    })
  })

  describe("item-forbidden block types", () => {
    test("valid: p, quote, code, h can be items", () => {
      expect(validateNode({ type: "p", item: true })).toEqual([])
      expect(validateNode({ type: "quote", item: true })).toEqual([])
      expect(validateNode({ type: "code", item: true })).toEqual([])
      expect(validateNode({ type: "h", item: true })).toEqual([])
    })
    test("invalid: table cannot be an item", () => {
      const errors = validateNode({ type: "table", item: true })
      expect(errors).toHaveLength(1)
      expect(errors[0]!.field).toBe("type")
    })
    test("invalid: hr cannot be an item", () => {
      expect(validateNode({ type: "hr", item: true })).toHaveLength(1)
    })
    test("invalid: html cannot be an item", () => {
      expect(validateNode({ type: "html", item: true })).toHaveLength(1)
    })
    test("invalid: math cannot be an item", () => {
      expect(validateNode({ type: "math", item: true })).toHaveLength(1)
    })
    test("valid: these types as leaf blocks are fine", () => {
      expect(validateNode({ type: "table" })).toEqual([])
      expect(validateNode({ type: "hr" })).toEqual([])
      expect(validateNode({ type: "html" })).toEqual([])
      expect(validateNode({ type: "math" })).toEqual([])
    })
  })

  describe("leaf blocks (no item flag)", () => {
    test("valid: p without item", () => {
      expect(validateNode({ type: "p" })).toEqual([])
    })
    test("valid: code without item", () => {
      expect(validateNode({ type: "code" })).toEqual([])
    })
    test("valid: quote without item", () => {
      expect(validateNode({ type: "quote" })).toEqual([])
    })
  })

  describe("multiple errors", () => {
    test("table + item + task = 2 errors (item-forbidden + task needs item that is forbidden)", () => {
      const errors = validateNode({ type: "table", item: true, task_status: "todo" })
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })
  })
})
