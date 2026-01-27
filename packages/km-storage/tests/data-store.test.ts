/**
 * DataStore Interface Tests
 *
 * Tests for DataStore factories: createMapDataStore, createMemDataStore, createDBDataStore.
 * These are unit tests that verify the interface contracts without external dependencies.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { Database } from "bun:sqlite"
import {
  createMapDataStore,
  createMemDataStore,
  createDBDataStore,
  SCHEMA,
  type DataStore,
} from "../src/index.ts"

// =============================================================================
// Shared Test Suite (runs against all implementations)
// =============================================================================

function testDataStore(name: string, factory: () => DataStore) {
  describe(name, () => {
    let store: DataStore

    beforeEach(() => {
      store = factory()
    })

    afterEach(() => {
      store.close()
    })

    describe("addNode", () => {
      test("adds a node with generated ID", () => {
        const id = store.addNode(null, { type: "task", content: "Test task" })
        expect(id).toBeTruthy()
        expect(typeof id).toBe("string")
      })

      test("adds a node with specified ID", () => {
        const id = store.addNode(null, {
          id: "custom-id",
          type: "task",
          content: "Test",
        })
        expect(id).toBe("custom-id")
      })

      test("adds a node under parent", () => {
        const parentId = store.addNode(null, {
          type: "section",
          content: "Parent",
        })
        const childId = store.addNode(parentId, {
          type: "task",
          content: "Child",
        })

        const child = store.getNode(childId)
        expect(child?.parent_id).toBe(parentId)
      })

      test("sets task defaults for task type", () => {
        const id = store.addNode(null, { type: "task", content: "Test" })
        const node = store.getNode(id)

        expect(node?.task_status).toBe("todo")
        expect(node?.task_mark).toBe(" ")
      })
    })

    describe("getNode", () => {
      test("returns null for non-existent node", () => {
        expect(store.getNode("nonexistent")).toBeNull()
      })

      test("returns node by ID", () => {
        const id = store.addNode(null, { type: "task", content: "Test" })
        const node = store.getNode(id)

        expect(node).not.toBeNull()
        expect(node?.id).toBe(id)
        expect(node?.content).toBe("Test")
      })
    })

    describe("getChildren", () => {
      test("returns empty array for no children", () => {
        const parentId = store.addNode(null, { type: "section" })
        expect(store.getChildren(parentId)).toEqual([])
      })

      test("returns children sorted by parent_idx", () => {
        const parentId = store.addNode(null, { type: "section" })
        store.addNode(parentId, { type: "task", content: "C", parent_idx: 3 })
        store.addNode(parentId, { type: "task", content: "A", parent_idx: 1 })
        store.addNode(parentId, { type: "task", content: "B", parent_idx: 2 })

        const children = store.getChildren(parentId)
        expect(children.map((n) => n.content)).toEqual(["A", "B", "C"])
      })

      test("returns root-level nodes with null parent", () => {
        store.addNode(null, { type: "file", content: "Root 1" })
        store.addNode(null, { type: "file", content: "Root 2" })

        const roots = store.getChildren(null)
        expect(roots.length).toBe(2)
      })
    })

    describe("getAllNodes", () => {
      test("returns empty array when empty", () => {
        expect(store.getAllNodes()).toEqual([])
      })

      test("returns all nodes", () => {
        store.addNode(null, { type: "task", content: "One" })
        store.addNode(null, { type: "task", content: "Two" })
        store.addNode(null, { type: "task", content: "Three" })

        expect(store.getAllNodes().length).toBe(3)
      })
    })

    describe("updateNode", () => {
      test("updates node properties", () => {
        const id = store.addNode(null, { type: "task", content: "Original" })
        store.updateNode(id, { content: "Updated" })

        const node = store.getNode(id)
        expect(node?.content).toBe("Updated")
      })

      test("preserves unmodified properties", () => {
        const id = store.addNode(null, {
          type: "task",
          content: "Test",
          priority: 1,
        })
        store.updateNode(id, { content: "Updated" })

        const node = store.getNode(id)
        expect(node?.priority).toBe(1)
      })

      test("updates updated_at timestamp", () => {
        const id = store.addNode(null, { type: "task", content: "Test" })
        const before = store.getNode(id)?.updated_at ?? 0

        // Small delay to ensure timestamp changes
        Bun.sleepSync(5)

        store.updateNode(id, { content: "Updated" })
        const after = store.getNode(id)?.updated_at ?? 0

        expect(after).toBeGreaterThan(before)
      })

      test("does nothing for non-existent node", () => {
        // Should not throw
        store.updateNode("nonexistent", { content: "Test" })
      })
    })

    describe("deleteNode", () => {
      test("removes node", () => {
        const id = store.addNode(null, { type: "task", content: "Test" })
        store.deleteNode(id)

        expect(store.getNode(id)).toBeNull()
      })

      test("does nothing for non-existent node", () => {
        // Should not throw
        store.deleteNode("nonexistent")
      })
    })

    describe("moveNode", () => {
      test("moves node to new parent", () => {
        const parent1 = store.addNode(null, { type: "section" })
        const parent2 = store.addNode(null, { type: "section" })
        const child = store.addNode(parent1, { type: "task", content: "Child" })

        store.moveNode(child, parent2, 100)

        const node = store.getNode(child)
        expect(node?.parent_id).toBe(parent2)
        expect(node?.parent_idx).toBe(100)
      })

      test("does nothing for non-existent node", () => {
        const parent = store.addNode(null, { type: "section" })
        // Should not throw
        store.moveNode("nonexistent", parent, 100)
      })
    })

    describe("search", () => {
      test("finds nodes by content", () => {
        store.addNode(null, { type: "task", content: "Buy groceries" })
        store.addNode(null, { type: "task", content: "Call mom" })
        store.addNode(null, { type: "task", content: "Buy presents" })

        const results = store.search("Buy")
        expect(results.length).toBe(2)
      })

      test("returns empty array for no matches", () => {
        store.addNode(null, { type: "task", content: "Test" })
        expect(store.search("nonexistent")).toEqual([])
      })
    })

    describe("close", () => {
      test("prevents further operations", () => {
        store.close()
        expect(() => store.getNode("test")).toThrow("closed")
      })

      test("is idempotent", () => {
        store.close()
        store.close() // Should not throw
      })
    })

    describe("Symbol.dispose", () => {
      test("calls close", () => {
        store[Symbol.dispose]()
        expect(() => store.getNode("test")).toThrow("closed")
      })
    })
  })
}

// =============================================================================
// Run tests for each implementation
// =============================================================================

testDataStore("createMapDataStore", createMapDataStore)
testDataStore("createMemDataStore", createMemDataStore)

describe("createDBDataStore", () => {
  let db: Database
  let store: DataStore

  beforeEach(() => {
    db = new Database(":memory:")
    db.run(SCHEMA)
    store = createDBDataStore(db)
  })

  afterEach(() => {
    store.close()
    db.close()
  })

  // Run the shared tests
  testDataStore("createDBDataStore (shared)", () => {
    const testDb = new Database(":memory:")
    testDb.run(SCHEMA)
    return createDBDataStore(testDb)
  })

  test("exposes database property", () => {
    // Need to cast to access HasDatabase capability
    const dbStore = store as DataStore & { database: Database }
    expect(dbStore.database).toBe(db)
  })

  test("does not close caller's database on close", () => {
    store.close()
    // Caller's db should still be open
    expect(() => db.run("SELECT 1")).not.toThrow()
  })
})
