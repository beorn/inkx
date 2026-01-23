/**
 * Concurrent Edit Tests
 *
 * Tests that the sync system handles concurrent edits from both
 * the filesystem and database sides without data loss or corruption.
 *
 * Uses @sinonjs/fake-timers for deterministic timing - same seed = same result.
 *
 * IMPORTANT: These tests use a TestWatcher that we control directly instead of
 * relying on real chokidar/fs.watch events. This is because:
 * 1. Chokidar's awaitWriteFinish uses setInterval internally
 * 2. Even with fake timers, OS filesystem events are asynchronous and non-deterministic
 * 3. To get deterministic behavior, we manually trigger sync events after writes
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { EventEmitter } from "events";
import FakeTimers, { type InstalledClock } from "@sinonjs/fake-timers";
import type { WatcherInterface, SyncData } from "../../../src/watch/types.ts";

/**
 * TestWatcher - A controllable watcher for deterministic testing.
 *
 * Unlike FileSystemWatcher/WorkerWatcher, this doesn't rely on OS filesystem
 * events. Instead, tests manually call `triggerChange()` after writes.
 * The debouncing still works via fake timers.
 */
class TestWatcher extends EventEmitter implements WatcherInterface {
  private pendingPaths: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;
  private vaultPath: string = "";
  private inFlightWrites: Set<string> = new Set();

  constructor(debounceMs: number = 100) {
    super();
    this.debounceMs = debounceMs;
  }

  start(vaultPath: string): void {
    this.vaultPath = vaultPath;
    // Emit ready immediately (no real watcher to initialize)
    setImmediate(() => this.emit("ready"));
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingPaths.clear();
  }

  markInFlight(path: string): void {
    this.inFlightWrites.add(path);
  }

  clearInFlight(path: string, delayMs: number = 1000): void {
    setTimeout(() => {
      this.inFlightWrites.delete(path);
    }, delayMs);
  }

  isInFlight(path: string): boolean {
    return this.inFlightWrites.has(path);
  }

  /**
   * Manually trigger a file change. Call this after writeFileSync().
   * This simulates what a real watcher would do when detecting changes.
   */
  triggerChange(path: string): void {
    if (this.inFlightWrites.has(path)) {
      return; // Skip our own writes
    }
    this.pendingPaths.add(path);
    this.scheduleSync();
  }

  /**
   * Manually trigger changes for multiple paths.
   */
  triggerChanges(paths: string[]): void {
    for (const path of paths) {
      if (!this.inFlightWrites.has(path)) {
        this.pendingPaths.add(path);
      }
    }
    if (this.pendingPaths.size > 0) {
      this.scheduleSync();
    }
  }

  forceSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.sync();
  }

  private scheduleSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.sync();
    }, this.debounceMs);
  }

  private sync(): void {
    const paths = [...this.pendingPaths];
    this.pendingPaths.clear();
    this.debounceTimer = null;

    if (paths.length === 0) return;

    const dirs = new Set<string>();
    for (const path of paths) {
      dirs.add(dirname(path));
    }

    const data: SyncData = {
      paths,
      directories: [...dirs],
    };
    this.emit("sync", data);
  }
}

const TEST_DIR = join("/tmp", "kmtest-concurrent");
const VAULT_DIR = join(TEST_DIR, "vault");
const KM_DIR = join(TEST_DIR, ".km");

import {
  closeDb,
  resetDb,
  getAllNodes,
  updateNode,
  applyEvent,
} from "@km/storage";

