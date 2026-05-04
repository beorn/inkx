/**
 * Schema v9 — node_aliases table + triggers populated from data.aliases JSON.
 *
 * Bead: @km/storage/aliases-first-class
 *
 * The trigger pattern mirrors the v7 deps cascade:
 * INSERT/UPDATE/DELETE on `nodes` keep `node_aliases` in sync with the
 * `data.aliases` JSON array. Reverse lookup (`alias → node_id`) goes
 * through `idx_node_aliases_alias` for O(log N) instead of a per-query
 * json_each scan.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"

import { SCHEMA, SCHEMA_VERSION, migrateSchema } from "../src/db/schema.ts"

const NOW = 1_700_000_000_000

function freshDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  migrateSchema(db)
  return db
}

function insertNode(
  db: Database,
  opts: {
    id: string
    parentId?: string | null
    name: string
    fstype?: string | null
    aliases?: string[]
  },
): void {
  const data = opts.aliases ? JSON.stringify({ aliases: opts.aliases }) : "{}"
  db.prepare(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, name, fstype, data, created_at, updated_at, version)
     VALUES (?, 'h', ?, 0, ?, ?, ?, ?, ?, '')`,
  ).run(opts.id, opts.parentId ?? null, opts.name, opts.fstype ?? null, data, NOW, NOW)
}

describe("schema v9 — node_aliases populated by triggers from data.aliases JSON", () => {
  test("SCHEMA_VERSION is >= 9 (v9 introduced this table)", () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(9)
  })

  test("fresh DB has node_aliases table + indexes", () => {
    const db = freshDb()
    const table = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='node_aliases'").get()
    expect(table).not.toBeNull()
    const idx = db.query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_node_aliases_alias'").get()
    expect(idx).not.toBeNull()
  })

  test("INSERT trigger: data.aliases JSON populates node_aliases rows", () => {
    const db = freshDb()
    insertNode(db, {
      id: "node-1",
      name: "foo",
      fstype: "mdfile",
      aliases: ["km-beads.foo", "km-beads-foo"],
    })
    const rows = db.query("SELECT alias FROM node_aliases WHERE node_id = 'node-1' ORDER BY alias").all() as Array<{
      alias: string
    }>
    expect(rows.map((r) => r.alias)).toEqual(["km-beads-foo", "km-beads.foo"])
  })

  test("UPDATE trigger: changing data.aliases reconciles node_aliases (delete-then-insert)", () => {
    const db = freshDb()
    insertNode(db, { id: "node-2", name: "bar", aliases: ["old-name"] })
    db.run("UPDATE nodes SET data = ? WHERE id = 'node-2'", [JSON.stringify({ aliases: ["new-name", "another"] })])
    const rows = db.query("SELECT alias FROM node_aliases WHERE node_id = 'node-2' ORDER BY alias").all() as Array<{
      alias: string
    }>
    expect(rows.map((r) => r.alias)).toEqual(["another", "new-name"])
  })

  test("DELETE trigger: removing a node cascades node_aliases rows", () => {
    const db = freshDb()
    insertNode(db, { id: "node-3", name: "baz", aliases: ["zap"] })
    db.run("DELETE FROM nodes WHERE id = 'node-3'")
    const rows = db.query("SELECT alias FROM node_aliases WHERE node_id = 'node-3'").all()
    expect(rows).toHaveLength(0)
  })

  test("nodes without data.aliases produce zero node_aliases rows", () => {
    const db = freshDb()
    insertNode(db, { id: "node-4", name: "no-aliases" })
    const rows = db.query("SELECT alias FROM node_aliases WHERE node_id = 'node-4'").all()
    expect(rows).toHaveLength(0)
  })

  test("duplicate aliases within a node's array are deduplicated by INSERT OR IGNORE", () => {
    const db = freshDb()
    insertNode(db, {
      id: "node-5",
      name: "dup",
      aliases: ["alpha", "alpha", "beta"],
    })
    const rows = db.query("SELECT alias FROM node_aliases WHERE node_id = 'node-5' ORDER BY alias").all() as Array<{
      alias: string
    }>
    expect(rows.map((r) => r.alias)).toEqual(["alpha", "beta"])
  })

  test("empty-string aliases are filtered out", () => {
    const db = freshDb()
    insertNode(db, {
      id: "node-6",
      name: "empty",
      aliases: ["", "valid"],
    })
    const rows = db.query("SELECT alias FROM node_aliases WHERE node_id = 'node-6'").all() as Array<{
      alias: string
    }>
    expect(rows.map((r) => r.alias)).toEqual(["valid"])
  })

  test("alias lookup uses indexed table (sanity check via EXPLAIN QUERY PLAN)", () => {
    const db = freshDb()
    insertNode(db, { id: "node-7", name: "x", aliases: ["needle"] })
    const plan = db
      .query("EXPLAIN QUERY PLAN SELECT node_id FROM node_aliases WHERE alias = ?")
      .all("needle") as Array<{ detail: string }>
    // Plan should reference the alias index, not a full scan.
    const planText = plan.map((r) => r.detail).join(" ")
    expect(planText).toMatch(/idx_node_aliases_alias|USING INDEX|SEARCH/i)
  })
})
