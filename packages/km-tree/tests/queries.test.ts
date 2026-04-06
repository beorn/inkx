/**
 * Tree Layer Queries Tests
 *
 * Tests for tree navigation and query functions.
 */

import { describe, it, expect } from "vitest"
import {
  getNodeAtPath,
  getSiblingCount,
  getCurrentIndex,
  collectAllNodeIds,
  getSiblings,
  getParentPath,
  getFirstChildPath,
  countVisibleNodes,
  findPathByNodeId,
} from "../src/queries.ts"
import type { TNode } from "../src/types.ts"

// Helper to create test nodes
function createNode(id: string, children: TNode[] = []): TNode {
  return {
    id,
    type: "h",
    item: {},
    fstype: "mdsection",
    parent_id: null,
    parent_idx: 0,
    symlink_to: null,
    title: id,
    children,
    childCount: children.length,
    childrenLoaded: true,
    isTask: false,
    depth: 0,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "",
  }
}

// Test tree structure:
// - Column A (col-a)
//   - Card 1 (card-1)
//     - Item 1.1 (item-1-1)
//     - Item 1.2 (item-1-2)
//   - Card 2 (card-2)
// - Column B (col-b)
//   - Card 3 (card-3)
const testNodes: TNode[] = [
  createNode("col-a", [createNode("card-1", [createNode("item-1-1"), createNode("item-1-2")]), createNode("card-2")]),
  createNode("col-b", [createNode("card-3")]),
]

describe("getNodeAtPath", () => {
  it("returns null for empty path", () => {
    expect(getNodeAtPath(testNodes, [])).toBeNull()
  })

  it("gets top-level node", () => {
    const node = getNodeAtPath(testNodes, [0])
    expect(node?.id).toBe("col-a")
  })

  it("gets nested node", () => {
    const node = getNodeAtPath(testNodes, [0, 0])
    expect(node?.id).toBe("card-1")
  })

  it("gets deeply nested node", () => {
    const node = getNodeAtPath(testNodes, [0, 0, 1])
    expect(node?.id).toBe("item-1-2")
  })

  it("returns null for invalid path", () => {
    expect(getNodeAtPath(testNodes, [10])).toBeNull()
    expect(getNodeAtPath(testNodes, [0, 10])).toBeNull()
  })

  it("works with second column", () => {
    const node = getNodeAtPath(testNodes, [1, 0])
    expect(node?.id).toBe("card-3")
  })
})

describe("getSiblingCount", () => {
  it("returns 0 for empty path", () => {
    expect(getSiblingCount(testNodes, [])).toBe(0)
  })

  it("returns top-level count for depth-1 path", () => {
    expect(getSiblingCount(testNodes, [0])).toBe(2) // col-a, col-b
  })

  it("returns children count for nested path", () => {
    expect(getSiblingCount(testNodes, [0, 0])).toBe(2) // card-1, card-2
  })

  it("returns deeply nested sibling count", () => {
    expect(getSiblingCount(testNodes, [0, 0, 0])).toBe(2) // item-1-1, item-1-2
  })
})

describe("getCurrentIndex", () => {
  it("returns 0 for empty path", () => {
    expect(getCurrentIndex([])).toBe(0)
  })

  it("returns last element of path", () => {
    expect(getCurrentIndex([0])).toBe(0)
    expect(getCurrentIndex([1])).toBe(1)
    expect(getCurrentIndex([0, 1])).toBe(1)
    expect(getCurrentIndex([0, 0, 1])).toBe(1)
  })
})

describe("collectAllNodeIds", () => {
  it("returns empty array for empty nodes", () => {
    expect(collectAllNodeIds([])).toEqual([])
  })

  it("collects all node IDs recursively", () => {
    const ids = collectAllNodeIds(testNodes)
    expect(ids).toContain("col-a")
    expect(ids).toContain("col-b")
    expect(ids).toContain("card-1")
    expect(ids).toContain("card-2")
    expect(ids).toContain("card-3")
    expect(ids).toContain("item-1-1")
    expect(ids).toContain("item-1-2")
    expect(ids).toHaveLength(7)
  })

  it("maintains tree order", () => {
    const ids = collectAllNodeIds(testNodes)
    // col-a and its children should come before col-b
    expect(ids.indexOf("col-a")).toBeLessThan(ids.indexOf("col-b"))
    expect(ids.indexOf("card-1")).toBeLessThan(ids.indexOf("card-2"))
  })
})

