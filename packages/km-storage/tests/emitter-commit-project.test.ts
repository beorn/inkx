/**
 * Emitter commit/apply split tests
 *
 * Verifies that:
 * - commit() applies DB + persist + broadcast (same as apply at emitter level)
 * - apply() applies DB + persist + broadcast (FS projection is added by decorators)
 * - FS-origin commit uses the reconcile wrapping pattern
 * - Decorator wrapping (skipFsSync) prevents echo loops
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest"
import { Database } from "bun:sqlite"
import { mkdirSync, rmSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { setLogLevel, getLogLevel, type LogLevel } from "loggily"
import { createEmitter, type EventHub } from "../src/emitter.ts"
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

describe("commit/apply split", () => {
  test("commit() applies DB and broadcasts", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const broadcastCalls: string[] = []

    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, skipPersist: true })

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

  test("apply() does DB + broadcast (decorator adds FS projection)", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const broadcastCalls: string[] = []
    const fsCalls: string[] = []

    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, skipPersist: true })

    // Simulate FS decorator wrapping emitter.apply
    const baseApply = emitter.apply.bind(emitter)
    emitter.apply = (event, options = {}) => {
      const result = baseApply(event, options)
      if (!options.skipFsSync) {
        fsCalls.push(result.type)
      }
      return result
    }

    const event = emitter.apply({ type: "node_created", actor: "user", data: { id: "n2", type: "h" } })

    // Everything should run (including FS decorator)
    expect(event.id).toBeTruthy()
    expect(broadcastCalls).toEqual(["node_created"])
    expect(fsCalls).toEqual(["node_created"])

    // DB should be updated
    const meta = db.query("SELECT value FROM meta WHERE key = 'last_event'").get() as { value: string } | null
    expect(meta?.value).toBe(event.id)

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("FS-origin commit does not trigger FS decorator (structural echo prevention)", () => {
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

    // Simulate FS decorator wrapping emitter.apply
    const baseApply = emitter.apply.bind(emitter)
    emitter.apply = (event, options = {}) => {
      const result = baseApply(event, options)
      if (!options.skipFsSync) {
        fsCalls.push(result.type)
      }
      return result
    }

    // Use commit() for FS-origin events — bypasses the apply wrapper
    const event = emitter.commit({ type: "node_created", actor: "fs-watch", data: { id: "n3", type: "h" } })

    // DB updated
    const meta = db.query("SELECT value FROM meta WHERE key = 'last_event'").get() as { value: string } | null
    expect(meta?.value).toBe(event.id)

    // Broadcast runs (TUI gets notified)
    expect(broadcastCalls).toEqual(["node_created"])

    // FS decorator does NOT run (commit bypasses the wrapper)
    expect(fsCalls).toEqual([])

    db.close()
    rmSync(dir, { recursive: true })
  })

  test("apply with skipFsSync prevents FS decorator from running", () => {
    const db = createTestDb()
    const dir = createTmpDir()
    const kmDir = join(dir, ".km")

    const fsCalls: string[] = []

    const emitter = createEmitter({ kmDir, db, skipPersist: true })

    // Simulate FS decorator
    const baseApply = emitter.apply.bind(emitter)
    emitter.apply = (event, options = {}) => {
      const result = baseApply(event, options)
      if (!options.skipFsSync) {
        fsCalls.push(result.type)
      }
      return result
    }

    // apply with skipFsSync should skip FS decorator
    emitter.apply({ type: "node_created", actor: "fs-watch", data: { id: "n4", type: "h" } }, { skipFsSync: true })

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

    const hub: EventHub = {
      broadcast(event) {
        broadcastCalls.push(event.type)
      },
    }

    const emitter = createEmitter({ kmDir, db, eventHub: hub, skipPersist: true })

    // Simulate FS decorator wrapping emitter.apply
    const baseApply = emitter.apply.bind(emitter)
    emitter.apply = (event, options = {}) => {
      const result = baseApply(event, options)
      if (!options.skipFsSync) {
        fsCalls.push(result.type)
      }
      return result
    }

    // Wrap using the same pattern as wrapEmitterForReconcile
    const wrappedEmitter: typeof emitter = {
      ...emitter,
      apply(event, _options = {}) {
        return emitter.commit(event, _options)
      },
    }

    // Apply via wrapped emitter — should broadcast but NOT trigger FS decorator
    wrappedEmitter.apply({ type: "node_created", actor: "fs-watch", data: { id: "w1", type: "h" } })
    wrappedEmitter.apply({ type: "node_updated", actor: "fs-watch", target: "w1", data: { content: "x" } })

    // Broadcast works (TUI gets notified)
    expect(broadcastCalls).toEqual(["node_created", "node_updated"])
    // FS decorator is skipped (structural, not flag-based)
    expect(fsCalls).toEqual([])

    // Direct emitter triggers FS decorator (for TUI-origin events)
    emitter.apply({ type: "node_updated", actor: "user", target: "u1", data: { content: "y" } })
    expect(fsCalls).toEqual(["node_updated"])

    db.close()
    rmSync(dir, { recursive: true })
  })
})
