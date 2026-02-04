/**
 * Node Differ Tests
 *
 * Unit tests for diffNodes function that compares existing nodes
 * against new nodes to detect created, updated, and deleted changes.
 */

import { describe, test, expect } from "vitest"
import { diffNodes } from "../../src/watch/handlers/node-differ.ts"
import type { KNode } from "@km/core"

// Helper to create minimal test nodes
function makeNode(
  overrides: Partial<KNode> & { id: string; type: string },
): KNode {
  return {
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    link_alias: null,
    fs_path: null,
    fs_ino: null,
    md_pos: null,
    md_slug: null,
    task_status: null,
    task_mark: null,
    assigned_to: null,
    due_date: null,
    scheduled_date: null,
    priority: null,
    content: null,
    content_hash: null,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
    ...overrides,
  }
}

describe("diffNodes", () => {
  describe("structural key matching", () => {
    test("matches nodes by parent_id + parent_idx + type", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file", parent_idx: 0 }),
        makeNode({
          id: "task-old",
          type: "task",
          parent_id: "file-1",
          parent_idx: 0,
          content: "Task 1",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "file", parent_idx: 0 }),
        makeNode({
          id: "task-new",
          type: "task",
          parent_id: "file-new",
          parent_idx: 0,
          content: "Task 1",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      // Should map new IDs to existing IDs
      expect(result.idMap.get("file-new")).toBe("file-1")
      expect(result.idMap.get("task-new")).toBe("task-old")
      // No changes if content is the same
      expect(result.changes.filter((c) => c.type === "created")).toHaveLength(0)
      expect(result.changes.filter((c) => c.type === "deleted")).toHaveLength(0)
    })

    test("different parent_idx creates new node", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file" }),
        makeNode({
          id: "task-1",
          type: "task",
          parent_id: "file-1",
          parent_idx: 0,
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "file" }),
        makeNode({
          id: "task-new",
          type: "task",
          parent_id: "file-new",
          parent_idx: 1, // Different index
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const created = result.changes.filter((c) => c.type === "created")
      const deleted = result.changes.filter((c) => c.type === "deleted")

      expect(created).toHaveLength(1)
      expect(deleted).toHaveLength(1)
      expect(deleted[0]?.nodeId).toBe("task-1")
    })

    test("different type creates new node", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file" }),
        makeNode({
          id: "node-1",
          type: "task",
          parent_id: "file-1",
          parent_idx: 0,
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "file" }),
        makeNode({
          id: "node-new",
          type: "section", // Different type
          parent_id: "file-new",
          parent_idx: 0,
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const created = result.changes.filter((c) => c.type === "created")
      const deleted = result.changes.filter((c) => c.type === "deleted")

      expect(created).toHaveLength(1)
      expect(created[0]?.node?.type).toBe("section")
      expect(deleted).toHaveLength(1)
      expect(deleted[0]?.nodeId).toBe("node-1")
    })
  })

  describe("ID remapping", () => {
    test("maps new file ID to existing file ID", () => {
      const existing = [makeNode({ id: "existing-file", type: "file" })]
      const newNodes = [makeNode({ id: "new-file", type: "file" })]

      const result = diffNodes(existing, newNodes)

      expect(result.idMap.get("new-file")).toBe("existing-file")
    })

    test("maps child node IDs through parent chain", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file" }),
        makeNode({
          id: "section-1",
          type: "section",
          parent_id: "file-1",
          parent_idx: 0,
        }),
        makeNode({
          id: "task-1",
          type: "task",
          parent_id: "section-1",
          parent_idx: 0,
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "file" }),
        makeNode({
          id: "section-new",
          type: "section",
          parent_id: "file-new",
          parent_idx: 0,
        }),
        makeNode({
          id: "task-new",
          type: "task",
          parent_id: "section-new",
          parent_idx: 0,
        }),
      ]

      const result = diffNodes(existing, newNodes)

      expect(result.idMap.get("file-new")).toBe("file-1")
      expect(result.idMap.get("section-new")).toBe("section-1")
      expect(result.idMap.get("task-new")).toBe("task-1")
    })

    test("remaps parent_id in created nodes", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file" }),
        makeNode({
          id: "section-1",
          type: "section",
          parent_id: "file-1",
          parent_idx: 0,
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "file" }),
        makeNode({
          id: "section-new",
          type: "section",
          parent_id: "file-new",
          parent_idx: 0,
        }),
        makeNode({
          id: "task-new",
          type: "task",
          parent_id: "section-new",
          parent_idx: 0, // New node under existing section
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const created = result.changes.find((c) => c.type === "created")
      expect(created?.node?.parent_id).toBe("section-1") // Remapped to existing ID
    })
  })

  describe("change detection", () => {
    test("detects content changes", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file" }),
        makeNode({
          id: "task-1",
          type: "task",
          parent_id: "file-1",
          parent_idx: 0,
          content: "Old content",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "file" }),
        makeNode({
          id: "task-new",
          type: "task",
          parent_id: "file-new",
          parent_idx: 0,
          content: "New content",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const updated = result.changes.find((c) => c.type === "updated")
      expect(updated?.nodeId).toBe("task-1")
      expect(updated?.changes?.content).toBe("New content")
    })

    test("detects task_status changes", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file" }),
        makeNode({
          id: "task-1",
          type: "task",
          parent_id: "file-1",
          parent_idx: 0,
          task_status: "todo",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "file" }),
        makeNode({
          id: "task-new",
          type: "task",
          parent_id: "file-new",
          parent_idx: 0,
          task_status: "done",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const updated = result.changes.find((c) => c.type === "updated")
      expect(updated?.nodeId).toBe("task-1")
      expect(updated?.changes?.task_status).toBe("done")
    })

    test("detects data object changes", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file" }),
        makeNode({
          id: "task-1",
          type: "task",
          parent_id: "file-1",
          parent_idx: 0,
          data: { tags: ["old"] },
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "file" }),
        makeNode({
          id: "task-new",
          type: "task",
          parent_id: "file-new",
          parent_idx: 0,
          data: { tags: ["new", "added"] },
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const updated = result.changes.find((c) => c.type === "updated")
      expect(updated?.nodeId).toBe("task-1")
      expect(updated?.changes?.data).toEqual({ tags: ["new", "added"] })
    })

    test("no changes when nodes are identical", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file", content: "File" }),
        makeNode({
          id: "task-1",
          type: "task",
          parent_id: "file-1",
          parent_idx: 0,
          content: "Task",
          task_status: "todo",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "file", content: "File" }),
        makeNode({
          id: "task-new",
          type: "task",
          parent_id: "file-new",
          parent_idx: 0,
          content: "Task",
          task_status: "todo",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      expect(result.changes).toHaveLength(0)
    })
  })

  describe("created/deleted detection", () => {
    test("detects new nodes", () => {
      const existing = [makeNode({ id: "file-1", type: "file" })]
      const newNodes = [
        makeNode({ id: "file-new", type: "file" }),
        makeNode({
          id: "task-new",
          type: "task",
          parent_id: "file-new",
          parent_idx: 0,
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const created = result.changes.filter((c) => c.type === "created")
      expect(created).toHaveLength(1)
      expect(created[0]?.node?.type).toBe("task")
    })

    test("detects deleted nodes", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file" }),
        makeNode({
          id: "task-1",
          type: "task",
          parent_id: "file-1",
          parent_idx: 0,
        }),
      ]
      const newNodes = [makeNode({ id: "file-new", type: "file" })]

      const result = diffNodes(existing, newNodes)

      const deleted = result.changes.filter((c) => c.type === "deleted")
      expect(deleted).toHaveLength(1)
      expect(deleted[0]?.nodeId).toBe("task-1")
    })

    test("does not delete file nodes", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file" }),
        makeNode({
          id: "file-2",
          type: "file", // Extra file (shouldn't happen but handle gracefully)
        }),
      ]
      const newNodes = [makeNode({ id: "file-new", type: "file" })]

      const result = diffNodes(existing, newNodes)

      const deleted = result.changes.filter((c) => c.type === "deleted")
      expect(deleted).toHaveLength(0) // File nodes are never deleted by diffNodes
    })
  })

  describe("edge cases", () => {
    test("handles empty existing nodes", () => {
      const existing: KNode[] = []
      const newNodes = [
        makeNode({ id: "file-new", type: "file" }),
        makeNode({
          id: "task-new",
          type: "task",
          parent_id: "file-new",
          parent_idx: 0,
        }),
      ]

      const result = diffNodes(existing, newNodes)

      // New file should create a node (no existing to match)
      // New task should create a node
      const created = result.changes.filter((c) => c.type === "created")
      expect(created.length).toBeGreaterThanOrEqual(1)
    })

    test("handles empty new nodes (all deleted)", () => {
      const existing = [
        makeNode({ id: "file-1", type: "file" }),
        makeNode({
          id: "task-1",
          type: "task",
          parent_id: "file-1",
          parent_idx: 0,
        }),
        makeNode({
          id: "task-2",
          type: "task",
          parent_id: "file-1",
          parent_idx: 1,
        }),
      ]
      const newNodes: KNode[] = []

      const result = diffNodes(existing, newNodes)

      const deleted = result.changes.filter((c) => c.type === "deleted")
      // File nodes are not deleted, but tasks should be
      expect(deleted).toHaveLength(2)
    })

    test("handles multiple nodes at same position (duplicate keys)", () => {
      // In practice this shouldn't happen, but test graceful handling
      const existing = [
        makeNode({ id: "file-1", type: "file" }),
        makeNode({
          id: "task-1",
          type: "task",
          parent_id: "file-1",
          parent_idx: 0,
        }),
        makeNode({
          id: "task-2",
          type: "task",
          parent_id: "file-1",
          parent_idx: 0, // Same position!
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "file" }),
        makeNode({
          id: "task-new",
          type: "task",
          parent_id: "file-new",
          parent_idx: 0,
        }),
      ]

      // Should not throw
      const result = diffNodes(existing, newNodes)
      expect(result.idMap.size).toBeGreaterThan(0)
    })

    test("handles file with no children", () => {
      const existing = [makeNode({ id: "file-1", type: "file" })]
      const newNodes = [makeNode({ id: "file-new", type: "file" })]

      const result = diffNodes(existing, newNodes)

      expect(result.idMap.get("file-new")).toBe("file-1")
      expect(result.changes).toHaveLength(0)
    })
  })
})
