import { describe, it, expect } from "vitest"
import { createFakeRepo } from "../../src/testing/fake-repo.ts"
import type { KNode } from "@km/core"

describe("FakeRepo", () => {
  describe("creation", () => {
    it("creates empty repo with defaults", () => {
      const repo = createFakeRepo()

      expect(repo.path).toBe("/fake/repo")
      expect(repo.mode).toBe("memory")
      expect(repo.loadErrors).toEqual([])
      expect(repo.stats.nodeCount).toBe(0)
    })

    it("accepts custom path", () => {
      const repo = createFakeRepo({ path: "/custom/path" })
      expect(repo.path).toBe("/custom/path")
    })

    it("accepts initial nodes", () => {
      const nodes: KNode[] = [
        createNode({ id: "1", type: "h", item: {}, content: "Section 1" }),
        createNode({
          id: "2",
          type: "p",
          item: {},
          content: "Task 1",
          parent_id: "1",
        }),
      ]

      const repo = createFakeRepo({ nodes })
      expect(repo.stats.nodeCount).toBe(2)
      expect(repo.getNode("1")).not.toBeNull()
      expect(repo.getNode("2")).not.toBeNull()
    })
  })

  describe("queries", () => {
    it("getNode returns node by id", () => {
      const repo = createFakeRepo({
        nodes: [createNode({ id: "abc", content: "Test" })],
      })

      const node = repo.getNode("abc")
      expect(node).not.toBeNull()
      expect(node!.content).toBe("Test")
    })

    it("getNode returns null for unknown id", () => {
      const repo = createFakeRepo()
      expect(repo.getNode("unknown")).toBeNull()
    })

    it("getChildren returns children sorted by parent_idx", () => {
      const repo = createFakeRepo({
        nodes: [
          createNode({ id: "parent", parent_id: null }),
          createNode({ id: "child1", parent_id: "parent", parent_idx: 0 }),
          createNode({ id: "child2", parent_id: "parent", parent_idx: 1 }),
          createNode({ id: "child0", parent_id: "parent", parent_idx: 2 }),
        ],
      })

      const children = repo.getChildren("parent")
      expect(children.map((c) => c.id)).toEqual(["child1", "child2", "child0"])
    })

    it("getSubtree returns node and all descendants", () => {
      const repo = createFakeRepo({
        nodes: [
          createNode({ id: "root", parent_id: null }),
          createNode({ id: "child1", parent_id: "root" }),
          createNode({ id: "child2", parent_id: "root" }),
          createNode({ id: "grandchild", parent_id: "child1" }),
          createNode({ id: "other", parent_id: null }),
        ],
      })

      const subtree = repo.getSubtree("root")
      expect(subtree.map((n) => n.id)).toContain("root")
      expect(subtree.map((n) => n.id)).toContain("child1")
      expect(subtree.map((n) => n.id)).toContain("child2")
      expect(subtree.map((n) => n.id)).toContain("grandchild")
      expect(subtree.map((n) => n.id)).not.toContain("other")
    })

    it("getAncestors returns path from root to parent", () => {
      const repo = createFakeRepo({
        nodes: [
          createNode({ id: "root", parent_id: null }),
          createNode({ id: "child", parent_id: "root" }),
          createNode({ id: "grandchild", parent_id: "child" }),
        ],
      })

      const ancestors = repo.getAncestors("grandchild")
      expect(ancestors.map((n) => n.id)).toEqual(["root", "child"])
    })

    it("getAllTasks returns only task nodes", () => {
      const repo = createFakeRepo({
        nodes: [
          createNode({ id: "1", type: "h", item: {} }),
          createNode({ id: "2", type: "p", item: { task: { status: "todo", marker: "[ ]" } } }),
          createNode({ id: "3", type: "p" }),
          createNode({ id: "4", type: "p", item: { task: { status: "done", marker: "[x]" } } }),
        ],
      })

      const tasks = repo.getAllTasks()
      expect(tasks).toHaveLength(2)
      expect(tasks.every((t) => t.item?.task?.status != null)).toBe(true)
    })

    it("getTasksByStatus filters by task_status", () => {
      const repo = createFakeRepo({
        nodes: [
          createNode({ id: "1", type: "p", item: { task: { status: "todo", marker: "[ ]" } } }),
          createNode({ id: "2", type: "p", item: { task: { status: "done", marker: "[ ]" } } }),
          createNode({ id: "3", type: "p", item: { task: { status: "todo", marker: "[ ]" } } }),
        ],
      })

      const todos = repo.getTasksByStatus("todo")
      expect(todos).toHaveLength(2)
      expect(todos.every((t) => t.item?.task?.status === "todo")).toBe(true)
    })

    it("search finds nodes by content", () => {
      const repo = createFakeRepo({
        nodes: [
          createNode({ id: "1", content: "Buy groceries" }),
          createNode({ id: "2", content: "Write report" }),
          createNode({ id: "3", title: "groceries list" }),
        ],
      })

      const results = repo.search("groceries")
      expect(results).toHaveLength(2)
    })
  })

  describe("mutations", () => {
    it("updateNode modifies node properties", () => {
      const repo = createFakeRepo({
        nodes: [createNode({ id: "1", content: "Original" })],
      })

      repo.updateNode("1", { content: "Updated" })

      const node = repo.getNode("1")
      expect(node!.content).toBe("Updated")
    })

    it("updateNode throws for unknown id", () => {
      const repo = createFakeRepo()
      expect(() => repo.updateNode("unknown", {})).toThrow("Node unknown not found")
    })

    it("moveNode changes parent and position", () => {
      const repo = createFakeRepo({
        nodes: [
          createNode({ id: "parent1", parent_id: null }),
          createNode({ id: "parent2", parent_id: null }),
          createNode({ id: "child", parent_id: "parent1", parent_idx: 0 }),
        ],
      })

      repo.moveNode("child", "parent2", 5)

      const node = repo.getNode("child")
      expect(node!.parent_id).toBe("parent2")
      expect(node!.parent_idx).toBe(5)
    })

    it("deleteNode removes node", () => {
      const repo = createFakeRepo({
        nodes: [createNode({ id: "1" })],
      })

      repo.deleteNode("1")
      expect(repo.getNode("1")).toBeNull()
    })

    it("addNode creates new node with generated id", () => {
      const repo = createFakeRepo()

      const id = repo.addNode(null, {
        type: "h",
        item: {},
        content: "New section",
      })

      expect(id).toMatch(/^fake-\d+$/)
      const node = repo.getNode(id)
      expect(node).not.toBeNull()
      expect(node!.content).toBe("New section")
      expect(node!.parent_id).toBeNull()
    })

    it("addNode sets task_status for tasks", () => {
      const repo = createFakeRepo()

      const id = repo.addNode(null, {
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "New task",
      })

      const node = repo.getNode(id)
      expect(node!.item?.task?.status).toBe("todo")
    })
  })

  describe("lifecycle", () => {
    it("watch throws (not supported)", () => {
      const repo = createFakeRepo()
      expect(() => repo.watch()).toThrow("FakeRepo does not support watching")
    })

    it("close prevents further operations", () => {
      const repo = createFakeRepo({
        nodes: [createNode({ id: "1" })],
      })

      repo.close()

      expect(() => repo.getNode("1")).toThrow("Repo is closed")
    })

    it("Symbol.dispose calls close", () => {
      const repo = createFakeRepo({
        nodes: [createNode({ id: "1" })],
      })

      repo[Symbol.dispose]()

      expect(() => repo.getNode("1")).toThrow("Repo is closed")
    })

    it("reset restores initial state", () => {
      const repo = createFakeRepo({
        nodes: [createNode({ id: "1", content: "Original" })],
      })

      repo.updateNode("1", { content: "Modified" })
      repo.addNode(null, { type: "h", item: {}, content: "New" })

      repo.reset()

      expect(repo.getAllNodes()).toHaveLength(1)
      expect(repo.getNode("1")!.content).toBe("Original")
    })
  })

  describe("test helpers", () => {
    it("getAllNodes returns all nodes", () => {
      const repo = createFakeRepo({
        nodes: [createNode({ id: "1" }), createNode({ id: "2" })],
      })

      expect(repo.getAllNodes()).toHaveLength(2)
    })

    it("getAllLinks returns all links", () => {
      const repo = createFakeRepo({
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

      expect(repo.getAllLinks()).toHaveLength(1)
    })
  })
})

// Helper to create minimal valid KNode
function createNode(overrides: Partial<KNode> & { id: string }): KNode {
  const now = Date.now()
  const isTask = overrides.type === "p" && overrides.item != null
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
    ...(isTask ? { item: { task: { status: "todo", marker: "[ ]" } } } : {}),
    ...overrides,
  }
}
