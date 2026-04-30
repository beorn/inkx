/**
 * Schema v7 — `deps` table for indexed bead-dependency lookups.
 *
 * Replaces the per-call O(N) JSON scan in km-beads dependent/blocker
 * queries with an indexed table populated by SQLite triggers from
 * `nodes.data.props["blocked-by"]`.
 *
 * Invariants verified here:
 *   - SCHEMA_VERSION = 7 and the deps table + indexes exist on a fresh DB.
 *   - Triggers populate deps on INSERT and reconcile on UPDATE.
 *   - DELETE FROM nodes cascades a delete from deps.
 *   - Both `link` (single target) and `list` (multi target) shapes index.
 *   - Migration from v6 backfills deps from existing JSON rows.
 *   - Re-running migrateSchema is idempotent.
 */

import { Database } from "bun:sqlite"
import { describe, expect, test } from "vitest"
import { SCHEMA, SCHEMA_VERSION, migrateSchema } from "../src/db/schema.ts"

function freshDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

const NOW = 1700000000000

function insertNode(db: Database, id: string, data: Record<string, unknown>): void {
  db.prepare(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, data, created_at, updated_at, version)
     VALUES (?, 'p', NULL, 0, ?, ?, ?, '')`,
  ).run(id, JSON.stringify(data), NOW, NOW)
}

function singleBlockedBy(target: string): Record<string, unknown> {
  return { props: { "blocked-by": { type: "link", target } } }
}

function listBlockedBy(targets: string[]): Record<string, unknown> {
  return {
    props: {
      "blocked-by": {
        type: "list",
        values: targets.map((t) => ({ type: "link", target: t })),
      },
    },
  }
}

function readDeps(db: Database, hostId: string): Array<{ target: string; kind: string }> {
  return db.query("SELECT target, kind FROM deps WHERE host_id = ? ORDER BY target").all(hostId) as Array<{
    target: string
    kind: string
  }>
}

describe("schema v7 — deps table", () => {
  test("SCHEMA_VERSION is 7", () => {
    expect(SCHEMA_VERSION).toBe(7)
  })

  test("fresh DB exposes the deps table with the canonical column shape", () => {
    const db = freshDb()
    const cols = db.query("PRAGMA table_info(deps)").all() as { name: string; type: string }[]
    const byName = new Map(cols.map((c) => [c.name, c.type.toUpperCase()]))
    expect(byName.get("host_id")).toBe("TEXT")
    expect(byName.get("target")).toBe("TEXT")
    expect(byName.get("kind")).toBe("TEXT")
  })

  test("fresh DB has the deps lookup indexes", () => {
    const db = freshDb()
    const idx = db.query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='deps'").all() as {
      name: string
    }[]
    const names = new Set(idx.map((r) => r.name))
    expect(names.has("idx_deps_target_kind")).toBe(true)
    expect(names.has("idx_deps_host")).toBe(true)
  })

  test("INSERT with single-link blocked-by produces one deps row", () => {
    const db = freshDb()
    insertNode(db, "host-1", singleBlockedBy("km-target1"))
    expect(readDeps(db, "host-1")).toEqual([{ target: "km-target1", kind: "blocked-by" }])
  })

  test("INSERT with list blocked-by produces one row per target", () => {
    const db = freshDb()
    insertNode(db, "host-2", listBlockedBy(["km-a", "km-b", "km-c"]))
    expect(readDeps(db, "host-2")).toEqual([
      { target: "km-a", kind: "blocked-by" },
      { target: "km-b", kind: "blocked-by" },
      { target: "km-c", kind: "blocked-by" },
    ])
  })

  test("INSERT with no blocked-by produces no deps rows", () => {
    const db = freshDb()
    insertNode(db, "host-3", { props: { rating: { type: "number", value: 5 } } })
    expect(readDeps(db, "host-3")).toEqual([])
  })

  test("UPDATE replacing blocked-by reconciles deps rows", () => {
    const db = freshDb()
    insertNode(db, "host-4", listBlockedBy(["km-a", "km-b"]))
    expect(readDeps(db, "host-4")).toHaveLength(2)

    db.prepare("UPDATE nodes SET data = ? WHERE id = ?").run(JSON.stringify(singleBlockedBy("km-c")), "host-4")

    expect(readDeps(db, "host-4")).toEqual([{ target: "km-c", kind: "blocked-by" }])
  })

  test("UPDATE clearing blocked-by removes all deps rows for that host", () => {
    const db = freshDb()
    insertNode(db, "host-5", listBlockedBy(["km-a", "km-b"]))
    expect(readDeps(db, "host-5")).toHaveLength(2)

    db.prepare("UPDATE nodes SET data = ? WHERE id = ?").run(JSON.stringify({}), "host-5")
    expect(readDeps(db, "host-5")).toEqual([])
  })

  test("DELETE FROM nodes cascades the deps rows", () => {
    const db = freshDb()
    insertNode(db, "host-6", listBlockedBy(["km-a", "km-b"]))
    expect(readDeps(db, "host-6")).toHaveLength(2)

    db.prepare("DELETE FROM nodes WHERE id = ?").run("host-6")
    expect(readDeps(db, "host-6")).toEqual([])
  })

  test("multiple hosts blocking the same target index together", () => {
    const db = freshDb()
    insertNode(db, "host-A", singleBlockedBy("km-shared"))
    insertNode(db, "host-B", singleBlockedBy("km-shared"))
    insertNode(db, "host-C", listBlockedBy(["km-shared", "km-other"]))

    const rows = db
      .query("SELECT host_id FROM deps WHERE target = ? AND kind = 'blocked-by' ORDER BY host_id")
      .all("km-shared") as { host_id: string }[]

    expect(rows.map((r) => r.host_id)).toEqual(["host-A", "host-B", "host-C"])
  })

  test("migration from v6 backfills deps from existing rows", () => {
    // Build a v6-shaped DB: schema_version=6, no deps table, but rows already
    // carry blocked-by data in the nodes JSON.
    const db = new Database(":memory:")
    db.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, fstype TEXT, parent_id TEXT,
        item INTEGER DEFAULT 0, embed_of TEXT, parent_idx REAL DEFAULT 0,
        fs_path TEXT, fs_dev INTEGER, fs_ino INTEGER, fs_mtime INTEGER,
        fs_size INTEGER, fs_content_hash TEXT,
        name TEXT, title TEXT, md_pos INTEGER, md_line INTEGER,
        list_marker TEXT, task_marker TEXT, task_status TEXT,
        assigned_to TEXT, due_at TEXT, start_at TEXT, priority TEXT,
        content TEXT, content_hash TEXT, data JSON DEFAULT '{}',
        created_at INTEGER, updated_at INTEGER, version TEXT, parsed INTEGER DEFAULT 0
      );
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO meta (key, value) VALUES ('schema_version', '6');
    `)

    const seed = db.prepare(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, data, created_at, updated_at, version)
       VALUES (?, 'p', NULL, 0, ?, ?, ?, '')`,
    )
    seed.run("legacy-1", JSON.stringify(singleBlockedBy("km-legacy-target")), NOW, NOW)
    seed.run("legacy-2", JSON.stringify(listBlockedBy(["km-x", "km-y"])), NOW, NOW)
    seed.run("legacy-3", JSON.stringify({}), NOW, NOW) // no blockers

    migrateSchema(db)

    expect(readDeps(db, "legacy-1")).toEqual([{ target: "km-legacy-target", kind: "blocked-by" }])
    expect(readDeps(db, "legacy-2")).toEqual([
      { target: "km-x", kind: "blocked-by" },
      { target: "km-y", kind: "blocked-by" },
    ])
    expect(readDeps(db, "legacy-3")).toEqual([])

    const recorded = db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }
    expect(parseInt(recorded.value, 10)).toBe(SCHEMA_VERSION)
  })

  test("migrateSchema is idempotent on a v7 DB", () => {
    const db = freshDb()
    insertNode(db, "host-x", singleBlockedBy("km-y"))
    const before = readDeps(db, "host-x")

    migrateSchema(db)
    migrateSchema(db)

    expect(readDeps(db, "host-x")).toEqual(before)
  })
})
