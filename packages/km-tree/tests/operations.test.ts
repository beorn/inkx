/**
 * Operations Tests — atomic ops, inverse(), apply(), round-trips.
 *
 * Each operation type is tested for:
 * 1. Correct application
 * 2. Correct inverse
 * 3. Round-trip: apply(op) then apply(inverse(op)) restores original state
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { KNode } from "@km/core"
import {
  inverse,
  applyOperation,
  type TreeOp,
  type InsertNodeOperation,
  type RemoveNodeOperation,
  type SetNodeOperation,
  type MoveNodeOperation,
  type SplitNodeOperation,
  type MergeNodeOperation,
  type SetSelectionOperation,
} from "../src/ops/operations.ts"

// =============================================================================
// Helpers
// =============================================================================

/** Create a simple tree: parent with two children */
function setupTree() {
  const repo = createTestRepo()
  const parentId = repo.addNode(null, {
    type: "h",
    item: {},
    name: "Parent",
    content: "Parent",
  })
  const child1Id = repo.addNode(parentId, {
    type: "p",
    content: "Alpha bravo",
    parent_idx: 1,
  })
  const child2Id = repo.addNode(parentId, {
    type: "p",
    content: "Charlie delta",
    parent_idx: 2,
  })
  return { repo, parentId, child1Id, child2Id }
}

/** Snapshot all node IDs and their content for comparison */
function snapshotTree(repo: ReturnType<typeof createTestRepo>, rootParentId: string | null) {
  const nodes: Record<string, { content: string | undefined; parentId: string | null; parentIdx: number }> = {}
  function walk(pid: string | null) {
    for (const child of repo.getChildren(pid)) {
      const node = repo.getNode(child.id)
      if (node) {
        nodes[node.id] = { content: node.content ?? undefined, parentId: node.parent_id, parentIdx: node.parent_idx }
        walk(node.id)
      }
    }
  }
  walk(rootParentId)
  return nodes
}

// =============================================================================
// insert_node
// =============================================================================

describe("insert_node", () => {
  test("inserts a node under a parent", () => {
    const { repo, parentId } = setupTree()
    const op: InsertNodeOperation = {
      type: "insert_node",
      parentId,
      index: 3,
      node: { type: "p", content: "Echo foxtrot" },
      newId: "new-node-1",
    }

    applyOperation(repo, op)

    const newNode = repo.getNode("new-node-1")
    expect(newNode).not.toBeNull()
    expect(newNode!.content).toBe("Echo foxtrot")
    expect(newNode!.parent_id).toBe(parentId)
  })

  test("inverse is remove_node", () => {
    const op: InsertNodeOperation = {
      type: "insert_node",
      parentId: "p1",
      index: 0,
      node: { type: "p", content: "test" },
      newId: "n1",
    }
    const inv = inverse(op)
    expect(inv.type).toBe("remove_node")
    expect((inv as RemoveNodeOperation).nodeId).toBe("n1")
    expect((inv as RemoveNodeOperation).parentId).toBe("p1")
  })

  test("round-trip: insert then remove restores state", () => {
    const { repo, parentId } = setupTree()
    const before = snapshotTree(repo, null)

    const op: InsertNodeOperation = {
      type: "insert_node",
      parentId,
      index: 3,
      node: { type: "p", content: "Temporary node" },
      newId: "temp-1",
    }

    applyOperation(repo, op)
    expect(repo.getNode("temp-1")).not.toBeNull()

    applyOperation(repo, inverse(op))
    expect(repo.getNode("temp-1")).toBeNull()

    const after = snapshotTree(repo, null)
    expect(after).toEqual(before)
  })
})

// =============================================================================
// remove_node
// =============================================================================

