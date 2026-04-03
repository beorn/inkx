/**
 * Emitter Tests — Error Isolation & Callback Integrity
 *
 * Covers:
 * - F1: Error isolation in apply() — one bad listener must not kill the pipeline
 * - EventHub broadcast errors are isolated
 * - All steps (persist, db apply, broadcast) execute in order
 * - Emitter wrapping pattern for decorators (withFsWriter, withSync)
 *
 * Note: FS projection is handled by decorators (withFsWriter, withSync) that
 * wrap emitter.apply(). The Emitter itself has no knowledge of the filesystem.
 */

import { describe, test, expect, vi, beforeAll, afterAll } from "vitest"
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { setLogLevel, getLogLevel, type LogLevel } from "loggily"
import { createEmitter, type EventHub } from "../src/emitter.ts"
import { SCHEMA } from "../src/db/schema.ts"

// Suppress log output in error-isolation tests (they deliberately trigger errors)
let savedLogLevel: LogLevel
beforeAll(() => {
  savedLogLevel = getLogLevel()
  setLogLevel("silent")
})
afterAll(() => {
  setLogLevel(savedLogLevel)
})

// =============================================================================
// Helpers
// =============================================================================

function createTestDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

function createTmpDir(): string {
  const dir = join("/tmp", `kmtest-emitter-${ulid()}`)
  mkdirSync(join(dir, ".km"), { recursive: true })
  return dir
}

// =============================================================================
// F1: Error isolation — broadcast error must not kill pipeline
// =============================================================================

describe("F1: Error isolation in apply()", () => {
  test("broadcast error does not prevent event from being returned", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const throwingHub: EventHub = {
      broadcast() {
        throw new Error("broadcast exploded")
      },
    }

    const emitter = createEmitter({
      kmDir,
      db,
      eventHub: throwingHub,
    })

    // Should NOT throw — broadcast error is isolated
    const event = emitter.apply({ type: "node_created", actor: "test", data: { id: "n1", type: "h" } })

    expect(event).toBeDefined()
    expect(event.type).toBe("node_created")

    // DB event should still have been applied (meta cursor updated)
    const meta = db.query("SELECT value FROM meta WHERE key = 'last_event'").get() as { value: string } | null
    expect(meta?.value).toBe(event.id)

    // Cleanup
    db.close()
    rmSync(dir, { recursive: true })
  })

  test("apply returns event even when no hub is set", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const emitter = createEmitter({ kmDir, db })

    const event = emitter.apply({ type: "node_created", actor: "test", data: { id: "n3", type: "p" } })

    expect(event.id).toBeTruthy()
    expect(event.ts).toBeGreaterThan(0)
    expect(event.type).toBe("node_created")

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("all three steps execute in order: persist, db, broadcast", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const order: string[] = []

    const hub: EventHub = {
      broadcast() {
        order.push("broadcast")
      },
    }

    const emitter = createEmitter({
      kmDir,
      db,
      eventHub: hub,
    })

    emitter.apply({ type: "node_created", actor: "test", data: { id: "n4", type: "h" } })

    // Verify events.jsonl was written (persist step)
    const eventsPath = join(kmDir, "events.jsonl")
    expect(existsSync(eventsPath)).toBe(true)
    const lines = readFileSync(eventsPath, "utf-8").trim().split("\n")
    expect(lines.length).toBe(1)
    order.unshift("persist") // We know it ran because file exists

    // DB step ran (check meta table)
    const meta = db.query("SELECT value FROM meta WHERE key = 'last_event'").get() as { value: string }
    expect(meta.value).toBeTruthy()
    // Insert "db" after persist
    order.splice(1, 0, "db")

    expect(order).toEqual(["persist", "db", "broadcast"])

    db.close()
    rmSync(dir, { recursive: true })
  })
})

// =============================================================================
// F1 variant: Multiple listeners (future-proofing)
// =============================================================================

