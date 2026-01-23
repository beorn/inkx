/**
 * State Rebuild Tests
 *
 * Tests for rebuild.ts functions.
 * Uses isolated temp directories for cleaner test setup.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { ulid } from "ulid";
import { setKmDir, getEventsPath } from "../src/emit.ts";
import {
  readEvents,
  rebuildState,
  needsRebuild,
  fullReset,
  freshStart,
  runWithProgress,
} from "../src/rebuild.ts";
import { closeDb, getDb, resetDb } from "../src/db.ts";

// Track created directories for cleanup
const createdDirs: string[] = [];

/** Create an isolated test directory with .km subdirectory */
function createTestDir(): { testDir: string; kmDir: string } {
  const testDir = join("/tmp", `kmtest-rebuild-${ulid()}`);
  const kmDir = join(testDir, ".km");
  mkdirSync(kmDir, { recursive: true });
  createdDirs.push(testDir);
  return { testDir, kmDir };
}

// Current test directory (set in beforeEach)
let currentKmDir: string;

describe.serial("rebuild.ts", () => {
  beforeEach(() => {
    const { kmDir } = createTestDir();
    currentKmDir = kmDir;
    setKmDir(kmDir);
  });

  afterEach(() => {
    closeDb();
    // Clean up all created directories
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdDirs.length = 0;
  });

  describe.serial("readEvents", () => {
    test("returns empty array when events file doesn't exist", () => {
      const events = readEvents();
      expect(events).toEqual([]);
    });

    test("reads events from events.jsonl", () => {
      const eventsPath = getEventsPath();
      writeFileSync(
        eventsPath,
        '{"id":"01HQ1A","type":"node_created","data":{"id":"n1","type":"task"}}\n' +
          '{"id":"01HQ1B","type":"node_created","data":{"id":"n2","type":"task"}}\n',
      );

      const events = readEvents();
      expect(events.length).toBe(2);
      expect(events[0].id).toBe("01HQ1A");
      expect(events[1].id).toBe("01HQ1B");
    });

    test("deduplicates events by ID", () => {
      const eventsPath = getEventsPath();
      writeFileSync(
        eventsPath,
        '{"id":"01HQ1A","type":"node_created","data":{"id":"n1","type":"task"}}\n' +
          '{"id":"01HQ1A","type":"node_created","data":{"id":"n1","type":"task"}}\n' +
          '{"id":"01HQ1B","type":"node_created","data":{"id":"n2","type":"task"}}\n',
      );

      const events = readEvents();
      expect(events.length).toBe(2);
    });

    test("sorts events by ULID", () => {
      const eventsPath = getEventsPath();
      // Write in reverse order
      writeFileSync(
        eventsPath,
        '{"id":"01HQ1B","type":"node_created","data":{"id":"n2","type":"task"}}\n' +
          '{"id":"01HQ1A","type":"node_created","data":{"id":"n1","type":"task"}}\n',
      );

      const events = readEvents();
      expect(events[0].id).toBe("01HQ1A");
      expect(events[1].id).toBe("01HQ1B");
    });

    test("skips malformed lines", () => {
      const eventsPath = getEventsPath();
      writeFileSync(
        eventsPath,
        '{"id":"01HQ1A","type":"node_created","data":{"id":"n1","type":"task"}}\n' +
          "not json\n" +
          '{"id":"01HQ1B","type":"node_created","data":{"id":"n2","type":"task"}}\n',
      );

      const events = readEvents();
      expect(events.length).toBe(2);
    });
  });

  describe.serial("needsRebuild", () => {
    test("returns true when state.db doesn't exist", () => {
      writeFileSync(getEventsPath(), "");
      expect(needsRebuild()).toBe(true);
    });

    test("returns false when no events exist", () => {
      // Create empty state.db
      resetDb();
      const db = getDb();
      db.run("INSERT INTO meta (key, value) VALUES ('last_event', '01HQ1A')");

      // No events file
      expect(needsRebuild()).toBe(false);
    });
  });

  describe.serial("rebuildState", () => {
    test("rebuilds state from events", () => {
      const eventsPath = getEventsPath();
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
      );

      const result = runWithProgress(rebuildState());
      expect(result.eventCount).toBe(1);
      expect(result.nodeCount).toBe(1);

      const db = getDb();
      const node = db.prepare("SELECT * FROM nodes WHERE id = ?").get("n1");
      expect(node).toBeDefined();
    });
  });

  describe.serial("fullReset", () => {
    test("deletes state.db and rebuilds", () => {
      // Create initial state
      const eventsPath = getEventsPath();
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
      );

      runWithProgress(rebuildState());

      // Now do full reset
      const result = runWithProgress(fullReset());
      expect(result.eventCount).toBe(1);
      expect(result.nodeCount).toBe(1);
    });
  });

  describe.serial("freshStart", () => {
    test("clears .km directory contents", () => {
      // Create some files in .km
      writeFileSync(join(currentKmDir, "events.jsonl"), "test");
      writeFileSync(join(currentKmDir, "test.txt"), "test");
      mkdirSync(join(currentKmDir, "blobs"));
      writeFileSync(join(currentKmDir, "blobs", "test"), "test");

      freshStart();

      // .km should exist but be empty
      expect(existsSync(currentKmDir)).toBe(true);
      expect(existsSync(join(currentKmDir, "events.jsonl"))).toBe(false);
      expect(existsSync(join(currentKmDir, "test.txt"))).toBe(false);
      expect(existsSync(join(currentKmDir, "blobs"))).toBe(false);
    });
  });
});
