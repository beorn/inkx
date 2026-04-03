import { describe, expect, it } from "vitest"
import { createSelectionEngine, type SelectionEngine } from "../src/selection-engine.ts"
import type { TreeReader } from "@km/tree"

// =============================================================================
// Fake repo builder
// =============================================================================

interface FakeNode {
  id: string
  parent_id: string | null
  parent_idx: number
}

function createFakeRepo(nodes: FakeNode[]): TreeReader {
  const byId = new Map<string, FakeNode>()
  for (const n of nodes) byId.set(n.id, n)

  return {
    getNode(id) {
      return byId.get(id) ?? null
    },
    getChildren(parentId) {
      return nodes.filter((n) => n.parent_id === parentId).sort((a, b) => a.parent_idx - b.parent_idx)
    },
  }
}

// =============================================================================
// Tree fixture:
//
//   root
//   ├── A (idx 0)
//   │   ├── A1 (idx 0)
//   │   └── A2 (idx 1)
//   ├── B (idx 1)
//   │   ├── B1 (idx 0)
//   │   │   └── B1a (idx 0)
//   │   └── B2 (idx 1)
//   └── C (idx 2)
// =============================================================================

const NODES: FakeNode[] = [
  { id: "root", parent_id: null, parent_idx: 0 },
  { id: "A", parent_id: "root", parent_idx: 0 },
  { id: "A1", parent_id: "A", parent_idx: 0 },
  { id: "A2", parent_id: "A", parent_idx: 1 },
  { id: "B", parent_id: "root", parent_idx: 1 },
  { id: "B1", parent_id: "B", parent_idx: 0 },
  { id: "B1a", parent_id: "B1", parent_idx: 0 },
  { id: "B2", parent_id: "B", parent_idx: 1 },
  { id: "C", parent_id: "root", parent_idx: 2 },
]

function setup(): SelectionEngine {
  return createSelectionEngine(createFakeRepo(NODES))
}

// =============================================================================
// expandWithDescendants
// =============================================================================

describe("expandWithDescendants", () => {
  it("returns empty set for empty input", () => {
    const engine = setup()
    const result = engine.expandWithDescendants(new Set())
    expect(result.size).toBe(0)
  })

  it("returns the node itself when it has no children", () => {
    const engine = setup()
    const result = engine.expandWithDescendants(new Set(["C"]))
    expect(result).toEqual(new Set(["C"]))
  })

  it("expands a node with direct children", () => {
    const engine = setup()
    const result = engine.expandWithDescendants(new Set(["A"]))
    expect(result).toEqual(new Set(["A", "A1", "A2"]))
  })

  it("expands deep tree", () => {
    const engine = setup()
    const result = engine.expandWithDescendants(new Set(["B"]))
    expect(result).toEqual(new Set(["B", "B1", "B1a", "B2"]))
  })

  it("handles multiple input nodes", () => {
    const engine = setup()
    const result = engine.expandWithDescendants(new Set(["A", "C"]))
    expect(result).toEqual(new Set(["A", "A1", "A2", "C"]))
  })
})

// =============================================================================
// removeNesting
// =============================================================================

describe("removeNesting", () => {
  it("returns empty set for empty input", () => {
    const engine = setup()
    expect(engine.removeNesting(new Set())).toEqual(new Set())
  })

  it("returns single node unchanged", () => {
    const engine = setup()
    expect(engine.removeNesting(new Set(["A"]))).toEqual(new Set(["A"]))
  })

  it("removes child when parent is in set", () => {
    const engine = setup()
    const result = engine.removeNesting(new Set(["A", "A1"]))
    expect(result).toEqual(new Set(["A"]))
  })

  it("removes grandchild when grandparent is in set", () => {
    const engine = setup()
    const result = engine.removeNesting(new Set(["B", "B1a"]))
    expect(result).toEqual(new Set(["B"]))
  })

  it("keeps non-overlapping nodes", () => {
    const engine = setup()
    const result = engine.removeNesting(new Set(["A", "B", "C"]))
    expect(result).toEqual(new Set(["A", "B", "C"]))
  })

  it("removes multiple nested children", () => {
    const engine = setup()
    const result = engine.removeNesting(new Set(["A", "A1", "A2"]))
    expect(result).toEqual(new Set(["A"]))
  })

  it("removes deeper nesting (parent+child+grandchild)", () => {
    const engine = setup()
    const result = engine.removeNesting(new Set(["B", "B1", "B1a"]))
    expect(result).toEqual(new Set(["B"]))
  })
})

// =============================================================================
// getRange
// =============================================================================

describe("getRange", () => {
  it("returns single node for same anchor and focus", () => {
    const engine = setup()
    expect(engine.getRange("A", "A")).toEqual(["A"])
  })

  it("returns adjacent siblings in order", () => {
    const engine = setup()
    const result = engine.getRange("A", "B")
    // DFS from root: root, A, A1, A2, B, B1, B1a, B2, C
    // Range A..B = [A, A1, A2, B]
    expect(result).toEqual(["A", "A1", "A2", "B"])
  })

  it("works in reverse direction (focus before anchor in tree)", () => {
    const engine = setup()
    const result = engine.getRange("B", "A")
    expect(result).toEqual(["A", "A1", "A2", "B"])
  })

  it("range across full tree", () => {
    const engine = setup()
    const result = engine.getRange("A", "C")
    expect(result).toEqual(["A", "A1", "A2", "B", "B1", "B1a", "B2", "C"])
  })

  it("range within subtree (cross-level)", () => {
    const engine = setup()
    const result = engine.getRange("B1", "B2")
    expect(result).toEqual(["B1", "B1a", "B2"])
  })

  it("range between leaf nodes in same subtree", () => {
    const engine = setup()
    const result = engine.getRange("A1", "A2")
    expect(result).toEqual(["A1", "A2"])
  })

  it("range between leaf nodes across subtrees", () => {
    const engine = setup()
    const result = engine.getRange("A2", "B1")
    expect(result).toEqual(["A2", "B", "B1"])
  })
})

// =============================================================================
// getSiblings
// =============================================================================

describe("getSiblings", () => {
  it("returns empty for root node (no parent)", () => {
    const engine = setup()
    expect(engine.getSiblings("root")).toEqual([])
  })

  it("returns children of parent (root children)", () => {
    const engine = setup()
    const result = engine.getSiblings("A")
    expect(result.map((s) => s.id)).toEqual(["A", "B", "C"])
  })

  it("returns children of parent (nested)", () => {
    const engine = setup()
    const result = engine.getSiblings("B1")
    expect(result.map((s) => s.id)).toEqual(["B1", "B2"])
  })

  it("returns empty for nonexistent node", () => {
    const engine = setup()
    expect(engine.getSiblings("nonexistent")).toEqual([])
  })

  it("returns single-child list for only child", () => {
    const engine = setup()
    const result = engine.getSiblings("B1a")
    expect(result.map((s) => s.id)).toEqual(["B1a"])
  })
})
