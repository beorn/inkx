// NOTE: This is a pure state test (no screen assertions). It belongs in km-board
// but can't move yet because the source module (path.ts) lives in km-tui/src and
// depends on sibling-index.ts. Move this test when path.ts migrates to @km/board.
import { describe, expect, it } from "vitest"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"
import { Path, NodePath } from "../src/navigation/path.ts"

// =============================================================================
// Test tree:
//   root
//   ├── col0
//   │   ├── card0
//   │   └── card1
//   │       ├── block0
//   │       └── block1
//   └── col1
//       └── card2
// =============================================================================

const nodes = item(
  "root",
  item("col0", item("card0"), item("card1", item("block0"), item("block1"))),
  item("col1", item("card2")),
)
const repo = createFakeRepo({ nodes })

// =============================================================================
// Path (pure arithmetic)
// =============================================================================

describe("Path", () => {
  describe("parent", () => {
    it("returns parent of a deep path", () => {
      expect(Path.parent([2, 5, 0])).toEqual([2, 5])
    })

    it("returns empty for single-level path", () => {
      expect(Path.parent([3])).toEqual([])
    })

    it("returns empty for empty path", () => {
      expect(Path.parent([])).toEqual([])
    })
  })

  describe("next", () => {
    it("increments last index", () => {
      expect(Path.next([2, 5])).toEqual([2, 6])
    })

    it("works on single-level path", () => {
      expect(Path.next([0])).toEqual([1])
    })

    it("returns empty for empty path", () => {
      expect(Path.next([])).toEqual([])
    })
  })

  describe("previous", () => {
    it("decrements last index", () => {
      expect(Path.previous([2, 5])).toEqual([2, 4])
    })

    it("can go to zero", () => {
      expect(Path.previous([1])).toEqual([0])
    })

    it("can go negative", () => {
      expect(Path.previous([0])).toEqual([-1])
    })

    it("returns empty for empty path", () => {
      expect(Path.previous([])).toEqual([])
    })
  })

  describe("ancestors", () => {
    it("returns all prefixes root-down", () => {
      expect(Path.ancestors([2, 5, 0])).toEqual([[2], [2, 5], [2, 5, 0]])
    })

    it("returns single prefix for depth-1", () => {
      expect(Path.ancestors([3])).toEqual([[3]])
    })

    it("returns empty for empty path", () => {
      expect(Path.ancestors([])).toEqual([])
    })
  })

  describe("compare", () => {
    it("returns 0 for equal paths", () => {
      expect(Path.compare([1, 2], [1, 2])).toBe(0)
    })

    it("returns -1 when a < b", () => {
      expect(Path.compare([1, 2], [1, 3])).toBe(-1)
    })

    it("returns 1 when a > b", () => {
      expect(Path.compare([1, 3], [1, 2])).toBe(1)
    })

    it("shorter path < longer path with same prefix", () => {
      expect(Path.compare([1], [1, 0])).toBe(-1)
    })

    it("longer path > shorter path with same prefix", () => {
      expect(Path.compare([1, 0], [1])).toBe(1)
    })

    it("compares empty paths as equal", () => {
      expect(Path.compare([], [])).toBe(0)
    })

    it("empty < non-empty", () => {
      expect(Path.compare([], [0])).toBe(-1)
    })
  })

  describe("isAncestor", () => {
    it("returns true for strict prefix", () => {
      expect(Path.isAncestor([1], [1, 2])).toBe(true)
    })

    it("returns true for deeper ancestry", () => {
      expect(Path.isAncestor([1, 2], [1, 2, 3])).toBe(true)
    })

    it("returns false for equal paths (not strict)", () => {
      expect(Path.isAncestor([1, 2], [1, 2])).toBe(false)
    })

    it("returns false when a is longer than b", () => {
      expect(Path.isAncestor([1, 2, 3], [1, 2])).toBe(false)
    })

    it("returns false when prefix differs", () => {
      expect(Path.isAncestor([2], [1, 2])).toBe(false)
    })

    it("empty is ancestor of everything", () => {
      expect(Path.isAncestor([], [0])).toBe(true)
    })

    it("empty is not ancestor of empty", () => {
      expect(Path.isAncestor([], [])).toBe(false)
    })
  })

  describe("depth", () => {
    it("returns 0 for empty path", () => {
      expect(Path.depth([])).toBe(0)
    })

    it("returns length of path", () => {
      expect(Path.depth([2, 5, 0])).toBe(3)
    })
  })

  describe("equals", () => {
    it("returns true for identical paths", () => {
      expect(Path.equals([1, 2], [1, 2])).toBe(true)
    })

    it("returns false for different lengths", () => {
      expect(Path.equals([1], [1, 2])).toBe(false)
    })

    it("returns false for different values", () => {
      expect(Path.equals([1, 2], [1, 3])).toBe(false)
    })

    it("returns true for two empty paths", () => {
      expect(Path.equals([], [])).toBe(true)
    })
  })
})

