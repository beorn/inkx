/**
 * Outliner Tests — withOutliner composition pattern
 *
 * Tests each operation in each context from docs/design/outliner-spec.md.
 * Uses createTestRepo for an in-memory Repo that satisfies TreeMutator.
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { KNode } from "@km/core"
import { withOutliner, createOutlinerContext, type OutlinerPolicy } from "../src/outliner.ts"

// =============================================================================
// Helpers
// =============================================================================

/** Create a flat list of items under a parent section. */
function setupFlatList() {
  const repo = createTestRepo()
  const parentId = repo.addNode(null, {
    type: "h",
    item: {},
    fstype: "mdsection",
    name: "Parent",
    content: "Parent",
  })
  const aId = repo.addNode(parentId, {
    type: "p",
    item: { list: "-" },
    content: "Alpha",
    parent_idx: 1,
  })
  const bId = repo.addNode(parentId, {
    type: "p",
    item: { list: "-" },
    content: "Bravo",
    parent_idx: 2,
  })
  const cId = repo.addNode(parentId, {
    type: "p",
    item: { list: "-" },
    content: "Charlie",
    parent_idx: 3,
  })
  return { repo, parentId, aId, bId, cId }
}

/** Create a nested tree: root > sectionA > [child1, child2], sectionB. */
function setupNestedTree() {
  const repo = createTestRepo()
  const rootId = repo.addNode(null, {
    type: "h",
    item: {},
    fstype: "mdsection",
    name: "Root",
    content: "Root",
  })
  const sectionAId = repo.addNode(rootId, {
    type: "h",
    item: {},
    fstype: "mdsection",
    name: "Section A",
    content: "Section A",
    parent_idx: 1,
  })
  const child1Id = repo.addNode(sectionAId, {
    type: "p",
    item: { list: "-" },
    content: "Child 1",
    parent_idx: 1,
  })
  const child2Id = repo.addNode(sectionAId, {
    type: "p",
    item: { list: "-" },
    content: "Child 2",
    parent_idx: 2,
  })
  const sectionBId = repo.addNode(rootId, {
    type: "h",
    item: {},
    fstype: "mdsection",
    name: "Section B",
    content: "Section B",
    parent_idx: 2,
  })
  return { repo, rootId, sectionAId, child1Id, child2Id, sectionBId }
}

/** Create task nodes with markers. */
function setupTaskList() {
  const repo = createTestRepo()
  const parentId = repo.addNode(null, {
    type: "h",
    item: {},
    fstype: "mdsection",
    name: "Tasks",
    content: "Tasks",
  })
  const t1Id = repo.addNode(parentId, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: "- [ ] Buy milk",
    parent_idx: 1,
  })
  const t2Id = repo.addNode(parentId, {
    type: "p",
    item: { list: "-", task: { marker: "[x]", status: "done" } },
    content: "- [x] Walk dog",
    parent_idx: 2,
  })
  return { repo, parentId, t1Id, t2Id }
}

// =============================================================================
// createOutlinerContext
// =============================================================================

