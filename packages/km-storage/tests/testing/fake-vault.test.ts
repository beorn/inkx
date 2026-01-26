import { describe, it, expect } from "bun:test"
import { createFakeRepo } from "../../src/testing/fake-vault.ts"
import type { KNode } from "@km/core"

describe("FakeVault", () => {
  describe("creation", () => {
    it("creates empty vault with defaults", () => {
      const vault = createFakeRepo()

      expect(vault.path).toBe("/fake/vault")
      expect(vault.mode).toBe("memory")
      expect(vault.loadErrors).toEqual([])
      expect(vault.stats.nodeCount).toBe(0)
    })

    it("accepts custom path", () => {
      const vault = createFakeRepo({ path: "/custom/path" })
      expect(vault.path).toBe("/custom/path")
    })

    it("accepts initial nodes", () => {
      const nodes: KNode[] = [
        createNode({ id: "1", type: "section", content: "Section 1" }),
        createNode({
          id: "2",
          type: "task",
          content: "Task 1",
          parent_id: "1",
        }),
      ]

      const vault = createFakeRepo({ nodes })
      expect(vault.stats.nodeCount).toBe(2)
      expect(vault.getNode("1")).not.toBeNull()
      expect(vault.getNode("2")).not.toBeNull()
    })
  })

  describe("queries", () => {
    it("getNode returns node by id", () => {
      const vault = createFakeRepo({
        nodes: [createNode({ id: "abc", content: "Test" })],
      })

      const node = vault.getNode("abc")
      expect(node).not.toBeNull()
      expect(node!.content).toBe("Test")
    })

    it("getNode returns null for unknown id", () => {
      const vault = createFakeRepo()
      expect(vault.getNode("unknown")).toBeNull()
    })

    it("getChildren returns children sorted by parent_idx", () => {
      const vault = createFakeRepo({
        nodes: [
          createNode({ id: "parent", parent_id: null }),
          createNode({ id: "child1", parent_id: "parent", parent_idx: 0 }),
          createNode({ id: "child2", parent_id: "parent", parent_idx: 1 }),
          createNode({ id: "child0", parent_id: "parent", parent_idx: 2 }),
        ],
      })

      const children = vault.getChildren("parent")
      expect(children.map((c) => c.id)).toEqual(["child1", "child2", "child0"])
    })

    it("getSubtree returns node and all descendants", () => {
      const vault = createFakeRepo({
        nodes: [
          createNode({ id: "root", parent_id: null }),
          createNode({ id: "child1", parent_id: "root" }),
          createNode({ id: "child2", parent_id: "root" }),
          createNode({ id: "grandchild", parent_id: "child1" }),
          createNode({ id: "other", parent_id: null }),
        ],
      })

      const subtree = vault.getSubtree("root")
      expect(subtree.map((n) => n.id)).toContain("root")
      expect(subtree.map((n) => n.id)).toContain("child1")
      expect(subtree.map((n) => n.id)).toContain("child2")
      expect(subtree.map((n) => n.id)).toContain("grandchild")
      expect(subtree.map((n) => n.id)).not.toContain("other")
    })

    it("getAncestors returns path from root to parent", () => {
      const vault = createFakeRepo({
        nodes: [
          createNode({ id: "root", parent_id: null }),
          createNode({ id: "child", parent_id: "root" }),
          createNode({ id: "grandchild", parent_id: "child" }),
        ],
      })

      const ancestors = vault.getAncestors("grandchild")
      expect(ancestors.map((n) => n.id)).toEqual(["root", "child"])
    })

    it("getAllTasks returns only task nodes", () => {
      const vault = createFakeRepo({
        nodes: [
          createNode({ id: "1", type: "section" }),
          createNode({ id: "2", type: "task" }),
          createNode({ id: "3", type: "paragraph" }),
          createNode({ id: "4", type: "task" }),
        ],
      })

      const tasks = vault.getAllTasks()
      expect(tasks).toHaveLength(2)
      expect(tasks.every((t) => t.type === "task")).toBe(true)
    })

    it("getTasksByStatus filters by task_status", () => {
      const vault = createFakeRepo({
        nodes: [
          createNode({ id: "1", type: "task", task_status: "todo" }),
          createNode({ id: "2", type: "task", task_status: "done" }),
          createNode({ id: "3", type: "task", task_status: "todo" }),
        ],
      })

      const todos = vault.getTasksByStatus("todo")
      expect(todos).toHaveLength(2)
      expect(todos.every((t) => t.task_status === "todo")).toBe(true)
    })

    it("search finds nodes by content", () => {
      const vault = createFakeRepo({
        nodes: [
          createNode({ id: "1", content: "Buy groceries" }),
          createNode({ id: "2", content: "Write report" }),
          createNode({ id: "3", title: "groceries list" }),
        ],
      })

      const results = vault.search("groceries")
      expect(results).toHaveLength(2)
    })
  })

  describe("mutations", () => {
    it("updateNode modifies node properties", () => {
      const vault = createFakeRepo({
        nodes: [createNode({ id: "1", content: "Original" })],
      })

      vault.updateNode("1", { content: "Updated" })

      const node = vault.getNode("1")
      expect(node!.content).toBe("Updated")
    })

    it("updateNode throws for unknown id", () => {
      const vault = createFakeRepo()
      expect(() => vault.updateNode("unknown", {})).toThrow(
        "Node unknown not found",
      )
    })

    it("moveNode changes parent and position", () => {
      const vault = createFakeRepo({
        nodes: [
          createNode({ id: "parent1", parent_id: null }),
          createNode({ id: "parent2", parent_id: null }),
          createNode({ id: "child", parent_id: "parent1", parent_idx: 0 }),
        ],
      })

      vault.moveNode("child", "parent2", 5)

      const node = vault.getNode("child")
      expect(node!.parent_id).toBe("parent2")
      expect(node!.parent_idx).toBe(5)
    })

    it("deleteNode removes node", () => {
      const vault = createFakeRepo({
        nodes: [createNode({ id: "1" })],
      })

      vault.deleteNode("1")
      expect(vault.getNode("1")).toBeNull()
    })

    it("addNode creates new node with generated id", () => {
      const vault = createFakeRepo()

      const id = vault.addNode(null, {
        type: "section",
        content: "New section",
      })

      expect(id).toMatch(/^fake-\d+$/)
      const node = vault.getNode(id)
      expect(node).not.toBeNull()
      expect(node!.content).toBe("New section")
      expect(node!.parent_id).toBeNull()
    })

    it("addNode sets task_status for tasks", () => {
      const vault = createFakeRepo()

      const id = vault.addNode(null, { type: "task", content: "New task" })

      const node = vault.getNode(id)
      expect(node!.task_status).toBe("todo")
    })
  })

  describe("lifecycle", () => {
    it("watch throws (not supported)", () => {
      const vault = createFakeRepo()
      expect(() => vault.watch()).toThrow("FakeVault does not support watching")
    })

    it("close prevents further operations", () => {
      const vault = createFakeRepo({
        nodes: [createNode({ id: "1" })],
      })

      vault.close()

      expect(() => vault.getNode("1")).toThrow("Vault is closed")
    })

    it("Symbol.dispose calls close", () => {
      const vault = createFakeRepo({
        nodes: [createNode({ id: "1" })],
      })

      vault[Symbol.dispose]()

      expect(() => vault.getNode("1")).toThrow("Vault is closed")
    })

    it("reset restores initial state", () => {
      const vault = createFakeRepo({
        nodes: [createNode({ id: "1", content: "Original" })],
      })

      vault.updateNode("1", { content: "Modified" })
      vault.addNode(null, { type: "section", content: "New" })

      vault.reset()

      expect(vault.getAllNodes()).toHaveLength(1)
      expect(vault.getNode("1")!.content).toBe("Original")
    })
  })

  describe("test helpers", () => {
    it("getAllNodes returns all nodes", () => {
      const vault = createFakeRepo({
        nodes: [createNode({ id: "1" }), createNode({ id: "2" })],
      })

      expect(vault.getAllNodes()).toHaveLength(2)
    })

    it("getAllLinks returns all links", () => {
      const vault = createFakeRepo({
        links: [
          {
            source_id: "1",
            target_id: "2",
            target_name: "node2",
            section: null,
            block_id: null,
            alias: null,
            embedded: false,
            relationship: null,
            created_at: Date.now(),
          },
        ],
      })

      expect(vault.getAllLinks()).toHaveLength(1)
    })
  })
})

// Helper to create minimal valid KNode
function createNode(overrides: Partial<KNode> & { id: string }): KNode {
  const now = Date.now()
  return {
    type: "section",
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    content: "",
    data: {},
    created_at: now,
    updated_at: now,
    version: "test-0",
    ...overrides,
  }
}
