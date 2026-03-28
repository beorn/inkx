/**
 * Position Resolver Tests
 *
 * Tests for resolveLocationKey — the central resolution table mapping
 * locationKey strings to concrete Positions in the tree.
 *
 * Pure function tests — no TUI, no rendering. Just key → Position logic.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  resolveLocationKey,
  isPickTarget,
  isPosition,
  type ResolverRepo,
  type CursorContext,
  type PickTarget,
} from "../src/board/position-resolver.ts"
import { Position } from "@km/core"
import { Tree, type TreeMover } from "@km/tree"
import { setFavorite, clearFavorite } from "@km/commands"

// --- Test helpers ---

/** Build a mock repo from a simple tree definition. */
function mockRepo(
  nodes: Array<{ id: string; parent_id: string | null; parent_idx: number; name?: string }>,
): ResolverRepo {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  return {
    getNode(id: string) {
      return nodeMap.get(id) ?? null
    },
    getChildren(parentId: string | null) {
      return nodes.filter((n) => n.parent_id === parentId).sort((a, b) => a.parent_idx - b.parent_idx)
    },
    resolveNode(query: string) {
      // Simple name-based resolution for tests
      const match = nodes.find((n) => n.name === query || n.id === query)
      return match ? { id: match.id } : null
    },
  }
}

function cursor(nodeId: string | null): CursorContext {
  return { cursorNodeId: nodeId }
}

// --- Standard test tree ---
// root
//   ├── board-A (idx 0)
//   │   ├── card-1 (idx 0)
//   │   ├── card-2 (idx 1)
//   │   └── card-3 (idx 2)
//   ├── board-B (idx 1)
//   │   └── card-4 (idx 0)
//   └── board-C (idx 2)

const TREE = [
  { id: "root", parent_id: null, parent_idx: 0, name: "root" },
  { id: "board-A", parent_id: "root", parent_idx: 0, name: "Board A" },
  { id: "card-1", parent_id: "board-A", parent_idx: 0, name: "Card 1" },
  { id: "card-2", parent_id: "board-A", parent_idx: 1, name: "Card 2" },
  { id: "card-3", parent_id: "board-A", parent_idx: 2, name: "Card 3" },
  { id: "board-B", parent_id: "root", parent_idx: 1, name: "Board B" },
  { id: "card-4", parent_id: "board-B", parent_idx: 0, name: "Card 4" },
  { id: "board-C", parent_id: "root", parent_idx: 2, name: "Board C" },
  // System boards
  { id: "@next-id", parent_id: "root", parent_idx: 10, name: "@next" },
  { id: "@inbox-id", parent_id: "root", parent_idx: 11, name: "@inbox" },
]