describe("createOutlinerContext", () => {
  test("returns null for non-existent node", () => {
    const repo = createTestRepo()
    expect(createOutlinerContext(repo, "nonexistent")).toBeNull()
  })

  test("first child context", () => {
    const { repo, aId } = setupFlatList()
    const ctx = createOutlinerContext(repo, aId)!
    expect(ctx.isFirstChild).toBe(true)
    expect(ctx.isLastChild).toBe(false)
    expect(ctx.isOnlyChild).toBe(false)
    expect(ctx.hasChildren).toBe(false)
    expect(ctx.isIndentable).toBe(true)
  })

  test("middle child context", () => {
    const { repo, bId } = setupFlatList()
    const ctx = createOutlinerContext(repo, bId)!
    expect(ctx.isFirstChild).toBe(false)
    expect(ctx.isLastChild).toBe(false)
    expect(ctx.isOnlyChild).toBe(false)
  })

  test("last child context", () => {
    const { repo, cId } = setupFlatList()
    const ctx = createOutlinerContext(repo, cId)!
    expect(ctx.isFirstChild).toBe(false)
    expect(ctx.isLastChild).toBe(true)
  })

  test("only child context", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    const childId = repo.addNode(parentId, { type: "p", item: {}, content: "Only" })
    const ctx = createOutlinerContext(repo, childId)!
    expect(ctx.isOnlyChild).toBe(true)
    expect(ctx.isFirstChild).toBe(true)
    expect(ctx.isLastChild).toBe(true)
  })

  test("hasChildren is true when node has children", () => {
    const { repo, sectionAId } = setupNestedTree()
    const ctx = createOutlinerContext(repo, sectionAId)!
    expect(ctx.hasChildren).toBe(true)
  })

  test("isEmpty is true for empty content", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    const childId = repo.addNode(parentId, { type: "p", item: {}, content: "" })
    const ctx = createOutlinerContext(repo, childId)!
    expect(ctx.isEmpty).toBe(true)
  })

  test("isRoot for top-level children", () => {
    const { repo, sectionAId, child1Id } = setupNestedTree()
    // sectionA is child of root (root has no parent) → isRoot
    const ctxA = createOutlinerContext(repo, sectionAId)!
    expect(ctxA.isRoot).toBe(true)
    // child1 is child of sectionA (sectionA has a parent) → not root
    const ctxChild = createOutlinerContext(repo, child1Id)!
    expect(ctxChild.isRoot).toBe(false)
  })

  test("custom isIndentable policy", () => {
    const { repo, aId } = setupFlatList()
    const neverIndent: OutlinerPolicy = { isIndentable: () => false }
    const ctx = createOutlinerContext(repo, aId, neverIndent)!
    expect(ctx.isIndentable).toBe(false)
  })

  test("non-item nodes are not indentable by default", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    const blockId = repo.addNode(parentId, { type: "p", content: "A block" })
    const ctx = createOutlinerContext(repo, blockId)!
    expect(ctx.isIndentable).toBe(false)
  })
})

// =============================================================================
// indent
// =============================================================================

describe("indent", () => {
  test("second child indents under first child", () => {
    const { repo, parentId, aId, bId } = setupFlatList()
    const outliner = withOutliner(repo)
    const result = outliner.indent(bId)
    expect(result).toBe(true)

    // B is now child of A
    const bNode = repo.getNode(bId)!
    expect(bNode.parent_id).toBe(aId)

    // A still has parentId as parent
    const aNode = repo.getNode(aId)!
    expect(aNode.parent_id).toBe(parentId)
  })

  test("third child indents under second child", () => {
    const { repo, bId, cId } = setupFlatList()
    const outliner = withOutliner(repo)
    expect(outliner.indent(cId)).toBe(true)

    const cNode = repo.getNode(cId)!
    expect(cNode.parent_id).toBe(bId)
  })

  test("first child cannot indent — no previous sibling", () => {
    const { repo, aId } = setupFlatList()
    const outliner = withOutliner(repo)
    expect(outliner.indent(aId)).toBe(false)

    // Node unchanged
    const aNode = repo.getNode(aId)!
    expect(aNode.parent_id).not.toBeNull()
  })

  test("non-indentable node (block) is no-op", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    repo.addNode(parentId, { type: "p", content: "Prev", parent_idx: 1 })
    const blockId = repo.addNode(parentId, { type: "p", content: "Block", parent_idx: 2 })

    const outliner = withOutliner(repo)
    expect(outliner.indent(blockId)).toBe(false)
  })

  test("custom policy can make all nodes indentable", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    const prevId = repo.addNode(parentId, { type: "p", content: "Prev", parent_idx: 1 })
    const blockId = repo.addNode(parentId, { type: "p", content: "Block", parent_idx: 2 })

    const outliner = withOutliner(repo, { isIndentable: () => true })
    expect(outliner.indent(blockId)).toBe(true)

    const blockNode = repo.getNode(blockId)!
    expect(blockNode.parent_id).toBe(prevId)
  })

  test("indent places node as last child of previous sibling", () => {
    const { repo, aId, bId } = setupFlatList()

    // Give A an existing child
    const existingChildId = repo.addNode(aId, {
      type: "p",
      item: {},
      content: "Existing",
      parent_idx: 1,
    })

    const outliner = withOutliner(repo)
    expect(outliner.indent(bId)).toBe(true)

    // B is now sibling of existingChild under A
    const bNode = repo.getNode(bId)!
    expect(bNode.parent_id).toBe(aId)
    // B should be after existingChild
    const existingNode = repo.getNode(existingChildId)!
    expect(bNode.parent_idx).toBeGreaterThan(existingNode.parent_idx)
  })

  test("nonexistent node returns false", () => {
    const repo = createTestRepo()
    const outliner = withOutliner(repo)
    expect(outliner.indent("nonexistent")).toBe(false)
  })
})

