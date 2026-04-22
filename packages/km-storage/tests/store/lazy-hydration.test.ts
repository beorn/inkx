/**
 * Lazy hydration — SQLite-backed peekNode / peekChildIds.
 *
 * The scale fix (hub/km/storage-architecture.md §8.WP1): swap the in-memory
 * JS object graph for SQLite indexed lookups. Both operations hit existing
 * indexes (`nodes.id` PK, `idx_nodes_parent_order`) and stay O(log N).
 *
 * Verifies:
 *   - peekNode / peekChildIds return correct data from SQLite
 *   - Construction is O(1) (no full-load scan at open time)
 *   - Queries on a 10k-node vault stay well under the <500ms cold-start budget
 *     (peekNode <1ms, peekChildIds on 1k children <5ms)
 */

import { describe, test, expect, beforeEach } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../../src/db/schema.ts"
import { createSQLiteStore } from "../../src/store/sqlite.ts"

function createTestDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

/** Bulk-seed `count` root-level nodes inside a transaction. */
function seedRootNodes(db: Database, count: number, parentId: string | null = null): string[] {
  const stmt = db.prepare(
    "INSERT INTO nodes (id, type, parent_id, parent_idx, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
  const ids: string[] = []
  const now = Date.now()
  db.run("BEGIN IMMEDIATE")
  try {
    for (let i = 0; i < count; i++) {
      const id = `n-${i.toString().padStart(6, "0")}`
      stmt.run(id, "p", parentId, i, `node ${i}`, now, now)
      ids.push(id)
    }
    db.run("COMMIT")
  } catch (err) {
    db.run("ROLLBACK")
    throw err
  }
  return ids
}

describe("lazy hydration — peekNode", () => {
  let db: Database

  beforeEach(() => {
    db = createTestDb()
  })

  test("returns null for a missing node", () => {
    const store = createSQLiteStore(db)
    expect(store.peekNode("nope")).toBeNull()
  })

  test("returns hydrated node for a seeded row", () => {
    seedRootNodes(db, 5)
    const store = createSQLiteStore(db)
    const node = store.peekNode("n-000003")
    expect(node?.id).toBe("n-000003")
    expect(node?.content).toBe("node 3")
  })
})

describe("lazy hydration — peekChildIds", () => {
  let db: Database

  beforeEach(() => {
    db = createTestDb()
  })

  test("returns ids in parent_idx order", () => {
    const parentIds = seedRootNodes(db, 1)
    const parent = parentIds[0]!
    // Insert children out of parent_idx order on purpose — the query must sort.
    const now = Date.now()
    const stmt = db.prepare(
      "INSERT INTO nodes (id, type, parent_id, parent_idx, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    stmt.run("c2", "p", parent, 20, now, now)
    stmt.run("c0", "p", parent, 0, now, now)
    stmt.run("c1", "p", parent, 10, now, now)

    const store = createSQLiteStore(db)
    expect(store.peekChildIds(parent)).toEqual(["c0", "c1", "c2"])
  })

  test("returns empty for a childless parent", () => {
    const store = createSQLiteStore(db)
    expect(store.peekChildIds("unknown")).toEqual([])
  })
})

describe("lazy hydration — scale", () => {
  // Performance budgets are intentionally loose: we only care about the
  // shape of the curve (indexed SQL, not O(N) JS traversal). If these fail,
  // something scanned the full table.
  const NODE_COUNT = 10_000
  const CHILDREN_COUNT = 1_000

  test("construction is O(1) on a 10k-row DB (no full scan at open)", () => {
    const db = createTestDb()
    seedRootNodes(db, NODE_COUNT)

    const before = performance.now()
    const store = createSQLiteStore(db)
    const ctor = performance.now() - before

    // Construction should be trivially fast — it's just a closure + listeners.
    // Even cold, CI should stay under 50ms.
    expect(ctor).toBeLessThan(50)
    // Sanity: store works after construction.
    expect(store.peekNode("n-000000")?.id).toBe("n-000000")
  })

  test("peekNode on a 10k vault: median query is well under 1ms", () => {
    const db = createTestDb()
    const ids = seedRootNodes(db, NODE_COUNT)
    const store = createSQLiteStore(db)

    // Warm the statement cache.
    store.peekNode(ids[0]!)

    // Sample 200 random IDs to get a stable median.
    const samples: number[] = []
    for (let i = 0; i < 200; i++) {
      const id = ids[Math.floor(Math.random() * ids.length)]!
      const t = performance.now()
      store.peekNode(id)
      samples.push(performance.now() - t)
    }
    samples.sort((a, b) => a - b)
    const median = samples[Math.floor(samples.length / 2)]!
    expect(median).toBeLessThan(1) // indexed PK lookup — microseconds
  })

  test("peekChildIds on a parent with 1k children finishes well under 5ms", () => {
    const db = createTestDb()
    // parent + 1000 children.
    const now = Date.now()
    db.run("BEGIN IMMEDIATE")
    try {
      db.run(
        "INSERT INTO nodes (id, type, parent_id, parent_idx, created_at, updated_at) VALUES ('parent', 'h', NULL, 0, ?, ?)",
        [now, now],
      )
      const stmt = db.prepare(
        "INSERT INTO nodes (id, type, parent_id, parent_idx, created_at, updated_at) VALUES (?, 'p', 'parent', ?, ?, ?)",
      )
      for (let i = 0; i < CHILDREN_COUNT; i++) {
        stmt.run(`c-${i.toString().padStart(4, "0")}`, i, now, now)
      }
      db.run("COMMIT")
    } catch (err) {
      db.run("ROLLBACK")
      throw err
    }

    const store = createSQLiteStore(db)

    // Warm.
    store.peekChildIds("parent")

    // Measure.
    const samples: number[] = []
    for (let i = 0; i < 50; i++) {
      const t = performance.now()
      const ids = store.peekChildIds("parent")
      samples.push(performance.now() - t)
      expect(ids).toHaveLength(CHILDREN_COUNT)
    }
    samples.sort((a, b) => a - b)
    const median = samples[Math.floor(samples.length / 2)]!
    expect(median).toBeLessThan(5)
  })
})
