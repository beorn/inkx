/**
 * Events-table contract tests (@km/storage/events-table-replaces-jsonl).
 *
 * The events table is the SCHEMA_VERSION 12 replacement for changes.jsonl.
 * Every emitter.apply / commit writes an events row inside the same
 * transaction as the state mutation, so they commit atomically.
 */

import { describe, expect, test } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  SCHEMA,
  applyConnectionPragmas,
  createEmitter,
  ensureRepoRootNode,
  migrateData,
  migrateSchema,
} from "../src/index.ts"

function freshDb(): Database {
  const db = new Database(":memory:")
  applyConnectionPragmas(db)
  migrateSchema(db)
  db.run(SCHEMA)
  migrateData(db)
  return db
}

function freshKmDir(): string {
  return mkdtempSync(join(tmpdir(), "km-events-test-"))
}

interface EventRow {
  seq: number
  id: string
  ts: number
  type: string
  actor: string
  source: string | null
  target: string | null
  data: string
}

function readEventRows(db: Database): EventRow[] {
  return db.query("SELECT seq, id, ts, type, actor, source, target, data FROM events ORDER BY seq").all() as EventRow[]
}

describe("events table — atomic write with state mutation", () => {
  test("emitter.apply writes both a nodes row and an events row", () => {
    const db = freshDb()
    const kmDir = freshKmDir()
    ensureRepoRootNode(db, kmDir)
    const emitter = createEmitter({ kmDir, db })

    const change = emitter.apply({
      type: "node_created",
      actor: "user",
      data: { id: "n1", type: "p", parent_id: ".", parent_idx: 0, item: 1, content: "Hello" },
    })

    // Nodes row landed.
    const node = db.query("SELECT id, content FROM nodes WHERE id = ?").get("n1") as { id: string; content: string }
    expect(node.id).toBe("n1")
    expect(node.content).toBe("Hello")

    // Events row landed inside the same transaction.
    const events = readEventRows(db)
    expect(events).toHaveLength(1)
    expect(events[0]!.id).toBe(change.id)
    expect(events[0]!.type).toBe("node_created")
    expect(events[0]!.actor).toBe("user")
    expect(events[0]!.target).toBe(null) // node_created uses data.id, not target
    const parsed = JSON.parse(events[0]!.data)
    expect(parsed.data.id).toBe("n1")
  })

  test("emitter.commit also writes events row (used by FS-import path)", () => {
    const db = freshDb()
    const kmDir = freshKmDir()
    ensureRepoRootNode(db, kmDir)
    const emitter = createEmitter({ kmDir, db })

    emitter.commit(
      {
        type: "node_created",
        actor: "fs-watch",
        data: { id: "n2", type: "p", parent_id: ".", parent_idx: 0, item: 1, content: "FS" },
      },
      { source: "fs-import" },
    )

    const events = readEventRows(db)
    expect(events).toHaveLength(1)
    expect(events[0]!.actor).toBe("fs-watch")
    expect(events[0]!.source).toBe("fs-import")
  })

  test("skipPersist suppresses both jsonl AND events writes", () => {
    const db = freshDb()
    const kmDir = freshKmDir()
    ensureRepoRootNode(db, kmDir)
    const emitter = createEmitter({ kmDir, db })

    emitter.commit(
      {
        type: "node_created",
        actor: "system",
        data: { id: "n3", type: "p", parent_id: ".", parent_idx: 0, item: 1, content: "Replay" },
      },
      { skipPersist: true },
    )

    // State applied …
    const node = db.query("SELECT id FROM nodes WHERE id = ?").get("n3") as { id: string } | null
    expect(node?.id).toBe("n3")
    // … but no events row (skipPersist also gates the events write).
    const events = readEventRows(db)
    expect(events).toHaveLength(0)
  })

  test("update events use the `target` column for indexed backlinks", () => {
    const db = freshDb()
    const kmDir = freshKmDir()
    ensureRepoRootNode(db, kmDir)
    const emitter = createEmitter({ kmDir, db })

    emitter.apply({
      type: "node_created",
      actor: "user",
      data: { id: "n4", type: "p", parent_id: ".", parent_idx: 0, item: 1, content: "v1" },
    })
    emitter.apply({
      type: "node_updated",
      actor: "user",
      target: "n4",
      data: { content: "v2" },
    })

    const updateRow = db
      .query("SELECT seq, type, target FROM events WHERE type = 'node_updated'")
      .get() as EventRow | null
    expect(updateRow).not.toBeNull()
    expect(updateRow!.target).toBe("n4")

    // Indexed lookup by target works (this is the audit-query shape).
    const byTarget = db
      .query("SELECT type FROM events WHERE target = ? ORDER BY ts")
      .all("n4") as { type: string }[]
    expect(byTarget.map((r) => r.type)).toEqual(["node_updated"])
  })

  test("seq is monotonically increasing — drives replay cursor", () => {
    const db = freshDb()
    const kmDir = freshKmDir()
    ensureRepoRootNode(db, kmDir)
    const emitter = createEmitter({ kmDir, db })

    for (let i = 0; i < 5; i++) {
      emitter.apply({
        type: "node_created",
        actor: "user",
        data: { id: `n-seq-${i}`, type: "p", parent_id: ".", parent_idx: i, item: 1, content: String(i) },
      })
    }

    const rows = readEventRows(db)
    expect(rows).toHaveLength(5)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.seq).toBeGreaterThan(rows[i - 1]!.seq)
    }
  })

  test("events table survives schema migration v11 → v12", () => {
    // Simulate a pre-v12 DB: install schema then strip the events table
    // and roll the version back.
    const db = freshDb()
    db.run("DROP TABLE events")
    db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '11')")

    // Migration installs the events table.
    migrateSchema(db)
    db.run(SCHEMA) // re-run ensures all tables/indexes match the current shape

    // Verify table exists with the consensus shape.
    const cols = db.query("PRAGMA table_info(events)").all() as { name: string; notnull: number }[]
    const colNames = cols.map((c) => c.name).sort()
    expect(colNames).toEqual(
      ["actor", "data", "hlc", "id", "peer_id", "seq", "source", "target", "ts", "type", "v"].sort(),
    )

    // Indexes exist.
    const indexes = db.query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='events'").all() as {
      name: string
    }[]
    const indexNames = indexes.map((i) => i.name)
    expect(indexNames).toContain("idx_events_ts")
    expect(indexNames).toContain("idx_events_target")
    expect(indexNames).toContain("idx_events_type")
    expect(indexNames).toContain("idx_events_hlc_seq")

    // CHECK(json_valid(data)) is enforced.
    expect(() =>
      db.run(
        "INSERT INTO events (id, ts, type, actor, data) VALUES ('id-x', 1, 'node_created', 'user', 'not json')",
      ),
    ).toThrow()
  })
})