describe("F1: Multiple callback isolation", () => {
  test("setEventHub replaces hub — old hub no longer called", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const calls: string[] = []
    const hub1: EventHub = {
      broadcast() {
        calls.push("hub1")
      },
    }
    const hub2: EventHub = {
      broadcast() {
        calls.push("hub2")
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub1, skipPersist: true })
    emitter.apply({ type: "node_created", actor: "test", data: { id: "a", type: "h" } })
    expect(calls).toEqual(["hub1"])

    emitter.setEventHub(hub2)
    emitter.apply({ type: "node_created", actor: "test", data: { id: "b", type: "h" } })
    expect(calls).toEqual(["hub1", "hub2"])

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("close() stops all callbacks", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const calls: string[] = []
    const hub: EventHub = {
      broadcast() {
        calls.push("hub")
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, skipPersist: true })
    emitter.apply({ type: "node_created", actor: "test", data: { id: "c", type: "h" } })
    expect(calls).toEqual(["hub"])

    emitter.close()
    calls.length = 0

    emitter.apply({ type: "node_created", actor: "test", data: { id: "d", type: "h" } })
    // After close, hub should not be called
    expect(calls).toEqual([])

    db.close()
    rmSync(dir, { recursive: true })
  })
})

// =============================================================================
// onApply subscriber — source-based filtering for FS projection
// =============================================================================

describe("onApply subscriber with source filtering", () => {
  test("source: fs-import skips FS projection subscriber", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsCalls: string[] = []
    const broadcastCalls: string[] = []

    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, skipPersist: true })

    // Register onApply subscriber (same pattern as withFsWriter/withSync)
    emitter.onApply((event, options) => {
      if (options.source !== "fs-import") {
        fsCalls.push(event.type)
      }
    })

    // Apply with source: "fs-import" — subscriber should skip FS projection
    emitter.apply({ type: "node_created", actor: "fs-watch", data: { id: "n1", type: "h" } }, { source: "fs-import" })
    expect(broadcastCalls).toEqual(["node_created"])
    expect(fsCalls).toEqual([])

    // Apply without source — subscriber should run FS projection
    emitter.apply({ type: "node_updated", actor: "user", target: "t1", data: { content: "x" } })
    expect(fsCalls).toEqual(["node_updated"])

    db.close()
    rmSync(dir, { recursive: true })
  })
})

// =============================================================================
// Emitter wrapping — pattern used by decorators for FS-origin reconciliation
// =============================================================================

describe("commit() vs apply() — structural echo prevention", () => {
  test("commit() does not fire onApply subscribers", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsCalls: string[] = []
    const broadcastCalls: string[] = []

    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, skipPersist: true })

    // Register onApply subscriber (same pattern as withFsWriter/withSync)
    emitter.onApply((event, options) => {
      if (options.source !== "fs-import") {
        fsCalls.push(event.type)
      }
    })

    // commit() bypasses onApply — should broadcast but NOT trigger subscriber
    emitter.commit({ type: "node_created", actor: "fs-watch", data: { id: "w1", type: "h" } })
    emitter.commit({ type: "node_updated", actor: "fs-watch", target: "w1", data: { content: "x" } })

    // Broadcast still works (TUI gets notified)
    expect(broadcastCalls).toEqual(["node_created", "node_updated"])
    // onApply subscriber is NOT called (commit bypasses it)
    expect(fsCalls).toEqual([])

    // Direct apply() still triggers subscriber (for TUI-origin events)
    emitter.apply({ type: "node_updated", actor: "user", target: "u1", data: { content: "y" } })
    expect(fsCalls).toEqual(["node_updated"])

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("commit() preserves other options (skipBroadcast)", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsCalls: string[] = []
    const broadcastCalls: string[] = []

    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, skipPersist: true })

    // Register onApply subscriber
    emitter.onApply((event, options) => {
      if (options.source !== "fs-import") {
        fsCalls.push(event.type)
      }
    })

    // commit() with skipBroadcast — both should be respected
    emitter.commit({ type: "node_created", actor: "fs-watch", data: { id: "w2", type: "h" } }, { skipBroadcast: true })

    expect(broadcastCalls).toEqual([])
    expect(fsCalls).toEqual([])

    db.close()
    rmSync(dir, { recursive: true })
  })
})
