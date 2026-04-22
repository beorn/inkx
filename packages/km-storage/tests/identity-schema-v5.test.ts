/**
 * Identity schema v5 — migration + round-trip tests.
 *
 * Covers hub/km/storage-architecture.md §2.4 + §3.2:
 *   - KNode carries fs_dev, fs_size, fs_content_hash
 *   - SCHEMA_VERSION=5 ALTER TABLEs them onto pre-v5 DBs
 *   - rowToNode round-trips them
 *   - The composite (fs_dev, fs_ino) index exists for reconciliation Step 1
 */

import { Database } from "bun:sqlite"
import { describe, expect, test } from "vitest"
import { SCHEMA, SCHEMA_VERSION, migrateSchema } from "../src/db/schema.ts"
import { insertNodeRow, INSERT_NODE_SQL } from "../src/db/insert.ts"
import { rowToNode } from "../src/db/queries/utils.ts"
import type { KNode } from "@km/core"

const BASE: KNode = {
  id: "01HKXB2W7K9M1X4Y2Z3ABCDEF",
  type: "p",
  parent_id: null,
  parent_idx: 0,
  data: {},
  created_at: 0,
  updated_at: 0,
  version: "",
}

function freshDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

describe("identity-schema v5", () => {
  test("SCHEMA_VERSION is 5", () => {
    expect(SCHEMA_VERSION).toBe(5)
  })

  test("fresh DB has fs_dev / fs_size / fs_content_hash columns", () => {
    const db = freshDb()
    const cols = db.query("PRAGMA table_info(nodes)").all() as { name: string }[]
    const names = new Set(cols.map((c) => c.name))
    expect(names.has("fs_dev")).toBe(true)
    expect(names.has("fs_size")).toBe(true)
    expect(names.has("fs_content_hash")).toBe(true)
  })

  test("fresh DB has composite (fs_dev, fs_ino) index", () => {
    const db = freshDb()
    const idx = db
      .query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='nodes'")
      .all() as { name: string }[]
    expect(idx.some((r) => r.name === "idx_nodes_fs_dev_ino")).toBe(true)
  })

  test("insertNodeRow round-trips fs metadata", () => {
    const db = freshDb()
    const stmt = db.prepare(INSERT_NODE_SQL)
    const node: KNode = {
      ...BASE,
      id: "01HKXB2W7K9M1X4Y2Z3ROUNDTRIP",
      fs_path: "notes/foo.md",
      fs_dev: 16777220,
      fs_ino: 12345678,
      fs_mtime: 1700000000000,
      fs_size: 4096,
      fs_content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      name: "foo",
    }
    insertNodeRow(stmt, node, 1700000000000)

    const row = db.query("SELECT * FROM nodes WHERE id = ?").get(node.id) as Record<string, unknown>
    const roundTripped = rowToNode(row)

    expect(roundTripped.fs_path).toBe("notes/foo.md")
    expect(roundTripped.fs_dev).toBe(16777220)
    expect(roundTripped.fs_ino).toBe(12345678)
    expect(roundTripped.fs_mtime).toBe(1700000000000)
    expect(roundTripped.fs_size).toBe(4096)
    expect(roundTripped.fs_content_hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    )
    expect(roundTripped.name).toBe("foo")
  })

  test("null fs_dev / fs_size / fs_content_hash round-trip as undefined", () => {
    const db = freshDb()
    const stmt = db.prepare(INSERT_NODE_SQL)
    const node: KNode = {
      ...BASE,
      id: "01HKXB2W7K9M1X4Y2Z3NULLS",
    }
    insertNodeRow(stmt, node, 1700000000000)

    const row = db.query("SELECT * FROM nodes WHERE id = ?").get(node.id) as Record<string, unknown>
    const roundTripped = rowToNode(row)

    expect(roundTripped.fs_dev).toBeUndefined()
    expect(roundTripped.fs_size).toBeUndefined()
    expect(roundTripped.fs_content_hash).toBeUndefined()
  })

  test("migrateSchema adds fs_dev/fs_size/fs_content_hash on pre-v5 DB", () => {
    // Simulate a pre-v5 DB by creating the nodes table without the new columns.
    const db = new Database(":memory:")
    db.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, fstype TEXT, parent_id TEXT,
        item INTEGER DEFAULT 0, embed_of TEXT, parent_idx REAL DEFAULT 0,
        fs_path TEXT, fs_ino INTEGER, fs_mtime INTEGER,
        name TEXT, block_id TEXT, title TEXT, md_pos INTEGER, md_line INTEGER,
        list_marker TEXT, task_marker TEXT, task_status TEXT,
        assigned_to TEXT, due_at TEXT, start_at TEXT, priority TEXT,
        content TEXT, content_hash TEXT, data JSON DEFAULT '{}',
        created_at INTEGER, updated_at INTEGER, version TEXT, parsed INTEGER DEFAULT 0
      );
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO meta (key, value) VALUES ('schema_version', '4');
    `)

    // Seed one row to verify it survives migration.
    db.run(
      "INSERT INTO nodes (id, type, parent_id, parent_idx, fs_path, fs_ino, name, data, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        "01HKXB2W7K9M1X4Y2Z3PREV5",
        "p",
        null,
        0,
        "notes/foo.md",
        555,
        "foo",
        "{}",
        0,
        0,
        "",
      ],
    )

    migrateSchema(db)
    db.run(SCHEMA) // idempotent re-run to pick up the new index

    const cols = db.query("PRAGMA table_info(nodes)").all() as { name: string }[]
    const names = new Set(cols.map((c) => c.name))
    expect(names.has("fs_dev")).toBe(true)
    expect(names.has("fs_size")).toBe(true)
    expect(names.has("fs_content_hash")).toBe(true)

    // Pre-existing row still present, new fields null.
    const row = db.query("SELECT * FROM nodes WHERE id = ?").get("01HKXB2W7K9M1X4Y2Z3PREV5") as
      | Record<string, unknown>
      | undefined
    expect(row).toBeDefined()
    expect(row!.fs_dev).toBeNull()
    expect(row!.fs_size).toBeNull()
    expect(row!.fs_content_hash).toBeNull()

    // Migration is idempotent.
    migrateSchema(db)
    migrateSchema(db)

    const version = (
      db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }
    ).value
    expect(parseInt(version, 10)).toBe(SCHEMA_VERSION)
  })
})

describe("branded identity types (@km/core)", () => {
  test("asNodeId / asRepoId are pure brand casts", async () => {
    const { asNodeId, asRepoId } = await import("@km/core")
    const id = asNodeId("01HKXB2W7K9M1X4Y2Z3ABC")
    const repo = asRepoId("01HKXB2W7K9M1X4Y2Z3DEF")
    // Values are unchanged at runtime — the brand is type-only.
    expect(id).toBe("01HKXB2W7K9M1X4Y2Z3ABC")
    expect(repo).toBe("01HKXB2W7K9M1X4Y2Z3DEF")
    // Phantom distinctness at the type level — can't compare NodeId to RepoId
    // without a cast, but at runtime they're both strings. This test asserts
    // the runtime contract only.
  })
})