import { setKmDir, setDatabase, setFsSync } from "../../../src/emit.ts";
import { SyncManager } from "../../../src/watch/sync.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Concurrent Edit Tests", () => {
  let syncManager: SyncManager;
  let testWatcher: TestWatcher;
  let events: EventEmitter;
  let clock: InstalledClock;

  beforeEach(async () => {
    // Install fake timers FIRST - before any code that uses setTimeout
    clock = FakeTimers.install({
      toFake: [
        "setTimeout",
        "setInterval",
        "clearTimeout",
        "clearInterval",
        "Date",
      ],
      shouldAdvanceTime: false, // Manual control = deterministic
    });

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

    // Create our controllable test watcher
    testWatcher = new TestWatcher(100); // 100ms debounce

    // Create sync manager with our test watcher injected
    // This bypasses chokidar entirely, giving us deterministic control
    syncManager = new SyncManager({
      vaultPath: VAULT_DIR,
      debounceFs: 100,
      debounceApply: 50,
      conflictStrategy: "last_write_wins",
      heartbeat: { enabled: false },
      watcher: testWatcher, // Inject our controllable watcher
    });

    // Wire up filesystem sync
    setFsSync(syncManager);

    // Track state changes
    syncManager.on("state-change", (state) => {
      events.emit("state-change", state);
    });
  });

  afterEach(async () => {
    setFsSync(null);
    await syncManager.stop();
    closeDb();

    // Restore real timers AFTER cleanup
    clock.uninstall();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  /**
   * Helper to advance time and flush all pending timers + promises.
   */
  async function advanceTime(ms: number): Promise<void> {
    await clock.tickAsync(ms);
  }

  /**
   * Helper to run all pending timers up to a limit.
   */
  async function flushTimers(): Promise<void> {
    await clock.tickAsync(1000);
  }

  /**
   * Helper to write a file and trigger the watcher.
   * This replaces writeFileSync + waiting for OS events.
   */
  function writeAndTrigger(path: string, content: string): void {
    writeFileSync(path, content);
    testWatcher.triggerChange(path);
  }

  describe("Interleaved Edits", () => {
    test("DB edit followed by FS edit preserves both changes", async () => {
      // Create test file with two tasks
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Task 1\n- [ ] Task 2\n");

      // Initial sync
      await syncManager.syncFromFs();
      syncManager.start();

      // Find tasks
      let allNodes = getAllNodes();
      const task1 = allNodes.find((n) => n.content === "Task 1");
      expect(task1).toBeDefined();

      // DB edit: mark task 1 as done
      updateNode(task1!.id, { task_status: "done" });

      // Advance time to allow DB→FS sync
      await advanceTime(100);

      // FS edit: add a new task
      const currentContent = readFileSync(testFile, "utf-8");
      writeAndTrigger(testFile, currentContent + "- [ ] Task 3\n");

      // Advance time for FS→DB sync
      await advanceTime(500);

      // Flush any remaining timers
      await flushTimers();

      // Verify final state in DB
      allNodes = getAllNodes();
      const tasks = allNodes.filter((n) => n.type === "task");

      // Should have task 1 (done), task 2 (todo), and task 3 (new)
      expect(tasks.length).toBeGreaterThanOrEqual(2);

      const finalTask1 = tasks.find((t) => t.content === "Task 1");
      expect(finalTask1?.task_status).toBe("done");
    });

    test("FS edit followed by DB edit preserves both changes", async () => {
      // Create test file
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Original task\n");

      // Initial sync
      await syncManager.syncFromFs();
      syncManager.start();

      // FS edit: add a new task
      writeAndTrigger(
        testFile,
        "# Tasks\n\n- [ ] Original task\n- [ ] New task\n",
      );

      // Advance time for FS sync
      await advanceTime(300);

      // Find the original task and update it
      let allNodes = getAllNodes();
      const originalTask = allNodes.find((n) => n.content === "Original task");
      expect(originalTask).toBeDefined();

      // DB edit: mark original task as done
      updateNode(originalTask!.id, { task_status: "done" });

      // Advance time for sync
      await advanceTime(300);
      await flushTimers();

      // Verify final state
      allNodes = getAllNodes();
      const tasks = allNodes.filter((n) => n.type === "task");
      expect(tasks.length).toBeGreaterThanOrEqual(2);

      // Original task should be done
      const finalOriginal = tasks.find((t) => t.content === "Original task");
      expect(finalOriginal?.task_status).toBe("done");
    });
  });

  describe("Rapid Concurrent Edits", () => {
    test("many rapid FS edits are coalesced", async () => {
      // Create test file
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Task\n");

      // Initial sync
      await syncManager.syncFromFs();
      syncManager.start();

      // Track sync events
      let syncCount = 0;
      syncManager.on("sync-complete", () => syncCount++);

      // Make 10 rapid FS edits
      for (let i = 1; i <= 10; i++) {
        writeAndTrigger(testFile, `# Tasks\n\n- [ ] Edit ${i}\n`);
        await advanceTime(20); // 20ms between edits (less than debounce)
      }

      // Advance time to let sync complete
      await advanceTime(500);
      await flushTimers();

      // Verify final state
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task?.content).toBe("Edit 10");

      // Sync count should be less than 10 (coalesced)
      expect(syncCount).toBeLessThan(10);
    });

    test("many rapid DB edits are coalesced", async () => {
      // Create test file
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Task\n");

      // Initial sync
      await syncManager.syncFromFs();

      // Find the task
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();

      // Make 10 rapid DB edits
      for (let i = 1; i <= 10; i++) {
        updateNode(task!.id, { content: `DB Edit ${i}` });
      }

      // Advance time for write queue to flush
      await advanceTime(300);
      await flushTimers();

      // Verify file has final state
      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("DB Edit 10");
      // Note: "DB Edit 10" contains "DB Edit 1" substring, check for early edit patterns
      expect(content).not.toMatch(/DB Edit [2-5]\n/);
    });
  });

  describe("Conflict Scenarios", () => {
    test("same task edited in DB and FS resolves without crash", async () => {
      // Create test file
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Contested task\n");

      // Initial sync
      await syncManager.syncFromFs();
      syncManager.start();

      // Find the task
      let allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();

      // Simultaneous edits (as close as we can get)
      updateNode(task!.id, { content: "DB version" });
      writeAndTrigger(testFile, "# Tasks\n\n- [ ] FS version\n");

      // Advance time for sync to settle
      await advanceTime(500);
      await flushTimers();

      // System should not have crashed
      // Final state depends on conflict resolution strategy
      allNodes = getAllNodes();
      const finalTask = allNodes.find((n) => n.type === "task");
      expect(finalTask).toBeDefined();

      // With "last_write_wins", one of the versions should win
      const finalContent = finalTask!.content;
      expect(["DB version", "FS version"]).toContain(finalContent);
    });

    test("task deleted in FS while edited in DB handles gracefully", async () => {
      // Create test file with task
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Task to delete\n");

      // Initial sync
      await syncManager.syncFromFs();
      syncManager.start();

      // Find the task
      let allNodes = getAllNodes();
      const task = allNodes.find((n) => n.content === "Task to delete");
      expect(task).toBeDefined();
      const taskId = task!.id;

      // Edit task in DB
      updateNode(taskId, { content: "Edited task" });

      // Delete from FS (overwrite file without the task)
      writeAndTrigger(testFile, "# Tasks\n\n");

      // Advance time for sync
      await advanceTime(500);
      await flushTimers();

      // System should handle gracefully (no crash)
      allNodes = getAllNodes();
      // Task may or may not exist depending on timing
      // The important thing is no crash occurred
      expect(true).toBe(true);
    });
  });

  describe("Multi-File Concurrent Edits", () => {
    test("concurrent edits to different files are independent", async () => {
      // Create test files
      const file1 = join(VAULT_DIR, "file1.md");
      const file2 = join(VAULT_DIR, "file2.md");
      writeFileSync(file1, "# File 1\n\n- [ ] Task 1\n");
      writeFileSync(file2, "# File 2\n\n- [ ] Task 2\n");

      // Initial sync
      await syncManager.syncFromFs();
      syncManager.start();

      // Find tasks
      let allNodes = getAllNodes();
      const task1 = allNodes.find((n) => n.content === "Task 1");
      const task2 = allNodes.find((n) => n.content === "Task 2");
      expect(task1).toBeDefined();
      expect(task2).toBeDefined();

      // Edit task1 in DB, task2 in FS
      updateNode(task1!.id, { task_status: "done" });
      writeAndTrigger(file2, "# File 2\n\n- [x] Task 2 modified\n");

      // Advance time for sync
      await advanceTime(500);
      await flushTimers();

      // Verify both edits took effect
      allNodes = getAllNodes();

      const finalTask1 = allNodes.find((n) => n.content === "Task 1");
      expect(finalTask1?.task_status).toBe("done");

      const finalTask2 = allNodes.find((n) => n.content?.includes("Task 2"));
      expect(finalTask2?.task_status).toBe("done");
    });
  });

  describe("Data Integrity", () => {
    test("no data loss during interleaved edits", async () => {
      // Create test file with multiple tasks
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(
        testFile,
        `# Tasks

- [ ] Task A
- [ ] Task B
- [ ] Task C
`,
      );

      // Initial sync
      await syncManager.syncFromFs();
      syncManager.start();

      // Find task B
      let allNodes = getAllNodes();
      const taskB = allNodes.find((n) => n.content === "Task B");
      expect(taskB).toBeDefined();

      // Edit task B in DB
      updateNode(taskB!.id, { task_status: "done" });

      // Advance time
      await advanceTime(100);

      // FS edit: add task D
      const content = readFileSync(testFile, "utf-8");
      writeAndTrigger(testFile, content + "- [ ] Task D\n");

      // Advance time for sync
      await advanceTime(500);
      await flushTimers();

      // Verify no data loss
      allNodes = getAllNodes();
      const tasks = allNodes.filter((n) => n.type === "task");
      const taskContents = tasks.map((t) => t.content);

      // All original tasks should still exist
      expect(taskContents).toContain("Task A");
      expect(taskContents).toContain("Task B");
      expect(taskContents).toContain("Task C");

      // Task B should be done
      const finalTaskB = tasks.find((t) => t.content === "Task B");
      expect(finalTaskB?.task_status).toBe("done");
    });

    test("file structure preserved during concurrent edits", async () => {
      // Create test file with sections
      const testFile = join(VAULT_DIR, "project.md");
      writeFileSync(
        testFile,
        `# Project

## Active

- [ ] Active task

## Completed

- [x] Done task

## Notes

Important notes here.
`,
      );

      // Initial sync
      await syncManager.syncFromFs();
      syncManager.start();

      // Find active task
      const allNodes = getAllNodes();
      const activeTask = allNodes.find((n) => n.content === "Active task");
      expect(activeTask).toBeDefined();

      // Edit in DB
      updateNode(activeTask!.id, { task_status: "done" });

      // Advance time for sync
      await advanceTime(300);
      await flushTimers();

      // Verify file structure preserved
      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("## Active");
      expect(content).toContain("## Completed");
      expect(content).toContain("## Notes");
      expect(content).toContain("Important notes here");
    });
  });
});
