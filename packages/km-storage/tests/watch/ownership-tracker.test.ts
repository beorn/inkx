/**
 * OwnershipTracker Tests — Unified two-tier ownership tracking.
 *
 * Tests the unified API that combines in-memory L1 (write tokens)
 * with persisted L2 (sync_state) into a single OwnershipTracker.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { SCHEMA } from "../../src/schema.ts"
import { createOwnershipTracker } from "../../src/watch/ownership-tracker.ts"

function createTestDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

function createTempDir(): string {
  const dir = join(tmpdir(), `ownership-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe("OwnershipTracker", () => {
  describe("recordWrite + isOwnedWrite (L1 fast path)", () => {
    test("returns true for a file we recorded", () => {
      const db = createTestDb()
      const tmpDir = createTempDir()
      const tracker = createOwnershipTracker(db)
      const filePath = join(tmpDir, "test.md")
      const content = "# Hello World\n"

      // Write the file to disk so L2 fallback can read it
      writeFileSync(filePath, content)
      tracker.recordWrite(filePath, content)

      expect(tracker.isOwnedWrite(filePath)).toBe(true)

      rmSync(tmpDir, { recursive: true })
      db.close()
    })

    test("returns false for an unrecorded file", () => {
      const db = createTestDb()
      const tmpDir = createTempDir()
      const tracker = createOwnershipTracker(db)
      const filePath = join(tmpDir, "unknown.md")

      // File exists but we never recorded it
      writeFileSync(filePath, "external content")

      expect(tracker.isOwnedWrite(filePath)).toBe(false)

      rmSync(tmpDir, { recursive: true })
      db.close()
    })
  })

  describe("L2 fallback (survives restart)", () => {
    test("isOwnedWrite falls back to sync_state when L1 misses", () => {
      const db = createTestDb()
      const tmpDir = createTempDir()
      const filePath = join(tmpDir, "test.md")
      const content = "# Persisted\n"

      // Record with one tracker instance
      const tracker1 = createOwnershipTracker(db)
      tracker1.recordWrite(filePath, content)

      // Create a new tracker (simulates restart — L1 is empty, L2 persists)
      const tracker2 = createOwnershipTracker(db)

      // Write file to disk so L2 can read and compare
      writeFileSync(filePath, content)

      // L1 miss, L2 hit
      expect(tracker2.isOwnedWrite(filePath)).toBe(true)

      rmSync(tmpDir, { recursive: true })
      db.close()
    })

    test("L2 returns false when file content changed externally", () => {
      const db = createTestDb()
      const tmpDir = createTempDir()
      const filePath = join(tmpDir, "test.md")

      const tracker1 = createOwnershipTracker(db)
      tracker1.recordWrite(filePath, "original content")

      // Simulate restart
      const tracker2 = createOwnershipTracker(db)

      // External edit changed the content
      writeFileSync(filePath, "externally modified content")

      expect(tracker2.isOwnedWrite(filePath)).toBe(false)

      rmSync(tmpDir, { recursive: true })
      db.close()
    })
  })

  describe("delete tracking", () => {
    test("recordDelete + isOwnedDelete returns true", () => {
      const db = createTestDb()
      const tracker = createOwnershipTracker(db)
      const path = "/tmp/delete-me.md"

      tracker.recordDelete(path)
      expect(tracker.isOwnedDelete(path)).toBe(true)

      db.close()
    })

    test("isOwnedDelete returns false without prior recordDelete", () => {
      const db = createTestDb()
      const tracker = createOwnershipTracker(db)

      expect(tracker.isOwnedDelete("/tmp/unknown.md")).toBe(false)

      db.close()
    })

    test("consumeDelete is one-shot: second call returns false", () => {
      const db = createTestDb()
      const tracker = createOwnershipTracker(db)
      const path = "/tmp/delete-me.md"

      tracker.recordDelete(path)
      expect(tracker.consumeDelete(path)).toBe(true)
      expect(tracker.consumeDelete(path)).toBe(false)

      db.close()
    })

    test("isOwnedDelete does not consume the tombstone", () => {
      const db = createTestDb()
      const tracker = createOwnershipTracker(db)
      const path = "/tmp/delete-me.md"

      tracker.recordDelete(path)
      expect(tracker.isOwnedDelete(path)).toBe(true)
      // Still there — isOwnedDelete is read-only
      expect(tracker.isOwnedDelete(path)).toBe(true)
      // consumeDelete actually removes it
      expect(tracker.consumeDelete(path)).toBe(true)
      expect(tracker.isOwnedDelete(path)).toBe(false)

      db.close()
    })
  })

  describe("renamePath", () => {
    test("moves ownership state from old to new path", () => {
      const db = createTestDb()
      const tmpDir = createTempDir()
      const tracker = createOwnershipTracker(db)
      const oldPath = join(tmpDir, "old.md")
      const newPath = join(tmpDir, "new.md")
      const content = "# Renamed\n"

      writeFileSync(oldPath, content)
      tracker.recordWrite(oldPath, content)

      tracker.renamePath(oldPath, newPath)

      // Old path no longer owned (L1)
      // New path should be owned (L1)
      writeFileSync(newPath, content)
      expect(tracker.isOwnedWrite(newPath)).toBe(true)

      rmSync(tmpDir, { recursive: true })
      db.close()
    })

    test("L2 sync_state is also renamed", () => {
      const db = createTestDb()
      const tmpDir = createTempDir()
      const oldPath = join(tmpDir, "old.md")
      const newPath = join(tmpDir, "new.md")
      const content = "# Persisted rename\n"

      // Record and rename with tracker1
      const tracker1 = createOwnershipTracker(db)
      tracker1.recordWrite(oldPath, content)
      tracker1.renamePath(oldPath, newPath)

      // Simulate restart — L2 should have the new path
      const tracker2 = createOwnershipTracker(db)
      writeFileSync(newPath, content)

      expect(tracker2.isOwnedWrite(newPath)).toBe(true)

      rmSync(tmpDir, { recursive: true })
      db.close()
    })
  })

  describe("removePath", () => {
    test("removes ownership from both L1 and L2", () => {
      const db = createTestDb()
      const tmpDir = createTempDir()
      const tracker = createOwnershipTracker(db)
      const filePath = join(tmpDir, "remove.md")
      const content = "# Remove\n"

      writeFileSync(filePath, content)
      tracker.recordWrite(filePath, content)

      // Owned before removal
      expect(tracker.isOwnedWrite(filePath)).toBe(true)

      tracker.removePath(filePath)

      // Not owned after removal (even though file still exists with same content)
      expect(tracker.isOwnedWrite(filePath)).toBe(false)

      rmSync(tmpDir, { recursive: true })
      db.close()
    })
  })

  describe("observation recording", () => {
    test("recordObservation makes file owned in L2", () => {
      const db = createTestDb()
      const tmpDir = createTempDir()
      const filePath = join(tmpDir, "observed.md")
      const content = "# Observed\n"

      const tracker1 = createOwnershipTracker(db)
      tracker1.recordObservation(filePath, content)

      // Simulate restart — only L2 has the observation
      const tracker2 = createOwnershipTracker(db)
      writeFileSync(filePath, content)

      expect(tracker2.isOwnedWrite(filePath)).toBe(true)

      rmSync(tmpDir, { recursive: true })
      db.close()
    })
  })

  describe("dirty tracking", () => {
    test("full lifecycle: mark dirty, get dirty paths, clear dirty", () => {
      const db = createTestDb()
      const tracker = createOwnershipTracker(db)

      // Need entries in sync_state before marking dirty
      tracker.recordWrite("/tmp/a.md", "content a")
      tracker.recordWrite("/tmp/b.md", "content b")
      tracker.recordWrite("/tmp/c.md", "content c")

      // Initially no dirty paths
      expect(tracker.getDirtyPaths()).toEqual([])

      // Mark some as dirty
      tracker.markDirty("/tmp/a.md")
      tracker.markDirty("/tmp/c.md")

      const dirty = tracker.getDirtyPaths()
      expect(dirty).toHaveLength(2)
      expect(dirty).toContain("/tmp/a.md")
      expect(dirty).toContain("/tmp/c.md")

      // Clear one
      tracker.clearDirty("/tmp/a.md")
      const dirtyAfter = tracker.getDirtyPaths()
      expect(dirtyAfter).toHaveLength(1)
      expect(dirtyAfter).toContain("/tmp/c.md")

      db.close()
    })
  })

  describe("getSyncState", () => {
    test("provides access to underlying SyncState for entry details", () => {
      const db = createTestDb()
      const tracker = createOwnershipTracker(db)

      tracker.recordWrite("/tmp/test.md", "content", "node-123")

      const syncState = tracker.getSyncState()
      const entry = syncState.get("/tmp/test.md")

      expect(entry).not.toBeNull()
      expect(entry!.node_id).toBe("node-123")
      expect(entry!.baseline_kind).toBe("projected")

      db.close()
    })
  })

  describe("write + delete independence", () => {
    test("write tokens and delete tombstones are independent", () => {
      const db = createTestDb()
      const tmpDir = createTempDir()
      const tracker = createOwnershipTracker(db)
      const filePath = join(tmpDir, "test.md")
      const content = "# Both\n"

      writeFileSync(filePath, content)
      tracker.recordWrite(filePath, content)
      tracker.recordDelete(filePath)

      // Write ownership still works
      expect(tracker.isOwnedWrite(filePath)).toBe(true)

      // Delete tombstone still works
      expect(tracker.isOwnedDelete(filePath)).toBe(true)
      expect(tracker.consumeDelete(filePath)).toBe(true)

      // After consuming delete, write ownership unchanged
      expect(tracker.isOwnedWrite(filePath)).toBe(true)

      rmSync(tmpDir, { recursive: true })
      db.close()
    })
  })
})
