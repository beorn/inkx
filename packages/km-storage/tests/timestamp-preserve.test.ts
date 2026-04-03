/**
 * Timestamp Preservation Tests
 *
 * Verify that original timestamps on KNodes are preserved through DB insertion
 * instead of being overwritten with Date.now().
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/db/schema.ts"
import { applyNodes, collect, type ParsedFile } from "../src/markdown/pipeline.ts"
import { insertNodeRow, INSERT_NODE_SQL } from "../src/db/insert.ts"
import type { KNode } from "@km/core"

// ============================================================================
// Test Helpers
// ============================================================================

function createTestDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

function createNode(id: string, overrides: Partial<KNode> = {}): KNode {
  return {
    id,
    type: "h",
    item: {},
    fstype: "mdfile",
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "",
    ...overrides,
  }
}

function createParsedFile(path: string, nodeId: string, overrides: Partial<ParsedFile> = {}): ParsedFile {
  return {
    path,
    nodeId,
    nodes: overrides.nodes ?? [createNode(nodeId)],
    wikilinks: [],
    hash: `hash-${nodeId}`,
    ino: 12345,
    mtime: Date.now(),
    isCreate: true,
    ...overrides,
  }
}

async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item
  }
}

// ============================================================================
// insertNodeRow() timestamp preservation
// ============================================================================

describe("insertNodeRow() timestamp preservation", () => {
  test("preserves original created_at and updated_at from node", () => {
    const db = createTestDb()
    const stmt = db.prepare(INSERT_NODE_SQL)

    const originalCreated = new Date("2023-06-15T10:30:00Z").getTime()
    const originalUpdated = new Date("2024-01-20T14:00:00Z").getTime()

    const node = createNode("node1", {
      created_at: originalCreated,
      updated_at: originalUpdated,
    })

    const now = Date.now()
    insertNodeRow(stmt, node, now)

    const row = db.query("SELECT created_at, updated_at FROM nodes WHERE id = ?").get("node1") as {
      created_at: number
      updated_at: number
    }

    expect(row.created_at).toBe(originalCreated)
    expect(row.updated_at).toBe(originalUpdated)
    // Verify they are NOT the current time
    expect(row.created_at).not.toBe(now)
    expect(row.updated_at).not.toBe(now)
  })

  test("falls back to now when node has no timestamps", () => {
    const db = createTestDb()
    const stmt = db.prepare(INSERT_NODE_SQL)

    // Create a node and strip timestamps to simulate undefined
    const node = createNode("node2")
    // TypeScript requires these fields, but at runtime they could be missing
    // Use Object.assign to bypass type checking for this test
    const { created_at, updated_at, ...nodeWithoutTimestamps } = node

    const now = Date.now()
    insertNodeRow(stmt, nodeWithoutTimestamps as KNode, now)

    const row = db.query("SELECT created_at, updated_at FROM nodes WHERE id = ?").get("node2") as {
      created_at: number
      updated_at: number
    }

    expect(row.created_at).toBe(now)
    expect(row.updated_at).toBe(now)
  })
})

// ============================================================================
// applyNodes() (insertFileNodes) timestamp preservation
// ============================================================================

describe("applyNodes() timestamp preservation", () => {
  test("preserves original timestamps through pipeline insertion", async () => {
    const db = createTestDb()

    const originalCreated = new Date("2022-03-10T08:00:00Z").getTime()
    const originalUpdated = new Date("2023-11-05T16:45:00Z").getTime()

    const parsedFiles = [
      createParsedFile("/test/file1.md", "file1", {
        nodes: [
          createNode("file1", {
            created_at: originalCreated,
            updated_at: originalUpdated,
          }),
        ],
      }),
    ]

    await collect(applyNodes(fromArray(parsedFiles), db))

    const row = db.query("SELECT created_at, updated_at FROM nodes WHERE id = ?").get("file1") as {
      created_at: number
      updated_at: number
    }

    expect(row.created_at).toBe(originalCreated)
    expect(row.updated_at).toBe(originalUpdated)
  })

  test("preserves timestamps on child nodes too", async () => {
    const db = createTestDb()

    const parentCreated = new Date("2021-01-01T00:00:00Z").getTime()
    const childCreated = new Date("2021-06-15T12:00:00Z").getTime()
    const childUpdated = new Date("2024-02-28T18:30:00Z").getTime()

    const parsedFiles = [
      createParsedFile("/test/file2.md", "file2", {
        nodes: [
          createNode("file2", { created_at: parentCreated, updated_at: parentCreated }),
          createNode("child1", {
            parent_id: "file2",
            parent_idx: 1,
            type: "p",
            item: {},
            created_at: childCreated,
            updated_at: childUpdated,
          }),
        ],
      }),
    ]

    await collect(applyNodes(fromArray(parsedFiles), db))

    const childRow = db.query("SELECT created_at, updated_at FROM nodes WHERE id = ?").get("child1") as {
      created_at: number
      updated_at: number
    }

    expect(childRow.created_at).toBe(childCreated)
    expect(childRow.updated_at).toBe(childUpdated)
  })

  test("nodes without timestamps get current time (regression)", async () => {
    const db = createTestDb()
    const before = Date.now()

    const parsedFiles = [
      createParsedFile("/test/file3.md", "file3", {
        nodes: [createNode("file3")],
      }),
    ]

    await collect(applyNodes(fromArray(parsedFiles), db))
    const after = Date.now()

    const row = db.query("SELECT created_at, updated_at FROM nodes WHERE id = ?").get("file3") as {
      created_at: number
      updated_at: number
    }

    // The node was created with Date.now() in createNode(), so it should be preserved
    // (which is essentially "now" — the point is it's not overwritten by pipeline's now)
    expect(row.created_at).toBeGreaterThanOrEqual(before - 1000) // Allow 1s tolerance
    expect(row.created_at).toBeLessThanOrEqual(after)
  })
})
