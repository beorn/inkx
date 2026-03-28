/**
 * TreeOps Tests
 *
 * Tests for repo-dependent Position helpers: toSortOrder, nodeAt, isAtPosition, moveTo.
 * Pure function tests — no TUI, no rendering.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { TreeOps, type TreeReader, type TreeMover } from "../src/tree-ops.ts"

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

describe("TreeOps", () => {
  let tree: TreeReader

  beforeEach(() => {
    tree = mockTree(TREE)
  })

  // =========================================================================
  // toSortOrder
  // =========================================================================

  describe("toSortOrder", () => {
    it("childIdx 0 -> before first child's parent_idx", () => {
      const result = TreeOps.toSortOrder(tree, { parentId: "board-A", childIdx: 0 })
      expect(result.parentId).toBe("board-A")
      expect(result.sortOrder).toBeLessThan(0)
    })

    it("childIdx -1 -> after last child's parent_idx", () => {
      const result = TreeOps.toSortOrder(tree, { parentId: "board-A", childIdx: -1 })
      expect(result.parentId).toBe("board-A")
      expect(result.sortOrder).toBeGreaterThan(2)
    })

    it("concrete childIdx passed through", () => {
      const result = TreeOps.toSortOrder(tree, { parentId: "board-A", childIdx: 5 })
      expect(result.sortOrder).toBe(5)
    })

    it("empty parent -> sortOrder 0", () => {
      const result = TreeOps.toSortOrder(tree, { parentId: "board-C", childIdx: -1 })
      expect(result.sortOrder).toBe(0)
    })

    it("empty parent with childIdx 0 -> sortOrder 0", () => {
      const result = TreeOps.toSortOrder(tree, { parentId: "board-C", childIdx: 0 })
      expect(result.sortOrder).toBe(0)
    })

    it("single-child parent, childIdx 0 -> before that child", () => {
      const result = TreeOps.toSortOrder(tree, { parentId: "board-B", childIdx: 0 })
      expect(result.parentId).toBe("board-B")
      expect(result.sortOrder).toBeLessThan(0) // card-4 is at idx 0
    })

    it("single-child parent, childIdx -1 -> after that child", () => {
      const result = TreeOps.toSortOrder(tree, { parentId: "board-B", childIdx: -1 })
      expect(result.parentId).toBe("board-B")
      expect(result.sortOrder).toBeGreaterThan(0) // card-4 is at idx 0
    })
  })

  // =========================================================================
  // nodeAt
  // =========================================================================

  describe("nodeAt", () => {
    it("childIdx 0 -> first child", () => {
      const node = TreeOps.nodeAt(tree, { parentId: "board-A", childIdx: 0 })
      expect(node?.id).toBe("card-1")
    })

    it("childIdx -1 -> last child", () => {
      const node = TreeOps.nodeAt(tree, { parentId: "board-A", childIdx: -1 })
      expect(node?.id).toBe("card-3")
    })

    it("empty parent -> null", () => {
      const node = TreeOps.nodeAt(tree, { parentId: "board-C", childIdx: 0 })
      expect(node).toBeNull()
    })

    it("concrete childIdx matches parent_idx", () => {
      const node = TreeOps.nodeAt(tree, { parentId: "board-A", childIdx: 1 })
      expect(node?.id).toBe("card-2")
    })

    it("concrete childIdx with no match -> null", () => {
      const node = TreeOps.nodeAt(tree, { parentId: "board-A", childIdx: 99 })
      expect(node).toBeNull()
    })

    it("returns full node shape with name", () => {
      const node = TreeOps.nodeAt(tree, { parentId: "board-A", childIdx: 0 })
      expect(node).toEqual({ id: "card-1", parent_id: "board-A", parent_idx: 0, name: "Card 1" })
    })
  })

  // =========================================================================
  // isAtPosition
  // =========================================================================

  describe("isAtPosition", () => {
    it("true when node is at first position", () => {
      expect(TreeOps.isAtPosition(tree, "card-1", { parentId: "board-A", childIdx: 0 })).toBe(true)
    })

    it("true when node is at last position", () => {
      expect(TreeOps.isAtPosition(tree, "card-3", { parentId: "board-A", childIdx: -1 })).toBe(true)
    })

    it("false when node is not at position", () => {
      expect(TreeOps.isAtPosition(tree, "card-2", { parentId: "board-A", childIdx: 0 })).toBe(false)
    })

    it("false for empty parent", () => {
      expect(TreeOps.isAtPosition(tree, "card-1", { parentId: "board-C", childIdx: 0 })).toBe(false)
    })

    it("true with concrete childIdx matching parent_idx", () => {
      expect(TreeOps.isAtPosition(tree, "card-2", { parentId: "board-A", childIdx: 1 })).toBe(true)
    })

    it("false with concrete childIdx not matching", () => {
      expect(TreeOps.isAtPosition(tree, "card-2", { parentId: "board-A", childIdx: 2 })).toBe(false)
    })
  })

  // =========================================================================
  // moveTo
  // =========================================================================

  describe("moveTo", () => {
    it("moves node to position", () => {
      const mTree = mockMoveTree(TREE)
      const moved = TreeOps.moveTo(mTree, "card-2", { parentId: "board-A", childIdx: -1 })
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
      const moved = TreeOps.moveTo(mTree, "card-1", { parentId: "board-A", childIdx: 0 })
      expect(moved).toBe(false)
    })

    it("moves node cross-parent", () => {
      const mTree = mockMoveTree(TREE)
      const moved = TreeOps.moveTo(mTree, "card-1", { parentId: "board-B", childIdx: -1 })
      expect(moved).toBe(true)
      expect(mTree.moves).toHaveLength(1)
      expect(mTree.moves[0]!.parentId).toBe("board-B")
      expect(mTree.moves[0]!.sortOrder).toBeGreaterThan(0) // after card-4
    })

    it("moves to empty parent", () => {
      const mTree = mockMoveTree(TREE)
      const moved = TreeOps.moveTo(mTree, "card-1", { parentId: "board-C", childIdx: 0 })
      expect(moved).toBe(true)
      expect(mTree.moves).toHaveLength(1)
      expect(mTree.moves[0]!.parentId).toBe("board-C")
      expect(mTree.moves[0]!.sortOrder).toBe(0)
    })
  })
})
