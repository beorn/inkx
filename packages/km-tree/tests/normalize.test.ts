/**
 * Normalization Tests — auto-enforcement of schema rules after mutations.
 *
 * Tests that withNormalization() corrects invalid tree states:
 * - Blocks with children → children moved to parent
 * - Items with wrong type → corrected to "h"
 * - withoutNormalizing batches correctly
 * - Custom normalizer plugins
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { withNormalization, createNormalizer, defaultNormalizers, type Normalizer } from "../src/ops/normalize.ts"
import type { TreeMutator } from "../src/ops/block-ops.ts"

// =============================================================================
// createNormalizer — engine basics
// =============================================================================

describe("createNormalizer", () => {
  test("normalize runs chain in order", () => {
    const calls: string[] = []
    const engine = createNormalizer([
      (id, _tree, next) => {
        calls.push(`a:${id}`)
        next()
      },
      (id, _tree, next) => {
        calls.push(`b:${id}`)
        next()
      },
    ])

    const repo = createTestRepo()
    const nodeId = repo.addNode(null, { type: "h", item: {}, name: "Test", content: "Test" })
    engine.normalize(repo, nodeId)

    expect(calls).toEqual([`a:${nodeId}`, `b:${nodeId}`])
  })

  test("normalizeAll visits all nodes", () => {
    const visited: string[] = []
    const engine = createNormalizer([
      (id, _tree, next) => {
        visited.push(id)
        next()
      },
    ])

    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "Parent", content: "Parent" })
    const childId = repo.addNode(parentId, { type: "p", item: {}, content: "Child", parent_idx: 1 })

    engine.normalizeAll(repo)

    expect(visited).toContain(parentId)
    expect(visited).toContain(childId)
  })

  test("normalizer can skip remaining chain by not calling next()", () => {
    const calls: string[] = []
    const engine = createNormalizer([
      (id, _tree, _next) => {
        calls.push(`a:${id}`)
        // deliberately not calling next()
      },
      (id, _tree, next) => {
        calls.push(`b:${id}`)
        next()
      },
    ])

    const repo = createTestRepo()
    const nodeId = repo.addNode(null, { type: "h", item: {}, name: "Test", content: "Test" })
    engine.normalize(repo, nodeId)

    expect(calls).toEqual([`a:${nodeId}`]) // b never called
  })
})

// =============================================================================
// Default normalizers — block children
// =============================================================================

describe("normalizeBlockChildren", () => {
  test("moves children of block node to block's parent", () => {
    const repo = createTestRepo()
    const engine = createNormalizer()

    // Create: root (item) → block → child
    const rootId = repo.addNode(null, { type: "h", item: {}, name: "Root", content: "Root" })
    // Add block as child of root — valid because root is an item
    const blockId = repo.addNode(rootId, { type: "p", content: "Block", parent_idx: 1 })
    // Sneak a child under the block (bypassing schema)
    const childId = repo.addNode(blockId, { type: "p", content: "Orphan", parent_idx: 1 })

    // Before normalization: child is under block
    expect(repo.getNode(childId)!.parent_id).toBe(blockId)

    // Normalize the block
    engine.normalize(repo, blockId)

    // After normalization: child moved to block's parent (root)
    const child = repo.getNode(childId)!
    expect(child.parent_id).toBe(rootId)
  })

  test("block with no children is left alone", () => {
    const repo = createTestRepo()
    const engine = createNormalizer()

    const rootId = repo.addNode(null, { type: "h", item: {}, name: "Root", content: "Root" })
    const blockId = repo.addNode(rootId, { type: "p", content: "Block", parent_idx: 1 })

    // No children, normalization is a no-op
    engine.normalize(repo, blockId)

    const block = repo.getNode(blockId)!
    expect(block.parent_id).toBe(rootId)
    expect(repo.getChildren(blockId)).toHaveLength(0)
  })
})

// =============================================================================
// Default normalizers — item type correction
// =============================================================================

describe("normalizeItemType", () => {
  test("item with type !== h is corrected to h", () => {
    const repo = createTestRepo()
    const engine = createNormalizer()

    // Create item with wrong type
    const nodeId = repo.addNode(null, { type: "p", item: {}, content: "Wrong type" })
    expect(repo.getNode(nodeId)!.type).toBe("p")

    engine.normalize(repo, nodeId)

    expect(repo.getNode(nodeId)!.type).toBe("h")
  })

  test("item with type h is left alone", () => {
    const repo = createTestRepo()
    const engine = createNormalizer()

    const nodeId = repo.addNode(null, { type: "h", item: {}, name: "Correct", content: "Correct" })
    engine.normalize(repo, nodeId)

    expect(repo.getNode(nodeId)!.type).toBe("h")
  })

  test("block with type p is left alone (not an item)", () => {
    const repo = createTestRepo()
    const engine = createNormalizer()

    const rootId = repo.addNode(null, { type: "h", item: {}, name: "Root", content: "Root" })
    const blockId = repo.addNode(rootId, { type: "p", content: "Paragraph" })
    engine.normalize(repo, blockId)

    expect(repo.getNode(blockId)!.type).toBe("p")
  })
})

// =============================================================================
// withNormalization — auto-normalize on mutation
// =============================================================================

describe("withNormalization", () => {
  test("addNode with item triggers type normalization", () => {
    const repo = createTestRepo()
    const tree = withNormalization(repo)

    // Add item with wrong type — should auto-correct to "h"
    const nodeId = tree.addNode(null, { type: "p", item: {}, content: "Auto-fix" })

    expect(repo.getNode(nodeId)!.type).toBe("h")
  })

  test("updateNode triggers normalization", () => {
    const repo = createTestRepo()
    const tree = withNormalization(repo)

    // Start with a block
    const rootId = tree.addNode(null, { type: "h", item: {}, name: "Root", content: "Root" })
    const blockId = tree.addNode(rootId, { type: "p", content: "Block", parent_idx: 1 })

    // Turn it into an item — should auto-correct type to "h"
    tree.updateNode(blockId, { item: {}, type: "p" })

    expect(repo.getNode(blockId)!.type).toBe("h")
  })

  test("moveNode to block parent triggers normalization", () => {
    const repo = createTestRepo()
    const tree = withNormalization(repo)

    const rootId = tree.addNode(null, { type: "h", item: {}, name: "Root", content: "Root" })
    const itemA = tree.addNode(rootId, { type: "h", item: {}, name: "A", content: "A", parent_idx: 1 })
    const child = tree.addNode(itemA, { type: "p", content: "Child", parent_idx: 1 })

    // Create a block under root
    const blockId = tree.addNode(rootId, { type: "p", content: "Block", parent_idx: 2 })

    // Move child to block — block can't have children, normalization should fix it
    tree.moveNode(child, blockId, 0)

    // After normalization, child should have been moved out of block
    // (back to block's parent, which is root)
    const childNode = repo.getNode(child)!
    expect(childNode.parent_id).toBe(rootId)
  })

  test("deleteNode triggers parent normalization", () => {
    const repo = createTestRepo()
    const tree = withNormalization(repo)

    const rootId = tree.addNode(null, { type: "h", item: {}, name: "Root", content: "Root" })
    const childId = tree.addNode(rootId, { type: "h", item: {}, name: "Child", content: "Child", parent_idx: 1 })

    tree.deleteNode(childId)

    // Parent (root) should still be valid
    const root = repo.getNode(rootId)!
    expect(root.type).toBe("h")
    expect(repo.getChildren(rootId)).toHaveLength(0)
  })

  test("getNode and getChildren pass through", () => {
    const repo = createTestRepo()
    const tree = withNormalization(repo)

    const nodeId = tree.addNode(null, { type: "h", item: {}, name: "Test", content: "Test" })

    expect(tree.getNode(nodeId)).toEqual(repo.getNode(nodeId))
    expect(tree.getChildren(null)).toEqual(repo.getChildren(null))
  })

  test("valid operations are not disturbed by normalization", () => {
    const repo = createTestRepo()
    const tree = withNormalization(repo)

    // All valid: item with type "h", blocks as children of items
    const rootId = tree.addNode(null, { type: "h", item: {}, name: "Root", content: "Root" })
    const blockId = tree.addNode(rootId, { type: "p", content: "Para", parent_idx: 1 })
    const childId = tree.addNode(rootId, { type: "h", item: {}, name: "Child", content: "Child", parent_idx: 2 })

    expect(repo.getNode(rootId)!.type).toBe("h")
    expect(repo.getNode(blockId)!.type).toBe("p")
    expect(repo.getNode(childId)!.type).toBe("h")
    expect(repo.getNode(blockId)!.parent_id).toBe(rootId)
    expect(repo.getNode(childId)!.parent_id).toBe(rootId)
  })
})

// =============================================================================
// withoutNormalizing — batch operations
// =============================================================================

describe("withoutNormalizing", () => {
  test("defers normalization until batch ends", () => {
    const repo = createTestRepo()
    const tree = withNormalization(repo)

    tree.withoutNormalizing(() => {
      // Add item with wrong type — should NOT be normalized yet
      const nodeId = tree.addNode(null, { type: "p", item: {}, content: "Deferred" })
      expect(repo.getNode(nodeId)!.type).toBe("p") // still wrong during batch
    })

    // After batch: should be normalized
    const nodes = repo.getChildren(null)
    const itemNode = nodes.find((n) => n.item != null)
    expect(itemNode!.type).toBe("h")
  })

  test("nested batches defer until outermost completes", () => {
    const repo = createTestRepo()
    const tree = withNormalization(repo)

    tree.withoutNormalizing(() => {
      const id1 = tree.addNode(null, { type: "p", item: {}, content: "Outer" })

      tree.withoutNormalizing(() => {
        const id2 = tree.addNode(null, { type: "p", item: {}, content: "Inner" })
        // Both still wrong during nested batch
        expect(repo.getNode(id1)!.type).toBe("p")
        expect(repo.getNode(id2)!.type).toBe("p")
      })

      // Inner batch ended but outer still active — still not normalized
      expect(repo.getNode(id1)!.type).toBe("p")
    })

    // After outermost batch: all normalized
    const nodes = repo.getChildren(null)
    for (const n of nodes) {
      if (n.item != null) {
        expect(n.type).toBe("h")
      }
    }
  })

  test("returns the value from the batch function", () => {
    const repo = createTestRepo()
    const tree = withNormalization(repo)

    const result = tree.withoutNormalizing(() => {
      return tree.addNode(null, { type: "h", item: {}, name: "Test", content: "Test" })
    })

    expect(repo.getNode(result)).not.toBeNull()
  })
})

// =============================================================================
// Custom normalizers
// =============================================================================

describe("custom normalizers", () => {
  test("custom normalizer is called for each mutation", () => {
    const repo = createTestRepo()
    const calls: string[] = []

    const customNormalizer: Normalizer = (id, _tree, next) => {
      calls.push(id)
      next()
    }

    const tree = withNormalization(repo, [customNormalizer])
    const nodeId = tree.addNode(null, { type: "h", item: {}, name: "Test", content: "Test" })

    expect(calls).toContain(nodeId)
  })

  test("custom normalizer can modify the tree", () => {
    const repo = createTestRepo()

    // Custom normalizer: force all nodes to have content "normalized"
    const forceContent: Normalizer = (id, tree, next) => {
      const node = tree.getNode(id)
      if (node && node.content !== "normalized") {
        tree.updateNode(id, { content: "normalized" })
      }
      next()
    }

    const tree = withNormalization(repo, [forceContent])
    const nodeId = tree.addNode(null, { type: "h", item: {}, name: "Test", content: "Original" })

    expect(repo.getNode(nodeId)!.content).toBe("normalized")
  })

  test("custom normalizer replaces defaults (not appended)", () => {
    const repo = createTestRepo()

    // Custom normalizer that does nothing
    const noopNormalizer: Normalizer = (_id, _tree, next) => next()

    const tree = withNormalization(repo, [noopNormalizer])

    // Add item with wrong type — default normalizer would fix it, but we replaced defaults
    const nodeId = tree.addNode(null, { type: "p", item: {}, content: "Not fixed" })

    // Type NOT corrected because we replaced the default normalizers
    expect(repo.getNode(nodeId)!.type).toBe("p")
  })

  test("defaultNormalizers is exported for composition", () => {
    const repo = createTestRepo()
    const calls: string[] = []

    const extraNormalizer: Normalizer = (id, _tree, next) => {
      calls.push(id)
      next()
    }

    // Compose: defaults + custom
    const tree = withNormalization(repo, [...defaultNormalizers, extraNormalizer])
    const nodeId = tree.addNode(null, { type: "p", item: {}, content: "Composed" })

    // Default normalizer fixed the type
    expect(repo.getNode(nodeId)!.type).toBe("h")
    // Custom normalizer also ran
    expect(calls).toContain(nodeId)
  })
})

// =============================================================================
// Edge cases
// =============================================================================

describe("edge cases", () => {
  test("normalizing a deleted node is a no-op", () => {
    const repo = createTestRepo()
    const engine = createNormalizer()

    const nodeId = repo.addNode(null, { type: "h", item: {}, name: "Gone", content: "Gone" })
    repo.deleteNode(nodeId)

    // Should not throw
    engine.normalize(repo, nodeId)
  })

  test("normalization does not infinite loop on self-correcting updates", () => {
    const repo = createTestRepo()
    const tree = withNormalization(repo)

    // This triggers updateNode during normalization (item type correction)
    // which would trigger another normalize if not guarded
    const nodeId = tree.addNode(null, { type: "p", item: {}, content: "Loop guard" })

    // If we get here without stack overflow, the guard works
    expect(repo.getNode(nodeId)!.type).toBe("h")
  })

  test("multiple dirty nodes in batch are all normalized", () => {
    const repo = createTestRepo()
    const tree = withNormalization(repo)

    tree.withoutNormalizing(() => {
      tree.addNode(null, { type: "p", item: {}, content: "A" })
      tree.addNode(null, { type: "p", item: {}, content: "B" })
      tree.addNode(null, { type: "p", item: {}, content: "C" })
    })

    // All three should have been normalized
    const nodes = repo.getChildren(null)
    expect(nodes).toHaveLength(3)
    for (const n of nodes) {
      expect(n.type).toBe("h")
    }
  })
})
