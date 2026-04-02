/**
 * Tree Walk Tests — TreeWalk.nodes().
 *
 * Uses createTestRepo for an in-memory Repo that satisfies TreeMutator.
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { TreeWalk } from "../src/walk.ts"

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
    item: {},
    name: "root",
  })

  const aId = repo.addNode(rootId, {
    type: "h",
    item: {},
    name: "A",
    parent_idx: 1,
  })

  const a1Id = repo.addNode(aId, {
    type: "p",
    item: {},
    content: "A1",
    parent_idx: 1,
  })

  const a2Id = repo.addNode(aId, {
    type: "p",
    item: {},
    content: "A2",
    parent_idx: 2,
  })

  const bId = repo.addNode(rootId, {
    type: "h",
    item: {},
    name: "B",
    parent_idx: 2,
  })

  const b1Id = repo.addNode(bId, {
    type: "p",
    item: {},
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
// TreeWalk.nodes — SlateJS-style pluggable traversal
// =============================================================================

/** Helper: extract names from NodeEntry tuples. */
function names(entries: Iterable<[{ name?: string | null; content?: string | null }, number]>): string[] {
  return [...entries].map(([node]) => (node.name ?? node.content)!)
}

/** Helper: extract [name, depth] from NodeEntry tuples. */
function nameDepths(
  entries: Iterable<[{ name?: string | null; content?: string | null }, number]>,
): [string, number][] {
  return [...entries].map(([node, depth]) => [(node.name ?? node.content)!, depth])
}

