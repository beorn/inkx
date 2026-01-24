/**
 * DB → File Chaos Tests
 *
 * Tests that changes made in the database (via updateNode, emit, etc.)
 * properly propagate back to the filesystem under various conditions.
 */

import { describe, test, expect } from "bun:test";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

import { getAllNodes, updateNode, applyEvent } from "@km/storage";

import { setDatabase, setFsSync } from "../../../src/emit.ts";
import { SyncManager } from "../../../src/watch/sync.ts";
import { withTestEnv } from "../../test-utils.ts";

/** Helper to set up sync manager with automatic cleanup via AsyncDisposableStack */
function setupSyncManager(
  stack: AsyncDisposableStack,
  syncManager: SyncManager,
): void {
  setFsSync(syncManager);
  stack.defer(() => setFsSync(null));
  stack.defer(async () => await syncManager.stop());
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("DB → File Sync Tests", () => {
  describe("Task Status Updates", () => {
    test("marking task as done updates file", () =>
      withTestEnv(async ({ vaultDir }) => {
        setDatabase({ applyEvent });

        const syncManager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 100,
          debounceApply: 50,
          conflictStrategy: "last_write_wins",
          useWorker: false,
        });

        await using stack = new AsyncDisposableStack();
        setupSyncManager(stack, syncManager);

        // Create test file
        const testFile = join(vaultDir, "tasks.md");
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
      }));

    test("marking task as todo updates file", () =>
      withTestEnv(async ({ vaultDir }) => {
        setDatabase({ applyEvent });

        const syncManager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 100,
          debounceApply: 50,
          conflictStrategy: "last_write_wins",
          useWorker: false,
        });

        await using stack = new AsyncDisposableStack();
        setupSyncManager(stack, syncManager);

        // Create test file with completed task
        const testFile = join(vaultDir, "tasks.md");
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
      }));
  });

  describe("Task Content Updates", () => {
    test("editing task content updates file", () =>
      withTestEnv(async ({ vaultDir }) => {
        setDatabase({ applyEvent });

        const syncManager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 100,
          debounceApply: 50,
          conflictStrategy: "last_write_wins",
          useWorker: false,
        });

        await using stack = new AsyncDisposableStack();
        setupSyncManager(stack, syncManager);

        // Create test file
        const testFile = join(vaultDir, "tasks.md");
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
      }));
  });

  describe("Multiple Rapid Updates", () => {
    test("rapid updates coalesce correctly", () =>
      withTestEnv(async ({ vaultDir }) => {
        setDatabase({ applyEvent });

        const syncManager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 100,
          debounceApply: 50,
          conflictStrategy: "last_write_wins",
          useWorker: false,
        });

        await using stack = new AsyncDisposableStack();
        setupSyncManager(stack, syncManager);

        // Create test file
        const testFile = join(vaultDir, "tasks.md");
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
      }));

    test("alternating status updates result in final state", () =>
      withTestEnv(async ({ vaultDir }) => {
        setDatabase({ applyEvent });

        const syncManager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 100,
          debounceApply: 50,
          conflictStrategy: "last_write_wins",
          useWorker: false,
        });

        await using stack = new AsyncDisposableStack();
        setupSyncManager(stack, syncManager);

        // Create test file
        const testFile = join(vaultDir, "tasks.md");
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
      }));
  });

  describe("Multiple Files", () => {
    test("updates to different files are independent", () =>
      withTestEnv(async ({ vaultDir }) => {
        setDatabase({ applyEvent });

        const syncManager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 100,
          debounceApply: 50,
          conflictStrategy: "last_write_wins",
          useWorker: false,
        });

        await using stack = new AsyncDisposableStack();
        setupSyncManager(stack, syncManager);

        // Create test files
        const file1 = join(vaultDir, "file1.md");
        const file2 = join(vaultDir, "file2.md");
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
      }));
  });

  describe("Error Handling", () => {
    test("update to non-existent node is handled gracefully", () =>
      withTestEnv(async ({ vaultDir }) => {
        setDatabase({ applyEvent });

        const syncManager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 100,
          debounceApply: 50,
          conflictStrategy: "last_write_wins",
          useWorker: false,
        });

        await using stack = new AsyncDisposableStack();
        setupSyncManager(stack, syncManager);

        // Create test file
        const testFile = join(vaultDir, "tasks.md");
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
      }));
  });

  describe("Data Preservation", () => {
    test("non-task content is preserved during task update", () =>
      withTestEnv(async ({ vaultDir }) => {
        setDatabase({ applyEvent });

        const syncManager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 100,
          debounceApply: 50,
          conflictStrategy: "last_write_wins",
          useWorker: false,
        });

        await using stack = new AsyncDisposableStack();
        setupSyncManager(stack, syncManager);

        // Create test file with mixed content
        const testFile = join(vaultDir, "mixed.md");
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
      }));
  });
});
