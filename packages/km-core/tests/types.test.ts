/**
 * Tests for @km/core type utilities
 */
import { describe, test, expect } from "vitest"
import {
  getMarkerForStatus,
  getStatusForMarker,
  extractTitleTaskMarker,
  markToMarker,
  isOutline,
  isListItem,
  isItem,
  isEmbed,
  isBlock,
  validateNode,
  type TaskStatus,
} from "../src/types.ts"

describe("getMarkerForStatus", () => {
  test("maps 'done' to '[x]'", () => {
    expect(getMarkerForStatus("done")).toBe("[x]")
  })

  test("maps 'wip' to '[/]'", () => {
    expect(getMarkerForStatus("wip")).toBe("[/]")
  })

  test("maps 'blocked' to '[!]'", () => {
    expect(getMarkerForStatus("blocked")).toBe("[!]")
  })

  test("maps 'dropped' to '[-]'", () => {
    expect(getMarkerForStatus("dropped")).toBe("[-]")
  })

  test("maps 'todo' to '[ ]'", () => {
    expect(getMarkerForStatus("todo")).toBe("[ ]")
  })
})

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

describe("markToMarker", () => {
  test("wraps single char in brackets", () => {
    expect(markToMarker("x")).toBe("[x]")
    expect(markToMarker(" ")).toBe("[ ]")
    expect(markToMarker("/")).toBe("[/]")
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
// Type predicates — v2 trait-based
// =============================================================================

describe("type predicates (v2 trait-based)", () => {
  describe("isOutline", () => {
    test("h + item is outline", () => {
      expect(isOutline("h", true)).toBe(true)
    })
    test("h without item is NOT outline", () => {
      expect(isOutline("h", false)).toBe(false)
      expect(isOutline("h")).toBe(false)
    })
    test("p + item is NOT outline (it's a list item)", () => {
      expect(isOutline("p", true)).toBe(false)
    })
    test("non-items are not outline", () => {
      expect(isOutline("p")).toBe(false)
      expect(isOutline("code")).toBe(false)
    })
  })

  describe("isListItem", () => {
    test("p + item is list item", () => {
      expect(isListItem("p", true)).toBe(true)
    })
    test("quote + item is list item", () => {
      expect(isListItem("quote", true)).toBe(true)
    })
    test("h + item is NOT list item (it's outline)", () => {
      expect(isListItem("h", true)).toBe(false)
    })
    test("p without item is NOT list item", () => {
      expect(isListItem("p", false)).toBe(false)
      expect(isListItem("p")).toBe(false)
    })
  })

  describe("isItem", () => {
    test("any type with item=true is an item", () => {
      expect(isItem("h", true)).toBe(true)
      expect(isItem("p", true)).toBe(true)
      expect(isItem("quote", true)).toBe(true)
    })
    test("without item flag, types are not items", () => {
      expect(isItem("p")).toBe(false)
      expect(isItem("p", false)).toBe(false)
      expect(isItem("h")).toBe(false)
    })
  })

  describe("isEmbed", () => {
    test("embed is embed", () => {
      expect(isEmbed("embed")).toBe(true)
    })
    test("non-embed types", () => {
      expect(isEmbed("p")).toBe(false)
      expect(isEmbed("h")).toBe(false)
      expect(isEmbed("link")).toBe(false)
    })
  })

  describe("isBlock", () => {
    test("item=false is a block", () => {
      expect(isBlock("p", false)).toBe(true)
      expect(isBlock("code", false)).toBe(true)
    })
    test("item=true is NOT a block", () => {
      expect(isBlock("p", true)).toBe(false)
      expect(isBlock("h", true)).toBe(false)
    })
    test("without item flag, types are blocks", () => {
      expect(isBlock("p")).toBe(true)
      expect(isBlock("code")).toBe(true)
      expect(isBlock("embed")).toBe(true)
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

  describe("embed constraints", () => {
    test("valid: embed with embed_source=null (unresolved)", () => {
      expect(validateNode({ type: "embed", embed_source: null })).toEqual([])
    })
    test("valid: embed with embed_source=id", () => {
      expect(validateNode({ type: "embed", embed_source: "some-id" })).toEqual([])
    })
    test("invalid: embed without embed_source field", () => {
      const errors = validateNode({ type: "embed" })
      expect(errors).toHaveLength(1)
      expect(errors[0]!.field).toBe("embed_source")
    })
    test("invalid: embed + item=true", () => {
      const errors = validateNode({ type: "embed", item: true, embed_source: "x" })
      // Gets both "embed cannot be an item" and "item-forbidden block type" errors
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(errors.some((e) => e.message.includes("cannot be an item"))).toBe(true)
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
    test("embed + item=true + no embed_source = 3 errors", () => {
      const errors = validateNode({ type: "embed", item: true })
      expect(errors).toHaveLength(3) // embed_source missing, embed not item, item-forbidden type
      const fields = errors.map((e) => e.field)
      expect(fields).toContain("embed_source")
      expect(fields).toContain("item")
      expect(fields).toContain("type")
    })
  })
})