describe("remove_node", () => {
  test("removes a node from the tree", () => {
    const { repo, child1Id, parentId } = setupTree()
    const node = repo.getNode(child1Id)!
    const op: RemoveNodeOperation = {
      type: "remove_node",
      nodeId: child1Id,
      snapshot: { type: node.type, content: node.content, parent_idx: node.parent_idx },
      parentId,
      index: node.parent_idx,
    }

    applyOperation(repo, op)
    expect(repo.getNode(child1Id)).toBeNull()
  })

  test("inverse is insert_node with snapshot", () => {
    const op: RemoveNodeOperation = {
      type: "remove_node",
      nodeId: "n1",
      snapshot: { type: "p", content: "saved" },
      parentId: "p1",
      index: 2,
    }
    const inv = inverse(op)
    expect(inv.type).toBe("insert_node")
    expect((inv as InsertNodeOperation).newId).toBe("n1")
    expect((inv as InsertNodeOperation).node).toEqual({ type: "p", content: "saved" })
  })

  test("round-trip: remove then insert restores node", () => {
    const { repo, child1Id, parentId } = setupTree()
    const node = repo.getNode(child1Id)!
    const before = snapshotTree(repo, null)

    const op: RemoveNodeOperation = {
      type: "remove_node",
      nodeId: child1Id,
      snapshot: { type: node.type, content: node.content, parent_idx: node.parent_idx },
      parentId,
      index: node.parent_idx,
    }

    applyOperation(repo, op)
    expect(repo.getNode(child1Id)).toBeNull()

    applyOperation(repo, inverse(op))
    const restored = repo.getNode(child1Id)
    expect(restored).not.toBeNull()
    expect(restored!.content).toBe("Alpha bravo")
  })
})

// =============================================================================
// set_node
// =============================================================================

describe("set_node", () => {
  test("updates node properties", () => {
    const { repo, child1Id } = setupTree()
    const op: SetNodeOperation = {
      type: "set_node",
      nodeId: child1Id,
      properties: { content: "Updated content" },
      oldProperties: { content: "Alpha bravo" },
    }

    applyOperation(repo, op)
    expect(repo.getNode(child1Id)!.content).toBe("Updated content")
  })

  test("inverse swaps properties and oldProperties", () => {
    const op: SetNodeOperation = {
      type: "set_node",
      nodeId: "n1",
      properties: { content: "new" },
      oldProperties: { content: "old" },
    }
    const inv = inverse(op) as SetNodeOperation
    expect(inv.properties).toEqual({ content: "old" })
    expect(inv.oldProperties).toEqual({ content: "new" })
  })

  test("round-trip: set then inverse restores original", () => {
    const { repo, child1Id } = setupTree()
    const op: SetNodeOperation = {
      type: "set_node",
      nodeId: child1Id,
      properties: { content: "Changed" },
      oldProperties: { content: "Alpha bravo" },
    }

    applyOperation(repo, op)
    expect(repo.getNode(child1Id)!.content).toBe("Changed")

    applyOperation(repo, inverse(op))
    expect(repo.getNode(child1Id)!.content).toBe("Alpha bravo")
  })
})

// =============================================================================
// move_node
// =============================================================================

describe("move_node", () => {
  test("moves a node to a new parent", () => {
    const { repo, parentId, child1Id } = setupTree()

    // Create a second parent
    const parent2Id = repo.addNode(null, {
      type: "h",
      item: {},
      name: "Parent 2",
      content: "Parent 2",
    })

    const node = repo.getNode(child1Id)!
    const op: MoveNodeOperation = {
      type: "move_node",
      nodeId: child1Id,
      oldParentId: parentId,
      oldIndex: node.parent_idx,
      newParentId: parent2Id,
      newIndex: 0,
    }

    applyOperation(repo, op)
    const moved = repo.getNode(child1Id)!
    expect(moved.parent_id).toBe(parent2Id)
  })

  test("inverse swaps old/new parent and index", () => {
    const op: MoveNodeOperation = {
      type: "move_node",
      nodeId: "n1",
      oldParentId: "p1",
      oldIndex: 1,
      newParentId: "p2",
      newIndex: 3,
    }
    const inv = inverse(op) as MoveNodeOperation
    expect(inv.oldParentId).toBe("p2")
    expect(inv.oldIndex).toBe(3)
    expect(inv.newParentId).toBe("p1")
    expect(inv.newIndex).toBe(1)
  })

  test("round-trip: move then inverse restores position", () => {
    const { repo, parentId, child1Id } = setupTree()

    const parent2Id = repo.addNode(null, {
      type: "h",
      item: {},
      name: "Parent 2",
      content: "Parent 2",
    })

    const node = repo.getNode(child1Id)!
    const op: MoveNodeOperation = {
      type: "move_node",
      nodeId: child1Id,
      oldParentId: parentId,
      oldIndex: node.parent_idx,
      newParentId: parent2Id,
      newIndex: 0,
    }

    applyOperation(repo, op)
    expect(repo.getNode(child1Id)!.parent_id).toBe(parent2Id)

    applyOperation(repo, inverse(op))
    expect(repo.getNode(child1Id)!.parent_id).toBe(parentId)
  })
})

