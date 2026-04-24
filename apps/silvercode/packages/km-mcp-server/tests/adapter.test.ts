/**
 * Adapter wiring tests — in-memory SQLite fixture exercising the real
 * @km/storage query surface through createKmContextFromStorage.
 *
 * The goal is to catch drift between the adapter's interface and the
 * @km/storage signatures it depends on (search / getNode / getAllNodes)
 * without touching a real vault's state.db.
 *
 * Seeding path: we apply the same SCHEMA + migrateSchema the disk tier uses,
 * then insert three nodes directly. FTS triggers fire on plain INSERTs so
 * km_search returns live results without a separate index rebuild.
 */

import { Database } from "bun:sqlite"
import { beforeEach, describe, expect, test } from "vitest"
import { SCHEMA, getAllNodes, getNode, migrateSchema, search } from "@km/storage"
import { createKmContextFromStorage } from "../src/adapter.ts"
import type { KmContext } from "../src/tools.ts"

function seed(db: Database): void {
  db.exec(SCHEMA)
  migrateSchema(db)

  const now = Date.now()
  const insert = db.prepare(`
    INSERT INTO nodes (
      id, type, parent_id, parent_idx, item,
      name, title, content, content_hash,
      data, created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  // Top-level board node.
  insert.run(
    "board-1",
    "file",
    null,
    0,
    0,
    "inbox",
    "Inbox",
    "Top-level board file",
    "hash-board-1",
    "{}",
    now,
    now,
    "v1",
  )

  // Child heading under board-1.
  insert.run(
    "heading-1",
    "h",
    "board-1",
    0,
    0,
    null,
    "Project Alpha",
    "Heading about Project Alpha",
    "hash-heading-1",
    "{}",
    now,
    now,
    "v1",
  )

  // A second top-level node so getBoard has >1 row.
  insert.run(
    "board-2",
    "file",
    null,
    1,
    0,
    "today",
    "Today",
    "Another board",
    "hash-board-2",
    "{}",
    now,
    now,
    "v1",
  )
}

function makeCtx(db: Database): KmContext {
  return createKmContextFromStorage(db, {
    search,
    getNode: (d, id) => getNode(d, id),
    getTopLevelNodes: (d) => getAllNodes(d).filter((n) => n.parent_id === null),
    renderPath: (d, id) => {
      const trail: string[] = []
      const seen = new Set<string>()
      let current = getNode(d, id)
      while (current && !seen.has(current.id) && trail.length < 64) {
        seen.add(current.id)
        trail.push(current.title ?? current.name ?? current.id)
        if (current.parent_id === null) break
        current = getNode(d, current.parent_id)
      }
      return trail.reverse()
    },
  })
}

describe("createKmContextFromStorage (in-memory SQLite)", () => {
  let db: Database
  let ctx: KmContext

  beforeEach(() => {
    db = new Database(":memory:")
    seed(db)
    ctx = makeCtx(db)
  })

  test("km_search returns nodes matching the FTS query", async () => {
    const results = await ctx.search("alpha", 10)
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((n) => n.id === "heading-1")).toBe(true)
  })

  test("km_get_node returns the right node by id", async () => {
    const node = await ctx.getNode("board-1")
    expect(node).not.toBeNull()
    expect(node?.id).toBe("board-1")
    expect(node?.title).toBe("Inbox")
  })

  test("km_get_node returns null for unknown ids", async () => {
    const node = await ctx.getNode("does-not-exist")
    expect(node).toBeNull()
  })

  test("km_get_board returns only top-level nodes", async () => {
    const board = await ctx.getBoard()
    const ids = board.map((n) => n.id).sort()
    expect(ids).toEqual(["board-1", "board-2"])
    // heading-1 has parent_id=board-1 so it must NOT appear.
    expect(ids).not.toContain("heading-1")
  })

  test("km_render_path walks parent_id chain root→leaf", async () => {
    const path = await ctx.renderPath("heading-1")
    expect(path).toEqual(["Inbox", "Project Alpha"])
  })

  test("km_render_path for a root node returns just that node", async () => {
    const path = await ctx.renderPath("board-1")
    expect(path).toEqual(["Inbox"])
  })
})