// =============================================================================
// outdent
// =============================================================================

describe("outdent", () => {
  test("nested child outdents to grandparent level", () => {
    const { repo, rootId, sectionAId, child1Id } = setupNestedTree()
    const outliner = withOutliner(repo)
    const result = outliner.outdent(child1Id)
    expect(result).toBe(true)

    // child1 is now a child of rootId (sibling of sectionA)
    const child1 = repo.getNode(child1Id)!
    expect(child1.parent_id).toBe(rootId)
  })

  test("outdented node is placed after its former parent", () => {
    const { repo, rootId, sectionAId, child1Id, sectionBId } = setupNestedTree()
    const outliner = withOutliner(repo)
    outliner.outdent(child1Id)

    const child1 = repo.getNode(child1Id)!
    const sectionA = repo.getNode(sectionAId)!
    const sectionB = repo.getNode(sectionBId)!

    // child1 should be between sectionA and sectionB
    expect(child1.parent_idx).toBeGreaterThan(sectionA.parent_idx)
    expect(child1.parent_idx).toBeLessThan(sectionB.parent_idx)
  })

  test("root-level node cannot outdent — no grandparent", () => {
    const { repo, sectionAId } = setupNestedTree()
    const outliner = withOutliner(repo)
    expect(outliner.outdent(sectionAId)).toBe(false)
  })

  test("non-indentable node cannot outdent", () => {
    const repo = createTestRepo()
    const rootId = repo.addNode(null, { type: "h", item: {}, name: "Root" })
    const sectionId = repo.addNode(rootId, { type: "h", item: {}, name: "Section", parent_idx: 1 })
    const blockId = repo.addNode(sectionId, { type: "p", content: "Block", parent_idx: 1 })

    const outliner = withOutliner(repo)
    expect(outliner.outdent(blockId)).toBe(false)
  })

  test("nonexistent node returns false", () => {
    const repo = createTestRepo()
    const outliner = withOutliner(repo)
    expect(outliner.outdent("nonexistent")).toBe(false)
  })

  test("outdent when parent is last child of grandparent", () => {
    const repo = createTestRepo()
    const rootId = repo.addNode(null, { type: "h", item: {}, name: "Root" })
    const sectionId = repo.addNode(rootId, {
      type: "h",
      item: {},
      name: "Last Section",
      parent_idx: 10,
    })
    const childId = repo.addNode(sectionId, { type: "p", item: {}, content: "Child", parent_idx: 1 })

    const outliner = withOutliner(repo)
    expect(outliner.outdent(childId)).toBe(true)

    const child = repo.getNode(childId)!
    expect(child.parent_id).toBe(rootId)
    expect(child.parent_idx).toBeGreaterThan(10)
  })
})

// =============================================================================
// splitBlock
// =============================================================================

