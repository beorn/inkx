/**
 * Tree Walk Tests — walkTree generator and getVisibleBlocks.
 *
 * Uses createTestRepo for an in-memory Repo that satisfies TreeMutator.
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { walkTree, getVisibleBlocks } from "../src/walk.ts"

// =============================================================================
// Helpers
// =============================================================================

/** Create a tree shaped like:
 *
 *   root
 *   ├── A (parent_idx: 1)
 *   │   ├── A1 (parent_idx: 1)
 *   │   └── A2 (parent_idx: 2)
 *   └── B (parent_idx: 2)
 *       └── B1 (parent_idx: 1)
 *           └── B1a (parent_idx: 1)
 */
function setupTree() {
  const repo = createTestRepo()

  const rootId = repo.addNode(null, {
    type: "h",
    item: true,
    name: "root",
  })

  const aId = repo.addNode(rootId, {
    type: "h",
    item: true,
    name: "A",
    parent_idx: 1,
  })

  const a1Id = repo.addNode(aId, {
    type: "p",
    item: true,
    content: "A1",
    parent_idx: 1,
  })

  const a2Id = repo.addNode(aId, {
    type: "p",
    item: true,
    content: "A2",
    parent_idx: 2,
  })

  const bId = repo.addNode(rootId, {
    type: "h",
    item: true,
    name: "B",
    parent_idx: 2,
  })

  const b1Id = repo.addNode(bId, {
    type: "p",
    item: true,
    content: "B1",
    parent_idx: 1,
  })

  const b1aId = repo.addNode(b1Id, {
    type: "p",
    content: "B1a",
    parent_idx: 1,
  })

  return { repo, rootId, aId, a1Id, a2Id, bId, b1Id, b1aId }
}

// =============================================================================
// walkTree
// =============================================================================

describe("walkTree", () => {
  test("yields nodes in DFS pre-order", () => {
    const { repo, rootId, aId, a1Id, a2Id, bId, b1Id, b1aId } = setupTree()

    const ids = [...walkTree(repo, rootId)].map((e) => e.node.id)
    expect(ids).toEqual([rootId, aId, a1Id, a2Id, bId, b1Id, b1aId])
  })

  test("yields correct depth for each node", () => {
    const { repo, rootId } = setupTree()

    const depths = [...walkTree(repo, rootId)].map((e) => ({ name: e.node.name ?? e.node.content, depth: e.depth }))
    expect(depths).toEqual([
      { name: "root", depth: 0 },
      { name: "A", depth: 1 },
      { name: "A1", depth: 2 },
      { name: "A2", depth: 2 },
      { name: "B", depth: 1 },
      { name: "B1", depth: 2 },
      { name: "B1a", depth: 3 },
    ])
  })

  test("yields correct parentId for each node", () => {
    const { repo, rootId, aId, bId, b1Id } = setupTree()

    const entries = [...walkTree(repo, rootId)]
    const parentIds = entries.map((e) => ({ name: e.node.name ?? e.node.content, parentId: e.parentId }))

    // Root's parentId is its actual parent_id (repo uses "." for root parent)
    expect(parentIds[0]).toEqual({ name: "root", parentId: entries[0]!.node.parent_id })
    // A's parentId is root
    expect(parentIds[1]).toEqual({ name: "A", parentId: rootId })
    // A1's parentId is A
    expect(parentIds[2]).toEqual({ name: "A1", parentId: aId })
    // B1a's parentId is B1
    expect(parentIds[6]).toEqual({ name: "B1a", parentId: b1Id })
  })

  test("filter skips node and its entire subtree", () => {
    const { repo, rootId, aId, bId } = setupTree()

    // Skip node A — should skip A, A1, A2
    const ids = [...walkTree(repo, rootId, { filter: (n) => n.id !== aId })].map((e) => e.node.id)
    expect(ids).toEqual([rootId, bId, expect.any(String), expect.any(String)])
    expect(ids).not.toContain(aId)
  })

  test("filter skips root if root fails filter", () => {
    const { repo, rootId } = setupTree()

    const ids = [...walkTree(repo, rootId, { filter: () => false })]
    expect(ids).toEqual([])
  })

  test("maxDepth limits traversal depth", () => {
    const { repo, rootId, aId, bId } = setupTree()

    // maxDepth 1 = root + direct children only
    const entries = [...walkTree(repo, rootId, { maxDepth: 1 })]
    const ids = entries.map((e) => e.node.id)
    expect(ids).toEqual([rootId, aId, bId])
  })

  test("maxDepth 0 yields only root", () => {
    const { repo, rootId } = setupTree()

    const entries = [...walkTree(repo, rootId, { maxDepth: 0 })]
    expect(entries).toHaveLength(1)
    expect(entries[0]!.node.id).toBe(rootId)
  })

  test("maxDepth and filter compose correctly", () => {
    const { repo, rootId, bId } = setupTree()

    // maxDepth 2, skip A subtree
    const entries = [...walkTree(repo, rootId, { maxDepth: 2, filter: (n) => n.name !== "A" })]
    const names = entries.map((e) => e.node.name ?? e.node.content)
    expect(names).toEqual(["root", "B", "B1"])
  })

  test("nonexistent rootId yields nothing", () => {
    const { repo } = setupTree()

    const entries = [...walkTree(repo, "nonexistent")]
    expect(entries).toEqual([])
  })

  test("leaf node yields just itself", () => {
    const { repo, a1Id } = setupTree()

    const entries = [...walkTree(repo, a1Id)]
    expect(entries).toHaveLength(1)
    expect(entries[0]!.node.id).toBe(a1Id)
    expect(entries[0]!.depth).toBe(0)
  })
})

// =============================================================================
// getVisibleBlocks
// =============================================================================

describe("getVisibleBlocks", () => {
  test("returns flat list in document order", () => {
    const { repo, rootId, aId, a1Id, a2Id, bId, b1Id, b1aId } = setupTree()

    const blocks = getVisibleBlocks(repo, rootId)
    const ids = blocks.map((n) => n.id)
    expect(ids).toEqual([rootId, aId, a1Id, a2Id, bId, b1Id, b1aId])
  })

  test("isVisible filter skips hidden nodes and their descendants", () => {
    const { repo, rootId, aId, a1Id, a2Id, bId, b1Id, b1aId } = setupTree()

    // Hide B — should skip B, B1, B1a
    const blocks = getVisibleBlocks(repo, rootId, { isVisible: (id) => id !== bId })
    const ids = blocks.map((n) => n.id)
    expect(ids).toEqual([rootId, aId, a1Id, a2Id])
  })

  test("isVisible can hide individual leaf nodes", () => {
    const { repo, rootId, aId, a2Id, bId, b1Id, b1aId, a1Id } = setupTree()

    // Hide A1 only (leaf) — siblings and other branches remain
    const blocks = getVisibleBlocks(repo, rootId, { isVisible: (id) => id !== a1Id })
    const ids = blocks.map((n) => n.id)
    expect(ids).toEqual([rootId, aId, a2Id, bId, b1Id, b1aId])
  })

  test("empty tree (nonexistent column) returns empty array", () => {
    const { repo } = setupTree()

    const blocks = getVisibleBlocks(repo, "nonexistent")
    expect(blocks).toEqual([])
  })

  test("without isVisible returns all nodes", () => {
    const { repo, rootId } = setupTree()

    const withFilter = getVisibleBlocks(repo, rootId, {})
    const withoutOpts = getVisibleBlocks(repo, rootId)
    expect(withFilter.map((n) => n.id)).toEqual(withoutOpts.map((n) => n.id))
  })
})
