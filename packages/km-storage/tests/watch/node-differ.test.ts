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
function makeNode(overrides: Partial<KNode> & { id: string; type: string }): KNode {
  return {
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
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
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile", parent_idx: 0 }),
        makeNode({
          id: "task-old",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          content: "Task 1",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile", parent_idx: 0 }),
        makeNode({
          id: "task-new",
          type: "p",
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

    test("lone child with different parent_idx matches by ordinal", () => {
      // A single child at parent_idx=1 and a single child at parent_idx=0
      // both have ordinal 0, so they match (same node, different raw index)
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-1",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 1, // Different raw index, but same ordinal (0)
        }),
      ]

      const result = diffNodes(existing, newNodes)

      // Both are the only child → ordinal 0 → match
      expect(result.idMap.get("task-new")).toBe("task-1")
      expect(result.changes.filter((c) => c.type === "created")).toHaveLength(0)
      expect(result.changes.filter((c) => c.type === "deleted")).toHaveLength(0)
    })

    test("matches nodes with fractional parent_idx from TUI reorder", () => {
      // DB has fractional values from midpoint calculations (0.5, 1)
      // Parser produces sequential integers (0, 1) — should match by ordinal
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-1",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0.5,
          content: "A",
        }),
        makeNode({
          id: "task-2",
          type: "p",
          parent_id: "file-1",
          parent_idx: 1,
          content: "B",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-new-1",
          type: "p",
          item: {},
          parent_id: "file-new",
          parent_idx: 0,
          content: "A",
        }),
        makeNode({
          id: "task-new-2",
          type: "p",
          parent_id: "file-new",
          parent_idx: 1,
          content: "B",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      expect(result.idMap.get("task-new-1")).toBe("task-1")
      expect(result.idMap.get("task-new-2")).toBe("task-2")
      expect(result.changes.filter((c) => c.type === "created")).toHaveLength(0)
      expect(result.changes.filter((c) => c.type === "deleted")).toHaveLength(0)
    })

    test("different type creates new node", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "node-1",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "node-new",
          type: "h",
          item: {}, // Different type
          parent_id: "file-new",
          parent_idx: 0,
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const created = result.changes.filter((c) => c.type === "created")
      const deleted = result.changes.filter((c) => c.type === "deleted")

      expect(created).toHaveLength(1)
      expect(created[0]?.node?.type).toBe("h")
      expect(deleted).toHaveLength(1)
      expect(deleted[0]?.nodeId).toBe("node-1")
    })
  })

  describe("ID remapping", () => {
    test("maps new file ID to existing file ID", () => {
      const existing = [makeNode({ id: "existing-file", type: "h", item: {}, fstype: "mdfile" })]
      const newNodes = [makeNode({ id: "new-file", type: "h", item: {}, fstype: "mdfile" })]

      const result = diffNodes(existing, newNodes)

      expect(result.idMap.get("new-file")).toBe("existing-file")
    })

    test("maps child node IDs through parent chain", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "section-1",
          type: "h",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
        }),
        makeNode({
          id: "task-1",
          type: "p",
          parent_id: "section-1",
          parent_idx: 0,
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "section-new",
          type: "h",
          parent_id: "file-new",
          parent_idx: 0,
        }),
        makeNode({
          id: "task-new",
          type: "p",
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
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "section-1",
          type: "h",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "section-new",
          type: "h",
          parent_id: "file-new",
          parent_idx: 0,
        }),
        makeNode({
          id: "task-new",
          type: "p",
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
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-1",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          content: "Old content",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-new",
          type: "p",
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
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-1",
          type: "p",
          item: { task: { status: "done", marker: "[x]" } },
          parent_id: "file-1",
          parent_idx: 0,
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-new",
          type: "p",
          item: { task: { status: "todo", marker: "[ ]" } },
          parent_id: "file-new",
          parent_idx: 0,
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const updated = result.changes.find((c) => c.type === "updated")
      expect(updated?.nodeId).toBe("task-1")
      expect((updated?.changes?.item as { task?: { status?: string } })?.task?.status).toBe("todo")
    })

    test("detects data object changes", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-1",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          data: { tags: ["old"] },
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-new",
          type: "p",
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

    test("detects data replacement when properties are removed", () => {
      // Regression: When a section heading changes from "Waiting km.color:: yellow"
      // to empty, the new data should NOT retain the old title/rules properties.
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "section-1",
          type: "h",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          title: "Waiting",
          content: "Waiting km.color:: yellow",
          data: { rules: { color: "yellow" }, title: "Waiting" },
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "section-new",
          type: "h",
          parent_id: "file-new",
          parent_idx: 0,
          title: "",
          content: "",
          data: { lang: "ts" },
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const updated = result.changes.find((c) => c.type === "updated")
      expect(updated?.nodeId).toBe("section-1")
      // data should be the FULL new object, not a merge
      expect(updated?.changes?.data).toEqual({ lang: "ts" })
      // Specifically: old title and rules must NOT be present
      expect((updated?.changes?.data as Record<string, unknown>)?.title).toBeUndefined()
      expect((updated?.changes?.data as Record<string, unknown>)?.rules).toBeUndefined()
    })

    test("no changes when nodes are identical", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile", content: "File" }),
        makeNode({
          id: "task-1",
          type: "p",
          item: { task: { status: "todo", marker: "[ ]" } },
          parent_id: "file-1",
          parent_idx: 0,
          content: "Task",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile", content: "File" }),
        makeNode({
          id: "task-new",
          type: "p",
          item: { task: { status: "todo", marker: "[ ]" } },
          parent_id: "file-new",
          parent_idx: 0,
          content: "Task",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      expect(result.changes).toHaveLength(0)
    })
  })

  describe("created/deleted detection", () => {
    test("detects new nodes", () => {
      const existing = [makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" })]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-new",
          type: "p",
          item: {},
          parent_id: "file-new",
          parent_idx: 0,
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const created = result.changes.filter((c) => c.type === "created")
      expect(created).toHaveLength(1)
      expect(created[0]?.node?.type).toBe("p")
    })

    test("detects deleted nodes", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-1",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
        }),
      ]
      const newNodes = [makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" })]

      const result = diffNodes(existing, newNodes)

      const deleted = result.changes.filter((c) => c.type === "deleted")
      expect(deleted).toHaveLength(1)
      expect(deleted[0]?.nodeId).toBe("task-1")
    })

    test("does not delete file nodes", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "file-2",
          type: "h",
          item: {},
          fstype: "mdfile", // Extra file (shouldn't happen but handle gracefully)
        }),
      ]
      const newNodes = [makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" })]

      const result = diffNodes(existing, newNodes)

      const deleted = result.changes.filter((c) => c.type === "deleted")
      expect(deleted).toHaveLength(0) // File nodes are never deleted by diffNodes
    })
  })

  describe("edge cases", () => {
    test("handles empty existing nodes", () => {
      const existing: KNode[] = []
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-new",
          type: "p",
          item: {},
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
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-1",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
        }),
        makeNode({
          id: "task-2",
          type: "p",
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
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-1",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
        }),
        makeNode({
          id: "task-2",
          type: "p",
          parent_id: "file-1",
          parent_idx: 0, // Same position!
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 0,
        }),
      ]

      // Should not throw
      const result = diffNodes(existing, newNodes)
      expect(result.idMap.size).toBeGreaterThan(0)
    })

    test("handles file with no children", () => {
      const existing = [makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" })]
      const newNodes = [makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" })]

      const result = diffNodes(existing, newNodes)

      expect(result.idMap.get("file-new")).toBe("file-1")
      expect(result.changes).toHaveLength(0)
    })
  })
})
