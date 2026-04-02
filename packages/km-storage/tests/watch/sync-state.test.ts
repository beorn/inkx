/**
 * SyncState Tests — Persisted content-hash baseline
 *
 * Tests the sync_state table operations: projection recording,
 * observation recording, ownership detection, rename cascading,
 * dirty flag lifecycle, and deletion.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../../src/schema.ts"
import { createSyncState } from "../../src/watch/sync-state.ts"

function createTestDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

describe("SyncState", () => {
  test("recordProjection + isOurs returns true for matching content", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordProjection("/tmp/test.md", "# Hello World\n")
    expect(state.isOurs("/tmp/test.md", "# Hello World\n")).toBe(true)

    db.close()
  })

  test("isOurs with different content returns false", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordProjection("/tmp/test.md", "original content")
    expect(state.isOurs("/tmp/test.md", "different content")).toBe(false)

    db.close()
  })

  test("isOurs with no entry returns false", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    expect(state.isOurs("/tmp/unknown.md", "anything")).toBe(false)

    db.close()
  })

  test("recordObservation + isOurs returns true", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordObservation("/tmp/test.md", "observed content")
    expect(state.isOurs("/tmp/test.md", "observed content")).toBe(true)

    db.close()
  })

  test("projection and observation set different baseline_kind", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordProjection("/tmp/a.md", "content A")
    const entryA = state.get("/tmp/a.md")
    expect(entryA?.baseline_kind).toBe("projected")

    state.recordObservation("/tmp/b.md", "content B")
    const entryB = state.get("/tmp/b.md")
    expect(entryB?.baseline_kind).toBe("observed")

    db.close()
  })

  test("re-recording updates the hash", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordProjection("/tmp/test.md", "version 1")
    expect(state.isOurs("/tmp/test.md", "version 1")).toBe(true)

    state.recordProjection("/tmp/test.md", "version 2")
    expect(state.isOurs("/tmp/test.md", "version 1")).toBe(false)
    expect(state.isOurs("/tmp/test.md", "version 2")).toBe(true)

    db.close()
  })

  test("renamePath moves entry to new path", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordProjection("/tmp/old.md", "content")
    state.renamePath("/tmp/old.md", "/tmp/new.md")

    // Old path no longer exists
    expect(state.get("/tmp/old.md")).toBeNull()
    // New path has the same content
    expect(state.isOurs("/tmp/new.md", "content")).toBe(true)

    db.close()
  })

  test("renamePrefix cascades for subtree", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordProjection("/tmp/folder/a.md", "content a")
    state.recordProjection("/tmp/folder/sub/b.md", "content b")
    state.recordProjection("/tmp/folder/sub/c.md", "content c")
    state.recordProjection("/tmp/other/d.md", "content d")

    state.renamePrefix("/tmp/folder", "/tmp/renamed")

    // Direct children of folder are renamed
    expect(state.get("/tmp/folder/a.md")).toBeNull()
    expect(state.isOurs("/tmp/renamed/a.md", "content a")).toBe(true)

    // Nested children are also renamed
    expect(state.get("/tmp/folder/sub/b.md")).toBeNull()
    expect(state.isOurs("/tmp/renamed/sub/b.md", "content b")).toBe(true)
    expect(state.isOurs("/tmp/renamed/sub/c.md", "content c")).toBe(true)

    // Other paths are unaffected
    expect(state.isOurs("/tmp/other/d.md", "content d")).toBe(true)

    db.close()
  })

  test("removePath deletes entry", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordProjection("/tmp/test.md", "content")
    expect(state.get("/tmp/test.md")).not.toBeNull()

    state.removePath("/tmp/test.md")
    expect(state.get("/tmp/test.md")).toBeNull()

    db.close()
  })

  test("dirty flag lifecycle: mark dirty, get dirty paths, record clears dirty", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordProjection("/tmp/a.md", "content a")
    state.recordProjection("/tmp/b.md", "content b")
    state.recordProjection("/tmp/c.md", "content c")

    // Initially no dirty paths
    expect(state.getDirtyPaths()).toEqual([])

    // Mark some as dirty
    state.markDirty("/tmp/a.md")
    state.markDirty("/tmp/c.md")

    const dirty = state.getDirtyPaths()
    expect(dirty).toHaveLength(2)
    expect(dirty).toContain("/tmp/a.md")
    expect(dirty).toContain("/tmp/c.md")

    // Re-recording clears dirty flag
    state.recordProjection("/tmp/a.md", "content a updated")
    const dirtyAfter = state.getDirtyPaths()
    expect(dirtyAfter).toHaveLength(1)
    expect(dirtyAfter).toContain("/tmp/c.md")

    db.close()
  })

  test("get returns full entry with all fields", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordProjection("/tmp/test.md", "content", "node-123")

    const entry = state.get("/tmp/test.md")
    expect(entry).not.toBeNull()
    expect(entry!.fs_path).toBe("/tmp/test.md")
    expect(entry!.node_id).toBe("node-123")
    expect(entry!.baseline_hash).toBeTruthy()
    expect(entry!.baseline_kind).toBe("projected")
    expect(entry!.dirty).toBe(false)

    db.close()
  })

  test("isOurs is non-destructive (can check multiple times)", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordProjection("/tmp/test.md", "content")

    // Unlike WriteTokenMap.consume(), isOurs does NOT consume the entry
    expect(state.isOurs("/tmp/test.md", "content")).toBe(true)
    expect(state.isOurs("/tmp/test.md", "content")).toBe(true)
    expect(state.isOurs("/tmp/test.md", "content")).toBe(true)

    db.close()
  })

  test("nodeId is optional (defaults to null)", () => {
    const db = createTestDb()
    const state = createSyncState(db)

    state.recordProjection("/tmp/test.md", "content")

    const entry = state.get("/tmp/test.md")
    expect(entry?.node_id).toBeNull()

    db.close()
  })
})
