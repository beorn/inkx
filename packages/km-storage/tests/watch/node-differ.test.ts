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

    test("accepts clearing content field (external edit empties a field)", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-1",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          content: "Some content",
          name: "Some name",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 0,
          content: "",
          name: "",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      const updated = result.changes.find((c) => c.type === "updated")
      expect(updated?.nodeId).toBe("task-1")
      // Both content and name should be cleared — the old guard would have skipped these
      expect(updated?.changes?.content).toBe("")
      expect(updated?.changes?.name).toBe("")
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

  describe("ordinal-drift resistance", () => {
    test("insert paragraph at top preserves later siblings' IDs", () => {
      // The core bug: inserting a paragraph at the top shifts all ordinals,
      // causing each existing node to look like the previous one.
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-a",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          content: "Alpha",
        }),
        makeNode({
          id: "task-b",
          type: "p",
          parent_id: "file-1",
          parent_idx: 1,
          content: "Beta",
        }),
        makeNode({
          id: "task-c",
          type: "p",
          parent_id: "file-1",
          parent_idx: 2,
          content: "Charlie",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "new-top",
          type: "p",
          parent_id: "file-new",
          parent_idx: 0,
          content: "New paragraph at top",
        }),
        makeNode({
          id: "task-a-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 1,
          content: "Alpha",
        }),
        makeNode({
          id: "task-b-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 2,
          content: "Beta",
        }),
        makeNode({
          id: "task-c-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 3,
          content: "Charlie",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      // Content-hash matching should preserve the original IDs
      expect(result.idMap.get("task-a-new")).toBe("task-a")
      expect(result.idMap.get("task-b-new")).toBe("task-b")
      expect(result.idMap.get("task-c-new")).toBe("task-c")

      // The new paragraph should be created, not matched to an existing node
      const created = result.changes.filter((c) => c.type === "created")
      expect(created).toHaveLength(1)
      expect(created[0]?.node?.content).toBe("New paragraph at top")

      // No deletions — all existing nodes found their match
      const deleted = result.changes.filter((c) => c.type === "deleted")
      expect(deleted).toHaveLength(0)
    })

    test("insert paragraph in middle preserves surrounding siblings", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-a",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          content: "Alpha",
        }),
        makeNode({
          id: "task-b",
          type: "p",
          parent_id: "file-1",
          parent_idx: 1,
          content: "Beta",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-a-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 0,
          content: "Alpha",
        }),
        makeNode({
          id: "inserted",
          type: "p",
          parent_id: "file-new",
          parent_idx: 1,
          content: "Inserted in middle",
        }),
        makeNode({
          id: "task-b-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 2,
          content: "Beta",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      expect(result.idMap.get("task-a-new")).toBe("task-a")
      expect(result.idMap.get("task-b-new")).toBe("task-b")

      const created = result.changes.filter((c) => c.type === "created")
      expect(created).toHaveLength(1)
      expect(created[0]?.node?.content).toBe("Inserted in middle")
    })
  })

  describe("block_id matching", () => {
    test("block_id takes priority over ordinal position", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-a",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          block_id: "bid-alpha",
          content: "Alpha",
        }),
        makeNode({
          id: "task-b",
          type: "p",
          parent_id: "file-1",
          parent_idx: 1,
          block_id: "bid-beta",
          content: "Beta",
        }),
      ]
      // Nodes reordered — block_id should anchor them
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-b-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 0, // Was at index 1, now at 0
          block_id: "bid-beta",
          content: "Beta",
        }),
        makeNode({
          id: "task-a-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 1, // Was at index 0, now at 1
          block_id: "bid-alpha",
          content: "Alpha",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      // block_id matching ignores ordinal
      expect(result.idMap.get("task-a-new")).toBe("task-a")
      expect(result.idMap.get("task-b-new")).toBe("task-b")

      // No creates or deletes — just reordering
      const created = result.changes.filter((c) => c.type === "created")
      const deleted = result.changes.filter((c) => c.type === "deleted")
      expect(created).toHaveLength(0)
      expect(deleted).toHaveLength(0)
    })

    test("block_id match even when content changes", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-a",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          block_id: "bid-1",
          content: "Original text",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-a-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 0,
          block_id: "bid-1",
          content: "Updated text",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      expect(result.idMap.get("task-a-new")).toBe("task-a")
      const updated = result.changes.find((c) => c.type === "updated")
      expect(updated?.nodeId).toBe("task-a")
      expect(updated?.changes?.content).toBe("Updated text")
    })
  })

  describe("content hash matching", () => {
    test("content hash matches nodes without block_id", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "task-a",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          content: "Unique content here",
        }),
      ]
      // New paragraph inserted before, shifting the ordinal
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "new-first",
          type: "p",
          parent_id: "file-new",
          parent_idx: 0,
          content: "Brand new node",
        }),
        makeNode({
          id: "task-a-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 1, // Shifted from ordinal 0 to 1
          content: "Unique content here",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      // Content hash should match despite ordinal shift
      expect(result.idMap.get("task-a-new")).toBe("task-a")
    })

    test("duplicate content under same parent matches in order", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "dup-1",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          content: "Same text",
        }),
        makeNode({
          id: "dup-2",
          type: "p",
          parent_id: "file-1",
          parent_idx: 1,
          content: "Same text",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "dup-new-1",
          type: "p",
          parent_id: "file-new",
          parent_idx: 0,
          content: "Same text",
        }),
        makeNode({
          id: "dup-new-2",
          type: "p",
          parent_id: "file-new",
          parent_idx: 1,
          content: "Same text",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      // First duplicate matches first, second matches second
      expect(result.idMap.get("dup-new-1")).toBe("dup-1")
      expect(result.idMap.get("dup-new-2")).toBe("dup-2")
      expect(result.changes.filter((c) => c.type === "created")).toHaveLength(0)
      expect(result.changes.filter((c) => c.type === "deleted")).toHaveLength(0)
    })

    test("empty content does not create false matches", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "empty-1",
          type: "p",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
          content: "",
        }),
        makeNode({
          id: "task-a",
          type: "p",
          parent_id: "file-1",
          parent_idx: 1,
          content: "Real content",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "empty-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 0,
          content: "",
        }),
        makeNode({
          id: "task-a-new",
          type: "p",
          parent_id: "file-new",
          parent_idx: 1,
          content: "Real content",
        }),
      ]

      const result = diffNodes(existing, newNodes)

      // Real content node should match by content hash
      expect(result.idMap.get("task-a-new")).toBe("task-a")
      // Empty nodes fall through to ordinal matching
      expect(result.idMap.get("empty-new")).toBe("empty-1")
    })

    test("content hash does not match across different parents", () => {
      const existing = [
        makeNode({ id: "file-1", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "section-a",
          type: "h",
          item: {},
          parent_id: "file-1",
          parent_idx: 0,
        }),
        makeNode({
          id: "task-under-a",
          type: "p",
          parent_id: "section-a",
          parent_idx: 0,
          content: "Shared text",
        }),
      ]
      const newNodes = [
        makeNode({ id: "file-new", type: "h", item: {}, fstype: "mdfile" }),
        makeNode({
          id: "section-a-new",
          type: "h",
          parent_id: "file-new",
          parent_idx: 0,
        }),
        makeNode({
          id: "section-b-new",
          type: "h",
          parent_id: "file-new",
          parent_idx: 1,
        }),
        makeNode({
          id: "task-under-b-new",
          type: "p",
          parent_id: "section-b-new",
          parent_idx: 0,
          content: "Shared text", // Same content, different parent
        }),
      ]

      const result = diffNodes(existing, newNodes)

      // Should NOT match task-under-b-new to task-under-a (different parents)
      expect(result.idMap.get("task-under-b-new")).not.toBe("task-under-a")
      // The old node should be deleted since it was under section-a
      const deleted = result.changes.filter((c) => c.type === "deleted")
      expect(deleted.some((c) => c.nodeId === "task-under-a")).toBe(true)
    })
  })
})
