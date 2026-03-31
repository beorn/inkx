import { describe, it, expect } from "vitest"
import { createNodeCache } from "../node-cache.ts"
import type { KNode } from "@km/core"

function makeNode(overrides: Partial<KNode> & { id: string; parent_id: string | null }): KNode {
  return {
    type: "p",
    content: "",
    parent_idx: 0,
    created_at: 0,
    updated_at: 0,
    version: "1",
    data: {},
    ...overrides,
  } as KNode
}

describe("NodeCache", () => {
  const nodes = [
    makeNode({ id: "root", parent_id: ".", type: "h", content: "Root", parent_idx: 0 }),
    makeNode({ id: "a", parent_id: "root", content: "A", parent_idx: 0 }),
    makeNode({ id: "b", parent_id: "root", content: "B", parent_idx: 1 }),
    makeNode({ id: "c", parent_id: "a", content: "C", parent_idx: 0 }),
    makeNode({ id: "d", parent_id: "a", content: "D", parent_idx: 1 }),
  ]

  function freshCache() {
    const cache = createNodeCache()
    cache.hydrate(nodes)
    return cache
  }

  it("hydrate populates cache", () => {
    const cache = freshCache()
    expect(cache.getAllNodes()).toHaveLength(5)
  })

  it("getNode returns node by ID", () => {
    const cache = freshCache()
    expect(cache.getNode("a")?.content).toBe("A")
    expect(cache.getNode("missing")).toBeNull()
  })

  it("getChildren returns sorted children", () => {
    const cache = freshCache()
    const kids = cache.getChildren("root")
    expect(kids.map((n) => n.id)).toEqual(["a", "b"])
  })

  it("getChildren(null) maps to '.' for root nodes", () => {
    const cache = freshCache()
    const roots = cache.getChildren(null)
    expect(roots.map((n) => n.id)).toEqual(["root"])
  })

  it("getSubtree returns BFS descendants", () => {
    const cache = freshCache()
    const sub = cache.getSubtree("a")
    expect(sub.map((n) => n.id)).toEqual(["a", "c", "d"])
  })

  it("getAncestors returns root-to-parent chain", () => {
    const cache = freshCache()
    const anc = cache.getAncestors("c")
    expect(anc.map((n) => n.id)).toEqual(["root", "a"])
  })

  it("getChildCounts returns Map with counts", () => {
    const cache = freshCache()
    const counts = cache.getChildCounts(["root", "a", "b"])
    expect(counts.get("root")).toBe(2)
    expect(counts.get("a")).toBe(2)
    expect(counts.get("b")).toBe(0)
  })

  it("getNodesBatch returns Map of found nodes", () => {
    const cache = freshCache()
    const batch = cache.getNodesBatch(["a", "c", "missing"])
    expect(batch.size).toBe(2)
    expect(batch.get("a")?.content).toBe("A")
  })

  it("getRepoRootNode finds root folder node", () => {
    const rootFolder = makeNode({
      id: "repo-root",
      parent_id: null,
      type: "h",
      content: "Repo",
    })
    ;(rootFolder as unknown as Record<string, unknown>).fstype = "folder"
    const cache = createNodeCache()
    cache.hydrate([...nodes, rootFolder])
    expect(cache.getRepoRootNode()?.id).toBe("repo-root")
  })

  it("re-hydrate replaces all data", () => {
    const cache = freshCache()
    cache.hydrate([makeNode({ id: "x", parent_id: ".", content: "X" })])
    expect(cache.getAllNodes()).toHaveLength(1)
    expect(cache.getNode("a")).toBeNull()
  })

  describe("applyDelta", () => {
    it("adds new nodes", () => {
      const cache = freshCache()
      const newNode = makeNode({ id: "e", parent_id: "root", content: "E", parent_idx: 2 })
      cache.applyDelta([newNode], [])
      expect(cache.getNode("e")?.content).toBe("E")
      expect(cache.getChildren("root").map((n) => n.id)).toEqual(["a", "b", "e"])
    })

    it("updates existing nodes", () => {
      const cache = freshCache()
      const updated = makeNode({ id: "a", parent_id: "root", content: "A-updated", parent_idx: 0 })
      cache.applyDelta([updated], [])
      expect(cache.getNode("a")?.content).toBe("A-updated")
    })

    it("removes nodes", () => {
      const cache = freshCache()
      cache.applyDelta([], ["b"])
      expect(cache.getNode("b")).toBeNull()
      expect(cache.getChildren("root").map((n) => n.id)).toEqual(["a"])
    })

    it("handles parent changes", () => {
      const cache = freshCache()
      const moved = makeNode({ id: "c", parent_id: "root", content: "C", parent_idx: 2 })
      cache.applyDelta([moved], [])
      expect(cache.getChildren("root").map((n) => n.id)).toEqual(["a", "b", "c"])
      expect(cache.getChildren("a").map((n) => n.id)).toEqual(["d"])
    })
  })
})
