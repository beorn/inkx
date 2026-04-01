/**
 * Tests for recursive delete (Bug 1) and event compaction replay (Bug 2)
 *
 * Bug 1: deleteNodeImpl and applyNodeDeleted must recursively delete
 * descendants and clean up links. The emitted event must include metadata.
 *
 * Bug 2: identifyStaleEvents must not mark node_created as stale when
 * later events for the same node exist in the log.
 */

import { describe, test, expect, afterEach } from "vitest"
import { Database } from "bun:sqlite"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { SCHEMA } from "../src/schema.ts"
import { createDbOps } from "../src/db-ops.ts"
import { applyEventWithDb } from "../src/db-events.ts"
import { identifyStaleEvents } from "../src/event-compaction.ts"
import type { Event } from "@km/core"

// =============================================================================
// Helpers
// =============================================================================

function createTestDatabase(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

function getNodeCount(db: Database): number {
  return (db.query("SELECT COUNT(*) as cnt FROM nodes").get() as { cnt: number }).cnt
}

function getNodeIds(db: Database): Set<string> {
  const rows = db.query("SELECT id FROM nodes").all() as { id: string }[]
  return new Set(rows.map((r) => r.id))
}

function getLinkCount(db: Database): number {
  return (db.query("SELECT COUNT(*) as cnt FROM links").get() as { cnt: number }).cnt
}

function insertNode(
  db: Database,
  id: string,
  parentId: string | null,
  opts: { type?: string; fs_path?: string; content?: string } = {},
): void {
  const now = Date.now()
  db.run(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, item, content, fs_path, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, '{}', ?, ?)`,
    [id, opts.type ?? "p", parentId, now, opts.content ?? id, opts.fs_path ?? null, now, now],
  )
}

function insertLink(db: Database, sourceId: string, targetName: string, targetId?: string | null): void {
  db.run(
    `INSERT INTO links (source_id, target_name, target_id, section, block_id, relationship, created_at)
     VALUES (?, ?, ?, '', '', '', ?)`,
    [sourceId, targetName, targetId ?? null, Date.now()],
  )
}

// Track temp dirs for cleanup
const createdDirs: string[] = []

afterEach(() => {
  for (const dir of createdDirs) {
    try {
      rmSync(dir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  }
  createdDirs.length = 0
})

function createTestDir(): string {
  const dir = join("/tmp", `kmtest-delete-${ulid()}`)
  mkdirSync(dir, { recursive: true })
  createdDirs.push(dir)
  return dir
}

// =============================================================================
// Bug 1: Recursive Delete
// =============================================================================

describe("recursive delete", () => {
  test("deleteNodeImpl (no emitter) deletes children recursively", () => {
    const db = createTestDatabase()
    insertNode(db, "parent", null)
    insertNode(db, "child1", "parent")
    insertNode(db, "child2", "parent")
    insertNode(db, "grandchild", "child1")
    expect(getNodeCount(db)).toBe(4)

    const ops = createDbOps(db)
    ops.deleteNode("parent")

    expect(getNodeCount(db)).toBe(0)
  })

  test("deleteNodeImpl (no emitter) cleans up links referencing deleted nodes", () => {
    const db = createTestDatabase()
    insertNode(db, "parent", null)
    insertNode(db, "child", "parent")
    insertNode(db, "other", null)

    // Links where deleted nodes are source or target
    insertLink(db, "child", "other", "other")
    insertLink(db, "other", "parent", "parent")
    insertLink(db, "other", "other") // link not involving deleted nodes
    expect(getLinkCount(db)).toBe(3)

    const ops = createDbOps(db)
    ops.deleteNode("parent")

    // Only the link from "other" to "other" should remain
    expect(getLinkCount(db)).toBe(1)
    const remaining = db.query("SELECT source_id, target_name FROM links").get() as {
      source_id: string
      target_name: string
    }
    expect(remaining.source_id).toBe("other")
    expect(remaining.target_name).toBe("other")
  })

  test("deleteNodeImpl (with emitter) includes metadata in event", () => {
    const db = createTestDatabase()
    insertNode(db, "parent", ".", { fs_path: "tasks.md", type: "h" })
    insertNode(db, "child", "parent")

    const emittedEvents: Event[] = []
    const fakeEmitter = {
      kmDir: "/tmp",
      eventsPath: "/tmp/events.jsonl",
      emit(event: Omit<Event, "id" | "ts">, _options?: unknown): Event {
        const full: Event = { id: ulid(), ts: Date.now(), ...event }
        // Apply to db so we can verify recursive delete happens
        applyEventWithDb(db, full)
        emittedEvents.push(full)
        return full
      },
      setEventHub() {},
      setFsSync() {},
      getEventHub() {
        return null
      },
      getFsSync() {
        return null
      },
      close() {},
    }

    const ops = createDbOps(db, fakeEmitter as any)
    ops.deleteNode("parent")

    expect(emittedEvents.length).toBe(1)
    const event = emittedEvents[0]!
    expect(event.type).toBe("node_deleted")
    expect(event.data.fs_path).toBe("tasks.md")
    expect(event.data.type).toBe("h")
    expect(event.data.parent_id).toBe(".")
  })

  test("applyNodeDeleted recursively deletes descendants", () => {
    const db = createTestDatabase()
    insertNode(db, "root", null)
    insertNode(db, "A", "root")
    insertNode(db, "B", "root")
    insertNode(db, "A1", "A")
    insertNode(db, "A2", "A")
    insertNode(db, "A1a", "A1")
    expect(getNodeCount(db)).toBe(6)

    const event: Event = {
      id: ulid(),
      ts: Date.now(),
      type: "node_deleted",
      actor: "user",
      target: "root",
      data: {},
    }
    applyEventWithDb(db, event)

    expect(getNodeCount(db)).toBe(0)
  })

  test("applyNodeDeleted cleans up links for all deleted nodes", () => {
    const db = createTestDatabase()
    insertNode(db, "parent", null)
    insertNode(db, "child", "parent")
    insertNode(db, "unrelated", null)

    insertLink(db, "child", "unrelated", "unrelated") // source is deleted
    insertLink(db, "unrelated", "parent", "parent") // target_id is deleted
    insertLink(db, "unrelated", "unrelated") // no relation to deleted nodes
    expect(getLinkCount(db)).toBe(3)

    const event: Event = {
      id: ulid(),
      ts: Date.now(),
      type: "node_deleted",
      actor: "user",
      target: "parent",
      data: {},
    }
    applyEventWithDb(db, event)

    expect(getLinkCount(db)).toBe(1)
  })

  test("deleting a leaf node works correctly", () => {
    const db = createTestDatabase()
    insertNode(db, "parent", null)
    insertNode(db, "leaf", "parent")

    const ops = createDbOps(db)
    ops.deleteNode("leaf")

    expect(getNodeCount(db)).toBe(1)
    expect(getNodeIds(db).has("parent")).toBe(true)
  })

  test("deleting a non-existent node is a no-op", () => {
    const db = createTestDatabase()
    insertNode(db, "existing", null)

    const ops = createDbOps(db)
    ops.deleteNode("non-existent")

    expect(getNodeCount(db)).toBe(1)
  })

  test("deeply nested tree is fully deleted", () => {
    const db = createTestDatabase()
    // Create a chain: root -> A -> B -> C -> D -> E
    insertNode(db, "root", null)
    insertNode(db, "A", "root")
    insertNode(db, "B", "A")
    insertNode(db, "C", "B")
    insertNode(db, "D", "C")
    insertNode(db, "E", "D")
    expect(getNodeCount(db)).toBe(6)

    const ops = createDbOps(db)
    ops.deleteNode("root")

    expect(getNodeCount(db)).toBe(0)
  })
})

// =============================================================================
// Bug 2: Event Compaction Replay
// =============================================================================

describe("event compaction replay", () => {
  test("node_created with later updates is preserved", () => {
    const testDir = createTestDir()
    const kmDir = join(testDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    const nodeId = "node-abc"

    // Write events: create + update
    const events: Event[] = [
      { id: "evt1", ts: 1000, type: "node_created", actor: "user", data: { id: nodeId, type: "p", content: "hello" } },
      {
        id: "evt2",
        ts: 2000,
        type: "node_updated",
        actor: "user",
        target: nodeId,
        data: { content: "updated hello" },
      },
    ]
    writeFileSync(join(kmDir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n")

    // Build a DB with the node in it (simulating current state)
    const db = createTestDatabase()
    insertNode(db, nodeId, null, { content: "updated hello" })

    const result = identifyStaleEvents(kmDir, db)

    // The create event must be preserved (it has a later update)
    expect(result.staleCount).toBe(0)
    expect(result.keptEvents.length).toBe(2)
  })

  test("node_created with later delete is preserved", () => {
    const testDir = createTestDir()
    const kmDir = join(testDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    const nodeId = "node-del"

    const events: Event[] = [
      { id: "evt1", ts: 1000, type: "node_created", actor: "user", data: { id: nodeId, type: "p", content: "temp" } },
      { id: "evt2", ts: 2000, type: "node_deleted", actor: "user", target: nodeId, data: {} },
    ]
    writeFileSync(join(kmDir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n")

    // Node was created and deleted, so it doesn't exist in DB
    const db = createTestDatabase()

    const result = identifyStaleEvents(kmDir, db)

    // Both events should be kept — the create is needed for the delete to make sense
    expect(result.staleCount).toBe(0)
    expect(result.keptEvents.length).toBe(2)
  })

  test("standalone node_created for existing node with no later events IS stale", () => {
    const testDir = createTestDir()
    const kmDir = join(testDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    const nodeId = "node-stale"

    const events: Event[] = [
      {
        id: "evt1",
        ts: 1000,
        type: "node_created",
        actor: "user",
        data: { id: nodeId, type: "p", content: "stale" },
      },
    ]
    writeFileSync(join(kmDir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n")

    // Node exists in DB (from file parsing), no later events
    const db = createTestDatabase()
    insertNode(db, nodeId, null, { content: "stale" })

    const result = identifyStaleEvents(kmDir, db)

    // This create IS stale: node exists in DB and no later events reference it
    expect(result.staleCount).toBe(1)
    expect(result.keptEvents.length).toBe(0)
  })

  test("compacted events are replayable to produce same final state", () => {
    const testDir = createTestDir()
    const kmDir = join(testDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    const nodeA = "node-A"
    const nodeB = "node-B"

    const events: Event[] = [
      {
        id: "evt1",
        ts: 1000,
        type: "node_created",
        actor: "user",
        data: { id: nodeA, type: "p", parent_id: ".", parent_idx: 0, item: {}, content: "A" },
      },
      {
        id: "evt2",
        ts: 2000,
        type: "node_created",
        actor: "user",
        data: { id: nodeB, type: "p", parent_id: ".", parent_idx: 1, item: {}, content: "B" },
      },
      { id: "evt3", ts: 3000, type: "node_updated", actor: "user", target: nodeA, data: { content: "A updated" } },
    ]
    writeFileSync(join(kmDir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n")

    // Build "current" DB with both nodes
    const currentDb = createTestDatabase()
    insertNode(currentDb, nodeA, ".", { content: "A updated" })
    insertNode(currentDb, nodeB, ".", { content: "B" })

    const result = identifyStaleEvents(kmDir, currentDb)

    // nodeA's create must be preserved (has later update)
    // nodeB's create is stale (exists in DB, no later events)
    expect(result.keptEvents.map((e) => e.id)).toContain("evt1")
    expect(result.keptEvents.map((e) => e.id)).toContain("evt3")

    // Replay the kept events onto an empty DB
    const replayDb = createTestDatabase()
    for (const event of result.keptEvents) {
      applyEventWithDb(replayDb, event)
    }

    // nodeA must exist with updated content
    const nodeAResult = replayDb.query("SELECT content FROM nodes WHERE id = ?").get(nodeA) as {
      content: string
    } | null
    expect(nodeAResult).not.toBeNull()
    expect(nodeAResult!.content).toBe("A updated")
  })

  test("non-node events are always preserved", () => {
    const testDir = createTestDir()
    const kmDir = join(testDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    const events: Event[] = [
      {
        id: "evt1",
        ts: 1000,
        type: "session_started",
        actor: "agent",
        data: { session_id: "s1", model: "test" },
      },
      { id: "evt2", ts: 2000, type: "message", actor: "user", data: { text: "hello" } },
    ]
    writeFileSync(join(kmDir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n")

    const db = createTestDatabase()
    const result = identifyStaleEvents(kmDir, db)

    expect(result.staleCount).toBe(0)
    expect(result.keptEvents.length).toBe(2)
  })
})
