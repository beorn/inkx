/**
 * Schema v8 — partial UNIQUE INDEX on (parent_id, name) for fs-materialized
 * nodes (`fstype IS NOT NULL AND name IS NOT NULL`).
 *
 * Catches watcher-bug ambiguity at the storage seam: when a rename or atomic
 * write briefly produces two rows sharing parent_id + name for the same
 * fstype, the constraint fails the bad write atomically instead of leaking
 * an "ambiguous resolution" condition further down the stack. Mdsections
 * (fstype IS NULL) are deliberately excluded because `## Goals` appearing
 * twice in one file is valid markdown.
 *
 * Tracked by `@km/storage/parent-name-unique-partial`.
 */

import { Database, SQLiteError } from "bun:sqlite"
import { describe, expect, test } from "vitest"
import { SCHEMA, SCHEMA_VERSION, migrateSchema } from "../src/db/schema.ts"

function freshDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

const NOW = 1700000000000

interface InsertOpts {
  id: string
  parentId: string | null
  name: string | null
  fstype: string | null
}

function insertNode(db: Database, opts: InsertOpts): void {
  db.prepare(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, name, fstype, data, created_at, updated_at, version)
     VALUES (?, 'h', ?, 0, ?, ?, '{}', ?, ?, '')`,
  ).run(opts.id, opts.parentId, opts.name, opts.fstype, NOW, NOW)
}

describe("schema v8 — partial UNIQUE (parent_id, name) WHERE fstype IS NOT NULL", () => {
  test("SCHEMA_VERSION is 8", () => {
    expect(SCHEMA_VERSION).toBe(8)
  })

  test("fresh DB has idx_nodes_parent_name_fstype", () => {
    const db = freshDb()
    const row = db
      .query("SELECT name, sql FROM sqlite_master WHERE type='index' AND name='idx_nodes_parent_name_fstype'")
      .get() as { name: string; sql: string } | null
    expect(row).not.toBeNull()
    // Confirm the partial predicate is present — guards against a future
    // edit that promotes it to a non-partial UNIQUE (which would clobber
    // legitimate mdsection name collisions).
    expect(row!.sql).toMatch(/WHERE.*fstype\s+IS\s+NOT\s+NULL/i)
    expect(row!.sql).toMatch(/name\s+IS\s+NOT\s+NULL/i)
  })

  test("BLOCKS: two fs-materialized rows with same (parent_id, name)", () => {
    const db = freshDb()
    insertNode(db, { id: "a", parentId: "parent-1", name: "foo", fstype: "file" })
    expect(() => insertNode(db, { id: "b", parentId: "parent-1", name: "foo", fstype: "file" })).toThrow(SQLiteError)
  })

  test("BLOCKS: even when fstypes differ (file vs folder both materialize)", () => {
    const db = freshDb()
    insertNode(db, { id: "a", parentId: "parent-1", name: "foo", fstype: "folder" })
    expect(() => insertNode(db, { id: "b", parentId: "parent-1", name: "foo", fstype: "file" })).toThrow(SQLiteError)
  })

  test("ALLOWS: two mdsections (fstype = NULL) with same (parent_id, name)", () => {
    const db = freshDb()
    // `## Goals` twice in the same file is valid markdown.
    insertNode(db, { id: "a", parentId: "file-1", name: "Goals", fstype: null })
    expect(() => insertNode(db, { id: "b", parentId: "file-1", name: "Goals", fstype: null })).not.toThrow()
  })

  test("ALLOWS: an fs row alongside a section row with the same name", () => {
    const db = freshDb()
    // The partial predicate excludes the mdsection from the unique set.
    insertNode(db, { id: "file", parentId: "parent-1", name: "foo", fstype: "file" })
    expect(() => insertNode(db, { id: "section", parentId: "parent-1", name: "foo", fstype: null })).not.toThrow()
  })

  test("ALLOWS: row with fstype set but name = NULL (repo root)", () => {
    const db = freshDb()
    // Repo root has fstype='repo' and name=NULL; partial predicate excludes
    // it via the second conjunct (name IS NOT NULL).
    insertNode(db, { id: "root-1", parentId: null, name: null, fstype: "repo" })
    expect(() => insertNode(db, { id: "root-2", parentId: null, name: null, fstype: "repo" })).not.toThrow()
  })

  test("ALLOWS: same name under different parents", () => {
    const db = freshDb()
    insertNode(db, { id: "a", parentId: "parent-1", name: "foo", fstype: "file" })
    expect(() => insertNode(db, { id: "b", parentId: "parent-2", name: "foo", fstype: "file" })).not.toThrow()
  })

  test("migrateSchema is idempotent — re-running on a v8 DB is a no-op", () => {
    const db = freshDb()
    expect(() => migrateSchema(db)).not.toThrow()
    expect(() => migrateSchema(db)).not.toThrow()
  })

  test("migrateSchema refuses to upgrade a v7 DB with existing duplicates", () => {
    // Simulate a pre-v8 DB by stamping schema_version=7 and seeding two
    // colliding fs rows. The partial UNIQUE doesn't exist yet at v7, so
    // the duplicates can be inserted.
    const db = freshDb()
    db.run("DROP INDEX IF EXISTS idx_nodes_parent_name_fstype")
    db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '7')")
    insertNode(db, { id: "a", parentId: "parent-1", name: "foo", fstype: "file" })
    insertNode(db, { id: "b", parentId: "parent-1", name: "foo", fstype: "file" })

    expect(() => migrateSchema(db)).toThrow(/v7 → v8 migration aborted/)
    // Version was NOT bumped — half-migration would be worse than failing.
    const row = db.query("SELECT value FROM meta WHERE key='schema_version'").get() as {
      value: string
    }
    expect(row.value).toBe("7")
  })

  test("migrateSchema upgrades a clean v7 DB to v8 without error", () => {
    const db = freshDb()
    db.run("DROP INDEX IF EXISTS idx_nodes_parent_name_fstype")
    db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '7')")
    insertNode(db, { id: "a", parentId: "parent-1", name: "foo", fstype: "file" })
    insertNode(db, { id: "b", parentId: "parent-1", name: "bar", fstype: "file" })

    expect(() => migrateSchema(db)).not.toThrow()
    const row = db.query("SELECT value FROM meta WHERE key='schema_version'").get() as {
      value: string
    }
    expect(row.value).toBe(String(SCHEMA_VERSION))
    // Index is now present and enforces the constraint going forward.
    expect(() => insertNode(db, { id: "c", parentId: "parent-1", name: "foo", fstype: "file" })).toThrow(SQLiteError)
  })
})
