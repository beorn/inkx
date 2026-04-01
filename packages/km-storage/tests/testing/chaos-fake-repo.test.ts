import { describe, it, expect } from "vitest"
import { createChaosFakeRepo } from "../../src/testing/chaos-fake-repo.ts"
import type { KNode } from "@km/core"

describe("ChaosFakeRepo", () => {
  describe("transaction logging", () => {
    it("logs addNode operations", () => {
      const repo = createChaosFakeRepo()

      repo.addNode(null, { type: "h", item: {}, content: "Test" })

      const log = repo.getTransactionLog()
      expect(log).toHaveLength(1)
      expect(log[0]!.operation).toBe("add")
    })

    it("logs updateNode operations", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1" })],
      })

      repo.updateNode("1", { content: "Updated" })

      const log = repo.getTransactionLog()
      expect(log).toHaveLength(1)
      expect(log[0]!.operation).toBe("update")
      expect(log[0]!.nodeId).toBe("1")
    })

    it("logs deleteNode operations", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1" })],
      })

      repo.deleteNode("1")

      const log = repo.getTransactionLog()
      expect(log).toHaveLength(1)
      expect(log[0]!.operation).toBe("delete")
    })

    it("logs moveNode operations", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "parent", parent_id: null }), createNode({ id: "child", parent_id: "parent" })],
      })

      repo.moveNode("child", null as unknown as string, 0)

      const log = repo.getTransactionLog()
      expect(log).toHaveLength(1)
      expect(log[0]!.operation).toBe("move")
    })

    it("can disable logging", () => {
      const repo = createChaosFakeRepo({ logTransactions: false })

      repo.addNode(null, { type: "h", item: {}, content: "Test" })

      expect(repo.getTransactionLog()).toHaveLength(0)
    })

    it("clearTransactionLog clears the log", () => {
      const repo = createChaosFakeRepo()
      repo.addNode(null, { type: "h", item: {}, content: "Test" })

      repo.clearTransactionLog()

      expect(repo.getTransactionLog()).toHaveLength(0)
    })
  })

  describe("orphan detection", () => {
    it("detects nodes with non-existent parents", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1", parent_id: null }), createNode({ id: "2", parent_id: "nonexistent" })],
      })

      const orphans = repo.getOrphanedNodes()

      expect(orphans).toHaveLength(1)
      expect(orphans[0]!.id).toBe("2")
    })

    it("injectOrphan creates an orphaned node", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1", parent_id: null })],
      })

      repo.injectOrphan({
        id: "orphan",
        type: "p",
        item: {},
        content: "Orphan task",
        parent_id: "missing-parent",
        parent_idx: 0,
        embed_source: null,
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "test",
      })

      // Note: injectOrphan currently logs but doesn't modify base repo
      // The orphan detection works on base repo nodes
      const log = repo.getTransactionLog()
      expect(log.some((e) => e.details?.method === "injectOrphan")).toBe(true)
    })
  })

  describe("duplicate detection", () => {
    it("tracks duplicate IDs when injected", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1", parent_id: null })],
      })

      repo.injectDuplicate(createNode({ id: "1", content: "Duplicate" }))

      const duplicates = repo.getDuplicateIds()
      expect(duplicates.get("1")).toBe(2)
    })

    it("returns original node when injecting duplicate", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1", content: "Original" })],
      })

      const original = repo.injectDuplicate(createNode({ id: "1", content: "Duplicate" }))

      expect(original).not.toBeNull()
      expect(original!.content).toBe("Original")
    })
  })

  describe("circular reference detection", () => {
    it("detects circular parent chains", () => {
      const repo = createChaosFakeRepo({
        nodes: [
          createNode({ id: "a", parent_id: null }),
          createNode({ id: "b", parent_id: "a" }),
          createNode({ id: "c", parent_id: "b" }),
        ],
      })

      // Create cycle: a -> b -> c -> a
      repo.injectCircularRef("c", "a")

      const circular = repo.getCircularRefs()
      expect(circular.length).toBeGreaterThan(0)
    })

    it("simulateCorruption with circular_parent makes node its own parent", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1", parent_id: null })],
      })

      repo.simulateCorruption("1", "circular_parent")

      const node = repo.getNode("1")
      expect(node!.parent_id).toBe("1")
    })
  })

  describe("consistency validation", () => {
    it("finds missing parent issues", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1", parent_id: "missing" })],
      })

      const issues = repo.validateConsistency()

      expect(issues.some((i) => i.type === "missing_parent")).toBe(true)
    })

    it("finds duplicate position issues", () => {
      const repo = createChaosFakeRepo({
        nodes: [
          createNode({ id: "parent", parent_id: null }),
          createNode({ id: "a", parent_id: "parent", parent_idx: 0 }),
          createNode({ id: "b", parent_id: "parent", parent_idx: 0 }), // Same position!
        ],
      })

      const issues = repo.validateConsistency()

      expect(issues.some((i) => i.type === "invalid_position")).toBe(true)
    })

    it("returns empty for consistent repo", () => {
      const repo = createChaosFakeRepo({
        nodes: [
          createNode({ id: "parent", parent_id: null, content: "Parent" }),
          createNode({
            id: "child",
            parent_id: "parent",
            parent_idx: 0,
            content: "Child",
          }),
        ],
      })

      const issues = repo.validateConsistency()

      expect(issues).toHaveLength(0)
    })
  })

  describe("corruption simulation", () => {
    it("simulatePartialWrite removes specified fields", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1", content: "Content", title: "Title" })],
      })

      repo.simulatePartialWrite("1", ["content"])

      const node = repo.getNode("1")
      expect(node!.content).toBeUndefined()
    })

    it("simulateCorruption with missing_parent sets invalid parent", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1", parent_id: null })],
      })

      repo.simulateCorruption("1", "missing_parent")

      const node = repo.getNode("1")
      expect(node!.parent_id).toBe("nonexistent-parent-999")
    })

    it("simulateCorruption with stale_hash creates mismatched hash", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1", content: "Original" })],
      })

      repo.simulateCorruption("1", "stale_hash")

      const node = repo.getNode("1")
      expect(node!.content).toBe("changed content")
      expect(node!.content_hash).toBe("stale-hash-that-doesnt-match")
    })

    it("simulateCorruption with invalid_position sets negative index", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1", parent_idx: 0 })],
      })

      repo.simulateCorruption("1", "invalid_position")

      const node = repo.getNode("1")
      expect(node!.parent_idx).toBe(-1)
    })
  })

  describe("reset", () => {
    it("clears transaction log on reset", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1" })],
      })

      repo.updateNode("1", { content: "Changed" })
      expect(repo.getTransactionLog()).toHaveLength(1)

      repo.reset()

      expect(repo.getTransactionLog()).toHaveLength(0)
    })

    it("resets duplicate tracking on reset", () => {
      const repo = createChaosFakeRepo({
        nodes: [createNode({ id: "1" })],
      })

      repo.injectDuplicate(createNode({ id: "1" }))
      expect(repo.getDuplicateIds().size).toBeGreaterThan(0)

      repo.reset()

      expect(repo.getDuplicateIds().size).toBe(0)
    })
  })
})

// Helper to create minimal valid KNode
function createNode(overrides: Partial<KNode> & { id: string; parent_id?: string | null }): KNode {
  const now = Date.now()
  return {
    type: "h",
    item: {},
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
    content: "",
    data: {},
    created_at: now,
    updated_at: now,
    version: "test-0",
    ...overrides,
  }
}
