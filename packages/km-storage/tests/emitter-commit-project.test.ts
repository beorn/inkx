/**
 * Emitter commit/save split tests
 *
 * Verifies that:
 * - commit() applies DB + persist + broadcast but NOT filesystem sync
 * - save() triggers filesystem sync only
 * - apply() does both (commit + save)
 * - FS-origin commit doesn't save (no echo)
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest"
import { Database } from "bun:sqlite"
import { mkdirSync, rmSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { setLogLevel, getLogLevel, type LogLevel } from "loggily"
import { createEmitter, type EventHub, type FsSync } from "../src/emitter.ts"
import { SCHEMA } from "../src/schema.ts"

// Suppress log output in tests
let savedLogLevel: LogLevel
beforeAll(() => {
  savedLogLevel = getLogLevel()
  setLogLevel("silent")
})
afterAll(() => {
  setLogLevel(savedLogLevel)
})

function createTestDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

function createTmpDir(): string {
  const dir = join("/tmp", `kmtest-emitter-cp-${ulid()}`)
  mkdirSync(join(dir, ".km"), { recursive: true })
  return dir
}

describe("commit/save split", () => {
  test("commit() applies DB but does NOT trigger FS sync", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsSyncCalls: string[] = []
    const broadcastCalls: string[] = []

    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const fsSync: FsSync = {
      applyEventToFs(event) {
        fsSyncCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, fsSync, skipPersist: true })

    const event = emitter.commit({ type: "node_created", actor: "fs-watch", data: { id: "n1", type: "h" } })

    // Event should be returned with id and ts
    expect(event.id).toBeTruthy()
    expect(event.ts).toBeGreaterThan(0)
    expect(event.type).toBe("node_created")

    // DB should be updated (meta cursor)
    const meta = db.query("SELECT value FROM meta WHERE key = 'last_event'").get() as { value: string } | null
    expect(meta?.value).toBe(event.id)

    // Broadcast should run
    expect(broadcastCalls).toEqual(["node_created"])

    // FsSync should NOT run — commit doesn't save
    expect(fsSyncCalls).toEqual([])

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("save() triggers FS sync only — no DB, no broadcast", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsSyncCalls: string[] = []
    const broadcastCalls: string[] = []

    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const fsSync: FsSync = {
      applyEventToFs(event) {
        fsSyncCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, fsSync, skipPersist: true })

    // First commit to get a full event
    const event = emitter.commit({ type: "node_updated", actor: "user", target: "t1", data: { content: "x" } })

    // Clear tracking
    broadcastCalls.length = 0

    // Now save the already-committed event
    emitter.save(event)

    // FsSync should run
    expect(fsSyncCalls).toEqual(["node_updated"])

    // Broadcast should NOT run again (already ran during commit)
    expect(broadcastCalls).toEqual([])

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("apply() does both commit and save", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsSyncCalls: string[] = []
    const broadcastCalls: string[] = []

    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const fsSync: FsSync = {
      applyEventToFs(event) {
        fsSyncCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, fsSync, skipPersist: true })

    const event = emitter.apply({ type: "node_created", actor: "user", data: { id: "n2", type: "h" } })

    // Everything should run
    expect(event.id).toBeTruthy()
    expect(broadcastCalls).toEqual(["node_created"])
    expect(fsSyncCalls).toEqual(["node_created"])

    // DB should be updated
    const meta = db.query("SELECT value FROM meta WHERE key = 'last_event'").get() as { value: string } | null
    expect(meta?.value).toBe(event.id)

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("FS-origin commit does not save (structural echo prevention)", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsSyncCalls: string[] = []
    const broadcastCalls: string[] = []

    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const fsSync: FsSync = {
      applyEventToFs(event) {
        fsSyncCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, fsSync, skipPersist: true })

    // Simulate the wrapEmitterForReconcile pattern: use commit() for FS-origin events
    const event = emitter.commit({ type: "node_created", actor: "fs-watch", data: { id: "n3", type: "h" } })

    // DB updated
    const meta = db.query("SELECT value FROM meta WHERE key = 'last_event'").get() as { value: string } | null
    expect(meta?.value).toBe(event.id)

    // Broadcast runs (TUI gets notified)
    expect(broadcastCalls).toEqual(["node_created"])

    // FsSync does NOT run (no echo back to filesystem)
    expect(fsSyncCalls).toEqual([])

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("apply with skipFsSync still prevents save", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsSyncCalls: string[] = []

    const fsSync: FsSync = {
      applyEventToFs(event) {
        fsSyncCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, fsSync, skipPersist: true })

    // apply with skipFsSync should skip FS save
    emitter.apply({ type: "node_created", actor: "fs-watch", data: { id: "n4", type: "h" } }, { skipFsSync: true })

    expect(fsSyncCalls).toEqual([])

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("save with no fsSync set is a no-op", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const emitter = createEmitter({ kmDir, db, skipPersist: true })

    const event = emitter.commit({ type: "node_created", actor: "user", data: { id: "n5", type: "h" } })

    // Should not throw when no fsSync is set
    expect(() => emitter.save(event)).not.toThrow()

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("wrapped emitter (reconcile pattern) uses commit for all apply calls", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsSyncCalls: string[] = []
    const broadcastCalls: string[] = []

    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const fsSync: FsSync = {
      applyEventToFs(event) {
        fsSyncCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, fsSync, skipPersist: true })

    // Wrap using the same pattern as wrapEmitterForReconcile
    const wrappedEmitter: typeof emitter = {
      ...emitter,
      apply(event, _options = {}) {
        return emitter.commit(event, _options)
      },
    }

    // Apply via wrapped emitter — should broadcast but NOT write to FS
    wrappedEmitter.apply({ type: "node_created", actor: "fs-watch", data: { id: "w1", type: "h" } })
    wrappedEmitter.apply({ type: "node_updated", actor: "fs-watch", target: "w1", data: { content: "x" } })

    // Broadcast works (TUI gets notified)
    expect(broadcastCalls).toEqual(["node_created", "node_updated"])
    // FsSync is skipped (structural, not flag-based)
    expect(fsSyncCalls).toEqual([])

    // Direct emitter still has full apply (commit + save)
    emitter.apply({ type: "node_updated", actor: "user", target: "u1", data: { content: "y" } })
    expect(fsSyncCalls).toEqual(["node_updated"])

    db.close()
    rmSync(dir, { recursive: true })
  })
})