describe("splitBlock", () => {
  test("cursor at middle: splits text into two siblings", () => {
    const { repo, bId } = setupFlatList()
    const outliner = withOutliner(repo)

    // "Bravo" → split at 3 → "Bra" + "vo"
    const result = outliner.splitBlock(bId, 3)
    expect(result).not.toBeNull()
    expect(result!.beforeId).toBe(bId)

    const before = repo.getNode(result!.beforeId)!
    const after = repo.getNode(result!.afterId)!
    expect(KNode.string(before)).toBe("Bra")
    expect(KNode.string(after)).toBe("vo")
  })

  test("cursor at start: creates empty sibling before", () => {
    const { repo, parentId, bId } = setupFlatList()
    const outliner = withOutliner(repo)

    const result = outliner.splitBlock(bId, 0)
    expect(result).not.toBeNull()
    // afterId is the original node (content stays)
    expect(result!.afterId).toBe(bId)
    // beforeId is the new empty node
    expect(result!.beforeId).not.toBe(bId)

    const newNode = repo.getNode(result!.beforeId)!
    expect(KNode.string(newNode)).toBe("")
    expect(newNode.parent_id).toBe(parentId)

    // Original unchanged
    const bNode = repo.getNode(bId)!
    expect(KNode.string(bNode)).toBe("Bravo")
  })

  test("cursor at end + no children: creates empty sibling after", () => {
    const { repo, parentId, bId } = setupFlatList()
    const outliner = withOutliner(repo)

    const result = outliner.splitBlock(bId, 5) // "Bravo" len = 5
    expect(result).not.toBeNull()
    expect(result!.beforeId).toBe(bId)

    const afterNode = repo.getNode(result!.afterId)!
    expect(KNode.string(afterNode)).toBe("")
    expect(afterNode.parent_id).toBe(parentId)
  })

  test("cursor at end + visible children: creates first child", () => {
    const { repo, sectionAId } = setupNestedTree()
    const outliner = withOutliner(repo)

    // "Section A" len = 9
    const result = outliner.splitBlock(sectionAId, 9)
    expect(result).not.toBeNull()
    expect(result!.beforeId).toBe(sectionAId)

    const newNode = repo.getNode(result!.afterId)!
    expect(KNode.string(newNode)).toBe("")
    expect(newNode.parent_id).toBe(sectionAId) // first child, not sibling
  })

  test("cursor at end + collapsed children: creates sibling after", () => {
    const { repo, rootId, sectionAId } = setupNestedTree()
    const collapsed: OutlinerPolicy = { childrenVisible: (id) => id !== sectionAId }
    const outliner = withOutliner(repo, collapsed)

    const result = outliner.splitBlock(sectionAId, 9)
    expect(result).not.toBeNull()
    expect(result!.beforeId).toBe(sectionAId)

    const newNode = repo.getNode(result!.afterId)!
    expect(KNode.string(newNode)).toBe("")
    // Should be sibling of sectionA, not child
    expect(newNode.parent_id).toBe(rootId)
  })

  test("empty node: creates sibling after", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    const emptyId = repo.addNode(parentId, { type: "p", item: {}, content: "", parent_idx: 1 })

    const outliner = withOutliner(repo)
    const result = outliner.splitBlock(emptyId, 0)
    expect(result).not.toBeNull()
    expect(result!.beforeId).toBe(emptyId)

    const newNode = repo.getNode(result!.afterId)!
    expect(newNode.parent_id).toBe(parentId)
  })

  test("split preserves inherited properties", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    const nodeId = repo.addNode(parentId, {
      type: "p",
      item: { list: "-" },
      content: "Hello World",
      parent_idx: 1,
    })

    const outliner = withOutliner(repo)
    const result = outliner.splitBlock(nodeId, 5)!
    const newNode = repo.getNode(result.afterId)!
    expect(newNode.item).toEqual({ list: "-" })
  })

  test("split task node resets task status to todo", () => {
    const { repo, t2Id } = setupTaskList()
    const outliner = withOutliner(repo)

    // t2 is "[x] Walk dog" (done), split at end to create new sibling
    const result = outliner.splitBlock(t2Id, 8) // "Walk dog" len = 8 (KNode.string strips prefix)
    expect(result).not.toBeNull()

    const newNode = repo.getNode(result!.afterId)!
    // New node inherits task trait but resets to todo
    expect(newNode.item?.task).toEqual({ marker: "[ ]", status: "todo" })
  })

  test("root node (top-level) can still split — creates top-level sibling", () => {
    const repo = createTestRepo()
    const rootId = repo.addNode(null, { type: "h", item: {}, name: "Root", content: "Root" })
    const outliner = withOutliner(repo)
    // Root nodes in km have parent_id "." — split creates a sibling at top level
    const result = outliner.splitBlock(rootId, 0)
    expect(result).not.toBeNull()
    expect(result!.afterId).toBe(rootId)
    const newNode = repo.getNode(result!.beforeId)!
    expect(KNode.string(newNode)).toBe("")
  })
})

// =============================================================================
// joinBackward
// =============================================================================