// =============================================================================
// split_node
// =============================================================================

describe("split_node", () => {
  test("splits a node at the given offset", () => {
    const { repo, child1Id } = setupTree()
    const node = repo.getNode(child1Id)!
    const text = KNode.string(node) // "Alpha bravo"

    const op: SplitNodeOperation = {
      type: "split_node",
      nodeId: child1Id,
      offset: 5, // "Alpha" | " bravo"
      newId: "split-new-1",
      properties: { type: "p" },
    }

    applyOperation(repo, op)

    const original = repo.getNode(child1Id)!
    expect(original.content).toBe("Alpha")

    const newNode = repo.getNode("split-new-1")!
    expect(newNode).not.toBeNull()
    expect(newNode.content).toBe(" bravo")
  })

  test("inverse of split is merge", () => {
    const op: SplitNodeOperation = {
      type: "split_node",
      nodeId: "n1",
      offset: 5,
      newId: "n2",
      properties: { type: "p" },
    }
    const inv = inverse(op) as MergeNodeOperation
    expect(inv.type).toBe("merge_node")
    expect(inv.nodeId).toBe("n2")
    expect(inv.targetId).toBe("n1")
    expect(inv.offset).toBe(5)
  })

  test("round-trip: split then merge restores original text", () => {
    const { repo, child1Id } = setupTree()
    const originalContent = repo.getNode(child1Id)!.content

    const op: SplitNodeOperation = {
      type: "split_node",
      nodeId: child1Id,
      offset: 5,
      newId: "split-rt-1",
      properties: { type: "p" },
    }

    applyOperation(repo, op)
    expect(repo.getNode(child1Id)!.content).toBe("Alpha")
    expect(repo.getNode("split-rt-1")).not.toBeNull()

    applyOperation(repo, inverse(op))
    expect(repo.getNode(child1Id)!.content).toBe(originalContent)
    expect(repo.getNode("split-rt-1")).toBeNull()
  })
})

// =============================================================================
// merge_node
// =============================================================================

describe("merge_node", () => {
  test("merges source text into target and deletes source", () => {
    const { repo, child1Id, child2Id } = setupTree()

    const target = repo.getNode(child1Id)!
    const targetText = KNode.string(target) // "Alpha bravo"

    const op: MergeNodeOperation = {
      type: "merge_node",
      nodeId: child2Id,
      targetId: child1Id,
      offset: targetText.length,
    }

    applyOperation(repo, op)

    const merged = repo.getNode(child1Id)!
    expect(merged.content).toBe("Alpha bravoCharlie delta")
    expect(repo.getNode(child2Id)).toBeNull()
  })

  test("inverse of merge is split", () => {
    const op: MergeNodeOperation = {
      type: "merge_node",
      nodeId: "n2",
      targetId: "n1",
      offset: 11,
    }
    const inv = inverse(op) as SplitNodeOperation
    expect(inv.type).toBe("split_node")
    expect(inv.nodeId).toBe("n1")
    expect(inv.offset).toBe(11)
    expect(inv.newId).toBe("n2")
  })
})

// =============================================================================
// set_selection
// =============================================================================

describe("set_selection", () => {
  test("is a no-op on the tree (selection is an effect)", () => {
    const { repo } = setupTree()
    const before = snapshotTree(repo, null)

    const op: SetSelectionOperation = {
      type: "set_selection",
      oldSelection: null,
      newSelection: { nodeId: "some-node", offset: 5 },
    }

    applyOperation(repo, op)
    const after = snapshotTree(repo, null)
    expect(after).toEqual(before)
  })

  test("inverse swaps old and new selection", () => {
    const op: SetSelectionOperation = {
      type: "set_selection",
      oldSelection: { nodeId: "n1", offset: 0 },
      newSelection: { nodeId: "n2", offset: 5 },
    }
    const inv = inverse(op) as SetSelectionOperation
    expect(inv.oldSelection).toEqual({ nodeId: "n2", offset: 5 })
    expect(inv.newSelection).toEqual({ nodeId: "n1", offset: 0 })
  })
})

