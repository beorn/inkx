/**
 * Referenced Anchors — DB Layer Unit Tests
 *
 * The table + reads/writes for inbound-anchor resolution on collapsed files.
 * See `db/referenced-anchors.ts` and `markdown/extract-anchors.ts`.
 */

import { describe, test, expect, beforeEach } from "vitest"
import { Database } from "bun:sqlite"

import { SCHEMA } from "../src/db/schema.ts"
import {
  addReferencedAnchors,
  removeReferencedAnchors,
  getReferencedAnchor,
  getReferencedAnchorsForFile,
  countReferencedAnchors,
  toReferencedAnchorInsert,
} from "../src/db/referenced-anchors.ts"

function freshDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

describe("referenced_anchors: writes", () => {
  let db: Database
  beforeEach(() => {
    db = freshDb()
  })

  test("addReferencedAnchors inserts rows", () => {
    addReferencedAnchors(db, "file-1", [
      { anchor: "Plans", source_offset: 100, heading_level: 2, ref_count: 3 },
      { anchor: "^abc", source_offset: 200, heading_level: null, ref_count: 1 },
    ])
    expect(countReferencedAnchors(db)).toBe(2)
  })

  test("addReferencedAnchors with empty list is a no-op", () => {
    addReferencedAnchors(db, "file-1", [])
    expect(countReferencedAnchors(db)).toBe(0)
  })

  test("removeReferencedAnchors clears a single file's rows", () => {
    addReferencedAnchors(db, "file-1", [{ anchor: "A", source_offset: 0, heading_level: 1, ref_count: 1 }])
    addReferencedAnchors(db, "file-2", [{ anchor: "B", source_offset: 0, heading_level: 1, ref_count: 1 }])
    expect(countReferencedAnchors(db)).toBe(2)

    removeReferencedAnchors(db, "file-1")
    expect(countReferencedAnchors(db)).toBe(1)
    const remaining = getReferencedAnchorsForFile(db, "file-2")
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.anchor).toBe("B")
  })

  test("UNIQUE(file_id, anchor) prevents duplicates", () => {
    addReferencedAnchors(db, "file-1", [{ anchor: "Plans", source_offset: 100, heading_level: 2, ref_count: 1 }])
    expect(() => {
      addReferencedAnchors(db, "file-1", [{ anchor: "Plans", source_offset: 100, heading_level: 2, ref_count: 1 }])
    }).toThrow()
  })

  test("delete-then-insert protocol (refresh)", () => {
    addReferencedAnchors(db, "file-1", [{ anchor: "Old", source_offset: 50, heading_level: 1, ref_count: 2 }])
    removeReferencedAnchors(db, "file-1")
    addReferencedAnchors(db, "file-1", [{ anchor: "New", source_offset: 80, heading_level: 2, ref_count: 5 }])
    const rows = getReferencedAnchorsForFile(db, "file-1")
    expect(rows).toHaveLength(1)
    expect(rows[0]?.anchor).toBe("New")
    expect(rows[0]?.ref_count).toBe(5)
  })
})

describe("referenced_anchors: reads", () => {
  let db: Database
  beforeEach(() => {
    db = freshDb()
    addReferencedAnchors(db, "file-A", [
      { anchor: "Plans", source_offset: 100, heading_level: 2, ref_count: 3 },
      { anchor: "Details", source_offset: 500, heading_level: 3, ref_count: 1 },
      { anchor: "^block1", source_offset: 800, heading_level: null, ref_count: 2 },
    ])
  })

  test("getReferencedAnchor exact match", () => {
    const row = getReferencedAnchor(db, "file-A", "Plans")
    expect(row).not.toBeNull()
    expect(row?.source_offset).toBe(100)
    expect(row?.heading_level).toBe(2)
    expect(row?.ref_count).toBe(3)
  })

  test("getReferencedAnchor returns null for missing (file, anchor)", () => {
    expect(getReferencedAnchor(db, "file-A", "NotThere")).toBeNull()
    expect(getReferencedAnchor(db, "file-Missing", "Plans")).toBeNull()
  })

  test("getReferencedAnchor returns null for block ref with wrong anchor", () => {
    expect(getReferencedAnchor(db, "file-A", "block1")).toBeNull()
    // Must include the caret
    const row = getReferencedAnchor(db, "file-A", "^block1")
    expect(row?.anchor).toBe("^block1")
    expect(row?.heading_level).toBeNull()
  })

  test("getReferencedAnchorsForFile orders by source_offset", () => {
    const rows = getReferencedAnchorsForFile(db, "file-A")
    expect(rows.map((r) => r.source_offset)).toEqual([100, 500, 800])
  })
})

describe("referenced_anchors: toReferencedAnchorInsert", () => {
  test("heading → heading_level preserved", () => {
    const insert = toReferencedAnchorInsert({ anchor: "Plans", rawText: "Plans", headingLevel: 2, offset: 50 }, 4)
    expect(insert).toEqual({
      anchor: "Plans",
      source_offset: 50,
      heading_level: 2,
      ref_count: 4,
    })
  })

  test("block ref → heading_level null", () => {
    const insert = toReferencedAnchorInsert({ anchor: "^abc", rawText: "^abc", offset: 200 }, 1)
    expect(insert).toEqual({
      anchor: "^abc",
      source_offset: 200,
      heading_level: null,
      ref_count: 1,
    })
  })
})
