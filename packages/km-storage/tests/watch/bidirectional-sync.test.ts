/**
 * Bidirectional Sync E2E Tests
 *
 * Tests the full sync workflow:
 * - TUI edit → Model → File
 * - File edit → Model → TUI refresh event
 * - Rapid external edits don't cause race conditions
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { EventEmitter } from "events";

const TEST_DIR = join("/tmp", "kmtest-bidirectional");
const VAULT_DIR = join(TEST_DIR, "vault");
const KM_DIR = join(TEST_DIR, ".km");

import {
  closeDb,
  resetDb,
  getNode,
  getNodeByPath,
  getAllNodes,
  applyEvent,
  updateNode,
} from "@km/storage";

import { setKmDir, setDatabase, setFsSync } from "../../src/emit.ts";
import { SyncManager } from "../../src/watch/sync.ts";

describe.serial("Bidirectional Sync E2E", () => {
  let syncManager: SyncManager;
  let events: EventEmitter;

  beforeEach(async () => {
    // Clean up test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(VAULT_DIR, { recursive: true });
    mkdirSync(KM_DIR, { recursive: true });

    // Configure emit to use test directory
    setKmDir(KM_DIR);
    setDatabase({ applyEvent });

    // Reset database
    resetDb();

    // Create event emitter for test observation
    events = new EventEmitter();

    // Create sync manager with very short debounce for testing
    syncManager = new SyncManager({
      vaultPath: VAULT_DIR,
      debounceFs: 100, // 100ms for faster tests
      debounceApply: 50, // 50ms for TUI changes
      conflictStrategy: "last_write_wins",
    });

    // Wire up filesystem sync
    setFsSync(syncManager);

    // Track state changes
    syncManager.on("state-change", (state) => {
      events.emit("state-change", state);
    });

    // Note: syncFromFs() and start() are called per-test as needed
  });

  afterEach(async () => {
    setFsSync(null);
    await syncManager.stop();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe.serial("TUI → Filesystem", () => {
    test("editing task status in model writes to file", async () => {
      // Create test file with a task
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Test task\n");

      // Wait for initial sync
      await syncManager.syncFromFs();

      // Find the task
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();
      expect(task!.task_status).toBe("todo");

      // Update task status (simulating TUI edit)
      updateNode(task!.id, { task_status: "done" });

      // Wait for write queue to flush
      await Bun.sleep(200);

      // Read file and verify it was updated
      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("[x]");
      expect(content).not.toContain("[ ]");
    });

    test("creating new task in model creates file entry", async () => {
      // Create file first
      const testFile = join(VAULT_DIR, "new-tasks.md");
      writeFileSync(testFile, "# New Tasks\n\n- [ ] First task\n");

      // Sync
      await syncManager.syncFromFs();

      // Find the file node
      const fileNode = getNodeByPath(testFile);
      expect(fileNode).toBeDefined();

      // Find the task
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();

      // Update task text (simulating TUI edit)
      updateNode(task!.id, { content: "Updated task content" });

      // Wait for write
      await Bun.sleep(200);

      // Verify file was updated
      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("Updated task content");
    });
  });

  describe.serial("Filesystem → Model", () => {
    test("external file edit triggers state-change event", async () => {
      // Create initial file
      const testFile = join(VAULT_DIR, "watch-test.md");
      writeFileSync(testFile, "# Initial\n\n- [ ] Task 1\n");

      // Sync initial state
      await syncManager.syncFromFs();

      // Start watching and wait for ready
      syncManager.start();
      await new Promise<void>((resolve) => {
        syncManager.once("ready", resolve);
      });

      // Set up promise to wait for state change - wait for full cycle
      const stateChanged = new Promise<void>((resolve) => {
        let sawReconciling = false;
        const handler = (state: string) => {
          if (state === "reconciling") {
            sawReconciling = true;
          }
          if (state === "idle" && sawReconciling) {
            events.off("state-change", handler);
            resolve();
          }
        };
        events.on("state-change", handler);
      });

      // Make external edit
      writeFileSync(testFile, "# Initial\n\n- [ ] Task 1\n- [ ] Task 2\n");

      // Wait for sync to complete (with timeout)
      const timeout = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Timeout waiting for sync")), 5000);
      });

      await Promise.race([stateChanged, timeout]);

      // Verify new task was synced
      const allNodes = getAllNodes();
      const tasks = allNodes.filter((n) => n.type === "task");
      expect(tasks.length).toBe(2);
    });

    test("external file edit updates database", async () => {
      // Create initial file
      const testFile = join(VAULT_DIR, "external-edit.md");
      writeFileSync(testFile, "# Test\n\n- [ ] Original task\n");

      // Sync initial state
      await syncManager.syncFromFs();

      // Verify initial state
      let allNodes = getAllNodes();
      let task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();
      expect(task!.content).toContain("Original task");

      // Start watching and wait for ready
      syncManager.start();
      await new Promise<void>((resolve) => {
        syncManager.once("ready", resolve);
      });

      // Set up wait for sync - wait for full cycle
      const stateChanged = new Promise<void>((resolve) => {
        let sawReconciling = false;
        const handler = (state: string) => {
          if (state === "reconciling") {
            sawReconciling = true;
          }
          if (state === "idle" && sawReconciling) {
            events.off("state-change", handler);
            resolve();
          }
        };
        events.on("state-change", handler);
      });

      // External edit - change task text
      writeFileSync(testFile, "# Test\n\n- [ ] Modified task\n");

      // Wait for sync
      await Promise.race([
        stateChanged,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 5000),
        ),
      ]);

      // Verify database was updated
      allNodes = getAllNodes();
      task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();
      expect(task!.content).toContain("Modified task");
    });

    test("external file delete removes from database", async () => {
      // Create initial file
      const testFile = join(VAULT_DIR, "to-delete.md");
      writeFileSync(testFile, "# To Delete\n\n- [ ] Task\n");

      // Sync initial state
      await syncManager.syncFromFs();

      // Verify file exists in DB
      let fileNode = getNodeByPath(testFile);
      expect(fileNode).toBeDefined();

      // Start watching and wait for ready
      syncManager.start();
      await new Promise<void>((resolve) => {
        syncManager.once("ready", resolve);
      });

      // Set up wait for sync - wait for full cycle
      const stateChanged = new Promise<void>((resolve) => {
        let sawReconciling = false;
        const handler = (state: string) => {
          if (state === "reconciling") {
            sawReconciling = true;
          }
          if (state === "idle" && sawReconciling) {
            events.off("state-change", handler);
            resolve();
          }
        };
        events.on("state-change", handler);
      });

      // Delete file externally
      rmSync(testFile);

      // Wait for sync
      await Promise.race([
        stateChanged,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 5000),
        ),
      ]);

      // Verify removed from database
      fileNode = getNodeByPath(testFile);
      expect(fileNode).toBeNull();
    });
  });

  describe.serial("Race Conditions", () => {
    test("rapid external edits are coalesced", async () => {
      // Create initial file
      const testFile = join(VAULT_DIR, "rapid.md");
      writeFileSync(testFile, "# Rapid\n\n- [ ] Task\n");

      await syncManager.syncFromFs();

      // Start watching and wait for ready
      syncManager.start();
      await new Promise<void>((resolve) => {
        syncManager.once("ready", resolve);
      });

      // Count state changes
      let idleCount = 0;
      events.on("state-change", (state) => {
        if (state === "idle") idleCount++;
      });

      // Make many rapid edits
      for (let i = 0; i < 5; i++) {
        writeFileSync(testFile, `# Rapid\n\n- [ ] Task ${i}\n`);
        await Bun.sleep(20); // Small delay between writes
      }

      // Wait for sync to finish (needs to account for chokidar's awaitWriteFinish)
      await Bun.sleep(1000); // Longer than debounce + stabilityThreshold

      // Should have coalesced into few syncs (not 5)
      // Due to 100ms debounce, we expect 1-2 syncs max
      expect(idleCount).toBeLessThanOrEqual(2);

      // Final content should be the last edit
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();
      expect(task!.content).toContain("Task 4");
    });

    // Fixed: The reconcile-before-write fix ensures FS changes are synced to DB
    // before regenerating the file for a DB→FS write. This prevents data loss.
    test("TUI edit during filesystem sync doesn't cause data loss", async () => {
      // Create initial file
      const testFile = join(VAULT_DIR, "conflict.md");
      writeFileSync(testFile, "# Conflict\n\n- [ ] Task A\n");

      await syncManager.syncFromFs();

      // Start watching and wait for ready
      syncManager.start();
      await new Promise<void>((resolve) => {
        syncManager.once("ready", resolve);
      });

      // Get task node
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();

      // Simulate concurrent operations:
      // 1. External edit adds new task
      // 2. TUI edit updates existing task

      // Start external edit
      writeFileSync(testFile, "# Conflict\n\n- [ ] Task A\n- [ ] Task B\n");

      // Immediately do TUI edit on original task
      updateNode(task!.id, { task_status: "done" });

      // Wait for everything to settle (needs to account for chokidar's awaitWriteFinish)
      await Bun.sleep(1000);

      // Verify both changes are present
      // Note: The exact behavior depends on conflict resolution strategy
      // With last_write_wins, the TUI edit should persist
      const finalNodes = getAllNodes();
      const tasks = finalNodes.filter((n) => n.type === "task");

      // Should have 2 tasks
      expect(tasks.length).toBe(2);

      // At least one should be done (from TUI edit)
      const doneTasks = tasks.filter((t) => t.task_status === "done");
      expect(doneTasks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