describe("joinBackward", () => {
  test("step 1: strips task marker first", () => {
    const { repo, t1Id } = setupTaskList()
    const outliner = withOutliner(repo)

    const result = outliner.joinBackward(t1Id)
    expect(result).not.toBeNull()
    expect(result!.type).toBe("degraded")
    expect(result!.survivorId).toBe(t1Id)

    const node = repo.getNode(t1Id)!
    expect(node.item?.task).toBeUndefined()
    // Still an item with list marker
    expect(node.item).toBeDefined()
    expect(node.item?.list).toBe("-")
  })

  test("step 2: strips item trait after task is gone", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    const itemId = repo.addNode(parentId, {
      type: "p",
      item: { list: "-" },
      content: "An item",
      parent_idx: 1,
    })

    const outliner = withOutliner(repo)
    const result = outliner.joinBackward(itemId)
    expect(result!.type).toBe("degraded")

    const node = repo.getNode(itemId)!
    expect(node.item).toBeUndefined()
    expect(node.type).toBe("p")
  })

  test("step 3: converts non-paragraph type to p", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    const quoteId = repo.addNode(parentId, {
      type: "quote",
      content: "A quote",
      parent_idx: 1,
    })

    const outliner = withOutliner(repo)
    const result = outliner.joinBackward(quoteId)
    expect(result!.type).toBe("degraded")

    const node = repo.getNode(quoteId)!
    expect(node.type).toBe("p")
  })

  test("step 4: empty plain p with no children → delete, cursor to prev", () => {
    const { repo, parentId, aId, bId } = setupFlatList()
    // Make B a plain p (not item) and empty
    repo.updateNode(bId, { item: undefined, content: "" })

    const outliner = withOutliner(repo)
    // First call: strip item trait (already done in setup)
    // B is already plain p + empty → should delete
    const result = outliner.joinBackward(bId)
    expect(result).not.toBeNull()
    expect(result!.type).toBe("deleted")
    expect(result!.survivorId).toBe(aId)

    // B is gone
    expect(repo.getNode(bId)).toBeNull()
  })

  test("step 5: plain p with content + childless prev → merge text", () => {
    const { repo, aId, bId } = setupFlatList()
    // Make both plain p
    repo.updateNode(aId, { item: undefined, content: "Alpha" })
    repo.updateNode(bId, { item: undefined, content: "Bravo" })

    const outliner = withOutliner(repo)
    const result = outliner.joinBackward(bId)
    expect(result).not.toBeNull()
    expect(result!.type).toBe("merged")
    expect(result!.cursorOffset).toBe(5) // "Alpha" length

    // Survivor has merged text
    const survivor = repo.getNode(result!.survivorId)!
    expect(survivor.content).toBe("AlphaBravo")
  })

  test("step 6: plain p with content + prev has children → reparent as last child", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    const prevId = repo.addNode(parentId, { type: "p", content: "Prev", parent_idx: 1 })
    const prevChildId = repo.addNode(prevId, { type: "p", content: "Prev child", parent_idx: 1 })
    const nodeId = repo.addNode(parentId, { type: "p", content: "Current", parent_idx: 2 })

    const outliner = withOutliner(repo)
    const result = outliner.joinBackward(nodeId)
    expect(result).not.toBeNull()
    expect(result!.type).toBe("reparented")

    // Node moved under prev
    const node = repo.getNode(nodeId)!
    expect(node.parent_id).toBe(prevId)
  })

  test("step 7: first child plain p → outdent to parent level", () => {
    const repo = createTestRepo()
    const rootId = repo.addNode(null, { type: "h", item: {}, name: "Root" })
    const sectionId = repo.addNode(rootId, { type: "h", item: {}, name: "Section", parent_idx: 1 })
    const childId = repo.addNode(sectionId, { type: "p", content: "First child", parent_idx: 1 })

    const outliner = withOutliner(repo)
    const result = outliner.joinBackward(childId)
    expect(result).not.toBeNull()
    expect(result!.type).toBe("outdented")

    // Node moved to rootId level
    const node = repo.getNode(childId)!
    expect(node.parent_id).toBe(rootId)
  })

  test("degradation ladder runs in order: task → item → type → merge", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    repo.addNode(parentId, { type: "p", content: "Prev", parent_idx: 1 })
    const nodeId = repo.addNode(parentId, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "- [ ] Task item",
      parent_idx: 2,
    })

    const outliner = withOutliner(repo)

    // Step 1: strip task
    const r1 = outliner.joinBackward(nodeId)!
    expect(r1.type).toBe("degraded")
    let node = repo.getNode(nodeId)!
    expect(node.item?.task).toBeUndefined()
    expect(node.item).toBeDefined() // still item

    // Step 2: strip item
    const r2 = outliner.joinBackward(nodeId)!
    expect(r2.type).toBe("degraded")
    node = repo.getNode(nodeId)!
    expect(node.item).toBeUndefined()
    expect(node.type).toBe("p")

    // Step 3+: now it's a plain p with content + prev is childless → merge
    const r3 = outliner.joinBackward(nodeId)!
    expect(r3.type).toBe("merged")
  })

  test("nonexistent node returns null", () => {
    const repo = createTestRepo()
    const outliner = withOutliner(repo)
    expect(outliner.joinBackward("nonexistent")).toBeNull()
  })

  test("node with no parent returns null", () => {
    const repo = createTestRepo()
    const rootId = repo.addNode(null, { type: "p", content: "Root" })
    const outliner = withOutliner(repo)
    expect(outliner.joinBackward(rootId)).toBeNull()
  })
})

