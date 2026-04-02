/**
 * DB → File Chaos Tests
 *
 * Tests that changes made in the database (via updateNode, emit, etc.)
 * properly propagate back to the filesystem under various conditions.
 */

import { describe, test, expect } from "vitest"
import { writeFileSync, readFileSync } from "fs"
import { join } from "path"

import { getAllNodes, withTestEnv } from "@km/storage"
import { createTestSync, setupSync } from "../../watch/sync-test-helpers.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("DB → File Sync Tests", () => {
  describe("Task Status Updates", () => {
    test("marking task as done updates file", () =>
      withTestEnv(async ({ repoDir, db, data, emitter }) => {
        const syncManager = createTestSync(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSync(stack, syncManager, emitter)

        // Create test file
        const testFile = join(repoDir, "tasks.md")
        writeFileSync(testFile, "# Tasks\n\n- [ ] Test task\n")

        // Initial sync
        await syncManager.syncFromFs()

        // Find the task
        const allNodes = getAllNodes(db)
        const task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()
        expect(task!.item?.task?.status).toBe("todo")

        // Update task status
        data.updateNode(task!.id, { item: { task: { status: "done", marker: "[ ]" } } })

        // Wait for write queue to flush
        await Bun.sleep(200)

        // Verify file was updated
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("[x]")
        expect(content).not.toContain("[ ]")
      }))

    test("marking task as todo updates file", () =>
      withTestEnv(async ({ repoDir, db, data, emitter }) => {
        const syncManager = createTestSync(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSync(stack, syncManager, emitter)

        // Create test file with completed task
        const testFile = join(repoDir, "tasks.md")
        writeFileSync(testFile, "# Tasks\n\n- [x] Completed task\n")

        // Initial sync
        await syncManager.syncFromFs()

        // Find the task
        const allNodes = getAllNodes(db)
        const task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()
        expect(task!.item?.task?.status).toBe("done")

        // Update task status back to todo
        data.updateNode(task!.id, { item: { task: { status: "todo", marker: "[ ]" } } })

        // Wait for write queue to flush
        await Bun.sleep(200)

        // Verify file was updated
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("[ ]")
        expect(content).not.toContain("[x]")
      }))
  })

  describe("Task Content Updates", () => {
    test("editing task content updates file", () =>
      withTestEnv(async ({ repoDir, db, data, emitter }) => {
        const syncManager = createTestSync(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSync(stack, syncManager, emitter)

        // Create test file
        const testFile = join(repoDir, "tasks.md")
        writeFileSync(testFile, "# Tasks\n\n- [ ] Original text\n")

        // Initial sync
        await syncManager.syncFromFs()

        // Find the task
        const allNodes = getAllNodes(db)
        const task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()

        // Update task content
        data.updateNode(task!.id, { content: "Updated text" })

        // Wait for write queue to flush
        await Bun.sleep(200)

        // Verify file was updated
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("Updated text")
        expect(content).not.toContain("Original text")
      }))
  })

  describe("Multiple Rapid Updates", () => {
    test("rapid updates coalesce correctly", () =>
      withTestEnv(async ({ repoDir, db, data, emitter }) => {
        const syncManager = createTestSync(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSync(stack, syncManager, emitter)

        // Create test file
        const testFile = join(repoDir, "tasks.md")
        writeFileSync(testFile, "# Tasks\n\n- [ ] Task to update\n")

        // Initial sync
        await syncManager.syncFromFs()

        // Find the task
        const allNodes = getAllNodes(db)
        const task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()

        // Make 5 rapid updates
        for (let i = 1; i <= 5; i++) {
          data.updateNode(task!.id, { content: `Update ${i}` })
        }

        // Wait for write queue to flush
        await Bun.sleep(300)

        // Verify final state
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("Update 5")
        expect(content).not.toContain("Update 1")
      }))

    test("alternating status updates result in final state", () =>
      withTestEnv(async ({ repoDir, db, data, emitter }) => {
        const syncManager = createTestSync(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSync(stack, syncManager, emitter)

        // Create test file
        const testFile = join(repoDir, "tasks.md")
        writeFileSync(testFile, "# Tasks\n\n- [ ] Toggle task\n")

        // Initial sync
        await syncManager.syncFromFs()

        // Find the task
        const allNodes = getAllNodes(db)
        const task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()

        // Toggle status rapidly
        data.updateNode(task!.id, { item: { task: { status: "done", marker: "[ ]" } } })
        data.updateNode(task!.id, { item: { task: { status: "todo", marker: "[ ]" } } })
        data.updateNode(task!.id, { item: { task: { status: "done", marker: "[ ]" } } })
        data.updateNode(task!.id, { item: { task: { status: "todo", marker: "[ ]" } } })
        data.updateNode(task!.id, { item: { task: { status: "done", marker: "[ ]" } } }) // Final: done

        // Wait for write queue to flush
        await Bun.sleep(300)

        // Verify final state
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("[x]")
      }))
  })

  describe("Multiple Files", () => {
    test("updates to different files are independent", () =>
      withTestEnv(async ({ repoDir, db, data, emitter }) => {
        const syncManager = createTestSync(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSync(stack, syncManager, emitter)

        // Create test files
        const file1 = join(repoDir, "file1.md")
        const file2 = join(repoDir, "file2.md")
        writeFileSync(file1, "# File 1\n\n- [ ] Task 1\n")
        writeFileSync(file2, "# File 2\n\n- [ ] Task 2\n")

        // Initial sync
        await syncManager.syncFromFs()

        // Find tasks
        const allNodes = getAllNodes(db)
        const tasks = allNodes.filter((n) => n.item?.task?.status != null)
        expect(tasks.length).toBe(2)

        const task1 = tasks.find((t) => t.content === "Task 1")
        const task2 = tasks.find((t) => t.content === "Task 2")
        expect(task1).toBeDefined()
        expect(task2).toBeDefined()

        // Update both tasks
        data.updateNode(task1!.id, { item: { task: { status: "done", marker: "[ ]" } } })
        data.updateNode(task2!.id, { content: "Modified Task 2" })

        // Wait for write queue to flush
        await Bun.sleep(300)

        // Verify both files updated correctly
        const content1 = readFileSync(file1, "utf-8")
        const content2 = readFileSync(file2, "utf-8")

        expect(content1).toContain("[x]")
        expect(content1).toContain("Task 1")
        expect(content2).toContain("[ ]")
        expect(content2).toContain("Modified Task 2")
      }))
  })

  describe("Error Handling", () => {
    test("update to non-existent node is handled gracefully", () =>
      withTestEnv(async ({ repoDir, db, data, emitter }) => {
        const syncManager = createTestSync(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSync(stack, syncManager, emitter)

        // Create test file
        const testFile = join(repoDir, "tasks.md")
        writeFileSync(testFile, "# Tasks\n\n- [ ] Task\n")

        // Initial sync
        await syncManager.syncFromFs()

        // Try to update a non-existent node
        expect(() => {
          data.updateNode("non-existent-id", { item: { task: { status: "done", marker: "[ ]" } } })
        }).not.toThrow()

        // File should be unchanged
        await Bun.sleep(200)
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("[ ]")
      }))
  })

  describe("Data Preservation", () => {
    test("non-task content is preserved during task update", () =>
      withTestEnv(async ({ repoDir, db, data, emitter }) => {
        const syncManager = createTestSync(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSync(stack, syncManager, emitter)

        // Create test file with mixed content
        const testFile = join(repoDir, "mixed.md")
        writeFileSync(
          testFile,
          `# Project

Some important notes here.

## Tasks

- [ ] Task to update

## References

More content that should be preserved.
`,
        )

        // Initial sync
        await syncManager.syncFromFs()

        // Find the task
        const allNodes = getAllNodes(db)
        const task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()

        // Update task
        data.updateNode(task!.id, { item: { task: { status: "done", marker: "[ ]" } } })

        // Wait for write queue to flush
        await Bun.sleep(200)

        // Verify all content preserved
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("Some important notes here")
        expect(content).toContain("More content that should be preserved")
        expect(content).toContain("[x]") // Task updated
      }))
  })
})