describe("resolveLocationKey", () => {
  let repo: ResolverRepo

  beforeEach(() => {
    repo = mockRepo(TREE)
  })

  // =========================================================================
  // Picker targets
  // =========================================================================

  describe("picker targets", () => {
    it("pick:# → { pick: '#' }", () => {
      const result = resolveLocationKey("pick:#", cursor("card-1"), repo)
      expect(result).toEqual({ pick: "#" })
      expect(isPickTarget(result)).toBe(true)
    })

    it("pick:@ → { pick: '@' }", () => {
      const result = resolveLocationKey("pick:@", cursor("card-1"), repo)
      expect(result).toEqual({ pick: "@" })
    })

    it("pick:+ → { pick: '+' }", () => {
      const result = resolveLocationKey("pick:+", cursor("card-1"), repo)
      expect(result).toEqual({ pick: "+" })
    })

    it("pick:[ → { pick: '[' }", () => {
      const result = resolveLocationKey("pick:[", cursor("card-1"), repo)
      expect(result).toEqual({ pick: "[" })
    })

    it("pick: with empty prefix → { pick: '' }", () => {
      const result = resolveLocationKey("pick:", cursor("card-1"), repo)
      expect(result).toEqual({ pick: "" })
    })
  })

  // =========================================================================
  // Favorites
  // =========================================================================

  describe("favorites", () => {
    afterEach(() => {
      for (let n = 0; n <= 9; n++) clearFavorite(String(n))
    })

    it("fav:1 → Position of favorite node", () => {
      setFavorite("1", "board-A")
      const result = resolveLocationKey("fav:1", cursor("card-1"), repo)
      expect(result).toEqual({ parentId: "board-A", childIdx: -1 })
      expect(isPosition(result)).toBe(true)
    })

    it("fav:X → null when favorite not set", () => {
      const result = resolveLocationKey("fav:5", cursor("card-1"), repo)
      expect(result).toBeNull()
    })

    it("fav:X → null when favorite node doesn't exist in repo", () => {
      setFavorite("3", "nonexistent-node")
      const result = resolveLocationKey("fav:3", cursor("card-1"), repo)
      expect(result).toBeNull()
    })

    it("fav:0 works for key 0", () => {
      setFavorite("0", "board-B")
      const result = resolveLocationKey("fav:0", cursor("card-1"), repo)
      expect(result).toEqual({ parentId: "board-B", childIdx: -1 })
    })
  })

  // =========================================================================
  // Positional: parent
  // =========================================================================

  describe("parent", () => {
    it("cursor on card-2 → parent's slot (root, 0) = board-A's position", () => {
      const result = resolveLocationKey("parent", cursor("card-2"), repo) as Position
      expect(result).toEqual({ parentId: "root", childIdx: 0 })
    })

    it("cursor on card-4 → parent's slot (root, 1) = board-B's position", () => {
      const result = resolveLocationKey("parent", cursor("card-4"), repo) as Position
      expect(result).toEqual({ parentId: "root", childIdx: 1 })
    })

    it("cursor on board-A → parent is root (root level)", () => {
      const result = resolveLocationKey("parent", cursor("board-A"), repo) as Position
      // root has no parent_id, so parentNode = root, root.parent_id = null
      // Returns { parentId: root.id, childIdx: 0 } sentinel
      expect(result).toEqual({ parentId: "root", childIdx: 0 })
    })

    it("cursor on root → null (no parent)", () => {
      const result = resolveLocationKey("parent", cursor("root"), repo)
      expect(result).toBeNull()
    })

    it("no cursor → null", () => {
      const result = resolveLocationKey("parent", cursor(null), repo)
      expect(result).toBeNull()
    })
  })

  // =========================================================================
  // Positional: first / last
  // =========================================================================

  describe("first", () => {
    it("cursor on card-2 → first sibling slot (board-A, 0)", () => {
      const result = resolveLocationKey("first", cursor("card-2"), repo)
      expect(result).toEqual({ parentId: "board-A", childIdx: 0 })
    })

    it("cursor on card-1 (already first) → still (board-A, 0)", () => {
      const result = resolveLocationKey("first", cursor("card-1"), repo)
      expect(result).toEqual({ parentId: "board-A", childIdx: 0 })
    })

    it("no cursor → null", () => {
      const result = resolveLocationKey("first", cursor(null), repo)
      expect(result).toBeNull()
    })

    it("cursor on root (no parent) → null", () => {
      const result = resolveLocationKey("first", cursor("root"), repo)
      expect(result).toBeNull()
    })
  })

  describe("last", () => {
    it("cursor on card-1 → last sibling slot (board-A, -1)", () => {
      const result = resolveLocationKey("last", cursor("card-1"), repo)
      expect(result).toEqual({ parentId: "board-A", childIdx: -1 })
    })

    it("cursor on card-3 (already last) → still (board-A, -1)", () => {
      const result = resolveLocationKey("last", cursor("card-3"), repo)
      expect(result).toEqual({ parentId: "board-A", childIdx: -1 })
    })

    it("no cursor → null", () => {
      const result = resolveLocationKey("last", cursor(null), repo)
      expect(result).toBeNull()
    })
  })

  // =========================================================================
  // Special locations
  // =========================================================================

  describe("@home", () => {
    it("resolves to root sentinel", () => {
      const result = resolveLocationKey("@home", cursor("card-1"), repo)
      expect(result).toEqual({ parentId: "", childIdx: 0 })
    })
  })

  // =========================================================================
  // Board/node ID resolution
  // =========================================================================

  describe("board/node ID", () => {
    it("direct node ID → Position at that node", () => {
      const result = resolveLocationKey("board-A", cursor("card-1"), repo)
      expect(result).toEqual({ parentId: "board-A", childIdx: -1 })
    })

    it("resolves by name when direct ID lookup fails", () => {
      const result = resolveLocationKey("@next", cursor("card-1"), repo)
      expect(result).toEqual({ parentId: "@next-id", childIdx: -1 })
    })

    it("resolves @inbox by name", () => {
      const result = resolveLocationKey("@inbox", cursor("card-1"), repo)
      expect(result).toEqual({ parentId: "@inbox-id", childIdx: -1 })
    })

    it("unknown node ID → null", () => {
      const result = resolveLocationKey("nonexistent", cursor("card-1"), repo)
      expect(result).toBeNull()
    })
  })

  // =========================================================================
  // Type guards
  // =========================================================================

  describe("type guards", () => {
    it("isPickTarget identifies pick targets", () => {
      expect(isPickTarget({ pick: "#" })).toBe(true)
      expect(isPickTarget({ parentId: "a", childIdx: 0 })).toBe(false)
      expect(isPickTarget(null)).toBe(false)
    })

    it("isPosition identifies positions", () => {
      expect(isPosition({ parentId: "a", childIdx: 0 })).toBe(true)
      expect(isPosition({ pick: "#" })).toBe(false)
      expect(isPosition(null)).toBe(false)
    })
  })

  // =========================================================================
  // Domain helpers
  // =========================================================================

  describe("Position.of", () => {
    it("returns slot of a node in its parent", () => {
      expect(Position.of({ id: "card-2", parent_id: "board-A", parent_idx: 1 })).toEqual({
        parentId: "board-A",
        childIdx: 1,
      })
    })

    it("returns null for root (no parent)", () => {
      expect(Position.of({ id: "root", parent_id: null, parent_idx: 0 })).toBeNull()
    })
  })

  describe("Position.first / Position.last", () => {
    it("Position.first creates Position with childIdx 0", () => {
      expect(Position.first("board-A")).toEqual({ parentId: "board-A", childIdx: 0 })
    })

    it("Position.last creates Position with childIdx -1", () => {
      expect(Position.last("board-A")).toEqual({ parentId: "board-A", childIdx: -1 })
    })
  })

  describe("Tree.toSortOrder", () => {
    it("childIdx 0 → before first child's parent_idx", () => {
      const result = Tree.toSortOrder(repo, { parentId: "board-A", childIdx: 0 })
      expect(result.parentId).toBe("board-A")
      expect(result.sortOrder).toBeLessThan(0) // first child has parent_idx 0
    })

    it("childIdx -1 → after last child's parent_idx", () => {
      const result = Tree.toSortOrder(repo, { parentId: "board-A", childIdx: -1 })
      expect(result.parentId).toBe("board-A")
      expect(result.sortOrder).toBeGreaterThan(2) // last child has parent_idx 2
    })

    it("concrete childIdx passed through", () => {
      const result = Tree.toSortOrder(repo, { parentId: "board-A", childIdx: 5 })
      expect(result.sortOrder).toBe(5)
    })

    it("empty parent → sortOrder 0", () => {
      const result = Tree.toSortOrder(repo, { parentId: "board-C", childIdx: -1 })
      expect(result.sortOrder).toBe(0)
    })
  })

  describe("Tree.nodeAt", () => {
    it("childIdx 0 → first child", () => {
      const node = Tree.nodeAt(repo, { parentId: "board-A", childIdx: 0 })
      expect(node?.id).toBe("card-1")
    })

    it("childIdx -1 → last child", () => {
      const node = Tree.nodeAt(repo, { parentId: "board-A", childIdx: -1 })
      expect(node?.id).toBe("card-3")
    })

    it("empty parent → null", () => {
      const node = Tree.nodeAt(repo, { parentId: "board-C", childIdx: 0 })
      expect(node).toBeNull()
    })
  })

  describe("Tree.isAtPosition", () => {
    it("true when node is at first position", () => {
      expect(Tree.isAtPosition(repo, "card-1", { parentId: "board-A", childIdx: 0 })).toBe(true)
    })

    it("true when node is at last position", () => {
      expect(Tree.isAtPosition(repo, "card-3", { parentId: "board-A", childIdx: -1 })).toBe(true)
    })

    it("false when node is not at position", () => {
      expect(Tree.isAtPosition(repo, "card-2", { parentId: "board-A", childIdx: 0 })).toBe(false)
    })

    it("false for empty parent", () => {
      expect(Tree.isAtPosition(repo, "card-1", { parentId: "board-C", childIdx: 0 })).toBe(false)
    })
  })

  describe("Tree.moveTo", () => {
    it("moves node to position", () => {
      const moves: Array<{ id: string; parentId: string; sortOrder: number }> = []
      const moveRepo: TreeMover = {
        ...repo,
        moveNode(id, parentId, sortOrder) {
          moves.push({ id, parentId, sortOrder })
        },
      }
      const moved = Tree.moveTo(moveRepo, "card-2", { parentId: "board-A", childIdx: -1 })
      expect(moved).toBe(true)
      expect(moves).toHaveLength(1)
      expect(moves[0]!.id).toBe("card-2")
      expect(moves[0]!.parentId).toBe("board-A")
    })

    it("returns false if already at position", () => {
      const moveRepo: TreeMover = {
        ...repo,
        moveNode() {
          throw new Error("should not be called")
        },
      }
      const moved = Tree.moveTo(moveRepo, "card-1", { parentId: "board-A", childIdx: 0 })
      expect(moved).toBe(false)
    })
  })
})
