/**
 * Filtered Tree Traversal Query Tests
 *
 * Tests for getChildrenByType, getBodyChildren, and getSubitems query helpers.
 * Uses in-memory SQLite databases for isolation.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/schema.ts"
import { getChildrenByType, getBodyChildren, getSubitems, getChildren } from "../src/db-queries/tree-traversal.ts"

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
): void {
  const pid = parentId ?? "."
  const now = Date.now()
  db.run(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, content, data, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, '{}', ?, ?, 'v1')`,
    id,
    type,
    pid,
    parentIdx,
    content ?? "",
    now,
    now,
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
    insertNode("parent", "oi", null, 0)
    insertNode("child1", "p", "parent", 0)

    const result = getChildrenByType(db, "parent", [])
    expect(result).toEqual([])
  })

  test("returns only children matching the given types", () => {
    insertNode("parent", "oi", null, 0)
    insertNode("c1", "p", "parent", 0, "paragraph")
    insertNode("c2", "h", "parent", 1, "heading")
    insertNode("c3", "oi", "parent", 2, "section")
    insertNode("c4", "li", "parent", 3, "list item")

    const blocks = getChildrenByType(db, "parent", ["p", "h"])
    expect(blocks).toHaveLength(2)
    expect(blocks[0]!.id).toBe("c1")
    expect(blocks[1]!.id).toBe("c2")
  })

  test("returns children ordered by parent_idx then created_at", () => {
    insertNode("parent", "oi", null, 0)
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
    insertNode("parent", "oi", null, 0)
    insertNode("c1", "oi", "parent", 0)
    insertNode("c2", "li", "parent", 1)

    const result = getChildrenByType(db, "parent", ["p", "h", "code"])
    expect(result).toEqual([])
  })

  test("handles null parentId (root children)", () => {
    insertNode("c1", "p", null, 0, "root paragraph")
    insertNode("c2", "oi", null, 1, "root section")

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
    insertNode("parent", "oi", null, 0)
    insertNode("c1", "p", "parent", 0, "paragraph")
    insertNode("c2", "h", "parent", 1, "heading")
    insertNode("c3", "code", "parent", 2, "code block")
    insertNode("c4", "quote", "parent", 3, "blockquote")
    insertNode("c5", "table", "parent", 4, "table")
    insertNode("c6", "hr", "parent", 5, "---")
    insertNode("c7", "html", "parent", 6, "<div>html</div>")
    insertNode("c8", "math", "parent", 7, "x^2")

    const result = getBodyChildren(db, "parent")
    expect(result).toHaveLength(8)
    expect(result.map((n) => n.type)).toEqual(["p", "h", "code", "quote", "table", "hr", "html", "math"])
  })

  test("excludes item and link types", () => {
    insertNode("parent", "oi", null, 0)
    insertNode("c1", "p", "parent", 0, "paragraph")
    insertNode("c2", "oi", "parent", 1, "outline item")
    insertNode("c3", "li", "parent", 2, "list item")
    insertNode("c4", "link", "parent", 3, "link")
    insertNode("c5", "h", "parent", 4, "heading")

    const result = getBodyChildren(db, "parent")
    expect(result).toHaveLength(2)
    expect(result[0]!.type).toBe("p")
    expect(result[1]!.type).toBe("h")
  })

  test("returns empty array when parent has no block children", () => {
    insertNode("parent", "oi", null, 0)
    insertNode("c1", "oi", "parent", 0)
    insertNode("c2", "li", "parent", 1)

    const result = getBodyChildren(db, "parent")
    expect(result).toEqual([])
  })
})

// =============================================================================
// getSubitems
// =============================================================================

describe("getSubitems", () => {
  test("returns oi and li children", () => {
    insertNode("parent", "oi", null, 0)
    insertNode("c1", "oi", "parent", 0, "section")
    insertNode("c2", "li", "parent", 1, "list item")
    insertNode("c3", "p", "parent", 2, "paragraph")

    const result = getSubitems(db, "parent")
    expect(result).toHaveLength(2)
    expect(result[0]!.type).toBe("oi")
    expect(result[1]!.type).toBe("li")
  })

  test("excludes block and link types", () => {
    insertNode("parent", "oi", null, 0)
    insertNode("c1", "p", "parent", 0)
    insertNode("c2", "h", "parent", 1)
    insertNode("c3", "code", "parent", 2)
    insertNode("c4", "link", "parent", 3)
    insertNode("c5", "oi", "parent", 4)

    const result = getSubitems(db, "parent")
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe("oi")
  })

  test("returns empty array when no items exist", () => {
    insertNode("parent", "oi", null, 0)
    insertNode("c1", "p", "parent", 0)
    insertNode("c2", "h", "parent", 1)

    const result = getSubitems(db, "parent")
    expect(result).toEqual([])
  })
})

// =============================================================================
// Mixed children (integration)
// =============================================================================

describe("mixed node types under same parent", () => {
  test("getBodyChildren + getSubitems cover all non-link children from getChildren", () => {
    insertNode("parent", "oi", null, 0)
    insertNode("c1", "p", "parent", 0, "paragraph")
    insertNode("c2", "oi", "parent", 1, "outline")
    insertNode("c3", "li", "parent", 2, "list")
    insertNode("c4", "h", "parent", 3, "heading")
    insertNode("c5", "code", "parent", 4, "code")
    insertNode("c6", "link", "parent", 5, "link ref")

    const body = getBodyChildren(db, "parent")
    const items = getSubitems(db, "parent")
    const all = getChildren(db, "parent")

    // Body + items should cover all non-link children
    expect(body).toHaveLength(3) // p, h, code
    expect(items).toHaveLength(2) // oi, li
    expect(all).toHaveLength(6) // all types including link

    // No overlap between body and items
    const bodyIds = new Set(body.map((n) => n.id))
    const itemIds = new Set(items.map((n) => n.id))
    for (const id of bodyIds) {
      expect(itemIds.has(id)).toBe(false)
    }
  })

  test("filtered queries preserve parent_idx ordering", () => {
    insertNode("parent", "oi", null, 0)
    // Interleave block and item types
    insertNode("c1", "p", "parent", 0, "para 1")
    insertNode("c2", "oi", "parent", 1, "section 1")
    insertNode("c3", "h", "parent", 2, "heading")
    insertNode("c4", "li", "parent", 3, "task")
    insertNode("c5", "code", "parent", 4, "snippet")
    insertNode("c6", "oi", "parent", 5, "section 2")

    const body = getBodyChildren(db, "parent")
    const items = getSubitems(db, "parent")

    // Body nodes maintain relative order: p(0) < h(2) < code(4)
    expect(body.map((n) => n.id)).toEqual(["c1", "c3", "c5"])

    // Item nodes maintain relative order: oi(1) < li(3) < oi(5)
    expect(items.map((n) => n.id)).toEqual(["c2", "c4", "c6"])
  })
})