// =============================================================================
// NodePath (repo-aware)
// =============================================================================

describe("NodePath", () => {
  describe("pathOf", () => {
    it("returns [0] for first child of root", () => {
      expect(NodePath.pathOf(repo, "root", "col0")).toEqual([0])
    })

    it("returns [1] for second child of root", () => {
      expect(NodePath.pathOf(repo, "root", "col1")).toEqual([1])
    })

    it("returns [0, 0] for first grandchild", () => {
      expect(NodePath.pathOf(repo, "root", "card0")).toEqual([0, 0])
    })

    it("returns [0, 1] for second grandchild", () => {
      expect(NodePath.pathOf(repo, "root", "card1")).toEqual([0, 1])
    })

    it("returns deep path for nested node", () => {
      expect(NodePath.pathOf(repo, "root", "block0")).toEqual([0, 1, 0])
    })

    it("returns [0, 1, 1] for block1", () => {
      expect(NodePath.pathOf(repo, "root", "block1")).toEqual([0, 1, 1])
    })

    it("returns [1, 0] for card2 under col1", () => {
      expect(NodePath.pathOf(repo, "root", "card2")).toEqual([1, 0])
    })

    it("returns null for unknown nodeId", () => {
      expect(NodePath.pathOf(repo, "root", "nonexistent")).toBeNull()
    })

    it("returns null if node is not under the given root", () => {
      // col0 is under "root", not under "col1"
      expect(NodePath.pathOf(repo, "col1", "col0")).toBeNull()
    })
  })

  describe("nodeAt", () => {
    it("returns first child at [0]", () => {
      const node = NodePath.nodeAt(repo, "root", [0])
      expect(node?.id).toBe("col0")
    })

    it("returns second child at [1]", () => {
      const node = NodePath.nodeAt(repo, "root", [1])
      expect(node?.id).toBe("col1")
    })

    it("returns grandchild at [0, 0]", () => {
      const node = NodePath.nodeAt(repo, "root", [0, 0])
      expect(node?.id).toBe("card0")
    })

    it("returns deep node at [0, 1, 1]", () => {
      const node = NodePath.nodeAt(repo, "root", [0, 1, 1])
      expect(node?.id).toBe("block1")
    })

    it("returns null for out-of-bounds index", () => {
      expect(NodePath.nodeAt(repo, "root", [5])).toBeNull()
    })

    it("returns null for negative index", () => {
      expect(NodePath.nodeAt(repo, "root", [-1])).toBeNull()
    })

    it("returns null for invalid deep path", () => {
      expect(NodePath.nodeAt(repo, "root", [0, 0, 0])).toBeNull()
    })

    it("returns null for empty path", () => {
      // Empty path means "root level" — no node selected
      expect(NodePath.nodeAt(repo, "root", [])).toBeNull()
    })
  })

  describe("siblings", () => {
    it("returns root children for empty path", () => {
      const sibs = NodePath.siblings(repo, "root", [])
      expect(sibs.map((n) => n.id)).toEqual(["col0", "col1"])
    })

    it("returns siblings of a column", () => {
      // col0 is at [0], its siblings are all children of root
      const sibs = NodePath.siblings(repo, "root", [0])
      expect(sibs.map((n) => n.id)).toEqual(["col0", "col1"])
    })

    it("returns siblings of a card", () => {
      // card0 is at [0, 0], siblings are children of col0
      const sibs = NodePath.siblings(repo, "root", [0, 0])
      expect(sibs.map((n) => n.id)).toEqual(["card0", "card1"])
    })

    it("returns siblings of a deep node", () => {
      // block0 is at [0, 1, 0], siblings are children of card1
      const sibs = NodePath.siblings(repo, "root", [0, 1, 0])
      expect(sibs.map((n) => n.id)).toEqual(["block0", "block1"])
    })

    it("returns single-element for only child", () => {
      // card2 is at [1, 0], only child of col1
      const sibs = NodePath.siblings(repo, "root", [1, 0])
      expect(sibs.map((n) => n.id)).toEqual(["card2"])
    })
  })

  describe("roundtrip: pathOf -> nodeAt", () => {
    for (const id of ["col0", "col1", "card0", "card1", "card2", "block0", "block1"]) {
      it(`roundtrips for ${id}`, () => {
        const path = NodePath.pathOf(repo, "root", id)
        expect(path).not.toBeNull()
        const node = NodePath.nodeAt(repo, "root", path!)
        expect(node?.id).toBe(id)
      })
    }
  })
})