// =============================================================================
// Composite: block-ops emit operations
// =============================================================================

describe("operation capture from block-ops", () => {
  test("split emits insert_node and set_node operations", () => {
    // Verify that we can manually construct the operation sequence
    // that a split produces, and that applying+inverting them works
    const { repo, parentId, child1Id } = setupTree()
    const node = repo.getNode(child1Id)!
    const text = KNode.string(node) // "Alpha bravo"

    // The operations that split(repo, child1Id, 5) would emit:
    const ops: TreeOp[] = [
      {
        type: "set_node",
        nodeId: child1Id,
        properties: { content: "Alpha" },
        oldProperties: { content: node.content! },
      },
      {
        type: "insert_node",
        parentId,
        index: (node.parent_idx ?? 0) + 1,
        node: { type: "p", content: " bravo" },
        newId: "split-emit-1",
      },
    ]

    // Apply forward
    for (const op of ops) applyOperation(repo, op)

    expect(repo.getNode(child1Id)!.content).toBe("Alpha")
    expect(repo.getNode("split-emit-1")!.content).toBe(" bravo")

    // Apply inverse in reverse order
    for (const op of [...ops].reverse()) applyOperation(repo, inverse(op))

    expect(repo.getNode(child1Id)!.content).toBe("Alpha bravo")
    expect(repo.getNode("split-emit-1")).toBeNull()
  })

  test("mergeBackward emits set_node and remove_node operations", () => {
    const { repo, parentId, child1Id, child2Id } = setupTree()
    const child1 = repo.getNode(child1Id)!
    const child2 = repo.getNode(child2Id)!

    // The operations that merging child2 into child1 would emit:
    const ops: TreeOp[] = [
      {
        type: "set_node",
        nodeId: child1Id,
        properties: { content: "Alpha bravoCharlie delta" },
        oldProperties: { content: child1.content! },
      },
      {
        type: "remove_node",
        nodeId: child2Id,
        snapshot: { type: child2.type, content: child2.content, parent_idx: child2.parent_idx },
        parentId,
        index: child2.parent_idx,
      },
    ]

    // Apply forward
    for (const op of ops) applyOperation(repo, op)

    expect(repo.getNode(child1Id)!.content).toBe("Alpha bravoCharlie delta")
    expect(repo.getNode(child2Id)).toBeNull()

    // Apply inverse in reverse order
    for (const op of [...ops].reverse()) applyOperation(repo, inverse(op))

    expect(repo.getNode(child1Id)!.content).toBe("Alpha bravo")
    const restored = repo.getNode(child2Id)
    expect(restored).not.toBeNull()
    expect(restored!.content).toBe("Charlie delta")
  })
})

// =============================================================================
// Double inverse
// =============================================================================

describe("double inverse", () => {
  test("inverse(inverse(op)) returns equivalent operation", () => {
    const ops: TreeOp[] = [
      {
        type: "insert_node",
        parentId: "p1",
        index: 0,
        node: { type: "p", content: "test" },
        newId: "n1",
      },
      {
        type: "remove_node",
        nodeId: "n1",
        snapshot: { type: "p", content: "test" },
        parentId: "p1",
        index: 0,
      },
      {
        type: "set_node",
        nodeId: "n1",
        properties: { content: "new" },
        oldProperties: { content: "old" },
      },
      {
        type: "move_node",
        nodeId: "n1",
        oldParentId: "p1",
        oldIndex: 0,
        newParentId: "p2",
        newIndex: 1,
      },
      {
        type: "set_selection",
        oldSelection: null,
        newSelection: { nodeId: "n1", offset: 0 },
      },
    ]

    for (const op of ops) {
      const doubleInv = inverse(inverse(op))
      expect(doubleInv).toEqual(op)
    }
  })
})
