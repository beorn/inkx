/**
 * Emitter commit/apply split tests
 *
 * Verifies that:
 * - commit() applies DB + persist + broadcast (same as apply at emitter level)
 * - apply() applies DB + persist + broadcast (FS projection is added by decorators)
 * - FS-origin commit uses the reconcile wrapping pattern
 * - commit() bypasses onApply subscribers (structural echo prevention)
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest"
import { Database } from "bun:sqlite"
import { mkdirSync, rmSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { setLogLevel, getLogLevel, type LogLevel } from "loggily"
import { createEmitter, type ChangeHub } from "../src/emitter.ts"
import { SCHEMA } from "../src/db/schema.ts"

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

describe("commit/apply split", () => {
  test("commit() applies DB and broadcasts", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const broadcastCalls: string[] = []

    const hub: ChangeHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, changeHub: hub, skipPersist: true })

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

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("apply() does DB + broadcast + onApply subscriber", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const broadcastCalls: string[] = []
    const fsCalls: string[] = []

    const hub: ChangeHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, changeHub: hub, skipPersist: true })

    // Register onApply subscriber (same pattern as withFsWriter/withSync)
    emitter.onApply((event, options) => {
      if (options.source !== "fs-import") {
        fsCalls.push(event.type)
      }
    })

    const event = emitter.apply({ type: "node_created", actor: "user", data: { id: "n2", type: "h" } })

    // Everything should run (including onApply subscriber)
    expect(event.id).toBeTruthy()
    expect(broadcastCalls).toEqual(["node_created"])
    expect(fsCalls).toEqual(["node_created"])

    // DB should be updated
    const meta = db.query("SELECT value FROM meta WHERE key = 'last_event'").get() as { value: string } | null
    expect(meta?.value).toBe(event.id)

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("FS-origin commit does not trigger onApply (structural echo prevention)", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsCalls: string[] = []
    const broadcastCalls: string[] = []

    const hub: ChangeHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, changeHub: hub, skipPersist: true })

    // Register onApply subscriber
    emitter.onApply((event, options) => {
      if (options.source !== "fs-import") {
        fsCalls.push(event.type)
      }
    })

    // Use commit() for FS-origin events — bypasses onApply
    const event = emitter.commit({ type: "node_created", actor: "fs-watch", data: { id: "n3", type: "h" } })

    // DB updated
    const meta = db.query("SELECT value FROM meta WHERE key = 'last_event'").get() as { value: string } | null
    expect(meta?.value).toBe(event.id)

    // Broadcast runs (TUI gets notified)
    expect(broadcastCalls).toEqual(["node_created"])

    // onApply subscriber does NOT run (commit bypasses it)
    expect(fsCalls).toEqual([])

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("apply with source: fs-import skips FS projection in subscriber", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsCalls: string[] = []

    const emitter = createEmitter({ kmDir, db, skipPersist: true })

    // Register onApply subscriber with source filter
    emitter.onApply((event, options) => {
      if (options.source !== "fs-import") {
        fsCalls.push(event.type)
      }
    })

    // apply with source: "fs-import" should skip FS projection in subscriber
    emitter.apply({ type: "node_created", actor: "fs-watch", data: { id: "n4", type: "h" } }, { source: "fs-import" })

    expect(fsCalls).toEqual([])

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("wrapped emitter (reconcile pattern) uses commit for all apply calls", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsCalls: string[] = []
    const broadcastCalls: string[] = []

    const hub: ChangeHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, changeHub: hub, skipPersist: true })

    // Register onApply subscriber
    emitter.onApply((event, options) => {
      if (options.source !== "fs-import") {
        fsCalls.push(event.type)
      }
    })

    // Wrap using the same pattern as wrapEmitterForReconcile
    const wrappedEmitter: typeof emitter = {
      ...emitter,
      apply(event, _options = {}) {
        return emitter.commit(event, _options)
      },
    }

    // Apply via wrapped emitter — should broadcast but NOT trigger onApply
    wrappedEmitter.apply({ type: "node_created", actor: "fs-watch", data: { id: "w1", type: "h" } })
    wrappedEmitter.apply({ type: "node_updated", actor: "fs-watch", target: "w1", data: { content: "x" } })

    // Broadcast works (TUI gets notified)
    expect(broadcastCalls).toEqual(["node_created", "node_updated"])
    // onApply subscriber is NOT called (commit bypasses it)
    expect(fsCalls).toEqual([])

    // Direct emitter apply() triggers onApply subscriber (for TUI-origin events)
    emitter.apply({ type: "node_updated", actor: "user", target: "u1", data: { content: "y" } })
    expect(fsCalls).toEqual(["node_updated"])

    db.close()
    rmSync(dir, { recursive: true })
  })
})
