/**
 * Identity schema v6 — block_id → name fold, anchor-wins migration.
 *
 * Covers hub/km/storage-architecture.md §2.3 + §2.4:
 *   - SCHEMA_VERSION = 6 and the `block_id` column is gone on fresh DBs
 *   - The `idx_nodes_block_id` index is gone
 *   - migrateSchema() folds existing `block_id` values into `name` on pre-v6 DBs
 *   - Anchor wins over content-derived slug when both are present
 *   - Migration is idempotent
 */

import { Database } from "bun:sqlite"
import { describe, expect, test } from "vitest"
import { SCHEMA, SCHEMA_VERSION, migrateSchema } from "../src/db/schema.ts"

function freshDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

describe("identity-schema v6 (block_id → name fold)", () => {
  test("SCHEMA_VERSION is 6", () => {
    expect(SCHEMA_VERSION).toBe(6)
  })

  test("fresh DB has no block_id column", () => {
    const db = freshDb()
    const cols = db.query("PRAGMA table_info(nodes)").all() as { name: string }[]
    const names = new Set(cols.map((c) => c.name))
    expect(names.has("name")).toBe(true)
    expect(names.has("block_id")).toBe(false)
  })

  test("fresh DB has no idx_nodes_block_id", () => {
    const db = freshDb()
    const indexes = db.query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='nodes'").all() as {
      name: string
    }[]
    expect(indexes.some((r) => r.name === "idx_nodes_block_id")).toBe(false)
    expect(indexes.some((r) => r.name === "idx_nodes_name")).toBe(true)
  })

  test("migrate pre-v6: block_id folds into name (anchor wins over slug)", () => {
    // Seed a v5-shaped DB: has block_id column, schema_version = 5.
    const db = new Database(":memory:")
    db.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, fstype TEXT, parent_id TEXT,
        item INTEGER DEFAULT 0, embed_of TEXT, parent_idx REAL DEFAULT 0,
        fs_path TEXT, fs_dev INTEGER, fs_ino INTEGER, fs_mtime INTEGER,
        fs_size INTEGER, fs_content_hash TEXT,
        name TEXT, block_id TEXT, title TEXT, md_pos INTEGER, md_line INTEGER,
        list_marker TEXT, task_marker TEXT, task_status TEXT,
        assigned_to TEXT, due_at TEXT, start_at TEXT, priority TEXT,
        content TEXT, content_hash TEXT, data JSON DEFAULT '{}',
        created_at INTEGER, updated_at INTEGER, version TEXT, parsed INTEGER DEFAULT 0
      );
      CREATE INDEX idx_nodes_block_id ON nodes(block_id);
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO meta (key, value) VALUES ('schema_version', '5');
    `)

    // Three canonical rows exercising the migration rules:
    //
    //  anchor-only : name is null, block_id is the anchor literal
    //                → post-migration, .name = anchor
    //  both        : name is the content-derived slug, block_id is the
    //                anchor literal → post-migration, anchor wins
    //                (.name = anchor)
    //  slug-only   : name is the slug, block_id is null
    //                → post-migration, .name stays as the slug
    //
    const seed = db.prepare(`
      INSERT INTO nodes (id, type, parent_id, parent_idx, name, block_id, content, data, created_at, updated_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const now = 1700000000000
    seed.run("anchor-only", "p", null, 0, null, "abc", "a paragraph", "{}", now, now, "")
    seed.run("both", "h", null, 1, "my-heading", "rec", "My Heading", "{}", now, now, "")
    seed.run("slug-only", "h", null, 2, "plain-heading", null, "Plain Heading", "{}", now, now, "")

    migrateSchema(db)

    // block_id column is gone.
    const cols = db.query("PRAGMA table_info(nodes)").all() as { name: string }[]
    expect(cols.some((c) => c.name === "block_id")).toBe(false)

    // idx_nodes_block_id is gone.
    const indexes = db.query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='nodes'").all() as {
      name: string
    }[]
    expect(indexes.some((i) => i.name === "idx_nodes_block_id")).toBe(false)

    // Row content: anchor wins when set, slug preserved otherwise.
    const rows = db.query("SELECT id, name FROM nodes ORDER BY id").all() as { id: string; name: string | null }[]
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.name]))
    expect(byId["anchor-only"]).toBe("abc")
    expect(byId["both"]).toBe("rec") // anchor wins over "my-heading"
    expect(byId["slug-only"]).toBe("plain-heading")

    // schema_version advanced to 6.
    const version = (db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }).value
    expect(parseInt(version, 10)).toBe(SCHEMA_VERSION)

    // Migration is idempotent.
    migrateSchema(db)
    migrateSchema(db)
    const rowsAfterRerun = db.query("SELECT id, name FROM nodes ORDER BY id").all() as {
      id: string
      name: string | null
    }[]
    expect(Object.fromEntries(rowsAfterRerun.map((r) => [r.id, r.name]))).toEqual(byId)
  })

  test("empty-string block_id does NOT overwrite name", () => {
    // Edge case: the migration SQL is `WHERE block_id IS NOT NULL AND
    // block_id != ''`. A row with an empty-string block_id should keep
    // its slug-derived name intact — the fold only fires on real anchors.
    const db = new Database(":memory:")
    db.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, parent_id TEXT,
        parent_idx REAL DEFAULT 0, name TEXT, block_id TEXT,
        created_at INTEGER, updated_at INTEGER, version TEXT
      );
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO meta (key, value) VALUES ('schema_version', '5');
      INSERT INTO nodes (id, type, parent_id, parent_idx, name, block_id, created_at, updated_at, version)
      VALUES ('x', 'h', NULL, 0, 'real-slug', '', 0, 0, '');
    `)

    migrateSchema(db)

    const row = db.query("SELECT name FROM nodes WHERE id='x'").get() as { name: string }
    expect(row.name).toBe("real-slug")
  })
})
