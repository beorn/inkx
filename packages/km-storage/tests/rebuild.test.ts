/**
 * State Rebuild Tests
 *
 * Tests for rebuild.ts functions.
 * Uses isolated temp directories for parallel test execution.
 */

import { describe, test, expect } from "bun:test"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { getEventsPath } from "../src/emit.ts"
import {
  readEvents,
  rebuildState,
  fullReset,
  freshStart,
  runWithProgress,
} from "../src/rebuild.ts"
import { getDb } from "../src/db.ts"
import { createVault } from "../src/vault.ts"
import { runGenerator } from "../src/rebuild.ts"
import { withTestEnvSync, withTestEnv } from "@km/storage"

describe("rebuild.ts", () => {
  describe("readEvents", () => {
    test("returns empty array when events file doesn't exist", () =>
      withTestEnvSync(() => {
        const events = readEvents()
        expect(events).toEqual([])
      }))

    test("reads events from events.jsonl", () =>
      withTestEnvSync(({ kmDir }) => {
        mkdirSync(kmDir, { recursive: true })
        const eventsPath = getEventsPath()
        writeFileSync(
          eventsPath,
          '{"id":"01HQ1A","type":"node_created","data":{"id":"n1","type":"task"}}\n' +
            '{"id":"01HQ1B","type":"node_created","data":{"id":"n2","type":"task"}}\n',
        )

        const events = readEvents()
        expect(events.length).toBe(2)
        expect(events[0]!.id).toBe("01HQ1A")
        expect(events[1]!.id).toBe("01HQ1B")
      }))

    test("deduplicates events by ID", () =>
      withTestEnvSync(({ kmDir }) => {
        mkdirSync(kmDir, { recursive: true })
        const eventsPath = getEventsPath()
        writeFileSync(
          eventsPath,
          '{"id":"01HQ1A","type":"node_created","data":{"id":"n1","type":"task"}}\n' +
            '{"id":"01HQ1A","type":"node_created","data":{"id":"n1","type":"task"}}\n' +
            '{"id":"01HQ1B","type":"node_created","data":{"id":"n2","type":"task"}}\n',
        )

        const events = readEvents()
        expect(events.length).toBe(2)
      }))

    test("sorts events by ULID", () =>
      withTestEnvSync(({ kmDir }) => {
        mkdirSync(kmDir, { recursive: true })
        const eventsPath = getEventsPath()
        // Write in reverse order
        writeFileSync(
          eventsPath,
          '{"id":"01HQ1B","type":"node_created","data":{"id":"n2","type":"task"}}\n' +
            '{"id":"01HQ1A","type":"node_created","data":{"id":"n1","type":"task"}}\n',
        )

        const events = readEvents()
        expect(events[0]!.id).toBe("01HQ1A")
        expect(events[1]!.id).toBe("01HQ1B")
      }))

    test("skips malformed lines", () =>
      withTestEnvSync(({ kmDir }) => {
        mkdirSync(kmDir, { recursive: true })
        const eventsPath = getEventsPath()
        writeFileSync(
          eventsPath,
          '{"id":"01HQ1A","type":"node_created","data":{"id":"n1","type":"task"}}\n' +
            "not json\n" +
            '{"id":"01HQ1B","type":"node_created","data":{"id":"n2","type":"task"}}\n',
        )

        const events = readEvents()
        expect(events.length).toBe(2)
      }))
  })

  describe("vault.needsRebuild()", () => {
    test("returns false for memory mode vaults", () =>
      withTestEnv(async ({ vaultDir }) => {
        // No .km directory = memory mode
        writeFileSync(join(vaultDir, "test.md"), "# Test\n- [ ] Task\n")

        using vault = runGenerator(createVault(vaultDir))
        expect(vault.mode).toBe("memory")
        expect(vault.needsRebuild()).toBe(false)
      }))

    test("returns true for disk mode without state.db", () =>
      withTestEnv(async ({ vaultDir, kmDir }) => {
        // Create .km directory for disk mode (but no state.db created yet)
        mkdirSync(kmDir, { recursive: true })
        writeFileSync(join(vaultDir, "test.md"), "# Test\n- [ ] Task\n")

        using vault = runGenerator(createVault(vaultDir))
        expect(vault.mode).toBe("disk")
        // No state.db file exists = needs rebuild
        // (test uses ALS in-memory db, so physical state.db doesn't exist)
        expect(vault.needsRebuild()).toBe(true)
      }))

    test("returns false for disk mode with state.db and no events", () =>
      withTestEnv(async ({ vaultDir, kmDir }) => {
        // Create .km directory and empty state.db for disk mode
        mkdirSync(kmDir, { recursive: true })
        writeFileSync(join(kmDir, "state.db"), "") // Empty file simulates existing db
        writeFileSync(join(vaultDir, "test.md"), "# Test\n- [ ] Task\n")

        using vault = runGenerator(createVault(vaultDir))
        expect(vault.mode).toBe("disk")
        // state.db exists, no events = no rebuild needed
        expect(vault.needsRebuild()).toBe(false)
      }))
  })

  describe("rebuildState", () => {
    test("rebuilds state from events", () =>
      withTestEnvSync(({ kmDir }) => {
        mkdirSync(kmDir, { recursive: true })
        const eventsPath = getEventsPath()
        writeFileSync(
          eventsPath,
          JSON.stringify({
            id: "01HQ1A",
            type: "node_created",
            actor: "test",
            timestamp: Date.now(),
            data: {
              id: "n1",
              type: "task",
              content: "Test task",
              parent_id: null,
              parent_idx: 0,
              created_at: Date.now(),
              updated_at: Date.now(),
              version: "1",
            },
          }) + "\n",
        )

        const result = runWithProgress(rebuildState())
        expect(result.eventCount).toBe(1)
        expect(result.nodeCount).toBe(1)

        const db = getDb()
        const node = db.prepare("SELECT * FROM nodes WHERE id = ?").get("n1")
        expect(node).toBeDefined()
      }))
  })

  describe("fullReset", () => {
    test("deletes state.db and rebuilds", () =>
      withTestEnvSync(({ kmDir }) => {
        mkdirSync(kmDir, { recursive: true })
        // Create initial state
        const eventsPath = getEventsPath()
        writeFileSync(
          eventsPath,
          JSON.stringify({
            id: "01HQ1A",
            type: "node_created",
            actor: "test",
            timestamp: Date.now(),
            data: {
              id: "n1",
              type: "task",
              content: "Test task",
              parent_id: null,
              parent_idx: 0,
              created_at: Date.now(),
              updated_at: Date.now(),
              version: "1",
            },
          }) + "\n",
        )

        runWithProgress(rebuildState())

        // Now do full reset
        const result = runWithProgress(fullReset())
        expect(result.eventCount).toBe(1)
        expect(result.nodeCount).toBe(1)
      }))
  })

  describe("freshStart", () => {
    test("clears .km directory contents", () =>
      withTestEnvSync(({ kmDir }) => {
        // Create .km and some files in it
        mkdirSync(kmDir, { recursive: true })
        writeFileSync(join(kmDir, "events.jsonl"), "test")
        writeFileSync(join(kmDir, "test.txt"), "test")
        mkdirSync(join(kmDir, "blobs"))
        writeFileSync(join(kmDir, "blobs", "test"), "test")

        freshStart()

        // .km should exist but be empty
        expect(existsSync(kmDir)).toBe(true)
        expect(existsSync(join(kmDir, "events.jsonl"))).toBe(false)
        expect(existsSync(join(kmDir, "test.txt"))).toBe(false)
        expect(existsSync(join(kmDir, "blobs"))).toBe(false)
      }))
  })
})
