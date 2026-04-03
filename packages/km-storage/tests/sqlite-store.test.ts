import { describe, test, expect, beforeEach } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/schema.ts"
import { createSQLiteStore } from "../src/sqlite-store.ts"

function createTestDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

describe("createSQLiteStore", () => {
  let db: Database
  let store: ReturnType<typeof createSQLiteStore>

  beforeEach(() => {
    db = createTestDb()
    store = createSQLiteStore(db)
  })

  describe("peekNode", () => {
    test("returns null for non-existent node", () => {
      expect(store.peekNode("nonexistent")).toBeNull()
    })

    test("returns node after insert via commit", () => {
      store.commit([
        {
          type: "node_created",
          actor: "test",
          data: {
            id: "node-1",
            type: "p",
            parent_id: null,
            parent_idx: 0,
            content: "Hello world",
          },
        },
      ])

      const node = store.peekNode("node-1")
      expect(node).not.toBeNull()
      expect(node!.id).toBe("node-1")
      expect(node!.type).toBe("p")
      expect(node!.content).toBe("Hello world")
    })
  })

  describe("peekChildIds", () => {
    test("returns empty array when no children", () => {
      expect(store.peekChildIds("parent-1")).toEqual([])
    })

    test("returns sorted child IDs by parent_idx", () => {
      // Create parent
      store.commit([
        {
          type: "node_created",
          actor: "test",
          data: { id: "parent-1", type: "h", parent_id: null, parent_idx: 0 },
        },
      ])

      // Create children in reverse order
      store.commit([
        {
          type: "node_created",
          actor: "test",
          data: { id: "child-c", type: "p", parent_id: "parent-1", parent_idx: 2 },
        },
        {
          type: "node_created",
          actor: "test",
          data: { id: "child-a", type: "p", parent_id: "parent-1", parent_idx: 0 },
        },
        {
          type: "node_created",
          actor: "test",
          data: { id: "child-b", type: "p", parent_id: "parent-1", parent_idx: 1 },
        },
      ])

      const childIds = store.peekChildIds("parent-1")
      expect(childIds).toEqual(["child-a", "child-b", "child-c"])
    })
  })

  describe("commit", () => {
    test("applies events and returns CommitResult with delta", () => {
      const result = store.commit([
        {
          type: "node_created",
          actor: "test",
          data: { id: "n1", type: "p", parent_id: "root", parent_idx: 0 },
        },
      ])

      expect(result.meta.source).toBe("local")
      expect(result.meta.commitId).toBeTruthy()
      expect(result.events).toHaveLength(1)
      expect(result.events[0]!.type).toBe("node_created")
      expect(result.events[0]!.id).toBeTruthy()
      expect(result.events[0]!.ts).toBeGreaterThan(0)
      expect(result.delta.nodeIds).toContain("n1")
      expect(result.delta.parentIds).toContain("root")
    })

    test("respects custom meta", () => {
      const result = store.commit(
        [{ type: "node_created", actor: "test", data: { id: "n1", type: "p" } }],
        { source: "undo", commitId: "custom-id" },
      )

      expect(result.meta.source).toBe("undo")
      expect(result.meta.commitId).toBe("custom-id")
    })

    test("notifies listeners", () => {
      const results: ReturnType<typeof store.commit>[] = []
      store.onCommit((r) => results.push(r))

      store.commit([
        { type: "node_created", actor: "test", data: { id: "n1", type: "p" } },
      ])

      expect(results).toHaveLength(1)
      expect(results[0]!.events[0]!.type).toBe("node_created")
    })

    test("merges deltas across multiple events in one commit", () => {
      const result = store.commit([
        {
          type: "node_created",
          actor: "test",
          data: { id: "n1", type: "p", parent_id: "root", parent_idx: 0 },
        },
        {
          type: "node_created",
          actor: "test",
          data: { id: "n2", type: "p", parent_id: "root", parent_idx: 1 },
        },
      ])

      expect(result.events).toHaveLength(2)
      // Both nodes in delta
      expect(result.delta.nodeIds).toContain("n1")
      expect(result.delta.nodeIds).toContain("n2")
      // Parent deduplicated
      expect(result.delta.parentIds).toEqual(["root"])
    })
  })

  describe("onCommit", () => {
    test("fires for each commit", () => {
      let count = 0
      store.onCommit(() => count++)

      store.commit([{ type: "node_created", actor: "test", data: { id: "a", type: "p" } }])
      store.commit([{ type: "node_created", actor: "test", data: { id: "b", type: "p" } }])

      expect(count).toBe(2)
    })

    test("unsubscribe stops notifications", () => {
      let count = 0
      const unsub = store.onCommit(() => count++)

      store.commit([{ type: "node_created", actor: "test", data: { id: "a", type: "p" } }])
      unsub()
      store.commit([{ type: "node_created", actor: "test", data: { id: "b", type: "p" } }])

      expect(count).toBe(1)
    })
  })

  describe("round-trip", () => {
    test("node_updated modifies existing node", () => {
      store.commit([
        {
          type: "node_created",
          actor: "test",
          data: { id: "n1", type: "p", content: "before" },
        },
      ])

      store.commit([
        {
          type: "node_updated",
          actor: "test",
          target: "n1",
          data: { content: "after" },
        },
      ])

      const node = store.peekNode("n1")
      expect(node!.content).toBe("after")
    })

    test("node_deleted removes node", () => {
      store.commit([
        {
          type: "node_created",
          actor: "test",
          data: { id: "n1", type: "p", parent_id: "root" },
        },
      ])

      store.commit([
        {
          type: "node_deleted",
          actor: "test",
          target: "n1",
          data: { parent_id: "root" },
        },
      ])

      expect(store.peekNode("n1")).toBeNull()
    })

    test("node_moved updates parent", () => {
      store.commit([
        { type: "node_created", actor: "test", data: { id: "p1", type: "h" } },
        { type: "node_created", actor: "test", data: { id: "p2", type: "h" } },
        { type: "node_created", actor: "test", data: { id: "child", type: "p", parent_id: "p1", parent_idx: 0 } },
      ])

      expect(store.peekChildIds("p1")).toContain("child")
      expect(store.peekChildIds("p2")).not.toContain("child")

      store.commit([
        {
          type: "node_moved",
          actor: "test",
          target: "child",
          data: { parent_id: "p2", old_parent_id: "p1", parent_idx: 0 },
        },
      ])

      expect(store.peekChildIds("p1")).not.toContain("child")
      expect(store.peekChildIds("p2")).toContain("child")
    })
  })
})
