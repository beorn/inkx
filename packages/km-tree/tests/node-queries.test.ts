/**
 * NodeQuery Tests
 *
 * Pure tree navigation queries: parent, children, ancestors, siblings.
 * Uses mock TreeReader — no database, no TUI.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { NodeQuery } from "../src/node-queries.ts"
import type { TreeReader } from "../src/tree-ops.ts"

// --- Test helpers ---

type MockNode = { id: string; parent_id: string | null; parent_idx: number }

function mockTree(nodes: MockNode[]): TreeReader {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  return {
    getNode(id: string) {
      return nodeMap.get(id) ?? null
    },
    getChildren(parentId: string | null) {
      return nodes.filter((n) => n.parent_id === parentId).sort((a, b) => a.parent_idx - b.parent_idx)
    },
  }
}

// --- Standard test tree ---
// root
//   +-- board-A (idx 0)
//   |   +-- card-1 (idx 0)
//   |   +-- card-2 (idx 1)
//   |   +-- card-3 (idx 2)
//   +-- board-B (idx 1)
//   |   +-- card-4 (idx 0)
//   +-- board-C (idx 2, empty)

const TREE: MockNode[] = [
  { id: "root", parent_id: null, parent_idx: 0 },
  { id: "board-A", parent_id: "root", parent_idx: 0 },
  { id: "card-1", parent_id: "board-A", parent_idx: 0 },
  { id: "card-2", parent_id: "board-A", parent_idx: 1 },
  { id: "card-3", parent_id: "board-A", parent_idx: 2 },
  { id: "board-B", parent_id: "root", parent_idx: 1 },
  { id: "card-4", parent_id: "board-B", parent_idx: 0 },
  { id: "board-C", parent_id: "root", parent_idx: 2 },
]

describe("NodeQuery", () => {
  let tree: TreeReader

  beforeEach(() => {
    tree = mockTree(TREE)
  })

  // =========================================================================
  // parent
  // =========================================================================

  describe("parent", () => {
    it("returns parent node", () => {
      const parent = NodeQuery.parent(tree, "card-1")
      expect(parent?.id).toBe("board-A")
    })

    it("returns null for root node", () => {
      expect(NodeQuery.parent(tree, "root")).toBeNull()
    })

    it("returns root as parent of top-level boards", () => {
      const parent = NodeQuery.parent(tree, "board-A")
      expect(parent?.id).toBe("root")
    })

    it("returns null for unknown node", () => {
      expect(NodeQuery.parent(tree, "nonexistent")).toBeNull()
    })
  })

  // =========================================================================
  // children
  // =========================================================================

  describe("children", () => {
    it("returns children sorted by parent_idx", () => {
      const kids = NodeQuery.children(tree, "board-A")
      expect(kids.map((c) => c.id)).toEqual(["card-1", "card-2", "card-3"])
    })

    it("returns single child", () => {
      const kids = NodeQuery.children(tree, "board-B")
      expect(kids).toHaveLength(1)
      expect(kids[0]!.id).toBe("card-4")
    })

    it("returns empty array for leaf node", () => {
      expect(NodeQuery.children(tree, "card-1")).toEqual([])
    })

    it("returns empty array for empty parent", () => {
      expect(NodeQuery.children(tree, "board-C")).toEqual([])
    })
  })

  // =========================================================================
  // ancestors
  // =========================================================================

  describe("ancestors", () => {
    it("returns ancestors nearest-first", () => {
      const anc = NodeQuery.ancestors(tree, "card-1")
      expect(anc.map((a) => a.id)).toEqual(["board-A", "root"])
    })

    it("returns empty array for root", () => {
      expect(NodeQuery.ancestors(tree, "root")).toEqual([])
    })

    it("returns single ancestor for top-level node", () => {
      const anc = NodeQuery.ancestors(tree, "board-A")
      expect(anc.map((a) => a.id)).toEqual(["root"])
    })

    it("returns empty array for unknown node", () => {
      expect(NodeQuery.ancestors(tree, "nonexistent")).toEqual([])
    })
  })

  // =========================================================================
  // siblings
  // =========================================================================

  describe("siblings", () => {
    it("returns all siblings including self", () => {
      const sibs = NodeQuery.siblings(tree, "card-2")
      expect(sibs.map((s) => s.id)).toEqual(["card-1", "card-2", "card-3"])
    })

    it("returns self for only child", () => {
      const sibs = NodeQuery.siblings(tree, "card-4")
      expect(sibs.map((s) => s.id)).toEqual(["card-4"])
    })

    it("returns empty array for root node", () => {
      expect(NodeQuery.siblings(tree, "root")).toEqual([])
    })

    it("returns top-level boards as siblings", () => {
      const sibs = NodeQuery.siblings(tree, "board-A")
      expect(sibs.map((s) => s.id)).toEqual(["board-A", "board-B", "board-C"])
    })

    it("returns empty array for unknown node", () => {
      expect(NodeQuery.siblings(tree, "nonexistent")).toEqual([])
    })
  })
})
