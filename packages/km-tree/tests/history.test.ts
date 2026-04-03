/**
 * History Tests — withHistory decorator for op-based undo/redo.
 *
 * Tests:
 * - Basic undo/redo (add → undo → gone → redo → back)
 * - Update undo/redo
 * - Move undo/redo
 * - Delete undo/redo
 * - Batch undo (multiple ops in one undo step)
 * - Redo cleared on new mutation
 * - Composition: withHistory(withNormalization(tree))
 * - Empty undo/redo is no-op
 * - Multiple undo/redo cycles
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { KNode } from "@km/core"
import { withHistory, type HistoryEditor } from "../src/history.ts"
import { withNormalization } from "../src/normalize.ts"

// =============================================================================
// Helpers
// =============================================================================

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

// =============================================================================
// Basic undo/redo — addNode
// =============================================================================

describe("undo/redo addNode", () => {
  test("add node → undo → node gone → redo → node back", () => {
    const { repo, parentId } = setupTree()
    const editor = withHistory(repo)

    const newId = editor.addNode(parentId, { type: "p", content: "New node", parent_idx: 3 })
    expect(repo.getNode(newId)).not.toBeNull()
    expect(repo.getNode(newId)!.content).toBe("New node")

    editor.undo()
    expect(repo.getNode(newId)).toBeNull()

    editor.redo()
    expect(repo.getNode(newId)).not.toBeNull()
    expect(repo.getNode(newId)!.content).toBe("New node")
  })

  test("undo records operation in redo stack", () => {
    const { repo, parentId } = setupTree()
    const editor = withHistory(repo)

    editor.addNode(parentId, { type: "p", content: "Test", parent_idx: 3 })
    expect(editor.history.undos).toHaveLength(1)
    expect(editor.history.redos).toHaveLength(0)

    editor.undo()
    expect(editor.history.undos).toHaveLength(0)
    expect(editor.history.redos).toHaveLength(1)
  })
})

// =============================================================================
// Basic undo/redo — updateNode
// =============================================================================

describe("undo/redo updateNode", () => {
  test("update content → undo → original content restored", () => {
    const { repo, child1Id } = setupTree()
    const editor = withHistory(repo)

    editor.updateNode(child1Id, { content: "Updated content" })
    expect(repo.getNode(child1Id)!.content).toBe("Updated content")

    editor.undo()
    expect(repo.getNode(child1Id)!.content).toBe("Alpha bravo")

    editor.redo()
    expect(repo.getNode(child1Id)!.content).toBe("Updated content")
  })

  test("captures only changed properties in oldProperties", () => {
    const { repo, child1Id } = setupTree()
    const editor = withHistory(repo)

    editor.updateNode(child1Id, { content: "Changed" })

    const batch = editor.history.undos[0]!
    expect(batch).toHaveLength(1)
    const op = batch[0]!
    expect(op.type).toBe("set_node")
    if (op.type === "set_node") {
      expect(op.oldProperties).toHaveProperty("content", "Alpha bravo")
    }
  })
})

// =============================================================================
// Basic undo/redo — moveNode
// =============================================================================

describe("undo/redo moveNode", () => {
  test("move node → undo → node back at original parent", () => {
    const { repo, parentId, child1Id } = setupTree()
    const editor = withHistory(repo)

    const parent2Id = repo.addNode(null, {
      type: "h",
      item: {},
      name: "Parent 2",
      content: "Parent 2",
    })

    editor.moveNode(child1Id, parent2Id, 0)
    expect(repo.getNode(child1Id)!.parent_id).toBe(parent2Id)

    editor.undo()
    expect(repo.getNode(child1Id)!.parent_id).toBe(parentId)

    editor.redo()
    expect(repo.getNode(child1Id)!.parent_id).toBe(parent2Id)
  })
})

// =============================================================================
// Basic undo/redo — deleteNode
// =============================================================================

describe("undo/redo deleteNode", () => {
  test("delete node → undo → node restored", () => {
    const { repo, child1Id, parentId } = setupTree()
    const editor = withHistory(repo)

    editor.deleteNode(child1Id)
    expect(repo.getNode(child1Id)).toBeNull()

    editor.undo()
    const restored = repo.getNode(child1Id)
    expect(restored).not.toBeNull()
    expect(restored!.content).toBe("Alpha bravo")
    expect(restored!.parent_id).toBe(parentId)
  })

  test("delete node → undo → redo → node gone again", () => {
    const { repo, child1Id } = setupTree()
    const editor = withHistory(repo)

    editor.deleteNode(child1Id)
    editor.undo()
    expect(repo.getNode(child1Id)).not.toBeNull()

    editor.redo()
    expect(repo.getNode(child1Id)).toBeNull()
  })
})

// =============================================================================
// Batch undo
// =============================================================================

describe("batch undo", () => {
  test("batch groups multiple ops into single undo step", () => {
    const { repo, parentId } = setupTree()
    const editor = withHistory(repo)

    let id1: string
    let id2: string
    editor.batch(() => {
      id1 = editor.addNode(parentId, { type: "p", content: "Batch 1", parent_idx: 3 })
      id2 = editor.addNode(parentId, { type: "p", content: "Batch 2", parent_idx: 4 })
    })

    // One undo step for both ops
    expect(editor.history.undos).toHaveLength(1)
    expect(editor.history.undos[0]).toHaveLength(2)

    expect(repo.getNode(id1!)).not.toBeNull()
    expect(repo.getNode(id2!)).not.toBeNull()

    editor.undo()
    expect(repo.getNode(id1!)).toBeNull()
    expect(repo.getNode(id2!)).toBeNull()

    editor.redo()
    expect(repo.getNode(id1!)).not.toBeNull()
    expect(repo.getNode(id2!)).not.toBeNull()
  })

  test("empty batch does not create undo entry", () => {
    const { repo } = setupTree()
    const editor = withHistory(repo)

    editor.batch(() => {
      // no-op
    })

    expect(editor.history.undos).toHaveLength(0)
  })

  test("batch returns value from inner function", () => {
    const { repo, parentId } = setupTree()
    const editor = withHistory(repo)

    const result = editor.batch(() => {
      return editor.addNode(parentId, { type: "p", content: "Returned", parent_idx: 3 })
    })

    expect(repo.getNode(result)).not.toBeNull()
  })
})

// =============================================================================
// Redo cleared on new mutation
// =============================================================================

describe("redo cleared on new mutation", () => {
  test("new mutation after undo clears redo stack", () => {
    const { repo, parentId } = setupTree()
    const editor = withHistory(repo)

    const id1 = editor.addNode(parentId, { type: "p", content: "First", parent_idx: 3 })
    editor.undo()
    expect(editor.history.redos).toHaveLength(1)

    // New mutation clears redo
    editor.addNode(parentId, { type: "p", content: "Second", parent_idx: 3 })
    expect(editor.history.redos).toHaveLength(0)
  })

  test("batch mutation also clears redo stack", () => {
    const { repo, parentId } = setupTree()
    const editor = withHistory(repo)

    editor.addNode(parentId, { type: "p", content: "First", parent_idx: 3 })
    editor.undo()
    expect(editor.history.redos).toHaveLength(1)

    editor.batch(() => {
      editor.addNode(parentId, { type: "p", content: "Batched", parent_idx: 3 })
    })
    expect(editor.history.redos).toHaveLength(0)
  })
})

// =============================================================================
// Edge cases
// =============================================================================

describe("edge cases", () => {
  test("undo on empty stack is no-op", () => {
    const { repo } = setupTree()
    const editor = withHistory(repo)

    // Should not throw
    editor.undo()
    expect(editor.history.undos).toHaveLength(0)
    expect(editor.history.redos).toHaveLength(0)
  })

  test("redo on empty stack is no-op", () => {
    const { repo } = setupTree()
    const editor = withHistory(repo)

    editor.redo()
    expect(editor.history.undos).toHaveLength(0)
    expect(editor.history.redos).toHaveLength(0)
  })

  test("multiple undo/redo cycles are stable", () => {
    const { repo, parentId, child1Id } = setupTree()
    const editor = withHistory(repo)

    editor.updateNode(child1Id, { content: "V2" })
    editor.updateNode(child1Id, { content: "V3" })

    // Undo both
    editor.undo()
    expect(repo.getNode(child1Id)!.content).toBe("V2")
    editor.undo()
    expect(repo.getNode(child1Id)!.content).toBe("Alpha bravo")

    // Redo both
    editor.redo()
    expect(repo.getNode(child1Id)!.content).toBe("V2")
    editor.redo()
    expect(repo.getNode(child1Id)!.content).toBe("V3")

    // Undo one, mutate, redo should be empty
    editor.undo()
    editor.updateNode(child1Id, { content: "V4" })
    expect(editor.history.redos).toHaveLength(0)
    expect(repo.getNode(child1Id)!.content).toBe("V4")
  })

  test("undo/redo during undo does not record ops", () => {
    const { repo, parentId } = setupTree()
    const editor = withHistory(repo)

    editor.addNode(parentId, { type: "p", content: "Node A", parent_idx: 3 })
    expect(editor.history.undos).toHaveLength(1)

    editor.undo()
    // The inverse ops applied during undo should NOT be recorded
    expect(editor.history.undos).toHaveLength(0)
    expect(editor.history.redos).toHaveLength(1)
  })
})

// =============================================================================
// Composition: withHistory(withNormalization(tree))
// =============================================================================

describe("composition with withNormalization", () => {
  test("withHistory(withNormalization(tree)) normalizes and records", () => {
    const repo = createTestRepo()
    const normalized = withNormalization(repo)
    const editor = withHistory(normalized)

    // Add item with wrong type — normalization fixes to "h"
    const nodeId = editor.addNode(null, { type: "p", item: {}, content: "Auto-fix" })

    // Normalization ran
    expect(repo.getNode(nodeId)!.type).toBe("h")

    // History recorded the add
    expect(editor.history.undos).toHaveLength(1)

    // Undo removes the node
    editor.undo()
    expect(repo.getNode(nodeId)).toBeNull()

    // Redo restores it
    editor.redo()
    expect(repo.getNode(nodeId)).not.toBeNull()
  })

  test("undo after update through normalized tree", () => {
    const repo = createTestRepo()
    const normalized = withNormalization(repo)
    const editor = withHistory(normalized)

    const rootId = editor.addNode(null, { type: "h", item: {}, name: "Root", content: "Root" })
    const blockId = editor.addNode(rootId, { type: "p", content: "Block", parent_idx: 1 })

    editor.updateNode(blockId, { content: "Updated block" })
    expect(repo.getNode(blockId)!.content).toBe("Updated block")

    editor.undo()
    expect(repo.getNode(blockId)!.content).toBe("Block")
  })
})

// =============================================================================
// Split/merge undo via batch
// =============================================================================

describe("split/merge simulation via batch", () => {
  test("batched split ops can be undone atomically", () => {
    const { repo, parentId, child1Id } = setupTree()
    const editor = withHistory(repo)

    const originalContent = repo.getNode(child1Id)!.content!

    // Simulate split: update original + insert new sibling
    let newId: string
    editor.batch(() => {
      editor.updateNode(child1Id, { content: "Alpha" })
      newId = editor.addNode(parentId, { type: "p", content: " bravo", parent_idx: 2 })
    })

    expect(repo.getNode(child1Id)!.content).toBe("Alpha")
    expect(repo.getNode(newId!)).not.toBeNull()

    // Single undo reverses the whole split
    editor.undo()
    expect(repo.getNode(child1Id)!.content).toBe(originalContent)
    expect(repo.getNode(newId!)).toBeNull()

    // Redo re-applies the split
    editor.redo()
    expect(repo.getNode(child1Id)!.content).toBe("Alpha")
    expect(repo.getNode(newId!)!.content).toBe(" bravo")
  })

  test("batched merge ops can be undone atomically", () => {
    const { repo, child1Id, child2Id } = setupTree()
    const editor = withHistory(repo)

    const child1Content = repo.getNode(child1Id)!.content!
    const child2Content = repo.getNode(child2Id)!.content!

    // Simulate merge: update target content + delete source
    editor.batch(() => {
      editor.updateNode(child1Id, { content: child1Content + child2Content })
      editor.deleteNode(child2Id)
    })

    expect(repo.getNode(child1Id)!.content).toBe("Alpha bravoCharlie delta")
    expect(repo.getNode(child2Id)).toBeNull()

    // Single undo reverses the whole merge
    editor.undo()
    expect(repo.getNode(child1Id)!.content).toBe(child1Content)
    expect(repo.getNode(child2Id)).not.toBeNull()
    expect(repo.getNode(child2Id)!.content).toBe(child2Content)
  })
})