// =============================================================================
// joinForward
// =============================================================================

describe("joinForward", () => {
  test("next is empty with no children → delete next", () => {
    const { repo, bId, cId } = setupFlatList()
    repo.updateNode(cId, { content: "" })

    const outliner = withOutliner(repo)
    const result = outliner.joinForward(bId)
    expect(result).not.toBeNull()
    expect(result!.survivorId).toBe(bId)

    // C is deleted
    expect(repo.getNode(cId)).toBeNull()
    // B unchanged
    expect(KNode.string(repo.getNode(bId)!)).toBe("Bravo")
  })

  test("next has content + no children → merge text", () => {
    const { repo, bId, cId } = setupFlatList()

    const outliner = withOutliner(repo)
    const result = outliner.joinForward(bId)
    expect(result).not.toBeNull()
    expect(result!.survivorId).toBe(bId)
    expect(result!.cursorOffset).toBe(5) // "Bravo" length

    const bNode = repo.getNode(bId)!
    expect(KNode.string(bNode)).toBe("BravoCharlie")
    expect(repo.getNode(cId)).toBeNull()
  })

  test("next has children → no-op (conservative)", () => {
    const { repo, sectionAId, sectionBId } = setupNestedTree()
    // Give sectionB a child
    repo.addNode(sectionBId, { type: "p", item: {}, content: "B child", parent_idx: 1 })

    const outliner = withOutliner(repo)
    const result = outliner.joinForward(sectionAId)
    expect(result).toBeNull()

    // Both sections unchanged
    expect(repo.getNode(sectionAId)).not.toBeNull()
    expect(repo.getNode(sectionBId)).not.toBeNull()
  })

  test("last child → no next sibling → null", () => {
    const { repo, cId } = setupFlatList()
    const outliner = withOutliner(repo)
    expect(outliner.joinForward(cId)).toBeNull()
  })

  test("nonexistent node returns null", () => {
    const repo = createTestRepo()
    const outliner = withOutliner(repo)
    expect(outliner.joinForward("nonexistent")).toBeNull()
  })
})

// =============================================================================
// Integration: indent + outdent are inverses
// =============================================================================

describe("indent/outdent round-trip", () => {
  test("indent then outdent restores original parent", () => {
    const { repo, parentId, bId } = setupFlatList()
    const outliner = withOutliner(repo)

    // Indent B under A
    expect(outliner.indent(bId)).toBe(true)
    expect(repo.getNode(bId)!.parent_id).not.toBe(parentId)

    // Outdent B back
    expect(outliner.outdent(bId)).toBe(true)
    expect(repo.getNode(bId)!.parent_id).toBe(parentId)
  })
})

// =============================================================================
// withOutliner.context()
// =============================================================================

describe("withOutliner.context()", () => {
  test("exposes context for guard inspection", () => {
    const { repo, aId } = setupFlatList()
    const outliner = withOutliner(repo)

    const ctx = outliner.context(aId)
    expect(ctx).not.toBeNull()
    expect(ctx!.isFirstChild).toBe(true)
    expect(ctx!.isIndentable).toBe(true)
  })
})
