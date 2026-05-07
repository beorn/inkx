/**
 * DATA_VERSION 3 → 4 migration tests.
 *
 * Phase 3 of @km/all/L5-deprecation-purge: surgical strip of the
 * deprecated `data.{mentions,projects,tags,_allMentions,_allProjects}`
 * JSON sidecars from existing rows. The canonical `links` table was
 * already populated by sigil-boards / dissolve-data-tags work
 * (DATA_VERSION=3), so this migration only removes dead JSON fields —
 * no full rebuild needed.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { Database } from "bun:sqlite"
import { applyConnectionPragmas, migrateSchema, migrateData, SCHEMA, DATA_VERSION } from "../src/index.ts"

function freshDb(): Database {
  const db = new Database(":memory:")
  applyConnectionPragmas(db)
  migrateSchema(db)
  db.run(SCHEMA)
  return db
}

function seedNode(db: Database, id: string, data: Record<string, unknown>): void {
  const now = Date.now()
  db.run(
    `INSERT INTO nodes (id, type, content, data, created_at, updated_at, version, parent_idx)
     VALUES (?, 'p', '', ?, ?, ?, 'v1', 0)`,
    [id, JSON.stringify(data), now, now],
  )
}

function dataOf(db: Database, id: string): Record<string, unknown> | null {
  const row = db.query("SELECT data FROM nodes WHERE id = ?").get(id) as { data: string | null } | null
  if (!row) return null
  return row.data === null ? null : (JSON.parse(row.data) as Record<string, unknown>)
}

describe("DATA_VERSION 3 → 4: strip deprecated data.* JSON sidecars", () => {
  let db: Database

  beforeEach(() => {
    db = freshDb()
    // Pin meta.data_version = 3 to simulate a database created before
    // the L5 Phase 3 cutover.
    db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('data_version', '3')")
  })

  afterEach(() => {
    db.close()
  })

  test("DATA_VERSION constant is at least 4 (Phase 3 invariant)", () => {
    expect(DATA_VERSION).toBeGreaterThanOrEqual(4)
  })

  test("strips data.mentions / data.projects / data.tags from existing rows", () => {
    seedNode(db, "n1", { mentions: ["alice"], projects: ["alpha"], tags: ["bug"], keep: "yes" })
    const result = migrateData(db)
    expect(result.needsRebuild).toBe(false)
    const after = dataOf(db, "n1")
    expect(after).toBeDefined()
    expect(after).not.toBeNull()
    expect(after!.mentions).toBeUndefined()
    expect(after!.projects).toBeUndefined()
    expect(after!.tags).toBeUndefined()
    expect(after!.keep).toBe("yes")
  })

  test("strips _allMentions / _allProjects aggregates", () => {
    seedNode(db, "n2", { _allMentions: ["alice", "bob"], _allProjects: ["alpha"], keep: 42 })
    migrateData(db)
    const after = dataOf(db, "n2")
    expect(after!._allMentions).toBeUndefined()
    expect(after!._allProjects).toBeUndefined()
    expect(after!.keep).toBe(42)
  })

  test("nodes whose data collapses to {} after the strip get NULL'd", () => {
    seedNode(db, "n3", { mentions: ["a"], projects: ["b"], tags: ["c"] })
    migrateData(db)
    const row = db.query("SELECT data FROM nodes WHERE id = ?").get("n3") as { data: string | null }
    expect(row.data).toBeNull()
  })

  test("leaves untouched rows alone (no data.* fields present)", () => {
    seedNode(db, "n4", { rrule: "FREQ=DAILY", props: { foo: 1 } })
    migrateData(db)
    const after = dataOf(db, "n4")
    expect(after).toEqual({ rrule: "FREQ=DAILY", props: { foo: 1 } })
  })

  test("no acceptance: SELECT COUNT WHERE json_extract(...) IS NOT NULL returns 0", () => {
    seedNode(db, "a", { mentions: ["alice"] })
    seedNode(db, "b", { projects: ["alpha"] })
    seedNode(db, "c", { tags: ["bug"] })
    seedNode(db, "d", { _allMentions: ["x"] })
    seedNode(db, "e", { _allProjects: ["y"] })
    migrateData(db)
    const counts = db
      .query(
        `SELECT
           SUM(CASE WHEN json_extract(data, '$.mentions') IS NOT NULL THEN 1 ELSE 0 END) AS mentions,
           SUM(CASE WHEN json_extract(data, '$.projects') IS NOT NULL THEN 1 ELSE 0 END) AS projects,
           SUM(CASE WHEN json_extract(data, '$.tags') IS NOT NULL THEN 1 ELSE 0 END) AS tags,
           SUM(CASE WHEN json_extract(data, '$._allMentions') IS NOT NULL THEN 1 ELSE 0 END) AS allmentions,
           SUM(CASE WHEN json_extract(data, '$._allProjects') IS NOT NULL THEN 1 ELSE 0 END) AS allprojects
         FROM nodes`,
      )
      .get() as Record<string, number | null>
    expect(counts.mentions ?? 0).toBe(0)
    expect(counts.projects ?? 0).toBe(0)
    expect(counts.tags ?? 0).toBe(0)
    expect(counts.allmentions ?? 0).toBe(0)
    expect(counts.allprojects ?? 0).toBe(0)
  })

  test("idempotent: running migrateData twice is a no-op the second time", () => {
    seedNode(db, "n5", { mentions: ["alice"], keep: "x" })
    migrateData(db)
    const result2 = migrateData(db)
    expect(result2.needsRebuild).toBe(false)
    const after = dataOf(db, "n5")
    expect(after).toEqual({ keep: "x" })
  })

  test("bumps meta.data_version to current DATA_VERSION", () => {
    seedNode(db, "n6", { mentions: ["alice"] })
    migrateData(db)
    const row = db.query("SELECT value FROM meta WHERE key = 'data_version'").get() as { value: string }
    expect(parseInt(row.value, 10)).toBe(DATA_VERSION)
  })
})
