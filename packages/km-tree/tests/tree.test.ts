/**
 * Tree Tests
 *
 * Combined tests for the Tree namespace:
 * - Tree queries: parent, children, ancestors, siblings
 * - Tree position operations: toSortOrder, nodeAt, isAtPosition, moveTo
 *
 * Pure function tests — no TUI, no rendering. Uses mock TreeReader.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { Tree, type TreeReader, type TreeMover } from "../src/tree.ts"

// --- Test helpers ---

type MockNode = { id: string; parent_id: string | null; parent_idx: number; name?: string }

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

function mockMoveTree(
  nodes: MockNode[],
): TreeMover & { moves: Array<{ id: string; parentId: string; sortOrder: number }> } {
  const reader = mockTree(nodes)
  const moves: Array<{ id: string; parentId: string; sortOrder: number }> = []
  return {
    ...reader,
    moves,
    moveNode(id, parentId, sortOrder) {
      moves.push({ id, parentId, sortOrder })
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
  { id: "root", parent_id: null, parent_idx: 0, name: "root" },
  { id: "board-A", parent_id: "root", parent_idx: 0, name: "Board A" },
  { id: "card-1", parent_id: "board-A", parent_idx: 0, name: "Card 1" },
  { id: "card-2", parent_id: "board-A", parent_idx: 1, name: "Card 2" },
  { id: "card-3", parent_id: "board-A", parent_idx: 2, name: "Card 3" },
  { id: "board-B", parent_id: "root", parent_idx: 1, name: "Board B" },
  { id: "card-4", parent_id: "board-B", parent_idx: 0, name: "Card 4" },
  { id: "board-C", parent_id: "root", parent_idx: 2, name: "Board C" },
]

// =============================================================================
// Tree queries
// =============================================================================

describe("Tree queries", () => {
  let tree: TreeReader

  beforeEach(() => {
    tree = mockTree(TREE)
  })

  // =========================================================================
  // parent
  // =========================================================================

  describe("parent", () => {
    it("returns parent node", () => {
      const parent = Tree.parent(tree, "card-1")
      expect(parent?.id).toBe("board-A")
    })

    it("returns null for root node", () => {
      expect(Tree.parent(tree, "root")).toBeNull()
    })

    it("returns root as parent of top-level boards", () => {
      const parent = Tree.parent(tree, "board-A")
      expect(parent?.id).toBe("root")
    })

    it("returns null for unknown node", () => {
      expect(Tree.parent(tree, "nonexistent")).toBeNull()
    })
  })

  // =========================================================================
  // children
  // =========================================================================

  describe("children", () => {
    it("returns children sorted by parent_idx", () => {
      const kids = Tree.children(tree, "board-A")
      expect(kids.map((c) => c.id)).toEqual(["card-1", "card-2", "card-3"])
    })

    it("returns single child", () => {
      const kids = Tree.children(tree, "board-B")
      expect(kids).toHaveLength(1)
      expect(kids[0]!.id).toBe("card-4")
    })

    it("returns empty array for leaf node", () => {
      expect(Tree.children(tree, "card-1")).toEqual([])
    })

    it("returns empty array for empty parent", () => {
      expect(Tree.children(tree, "board-C")).toEqual([])
    })
  })

  // =========================================================================
  // ancestors
  // =========================================================================

  describe("ancestors", () => {
    it("returns ancestors nearest-first", () => {
      const anc = Tree.ancestors(tree, "card-1")
      expect(anc.map((a) => a.id)).toEqual(["board-A", "root"])
    })

    it("returns empty array for root", () => {
      expect(Tree.ancestors(tree, "root")).toEqual([])
    })

    it("returns single ancestor for top-level node", () => {
      const anc = Tree.ancestors(tree, "board-A")
      expect(anc.map((a) => a.id)).toEqual(["root"])
    })

    it("returns empty array for unknown node", () => {
      expect(Tree.ancestors(tree, "nonexistent")).toEqual([])
    })
  })

  // =========================================================================
  // siblings
  // =========================================================================

  describe("siblings", () => {
    it("returns all siblings including self", () => {
      const sibs = Tree.siblings(tree, "card-2")
      expect(sibs.map((s) => s.id)).toEqual(["card-1", "card-2", "card-3"])
    })

    it("returns self for only child", () => {
      const sibs = Tree.siblings(tree, "card-4")
      expect(sibs.map((s) => s.id)).toEqual(["card-4"])
    })

    it("returns empty array for root node", () => {
      expect(Tree.siblings(tree, "root")).toEqual([])
    })

    it("returns top-level boards as siblings", () => {
      const sibs = Tree.siblings(tree, "board-A")
      expect(sibs.map((s) => s.id)).toEqual(["board-A", "board-B", "board-C"])
    })

    it("returns empty array for unknown node", () => {
      expect(Tree.siblings(tree, "nonexistent")).toEqual([])
    })
  })
})

// =============================================================================
// Tree position operations
// =============================================================================

describe("Tree position operations", () => {
  let tree: TreeReader

  beforeEach(() => {
    tree = mockTree(TREE)
  })

  // =========================================================================
  // toSortOrder
  // =========================================================================

  describe("toSortOrder", () => {
    it("childIdx 0 -> before first child's parent_idx", () => {
      const result = Tree.toSortOrder(tree, { parentId: "board-A", childIdx: 0 })
      expect(result.parentId).toBe("board-A")
      expect(result.sortOrder).toBeLessThan(0)
    })

    it("childIdx -1 -> after last child's parent_idx", () => {
      const result = Tree.toSortOrder(tree, { parentId: "board-A", childIdx: -1 })
      expect(result.parentId).toBe("board-A")
      expect(result.sortOrder).toBeGreaterThan(2)
    })

    it("concrete childIdx passed through", () => {
      const result = Tree.toSortOrder(tree, { parentId: "board-A", childIdx: 5 })
      expect(result.sortOrder).toBe(5)
    })

    it("empty parent -> sortOrder 0", () => {
      const result = Tree.toSortOrder(tree, { parentId: "board-C", childIdx: -1 })
      expect(result.sortOrder).toBe(0)
    })

    it("empty parent with childIdx 0 -> sortOrder 0", () => {
      const result = Tree.toSortOrder(tree, { parentId: "board-C", childIdx: 0 })
      expect(result.sortOrder).toBe(0)
    })

    it("single-child parent, childIdx 0 -> before that child", () => {
      const result = Tree.toSortOrder(tree, { parentId: "board-B", childIdx: 0 })
      expect(result.parentId).toBe("board-B")
      expect(result.sortOrder).toBeLessThan(0) // card-4 is at idx 0
    })

    it("single-child parent, childIdx -1 -> after that child", () => {
      const result = Tree.toSortOrder(tree, { parentId: "board-B", childIdx: -1 })
      expect(result.parentId).toBe("board-B")
      expect(result.sortOrder).toBeGreaterThan(0) // card-4 is at idx 0
    })
  })

  // =========================================================================
  // nodeAt
  // =========================================================================

  describe("nodeAt", () => {
    it("childIdx 0 -> first child", () => {
      const node = Tree.nodeAt(tree, { parentId: "board-A", childIdx: 0 })
      expect(node?.id).toBe("card-1")
    })

    it("childIdx -1 -> last child", () => {
      const node = Tree.nodeAt(tree, { parentId: "board-A", childIdx: -1 })
      expect(node?.id).toBe("card-3")
    })

    it("empty parent -> null", () => {
      const node = Tree.nodeAt(tree, { parentId: "board-C", childIdx: 0 })
      expect(node).toBeNull()
    })

    it("concrete childIdx matches parent_idx", () => {
      const node = Tree.nodeAt(tree, { parentId: "board-A", childIdx: 1 })
      expect(node?.id).toBe("card-2")
    })

    it("concrete childIdx with no match -> null", () => {
      const node = Tree.nodeAt(tree, { parentId: "board-A", childIdx: 99 })
      expect(node).toBeNull()
    })

    it("returns full node shape with name", () => {
      const node = Tree.nodeAt(tree, { parentId: "board-A", childIdx: 0 })
      expect(node).toEqual({ id: "card-1", parent_id: "board-A", parent_idx: 0, name: "Card 1" })
    })
  })

  // =========================================================================
  // isAtPosition
  // =========================================================================

  describe("isAtPosition", () => {
    it("true when node is at first position", () => {
      expect(Tree.isAtPosition(tree, "card-1", { parentId: "board-A", childIdx: 0 })).toBe(true)
    })

    it("true when node is at last position", () => {
      expect(Tree.isAtPosition(tree, "card-3", { parentId: "board-A", childIdx: -1 })).toBe(true)
    })

    it("false when node is not at position", () => {
      expect(Tree.isAtPosition(tree, "card-2", { parentId: "board-A", childIdx: 0 })).toBe(false)
    })

    it("false for empty parent", () => {
      expect(Tree.isAtPosition(tree, "card-1", { parentId: "board-C", childIdx: 0 })).toBe(false)
    })

    it("true with concrete childIdx matching parent_idx", () => {
      expect(Tree.isAtPosition(tree, "card-2", { parentId: "board-A", childIdx: 1 })).toBe(true)
    })

    it("false with concrete childIdx not matching", () => {
      expect(Tree.isAtPosition(tree, "card-2", { parentId: "board-A", childIdx: 2 })).toBe(false)
    })
  })

  // =========================================================================
  // moveTo
  // =========================================================================

  describe("moveTo", () => {
    it("moves node to position", () => {
      const mTree = mockMoveTree(TREE)
      const moved = Tree.moveTo(mTree, "card-2", { parentId: "board-A", childIdx: -1 })
      expect(moved).toBe(true)
      expect(mTree.moves).toHaveLength(1)
      expect(mTree.moves[0]!.id).toBe("card-2")
      expect(mTree.moves[0]!.parentId).toBe("board-A")
    })

    it("returns false if already at position", () => {
      const mTree = mockMoveTree(TREE)
      mTree.moveNode = () => {
        throw new Error("should not be called")
      }
      const moved = Tree.moveTo(mTree, "card-1", { parentId: "board-A", childIdx: 0 })
      expect(moved).toBe(false)
    })

    it("moves node cross-parent", () => {
      const mTree = mockMoveTree(TREE)
      const moved = Tree.moveTo(mTree, "card-1", { parentId: "board-B", childIdx: -1 })
      expect(moved).toBe(true)
      expect(mTree.moves).toHaveLength(1)
      expect(mTree.moves[0]!.parentId).toBe("board-B")
      expect(mTree.moves[0]!.sortOrder).toBeGreaterThan(0) // after card-4
    })

    it("moves to empty parent", () => {
      const mTree = mockMoveTree(TREE)
      const moved = Tree.moveTo(mTree, "card-1", { parentId: "board-C", childIdx: 0 })
      expect(moved).toBe(true)
      expect(mTree.moves).toHaveLength(1)
      expect(mTree.moves[0]!.parentId).toBe("board-C")
      expect(mTree.moves[0]!.sortOrder).toBe(0)
    })
  })
})