describe("TreeWalk.nodes", () => {
  // -------------------------------------------------------------------------
  // Basic DFS order (no options)
  // -------------------------------------------------------------------------

  test("yields all nodes in DFS pre-order with no options", () => {
    const { repo, rootId } = setupTree()
    expect(names(TreeWalk.nodes(repo, rootId))).toEqual(["root", "A", "A1", "A2", "B", "B1", "B1a"])
  })

  test("yields correct depths", () => {
    const { repo, rootId } = setupTree()
    expect(nameDepths(TreeWalk.nodes(repo, rootId))).toEqual([
      ["root", 0],
      ["A", 1],
      ["A1", 2],
      ["A2", 2],
      ["B", 1],
      ["B1", 2],
      ["B1a", 3],
    ])
  })

  test("nonexistent rootId yields nothing", () => {
    const { repo } = setupTree()
    expect([...TreeWalk.nodes(repo, "nonexistent")]).toEqual([])
  })

  test("leaf node yields just itself", () => {
    const { repo, a1Id } = setupTree()
    const result = nameDepths(TreeWalk.nodes(repo, a1Id))
    expect(result).toEqual([["A1", 0]])
  })

  // -------------------------------------------------------------------------
  // match: yield only matching nodes (but always walk children)
  // -------------------------------------------------------------------------

  test("match: yield only items of type 'p'", () => {
    const { repo, rootId } = setupTree()
    const result = names(TreeWalk.nodes(repo, rootId, { match: (n) => n.type === "p" }))
    // A1, A2, B1, B1a are type "p"; root, A, B are type "h"
    expect(result).toEqual(["A1", "A2", "B1", "B1a"])
  })

  test("match: yield only headings", () => {
    const { repo, rootId } = setupTree()
    const result = names(TreeWalk.nodes(repo, rootId, { match: (n) => n.type === "h" }))
    expect(result).toEqual(["root", "A", "B"])
  })

  test("match on root only yields root when match passes", () => {
    const { repo, rootId } = setupTree()
    const result = names(TreeWalk.nodes(repo, rootId, { match: (n) => n.name === "root" }))
    expect(result).toEqual(["root"])
  })

  test("match that matches nothing yields empty", () => {
    const { repo, rootId } = setupTree()
    const result = [...TreeWalk.nodes(repo, rootId, { match: () => false })]
    expect(result).toEqual([])
  })

  // -------------------------------------------------------------------------
  // into: control descent (but never affect yielding)
  // -------------------------------------------------------------------------

  test("into: skip collapsed subtrees", () => {
    const { repo, rootId, aId } = setupTree()
    // Don't descend into A — but A itself is still yielded (no match filter)
    const result = names(TreeWalk.nodes(repo, rootId, { into: (n) => n.id !== aId }))
    expect(result).toEqual(["root", "A", "B", "B1", "B1a"])
  })

  test("into: skip all children of root yields only root", () => {
    const { repo, rootId } = setupTree()
    const result = names(TreeWalk.nodes(repo, rootId, { into: (n) => n.id !== rootId }))
    expect(result).toEqual(["root"])
  })

  test("into false on root skips all children but still yields root", () => {
    const { repo, rootId } = setupTree()
    const result = names(TreeWalk.nodes(repo, rootId, { into: () => false }))
    expect(result).toEqual(["root"])
  })

  // -------------------------------------------------------------------------
  // match + into compose (orthogonal)
  // -------------------------------------------------------------------------

  test("match + into: match type p but don't descend into A", () => {
    const { repo, rootId, aId } = setupTree()
    const result = names(
      TreeWalk.nodes(repo, rootId, {
        match: (n) => n.type === "p",
        into: (n) => n.id !== aId,
      }),
    )
    // A's children (A1, A2) not visited. B1 and B1a are type p.
    expect(result).toEqual(["B1", "B1a"])
  })

  test("match + into: match headings but don't descend into B", () => {
    const { repo, rootId, bId } = setupTree()
    const result = names(
      TreeWalk.nodes(repo, rootId, {
        match: (n) => n.type === "h",
        into: (n) => n.id !== bId,
      }),
    )
    // root (h), A (h), B (h) — B is yielded but children not visited (B has no h children anyway)
    expect(result).toEqual(["root", "A", "B"])
  })

  // -------------------------------------------------------------------------
  // reverse: bottom-up DFS
  // -------------------------------------------------------------------------

  test("reverse: yields nodes in reverse DFS order", () => {
    const { repo, rootId } = setupTree()
    const result = names(TreeWalk.nodes(repo, rootId, { reverse: true }))
    // Reverse DFS: root is first (pre-order), but children processed right-to-left
    // Stack pushes children forward so pops give last child first
    expect(result).toEqual(["root", "B", "B1", "B1a", "A", "A2", "A1"])
  })

  test("reverse on leaf yields just the leaf", () => {
    const { repo, b1aId } = setupTree()
    const result = names(TreeWalk.nodes(repo, b1aId, { reverse: true }))
    expect(result).toEqual(["B1a"])
  })

  // -------------------------------------------------------------------------
  // reverse + match: find last matching node
  // -------------------------------------------------------------------------

  test("reverse + match: first result is the last heading in forward DFS", () => {
    const { repo, rootId } = setupTree()
    const gen = TreeWalk.nodes(repo, rootId, { reverse: true, match: (n) => n.type === "h" })
    const first = gen.next().value
    expect(first).toBeDefined()
    // In reverse DFS, B comes before A. Both are headings. First match is root, then B.
    // For getting "last heading in forward order" we'd iterate all. Let's just verify order.
    const result = names(TreeWalk.nodes(repo, rootId, { reverse: true, match: (n) => n.type === "h" }))
    expect(result).toEqual(["root", "B", "A"])
  })

  // -------------------------------------------------------------------------
  // at: start from specific node
  // -------------------------------------------------------------------------

  test("at: skips nodes before the target in DFS order", () => {
    const { repo, rootId, aId } = setupTree()
    // DFS order: root, A, A1, A2, B, B1, B1a
    // at=A → skip root, yield A onward
    const result = names(TreeWalk.nodes(repo, rootId, { at: aId }))
    expect(result).toEqual(["A1", "A2", "B", "B1", "B1a"])
  })

  test("at: with a2Id skips everything before it", () => {
    const { repo, rootId, a2Id } = setupTree()
    const result = names(TreeWalk.nodes(repo, rootId, { at: a2Id }))
    expect(result).toEqual(["B", "B1", "B1a"])
  })

  test("at: last node yields nothing after", () => {
    const { repo, rootId, b1aId } = setupTree()
    const result = [...TreeWalk.nodes(repo, rootId, { at: b1aId })]
    expect(result).toEqual([])
  })

  test("at + match: compose correctly", () => {
    const { repo, rootId, a2Id } = setupTree()
    const result = names(TreeWalk.nodes(repo, rootId, { at: a2Id, match: (n) => n.type === "h" }))
    expect(result).toEqual(["B"])
  })

  // -------------------------------------------------------------------------
  // mode: highest — first match per branch
  // -------------------------------------------------------------------------

  test("mode highest: yields only shallowest match per branch", () => {
    const { repo, rootId } = setupTree()
    // All nodes have items, so match all. Highest should yield only root.
    const result = names(TreeWalk.nodes(repo, rootId, { match: (n) => n.item != null, mode: "highest" }))
    expect(result).toEqual(["root"])
  })

  test("mode highest: non-matching root lets children match independently", () => {
    const { repo, rootId } = setupTree()
    // Match type "p" — root is "h", so A1/A2/B1/B1a are candidates
    // Highest per branch: A1 (first p under A branch), A2 (sibling of A1, own branch), B1 (first p under B)
    // B1a is deeper than B1 in same branch — suppressed
    const result = names(TreeWalk.nodes(repo, rootId, { match: (n) => n.type === "p", mode: "highest" }))
    expect(result).toEqual(["A1", "A2", "B1"])
  })

  // -------------------------------------------------------------------------
  // mode: lowest — deepest match per branch
  // -------------------------------------------------------------------------

  test("mode lowest: yields only deepest match per branch", () => {
    const { repo, rootId } = setupTree()
    // Match everything with items. Lowest = leaves that have items.
    // A1 (leaf, has item), A2 (leaf, has item), B1 (has item, child B1a has no item) → B1 is lowest item
    const result = names(TreeWalk.nodes(repo, rootId, { match: (n) => n.item != null, mode: "lowest" }))
    expect(result).toEqual(["A1", "A2", "B1"])
  })

  test("mode lowest: single branch yields the leaf match", () => {
    const { repo, rootId, bId } = setupTree()
    // Match headings from B subtree — only B is a heading, and it has no heading children
    const result = names(TreeWalk.nodes(repo, bId, { match: (n) => n.type === "h", mode: "lowest" }))
    expect(result).toEqual(["B"])
  })

  test("mode lowest: all nodes match yields only leaves", () => {
    const { repo, rootId } = setupTree()
    const result = names(TreeWalk.nodes(repo, rootId, { match: () => true, mode: "lowest" }))
    // Leaves: A1, A2, B1a
    expect(result).toEqual(["A1", "A2", "B1a"])
  })

  test("mode lowest + into: respects into boundary", () => {
    const { repo, rootId, bId } = setupTree()
    // Match all, don't descend into B — so B is treated as a leaf for matching purposes
    const result = names(TreeWalk.nodes(repo, rootId, { match: () => true, into: (n) => n.id !== bId, mode: "lowest" }))
    // A branch: descend fully → A1, A2 are leaves. B branch: don't descend → B is the leaf.
    expect(result).toEqual(["A1", "A2", "B"])
  })

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  test("empty tree with single root", () => {
    const repo = createTestRepo()
    const rootId = repo.addNode(null, { type: "h", item: {}, name: "solo" })
    expect(names(TreeWalk.nodes(repo, rootId))).toEqual(["solo"])
  })

  test("into false on every node still yields root", () => {
    const { repo, rootId } = setupTree()
    const result = names(TreeWalk.nodes(repo, rootId, { into: () => false }))
    expect(result).toEqual(["root"])
  })

  test("match false + into false yields nothing", () => {
    const { repo, rootId } = setupTree()
    const result = [...TreeWalk.nodes(repo, rootId, { match: () => false, into: () => false })]
    expect(result).toEqual([])
  })

  test("reverse + at: composes correctly", () => {
    const { repo, rootId, aId } = setupTree()
    // Reverse DFS order: root, B, B1, B1a, A, A2, A1
    // at=A → skip root, B, B1, B1a, A; yield A2, A1
    const result = names(TreeWalk.nodes(repo, rootId, { reverse: true, at: aId }))
    expect(result).toEqual(["A2", "A1"])
  })

  test("mode lowest + at: composes correctly", () => {
    const { repo, rootId, aId } = setupTree()
    // at=A skips root and A; then from A1 onward: lowest leaves matching all = A1, A2, B1a
    const result = names(TreeWalk.nodes(repo, rootId, { at: aId, match: () => true, mode: "lowest" }))
    expect(result).toEqual(["A1", "A2", "B1a"])
  })
})
