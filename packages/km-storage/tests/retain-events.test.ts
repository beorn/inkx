/**
 * Tiered retention compaction for the SCHEMA_VERSION 12 events table.
 *
 * Default policy:
 *   - 0..30d: keep all events
 *   - 30..90d: keep latest per (target, type) — by-key compaction
 *   - 90+d: drop everything except node_created
 *   - node_created: kept forever
 */

import { describe, expect, test } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { applyConnectionPragmas, migrateData, migrateSchema, retainEvents, SCHEMA } from "../src/index.ts"

function freshDb(): Database {
  const db = new Database(":memory:")
  applyConnectionPragmas(db)
  migrateSchema(db)
  db.run(SCHEMA)
  migrateData(db)
  return db
}

function freshKmDir(): string {
  return mkdtempSync(join(tmpdir(), "km-retain-test-"))
}

function insert(
  db: Database,
  id: string,
  ts: number,
  type: string,
  target: string | null,
  data: object = {},
): void {
  db.run(
    `INSERT INTO events (id, ts, type, actor, target, data) VALUES (?, ?, ?, 'user', ?, ?)`,
    [id, ts, type, target, JSON.stringify({ id, ts, type, actor: "user", target, data })],
  )
}

const DAY = 86_400_000
const NOW = Date.UTC(2026, 4, 5, 12) // 2026-05-05T12:00Z

describe("retainEvents — tiered retention", () => {
  test("keeps everything inside the hot window (default 30d)", () => {
    const db = freshDb()
    const km = freshKmDir()
    // 5 events, all within 10 days of now
    for (let i = 0; i < 5; i++) {
      insert(db, `id-${i}`, NOW - i * DAY, "node_updated", `n${i}`)
    }
    // Pin the cutoff: anything with ts >= NOW - 30d is hot, all 5 events are < 10d old.
    const result = retainEvents(km, db, {
      fullRetentionDays: 30,
      byKeyRetentionDays: 90,
      skipVacuum: true,
    })
    expect(result.rowsBefore).toBe(5)
    expect(result.rowsAfter).toBe(5)
    expect(result.rowsDropped).toBe(0)
  })

  test("by-key compacts the 30-90d window — keeps only latest per (target, type)", () => {
    const db = freshDb()
    const km = freshKmDir()
    // Six events for node n1, all in the by-key window (40-60d old).
    insert(db, "id-1", NOW - 60 * DAY, "node_updated", "n1")
    insert(db, "id-2", NOW - 55 * DAY, "node_updated", "n1")
    insert(db, "id-3", NOW - 50 * DAY, "node_updated", "n1")
    insert(db, "id-4", NOW - 45 * DAY, "node_updated", "n1")
    insert(db, "id-5", NOW - 40 * DAY, "node_updated", "n1")
    // One event for node n2, also in the window.
    insert(db, "id-6", NOW - 50 * DAY, "node_updated", "n2")
    // One node_created — should be untouched.
    insert(db, "id-7", NOW - 70 * DAY, "node_created", "n3")

    const result = retainEvents(km, db, {
      fullRetentionDays: 30,
      byKeyRetentionDays: 90,
      skipVacuum: true,
    })

    // After by-key compaction:
    //   - n1 + node_updated: keeps latest (id-5)
    //   - n2 + node_updated: keeps latest (id-6)
    //   - n3 + node_created: kept (forever)
    // Total: 3 rows
    expect(result.rowsAfter).toBe(3)

    const remaining = db.query("SELECT id FROM events ORDER BY id").all() as { id: string }[]
    const ids = remaining.map((r) => r.id)
    expect(ids).toContain("id-5")
    expect(ids).toContain("id-6")
    expect(ids).toContain("id-7")
    expect(ids).not.toContain("id-1")
    expect(ids).not.toContain("id-2")
  })

  test("drops everything older than byKeyRetentionDays (except node_created)", () => {
    const db = freshDb()
    const km = freshKmDir()
    insert(db, "old-1", NOW - 200 * DAY, "node_updated", "n1")
    insert(db, "old-2", NOW - 150 * DAY, "node_deleted", "n2")
    insert(db, "old-3", NOW - 365 * DAY, "node_created", "n3")
    insert(db, "fresh", NOW - 5 * DAY, "node_updated", "n4")

    const result = retainEvents(km, db, {
      fullRetentionDays: 30,
      byKeyRetentionDays: 90,
      skipVacuum: true,
    })

    // node_updated old-1 + node_deleted old-2 are too old → dropped.
    // node_created old-3 → kept forever.
    // fresh → kept (in hot window).
    expect(result.rowsAfter).toBe(2)
    const remaining = db.query("SELECT id FROM events ORDER BY id").all() as { id: string }[]
    const ids = remaining.map((r) => r.id)
    expect(ids).toContain("old-3")
    expect(ids).toContain("fresh")
    expect(ids).not.toContain("old-1")
    expect(ids).not.toContain("old-2")
  })

  test("returns zero results on empty events table", () => {
    const db = freshDb()
    const km = freshKmDir()
    const result = retainEvents(km, db, { skipVacuum: true })
    expect(result.rowsBefore).toBe(0)
    expect(result.rowsAfter).toBe(0)
    expect(result.rowsDropped).toBe(0)
  })

  test("is idempotent — running twice on already-compacted data is a no-op", () => {
    const db = freshDb()
    const km = freshKmDir()
    insert(db, "old-1", NOW - 200 * DAY, "node_updated", "n1")
    insert(db, "fresh", NOW - 5 * DAY, "node_updated", "n2")

    const r1 = retainEvents(km, db, { fullRetentionDays: 30, byKeyRetentionDays: 90, skipVacuum: true })
    expect(r1.rowsDropped).toBe(1)

    const r2 = retainEvents(km, db, { fullRetentionDays: 30, byKeyRetentionDays: 90, skipVacuum: true })
    expect(r2.rowsDropped).toBe(0)
  })
})