describe("getSiblings", () => {
  it("returns empty array for empty path", () => {
    expect(getSiblings(testNodes, [])).toEqual([])
  })

  it("returns top-level nodes for depth-1 path", () => {
    const siblings = getSiblings(testNodes, [0])
    expect(siblings).toHaveLength(2)
    expect(siblings[0]?.id).toBe("col-a")
    expect(siblings[1]?.id).toBe("col-b")
  })

  it("returns siblings for nested path", () => {
    const siblings = getSiblings(testNodes, [0, 0])
    expect(siblings).toHaveLength(2)
    expect(siblings[0]?.id).toBe("card-1")
    expect(siblings[1]?.id).toBe("card-2")
  })

  it("returns deeply nested siblings", () => {
    const siblings = getSiblings(testNodes, [0, 0, 0])
    expect(siblings).toHaveLength(2)
    expect(siblings[0]?.id).toBe("item-1-1")
    expect(siblings[1]?.id).toBe("item-1-2")
  })
})

describe("getParentPath", () => {
  it("returns null for single-element path", () => {
    expect(getParentPath([0])).toBeNull()
  })

  it("returns null for empty path", () => {
    expect(getParentPath([])).toBeNull()
  })

  it("returns parent path for nested path", () => {
    expect(getParentPath([0, 1])).toEqual([0])
    expect(getParentPath([0, 0, 1])).toEqual([0, 0])
  })
})

describe("getFirstChildPath", () => {
  it("returns null for node without children", () => {
    expect(getFirstChildPath(testNodes, [0, 1])).toBeNull() // card-2 has no children
  })

  it("returns first child path for node with children", () => {
    expect(getFirstChildPath(testNodes, [0])).toEqual([0, 0]) // col-a -> card-1
    expect(getFirstChildPath(testNodes, [0, 0])).toEqual([0, 0, 0]) // card-1 -> item-1-1
  })

  it("returns null for invalid path", () => {
    expect(getFirstChildPath(testNodes, [10])).toBeNull()
  })
})

describe("countVisibleNodes", () => {
  it("counts all nodes when nothing is folded", () => {
    const count = countVisibleNodes(testNodes, new Map())
    expect(count).toBe(7) // All 7 nodes visible
  })

  it("excludes children of folded nodes", () => {
    const foldDepths = new Map([["col-a", 0]])
    const count = countVisibleNodes(testNodes, foldDepths)
    // col-a (visible) + col-b + card-3 = 3 (col-a's children hidden)
    expect(count).toBe(3)
  })

  it("handles deeply folded nodes", () => {
    const foldDepths = new Map([["card-1", 0]])
    const count = countVisibleNodes(testNodes, foldDepths)
    // All except item-1-1 and item-1-2 = 5
    expect(count).toBe(5)
  })

  it("returns 0 for empty nodes", () => {
    expect(countVisibleNodes([], new Map())).toBe(0)
  })
})

describe("findPathByNodeId", () => {
  it("finds top-level node", () => {
    expect(findPathByNodeId(testNodes, "col-a")).toEqual([0])
    expect(findPathByNodeId(testNodes, "col-b")).toEqual([1])
  })

  it("finds nested node", () => {
    expect(findPathByNodeId(testNodes, "card-1")).toEqual([0, 0])
    expect(findPathByNodeId(testNodes, "card-2")).toEqual([0, 1])
    expect(findPathByNodeId(testNodes, "card-3")).toEqual([1, 0])
  })

  it("finds deeply nested node", () => {
    expect(findPathByNodeId(testNodes, "item-1-1")).toEqual([0, 0, 0])
    expect(findPathByNodeId(testNodes, "item-1-2")).toEqual([0, 0, 1])
  })

  it("returns null for non-existent node", () => {
    expect(findPathByNodeId(testNodes, "non-existent")).toBeNull()
  })

  it("returns null for empty nodes", () => {
    expect(findPathByNodeId([], "any")).toBeNull()
  })
})
