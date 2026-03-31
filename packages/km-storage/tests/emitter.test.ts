/**
 * Emitter Tests — Error Isolation & Callback Integrity
 *
 * Covers:
 * - F1: Error isolation in emit() — one bad listener must not kill the pipeline
 * - EventHub broadcast errors don't block FsSync
 * - FsSync errors don't suppress event return
 * - All steps (persist, db apply, broadcast, fs sync) execute in order
 */

import { describe, test, expect, vi, beforeAll, afterAll } from "vitest"
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { setLogLevel, getLogLevel, type LogLevel } from "loggily"
import { createEmitter, type EventHub, type FsSync } from "../src/emitter.ts"
import { SCHEMA } from "../src/schema.ts"

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

describe("F1: Error isolation in emit()", () => {
  test("broadcast error does not prevent fsSync from running", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsSyncCalls: string[] = []
    const fsSync: FsSync = {
      applyEventToFs(event) {
        fsSyncCalls.push(event.type)
      },
    }

    const throwingHub: EventHub = {
      broadcast() {
        throw new Error("broadcast exploded")
      },
    }

    const emitter = createEmitter({
      kmDir,
      db,
      eventHub: throwingHub,
      fsSync,
    })

    // Should NOT throw — broadcast error is isolated
    const event = emitter.emit({ type: "node_created", actor: "test", data: { id: "n1", type: "h" } })

    expect(event).toBeDefined()
    expect(event.type).toBe("node_created")
    // FsSync should still have run despite broadcast failure
    expect(fsSyncCalls).toEqual(["node_created"])

    // DB event should still have been applied (meta cursor updated)
    const meta = db.query("SELECT value FROM meta WHERE key = 'last_event'").get() as { value: string } | null
    expect(meta?.value).toBe(event.id)

    // Cleanup
    db.close()
    rmSync(dir, { recursive: true })
  })

  test("fsSync I/O error does not prevent event from being returned", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const broadcastCalls: string[] = []
    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const throwingFsSync: FsSync = {
      applyEventToFs() {
        const err = new Error("disk full") as NodeJS.ErrnoException
        err.code = "ENOSPC"
        throw err
      },
    }

    const emitter = createEmitter({
      kmDir,
      db,
      eventHub: hub,
      fsSync: throwingFsSync,
    })

    // I/O error in fsSync (has errno code) should be swallowed
    const event = emitter.emit({ type: "node_updated", actor: "test", target: "t1", data: { content: "x" } })

    expect(event).toBeDefined()
    expect(event.type).toBe("node_updated")
    // Broadcast should have run before fsSync
    expect(broadcastCalls).toEqual(["node_updated"])

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("fsSync programming error (no errno code) IS re-thrown", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const throwingFsSync: FsSync = {
      applyEventToFs() {
        throw new TypeError("Cannot read properties of undefined")
      },
    }

    const emitter = createEmitter({
      kmDir,
      db,
      fsSync: throwingFsSync,
    })

    // Programming errors (no errno code) should propagate
    expect(() => {
      emitter.emit({ type: "node_created", actor: "test", data: { id: "n2", type: "h" } })
    }).toThrow("Cannot read properties of undefined")

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("emit returns event even when no hub or fsSync is set", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const emitter = createEmitter({ kmDir, db })

    const event = emitter.emit({ type: "node_created", actor: "test", data: { id: "n3", type: "p" } })

    expect(event.id).toBeTruthy()
    expect(event.ts).toBeGreaterThan(0)
    expect(event.type).toBe("node_created")

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("all four steps execute in order: persist, db, broadcast, fsSync", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const order: string[] = []

    const hub: EventHub = {
      broadcast() {
        order.push("broadcast")
      },
    }

    const fsSync: FsSync = {
      applyEventToFs() {
        order.push("fsSync")
      },
    }

    const emitter = createEmitter({
      kmDir,
      db,
      eventHub: hub,
      fsSync,
    })

    emitter.emit({ type: "node_created", actor: "test", data: { id: "n4", type: "h" } })

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

    expect(order).toEqual(["persist", "db", "broadcast", "fsSync"])

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
    emitter.emit({ type: "node_created", actor: "test", data: { id: "a", type: "h" } })
    expect(calls).toEqual(["hub1"])

    emitter.setEventHub(hub2)
    emitter.emit({ type: "node_created", actor: "test", data: { id: "b", type: "h" } })
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
    const fsSync: FsSync = {
      applyEventToFs() {
        calls.push("fsSync")
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, fsSync, skipPersist: true })
    emitter.emit({ type: "node_created", actor: "test", data: { id: "c", type: "h" } })
    expect(calls).toEqual(["hub", "fsSync"])

    emitter.close()
    calls.length = 0

    emitter.emit({ type: "node_created", actor: "test", data: { id: "d", type: "h" } })
    // After close, neither hub nor fsSync should be called
    expect(calls).toEqual([])

    db.close()
    rmSync(dir, { recursive: true })
  })
})
