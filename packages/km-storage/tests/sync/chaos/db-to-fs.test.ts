/**
 * DB → File Chaos Tests
 *
 * Tests that changes made in the database (via updateNode, emit, etc.)
 * properly propagate back to the filesystem under various conditions.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

const TEST_DIR = join("/tmp", "kmtest-db-to-fs");
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

describe("DB → File Sync Tests", () => {
  let syncManager: SyncManager;

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

    // Create sync manager with short debounce for testing
    syncManager = new SyncManager({
      vaultPath: VAULT_DIR,
      debounceFs: 100,
      debounceApply: 50,
      conflictStrategy: "last_write_wins",
    });

    // Wire up filesystem sync
    setFsSync(syncManager);
  });

  afterEach(async () => {
    setFsSync(null);
    await syncManager.stop();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("Task Status Updates", () => {
    test("marking task as done updates file", async () => {
      // Create test file
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Test task\n");

      // Initial sync
      await syncManager.syncFromFs();

      // Find the task
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();
      expect(task!.task_status).toBe("todo");

      // Update task status
      updateNode(task!.id, { task_status: "done" });

      // Wait for write queue to flush
      await new Promise((r) => setTimeout(r, 200));

      // Verify file was updated
      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("[x]");
      expect(content).not.toContain("[ ]");
    });

    test("marking task as todo updates file", async () => {
      // Create test file with completed task
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [x] Completed task\n");

      // Initial sync
      await syncManager.syncFromFs();

      // Find the task
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();
      expect(task!.task_status).toBe("done");

      // Update task status back to todo
      updateNode(task!.id, { task_status: "todo" });

      // Wait for write queue to flush
      await new Promise((r) => setTimeout(r, 200));

      // Verify file was updated
      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("[ ]");
      expect(content).not.toContain("[x]");
    });
  });

  describe("Task Content Updates", () => {
    test("editing task content updates file", async () => {
      // Create test file
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Original text\n");

      // Initial sync
      await syncManager.syncFromFs();

      // Find the task
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();

      // Update task content
      updateNode(task!.id, { content: "Updated text" });

      // Wait for write queue to flush
      await new Promise((r) => setTimeout(r, 200));

      // Verify file was updated
      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("Updated text");
      expect(content).not.toContain("Original text");
    });
  });

  describe("Multiple Rapid Updates", () => {
    test("rapid updates coalesce correctly", async () => {
      // Create test file
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Task to update\n");

      // Initial sync
      await syncManager.syncFromFs();

      // Find the task
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();

      // Make 5 rapid updates
      for (let i = 1; i <= 5; i++) {
        updateNode(task!.id, { content: `Update ${i}` });
      }

      // Wait for write queue to flush
      await new Promise((r) => setTimeout(r, 300));

      // Verify final state
      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("Update 5");
      expect(content).not.toContain("Update 1");
    });

    test("alternating status updates result in final state", async () => {
      // Create test file
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Toggle task\n");

      // Initial sync
      await syncManager.syncFromFs();

      // Find the task
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();

      // Toggle status rapidly
      updateNode(task!.id, { task_status: "done" });
      updateNode(task!.id, { task_status: "todo" });
      updateNode(task!.id, { task_status: "done" });
      updateNode(task!.id, { task_status: "todo" });
      updateNode(task!.id, { task_status: "done" }); // Final: done

      // Wait for write queue to flush
      await new Promise((r) => setTimeout(r, 300));

      // Verify final state
      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("[x]");
    });
  });

  describe("Multiple Files", () => {
    test("updates to different files are independent", async () => {
      // Create test files
      const file1 = join(VAULT_DIR, "file1.md");
      const file2 = join(VAULT_DIR, "file2.md");
      writeFileSync(file1, "# File 1\n\n- [ ] Task 1\n");
      writeFileSync(file2, "# File 2\n\n- [ ] Task 2\n");

      // Initial sync
      await syncManager.syncFromFs();

      // Find tasks
      const allNodes = getAllNodes();
      const tasks = allNodes.filter((n) => n.type === "task");
      expect(tasks.length).toBe(2);

      const task1 = tasks.find((t) => t.content === "Task 1");
      const task2 = tasks.find((t) => t.content === "Task 2");
      expect(task1).toBeDefined();
      expect(task2).toBeDefined();

      // Update both tasks
      updateNode(task1!.id, { task_status: "done" });
      updateNode(task2!.id, { content: "Modified Task 2" });

      // Wait for write queue to flush
      await new Promise((r) => setTimeout(r, 300));

      // Verify both files updated correctly
      const content1 = readFileSync(file1, "utf-8");
      const content2 = readFileSync(file2, "utf-8");

      expect(content1).toContain("[x]");
      expect(content1).toContain("Task 1");
      expect(content2).toContain("[ ]");
      expect(content2).toContain("Modified Task 2");
    });
  });

  describe("Error Handling", () => {
    test("update to non-existent node is handled gracefully", async () => {
      // Create test file
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(testFile, "# Tasks\n\n- [ ] Task\n");

      // Initial sync
      await syncManager.syncFromFs();

      // Try to update a non-existent node
      expect(() => {
        updateNode("non-existent-id", { task_status: "done" });
      }).not.toThrow();

      // File should be unchanged
      await new Promise((r) => setTimeout(r, 200));
      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("[ ]");
    });
  });

  describe("Data Preservation", () => {
    test("non-task content is preserved during task update", async () => {
      // Create test file with mixed content
      const testFile = join(VAULT_DIR, "mixed.md");
      writeFileSync(
        testFile,
        `# Project

Some important notes here.

## Tasks

- [ ] Task to update

## References

More content that should be preserved.
`,
      );

      // Initial sync
      await syncManager.syncFromFs();

      // Find the task
      const allNodes = getAllNodes();
      const task = allNodes.find((n) => n.type === "task");
      expect(task).toBeDefined();

      // Update task
      updateNode(task!.id, { task_status: "done" });

      // Wait for write queue to flush
      await new Promise((r) => setTimeout(r, 200));

      // Verify all content preserved
      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("Some important notes here");
      expect(content).toContain("More content that should be preserved");
      expect(content).toContain("[x]"); // Task updated
    });
  });
});
