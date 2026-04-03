/**
 * Filtered Tree Traversal Query Tests
 *
 * Tests for getChildrenByType, getBodyChildren, and getSubitems query helpers.
 * Uses in-memory SQLite databases for isolation.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/db/schema.ts"
import { getChildrenByType, getBodyChildren, getSubitems, getChildren } from "../src/db/queries/tree-traversal.ts"
import type { ItemData } from "@km/core"

// =============================================================================
// Test Setup
// =============================================================================

let db: Database

/** Insert a node with minimal required fields */
function insertNode(
  id: string,
  type: string,
  parentId: string | null,
  parentIdx: number,
  content?: string,
  item?: ItemData,
): void {
  const pid = parentId ?? "."
  const now = Date.now()
  db.run(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, content, item, data, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, 'v1')`,
    [id, type, pid, parentIdx, content ?? "", item ? 1 : 0, now, now],
  )
}

beforeEach(() => {
  db = new Database(":memory:")
  db.run(SCHEMA)
})

afterEach(() => {
  db.close()
})

// =============================================================================
// getChildrenByType
// =============================================================================

describe("getChildrenByType", () => {
  test("returns empty array for empty types list", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    insertNode("child1", "p", "parent", 0)

    const result = getChildrenByType(db, "parent", [])
    expect(result).toEqual([])
  })

  test("returns only children matching the given types", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    insertNode("c1", "p", "parent", 0, "paragraph")
    insertNode("c2", "code", "parent", 1, "code block")
    insertNode("c3", "h", "parent", 2, "section", {})
    insertNode("c4", "quote", "parent", 3, "blockquote")

    const blocks = getChildrenByType(db, "parent", ["p", "code"])
    expect(blocks).toHaveLength(2)
    expect(blocks[0]!.id).toBe("c1")
    expect(blocks[1]!.id).toBe("c2")
  })

  test("returns children ordered by parent_idx then created_at", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    insertNode("c1", "p", "parent", 2, "second")
    insertNode("c2", "p", "parent", 0, "first")
    insertNode("c3", "p", "parent", 1, "middle")

    const result = getChildrenByType(db, "parent", ["p"])
    expect(result).toHaveLength(3)
    expect(result[0]!.id).toBe("c2")
    expect(result[1]!.id).toBe("c3")
    expect(result[2]!.id).toBe("c1")
  })

  test("returns empty array when no children match types", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    insertNode("c1", "h", "parent", 0, undefined, {})
    insertNode("c2", "quote", "parent", 1)

    const result = getChildrenByType(db, "parent", ["p", "code"])
    expect(result).toEqual([])
  })

  test("handles null parentId (root children)", () => {
    insertNode("c1", "p", null, 0, "root paragraph")
    insertNode("c2", "h", null, 1, "root section", {})

    const result = getChildrenByType(db, null, ["p"])
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe("c1")
  })
})

// =============================================================================
// getBodyChildren
// =============================================================================

describe("getBodyChildren", () => {
  test("returns all block-type children", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    insertNode("c1", "p", "parent", 0, "paragraph")
    insertNode("c2", "code", "parent", 1, "code block")
    insertNode("c3", "quote", "parent", 2, "blockquote")
    insertNode("c4", "table", "parent", 3, "table")
    insertNode("c5", "hr", "parent", 4, "---")
    insertNode("c6", "html", "parent", 5, "<div>html</div>")
    insertNode("c7", "math", "parent", 6, "x^2")

    const result = getBodyChildren(db, "parent")
    expect(result).toHaveLength(7)
    expect(result.map((n) => n.type)).toEqual(["p", "code", "quote", "table", "hr", "html", "math"])
  })

  test("excludes outline items, includes block types", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    insertNode("c1", "p", "parent", 0, "paragraph")
    insertNode("c2", "h", "parent", 1, "outline item", {})
    insertNode("c3", "p", "parent", 2, "list item", {})
    insertNode("c4", "code", "parent", 3, "code block")

    const result = getBodyChildren(db, "parent")
    // getBodyChildren filters by type IN (p, code, quote, ...) — excludes h
    // Note: p items (item=1) are also returned since getBodyChildren filters by type only
    expect(result).toHaveLength(3)
    expect(result[0]!.type).toBe("p")
    expect(result[1]!.type).toBe("p")
    expect(result[2]!.type).toBe("code")
  })

  test("returns empty array when parent has no block children", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    insertNode("c1", "h", "parent", 0, undefined, {})
    insertNode("c2", "h", "parent", 1, undefined, {})

    const result = getBodyChildren(db, "parent")
    expect(result).toEqual([])
  })
})

// =============================================================================
// getSubitems
// =============================================================================

describe("getSubitems", () => {
  test("returns item children (h and p with item=true)", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    insertNode("c1", "h", "parent", 0, "section", {})
    insertNode("c2", "p", "parent", 1, "list item", {})
    insertNode("c3", "p", "parent", 2, "paragraph")

    const result = getSubitems(db, "parent")
    expect(result).toHaveLength(2)
    expect(result[0]!.type).toBe("h")
    expect(result[1]!.type).toBe("p")
  })

  test("excludes block types, includes items", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    insertNode("c1", "p", "parent", 0)
    insertNode("c2", "code", "parent", 1)
    insertNode("c3", "p", "parent", 2)
    insertNode("c4", "h", "parent", 3, undefined, {})

    const result = getSubitems(db, "parent")
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe("h")
  })

  test("returns empty array when no items exist", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    insertNode("c1", "p", "parent", 0)
    insertNode("c2", "code", "parent", 1)

    const result = getSubitems(db, "parent")
    expect(result).toEqual([])
  })
})

// =============================================================================
// Mixed children (integration)
// =============================================================================

describe("mixed node types under same parent", () => {
  test("getBodyChildren + getSubitems cover all non-embed children from getChildren", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    insertNode("c1", "p", "parent", 0, "paragraph")
    insertNode("c2", "h", "parent", 1, "outline", {})
    insertNode("c3", "code", "parent", 2, "code")
    insertNode("c4", "quote", "parent", 3, "quote block")

    const body = getBodyChildren(db, "parent")
    const items = getSubitems(db, "parent")
    const all = getChildren(db, "parent")

    // Body: p, code, quote (getBodyChildren filters by BLOCK_TYPES)
    expect(body).toHaveLength(3)
    // Items: h with item=1 (getSubitems filters by item=1)
    expect(items).toHaveLength(1)
    expect(all).toHaveLength(4)

    // No overlap between body and items
    const bodyIds = new Set(body.map((n) => n.id))
    const itemIds = new Set(items.map((n) => n.id))
    for (const id of bodyIds) {
      expect(itemIds.has(id)).toBe(false)
    }
  })

  test("filtered queries preserve parent_idx ordering", () => {
    insertNode("parent", "h", null, 0, undefined, {})
    // Interleave block and item types
    insertNode("c1", "p", "parent", 0, "para 1")
    insertNode("c2", "h", "parent", 1, "section 1", {})
    insertNode("c3", "quote", "parent", 2, "blockquote")
    insertNode("c4", "p", "parent", 3, "task", {})
    insertNode("c5", "code", "parent", 4, "snippet")
    insertNode("c6", "h", "parent", 5, "section 2", {})

    const body = getBodyChildren(db, "parent")
    const items = getSubitems(db, "parent")

    // Body nodes maintain relative order: p(0) < quote(2) < p-item(3) < code(4)
    // Note: p items (item=1) are included since getBodyChildren filters by type only
    expect(body.map((n) => n.id)).toEqual(["c1", "c3", "c4", "c5"])

    // Item nodes maintain relative order: h-item(1) < p-item(3) < h-item(5)
    expect(items.map((n) => n.id)).toEqual(["c2", "c4", "c6"])
  })
})
