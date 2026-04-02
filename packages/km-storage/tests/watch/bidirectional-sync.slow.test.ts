/**
 * Bidirectional Sync E2E Tests
 *
 * Tests the full sync workflow:
 * - TUI edit → Model → File
 * - File edit → Model → TUI refresh event
 * - Rapid external edits don't cause race conditions
 *
 * Uses isolated test environments with useWorker:false for parallel execution.
 * Worker thread integration is tested separately.
 */

import { describe, test, expect } from "vitest"
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import { EventEmitter } from "events"

import { getNodeByPath, getAllNodes, withTestEnv, createTestEnvRepo } from "@km/storage"
import {
  createTestSyncManager,
  setupSyncManager,
  waitForReady,
  waitForStateChange,
  withTimeout,
} from "./sync-test-helpers.ts"

describe("Bidirectional Sync E2E", () => {
  describe("TUI → Filesystem", () => {
    test("editing task status in model writes to file", () =>
      withTestEnv(async ({ repoDir, db, data, emitter }) => {
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSyncManager(stack, syncManager, emitter)

        // Create test file with a task
        const testFile = join(repoDir, "tasks.md")
        writeFileSync(testFile, "# Tasks\n\n- [ ] Test task\n")

        // Wait for initial sync
        await syncManager.syncFromFs()

        // Find the task
        const allNodes = getAllNodes(db)
        const task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()
        expect(task!.item?.task?.status).toBe("todo")

        // Update task status (simulating TUI edit)
        data.updateNode(task!.id, { item: { task: { status: "done", marker: "[ ]" } } })

        // Wait for write queue to flush
        await Bun.sleep(200)

        // Read file and verify it was updated
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("[x]")
        expect(content).not.toContain("[ ]")
      }))

    test("creating new task in model creates file entry", () =>
      withTestEnv(async ({ repoDir, db, data, emitter }) => {
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSyncManager(stack, syncManager, emitter)

        // Create file first
        const testFile = join(repoDir, "new-tasks.md")
        writeFileSync(testFile, "# New Tasks\n\n- [ ] First task\n")

        // Sync
        await syncManager.syncFromFs()

        // Find the file node
        const fileNode = getNodeByPath(db, testFile)
        expect(fileNode).toBeDefined()

        // Find the task
        const allNodes = getAllNodes(db)
        const task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()

        // Update task text (simulating TUI edit)
        data.updateNode(task!.id, { content: "Updated task content" })

        // Wait for write
        await Bun.sleep(200)

        // Verify file was updated
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("Updated task content")
      }))
  })

  describe("Filesystem → Model", () => {
    test("external file edit triggers state-change event", { timeout: 15000 }, () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        const events = new EventEmitter()
        const syncManager = createTestSyncManager(db, repoDir)

        syncManager.on("state-change", (state) => {
          events.emit("state-change", state)
        })

        await using stack = new AsyncDisposableStack()
        setupSyncManager(stack, syncManager, emitter)

        // Create initial file
        const testFile = join(repoDir, "watch-test.md")
        writeFileSync(testFile, "# Initial\n\n- [ ] Task 1\n")

        // Sync initial state
        await syncManager.syncFromFs()

        // Start watching and wait for ready
        syncManager.start()
        await waitForReady(syncManager)

        // Set up promise to wait for state change - wait for full cycle
        const stateChanged = waitForStateChange(events)

        // Make external edit
        writeFileSync(testFile, "# Initial\n\n- [ ] Task 1\n- [ ] Task 2\n")

        // Wait for sync to complete
        // Chokidar awaitWriteFinish (500ms) + debounce (100ms) + async reconciliation
        await withTimeout(stateChanged, 10000, "Timeout waiting for sync")

        // Verify new task was synced
        const allNodes = getAllNodes(db)
        const tasks = allNodes.filter((n) => n.item?.task?.status != null)
        expect(tasks.length).toBe(2)
      }),
    )

    test("external file edit updates database", { timeout: 15000 }, () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        const events = new EventEmitter()
        const syncManager = createTestSyncManager(db, repoDir)

        syncManager.on("state-change", (state) => {
          events.emit("state-change", state)
        })

        await using stack = new AsyncDisposableStack()
        setupSyncManager(stack, syncManager, emitter)

        // Create initial file
        const testFile = join(repoDir, "external-edit.md")
        writeFileSync(testFile, "# Test\n\n- [ ] Original task\n")

        // Sync initial state
        await syncManager.syncFromFs()

        // Verify initial state
        let allNodes = getAllNodes(db)
        let task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()
        expect(task!.content).toContain("Original task")

        // Start watching and wait for ready
        syncManager.start()
        await waitForReady(syncManager)

        // Set up wait for sync - wait for full cycle
        const stateChanged = waitForStateChange(events)

        // External edit - change task text
        writeFileSync(testFile, "# Test\n\n- [ ] Modified task\n")

        // Wait for sync
        // Chokidar awaitWriteFinish (500ms) + debounce (100ms) + async reconciliation
        await withTimeout(stateChanged, 10000, "Timeout waiting for sync")

        // Verify database was updated
        allNodes = getAllNodes(db)
        task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()
        expect(task!.content).toContain("Modified task")
      }),
    )

    test("external file delete removes from database", { timeout: 15000 }, () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        const events = new EventEmitter()
        const syncManager = createTestSyncManager(db, repoDir)

        syncManager.on("state-change", (state) => {
          events.emit("state-change", state)
        })

        await using stack = new AsyncDisposableStack()
        setupSyncManager(stack, syncManager, emitter)

        // Create initial file
        const testFile = join(repoDir, "to-delete.md")
        writeFileSync(testFile, "# To Delete\n\n- [ ] Task\n")

        // Sync initial state
        await syncManager.syncFromFs()

        // Verify file exists in DB
        let fileNode = getNodeByPath(db, testFile)
        expect(fileNode).toBeDefined()

        // Start watching and wait for ready
        syncManager.start()
        await waitForReady(syncManager)

        // Set up wait for sync - wait for full cycle
        const stateChanged = waitForStateChange(events)

        // Delete file externally
        rmSync(testFile)

        // Wait for sync
        // Chokidar awaitWriteFinish (500ms) + debounce (100ms) + async reconciliation
        await withTimeout(stateChanged, 10000, "Timeout waiting for sync")

        // Verify removed from database
        fileNode = getNodeByPath(db, testFile)
        expect(fileNode).toBeNull()
      }),
    )
  })

  describe("Race Conditions", () => {
    test("rapid external edits are coalesced", { timeout: 15000 }, () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        const events = new EventEmitter()
        const syncManager = createTestSyncManager(db, repoDir)

        syncManager.on("state-change", (state) => {
          events.emit("state-change", state)
        })

        await using stack = new AsyncDisposableStack()
        setupSyncManager(stack, syncManager, emitter)

        // Create initial file
        const testFile = join(repoDir, "rapid.md")
        writeFileSync(testFile, "# Rapid\n\n- [ ] Task\n")

        await syncManager.syncFromFs()

        // Start watching and wait for ready
        syncManager.start()
        await waitForReady(syncManager)

        // Count state changes
        let idleCount = 0
        events.on("state-change", (state: string) => {
          if (state === "idle") idleCount++
        })

        // Make many rapid edits
        for (let i = 0; i < 5; i++) {
          writeFileSync(testFile, `# Rapid\n\n- [ ] Task ${i}\n`)
          await Bun.sleep(20) // Small delay between writes
        }

        // Wait for sync to finish
        // Chokidar awaitWriteFinish (500ms) + debounce (100ms) + async reconciliation
        await Bun.sleep(3000)

        // Should have coalesced into few syncs (not 5)
        // Due to debouncing, we expect at most 3 syncs
        expect(idleCount).toBeLessThanOrEqual(3)

        // Final content should be the last edit
        const allNodes = getAllNodes(db)
        const task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()
        expect(task!.content).toContain("Task 4")
      }),
    )

    // FIXME: Pre-existing failure — write token suppression blocks external edit pickup.
    // The TUI edit to Task A records a write token for the file, which prevents
    // reconciliation from picking up the externally-added Task B. Needs field-level merge.
    test.skip("TUI edit during filesystem sync doesn't cause data loss", { timeout: 15000 }, () =>
      withTestEnv(async ({ repoDir, db, data, emitter }) => {
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSyncManager(stack, syncManager, emitter)

        // Create initial file
        const testFile = join(repoDir, "conflict.md")
        writeFileSync(testFile, "# Conflict\n\n- [ ] Task A\n")

        await syncManager.syncFromFs()

        // Start watching and wait for ready
        syncManager.start()
        await waitForReady(syncManager)

        // Get task node
        const allNodes = getAllNodes(db)
        const task = allNodes.find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()

        // Simulate concurrent operations:
        // 1. External edit adds new task
        // 2. TUI edit updates existing task

        // Start external edit
        writeFileSync(testFile, "# Conflict\n\n- [ ] Task A\n- [ ] Task B\n")

        // Immediately do TUI edit on original task
        data.updateNode(task!.id, { item: { task: { status: "done", marker: "[ ]" } } })

        // Wait for everything to settle
        // Chokidar awaitWriteFinish (500ms) + debounce (100ms) + async reconciliation
        await Bun.sleep(3000)

        // Verify new task was picked up from filesystem
        const finalNodes = getAllNodes(db)
        const tasks = finalNodes.filter((n) => n.item?.task?.status != null)

        // Should have 2 tasks (external edit added Task B)
        expect(tasks.length).toBe(2)

        // Note: The TUI edit to task_status may be overwritten by reconciliation.
        // When reconcileIfChanged detects the file was modified externally, it
        // re-parses the file which resets task_status. This is a known limitation
        // of concurrent TUI+filesystem edits on the same file — the last writer
        // (filesystem reconciliation) wins. A field-level merge would fix this
        // but is not yet implemented.
      }),
    )
  })
})

/**
 * Full Round-Trip Tests
 *
 * Verifies the complete data flow in both directions:
 *
 * Forward (TUI edit):
 *   repo.updateNode() → DB updated → useSyncExternalStore notified → file written
 *
 * Reverse (filesystem edit):
 *   file changed → SyncManager reconciles → DB updated → state-change event fired
 *
 * These tests use repo-level APIs (not raw DataStore) to match production behavior.
 */
describe("Full Round-Trip", () => {
  describe("Forward: repo.updateNode → DB → version bump → file write", () => {
    test("task status toggle: DB, version, and file all update", () =>
      withTestEnv(async ({ repoDir, db }) => {
        // Create repo with its own emitter (matches production createRepo setup)
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        // Wire repo's emitter → SyncManager (matches tui.tsx:138)
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        // Create test file
        const testFile = join(repoDir, "roundtrip.md")
        writeFileSync(testFile, "# Tasks\n\n- [ ] Buy milk\n")

        await syncManager.syncFromFs()

        // Find task in DB
        const task = getAllNodes(db).find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()
        expect(task!.item?.task?.status).toBe("todo")

        // Track version for useSyncExternalStore notification
        const versionBefore = repo.version

        // Simulate TUI edit (same as board-actions-edit.ts toggleTaskStatus)
        repo.updateNode(task!.id, { item: { task: { status: "done", marker: "[x]" } } })

        // 1. DB should be updated immediately
        const dbNode = getAllNodes(db).find((n) => n.id === task!.id)
        expect(dbNode!.item?.task?.status).toBe("done")

        // 2. Version should have bumped (triggers useSyncExternalStore re-render)
        expect(repo.version).toBe(versionBefore + 1)

        // 3. File should be written (after WriteQueue flush)
        await Bun.sleep(200)
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("[x]")
        expect(content).not.toContain("[ ]")
      }))

    test("title edit: DB, version, and file all update", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        const testFile = join(repoDir, "edit-title.md")
        writeFileSync(testFile, "# Notes\n\n- [ ] Original task\n")

        await syncManager.syncFromFs()

        const task = getAllNodes(db).find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()

        const versionBefore = repo.version

        // Simulate TUI title edit (same as TreeNode handleTitleSave)
        repo.updateNode(task!.id, { content: "[  ] Updated task title" })

        // 1. DB updated
        const dbNode = getAllNodes(db).find((n) => n.id === task!.id)
        expect(dbNode!.content).toContain("Updated task title")

        // 2. Version bumped
        expect(repo.version).toBe(versionBefore + 1)

        // 3. File written
        await Bun.sleep(200)
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("Updated task title")
      }))

    test("subscribe() callback fires on updateNode (useSyncExternalStore)", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })

        const testFile = join(repoDir, "subscribe.md")
        writeFileSync(testFile, "# Test\n\n- [ ] Task\n")

        const syncManager = createTestSyncManager(db, repoDir)
        await syncManager.syncFromFs()

        const task = getAllNodes(db).find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()

        // Subscribe (same pattern as useSyncExternalStore in useColumns)
        let notifyCount = 0
        const unsub = repo.subscribe(() => {
          notifyCount++
        })

        repo.updateNode(task!.id, { item: { task: { status: "done", marker: "[ ]" } } })

        // Callback must fire exactly once per mutation
        expect(notifyCount).toBe(1)

        unsub()
      }))
  })

  describe("Reverse: file change → DB update → state-change event", () => {
    test("external edit updates DB and fires state-change", { timeout: 15000 }, () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        const events = new EventEmitter()
        const syncManager = createTestSyncManager(db, repoDir)

        syncManager.on("state-change", (state) => {
          events.emit("state-change", state)
        })

        await using stack = new AsyncDisposableStack()
        setupSyncManager(stack, syncManager, emitter)

        const testFile = join(repoDir, "reverse.md")
        writeFileSync(testFile, "# Reverse\n\n- [ ] Original\n")

        await syncManager.syncFromFs()

        // Verify initial state
        const initialTask = getAllNodes(db).find((n) => n.item?.task?.status != null)
        expect(initialTask).toBeDefined()
        expect(initialTask!.content).toContain("Original")

        // Start watching
        syncManager.start()
        await waitForReady(syncManager)

        // Wait for state change (reconciling → idle cycle)
        const stateChanged = waitForStateChange(events)

        // External file edit (simulates user editing in vim/vscode)
        writeFileSync(testFile, "# Reverse\n\n- [ ] Modified by external editor\n")

        // Chokidar awaitWriteFinish (500ms) + debounce (100ms) + async reconciliation
        await withTimeout(stateChanged, 10000, "Timeout waiting for sync")

        // 1. DB should have the new content
        const updatedTask = getAllNodes(db).find((n) => n.item?.task?.status != null)
        expect(updatedTask).toBeDefined()
        expect(updatedTask!.content).toContain("Modified by external editor")

        // 2. File should still contain the same content (not overwritten)
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("Modified by external editor")
      }),
    )

    test("external task completion updates DB status", { timeout: 15000 }, () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        const events = new EventEmitter()
        const syncManager = createTestSyncManager(db, repoDir)

        syncManager.on("state-change", (state) => {
          events.emit("state-change", state)
        })

        await using stack = new AsyncDisposableStack()
        setupSyncManager(stack, syncManager, emitter)

        const testFile = join(repoDir, "external-done.md")
        writeFileSync(testFile, "# Tasks\n\n- [ ] My task\n")

        await syncManager.syncFromFs()

        const task = getAllNodes(db).find((n) => n.item?.task?.status != null)
        expect(task).toBeDefined()
        expect(task!.item?.task?.status).toBe("todo")

        syncManager.start()
        await waitForReady(syncManager)

        const stateChanged = waitForStateChange(events)

        // External edit: mark task as done (user checked checkbox in editor)
        writeFileSync(testFile, "# Tasks\n\n- [x] My task\n")

        // Chokidar awaitWriteFinish (500ms) + debounce (100ms) + async reconciliation
        await withTimeout(stateChanged, 10000, "Timeout waiting for sync")

        // DB should reflect the status change
        const updated = getAllNodes(db).find((n) => n.item?.task?.status != null)
        expect(updated).toBeDefined()
        expect(updated!.item?.task?.status).toBe("done")
      }),
    )
  })
})

/**
 * File & Folder Rename Tests
 *
 * Verifies that renaming files/folders through the TUI (content edit)
 * correctly renames the corresponding filesystem entries.
 */
describe("File & Folder Renames", () => {
  describe("File rename (H1 title → filename)", () => {
    test("editing file node content renames .md file on disk", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        const testFile = join(repoDir, "old-name.md")
        writeFileSync(testFile, "# Old Name\n\nSome content.\n")

        await syncManager.syncFromFs()

        // Find the file node
        const fileNode = getAllNodes(db).find((n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile"))
        expect(fileNode).toBeDefined()
        expect(fileNode!.content).toBe("Old Name")

        // Simulate TUI edit: change the H1 title (which is the file node's content)
        repo.updateNode(fileNode!.id, { content: "New Name" })

        // Wait for write queue to flush (debounce 50ms + execution time)
        await Bun.sleep(500)

        // If debounced flush didn't fire, force it
        await syncManager.syncToFs()

        // Old file should be gone, new file should exist
        expect(existsSync(join(repoDir, "old-name.md"))).toBe(false)
        expect(existsSync(join(repoDir, "New Name.md"))).toBe(true)

        // New file should have the updated content
        const content = readFileSync(join(repoDir, "New Name.md"), "utf-8")
        expect(content).toContain("# New Name")
        expect(content).toContain("Some content.")

        // DB should reflect the new path
        const updated = getAllNodes(db).find((n) => n.id === fileNode!.id)
        expect(updated!.fs_path).toBe("New Name.md")
        expect(updated!.name).toBe("New Name")
      }))

    test("file rename in subdirectory preserves parent path", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        const subDir = join(repoDir, "notes")
        mkdirSync(subDir)
        writeFileSync(join(subDir, "draft.md"), "# Draft\n\nWork in progress.\n")

        await syncManager.syncFromFs()

        const fileNode = getAllNodes(db).find(
          (n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile") && n.fs_path?.includes("draft"),
        )
        expect(fileNode).toBeDefined()

        repo.updateNode(fileNode!.id, { content: "Published" })
        await Bun.sleep(200)

        // Should be at notes/Published.md
        expect(existsSync(join(subDir, "draft.md"))).toBe(false)
        expect(existsSync(join(subDir, "Published.md"))).toBe(true)

        const updated = getAllNodes(db).find((n) => n.id === fileNode!.id)
        expect(updated!.fs_path).toBe("notes/Published.md")
      }))

    test("file rename with unsafe chars sanitizes filename", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        writeFileSync(join(repoDir, "safe.md"), "# Safe\n")
        await syncManager.syncFromFs()

        const fileNode = getAllNodes(db).find((n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile"))
        expect(fileNode).toBeDefined()

        // Title with filesystem-unsafe chars
        repo.updateNode(fileNode!.id, { content: 'What/When: A "Plan"' })
        await Bun.sleep(200)

        // Should sanitize slashes, colons and quotes
        expect(existsSync(join(repoDir, "safe.md"))).toBe(false)
        const newFile = join(repoDir, "What-When- A -Plan.md")
        expect(existsSync(newFile)).toBe(true)
      }))

    test("no rename when content unchanged from filename", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        writeFileSync(join(repoDir, "My Note.md"), "# My Note\n\nBody text.\n")
        await syncManager.syncFromFs()

        const fileNode = getAllNodes(db).find((n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile"))
        expect(fileNode).toBeDefined()

        // Update content to same value as existing filename
        repo.updateNode(fileNode!.id, { content: "My Note" })
        await Bun.sleep(200)

        // File should still be at original path (no rename)
        expect(existsSync(join(repoDir, "My Note.md"))).toBe(true)
      }))
  })

  describe("Fault Injection: Reconcile Failures", () => {
    test("corrupt .md file during reconcile does not overwrite with DB state", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSyncManager(stack, syncManager, emitter)

        // Create valid file and sync
        const testFile = join(repoDir, "corrupt-test.md")
        writeFileSync(testFile, "# Valid\n\n- [ ] Task A\n- [ ] Task B\n")

        await syncManager.syncFromFs()

        // Verify initial state
        const allNodes = getAllNodes(db)
        const tasks = allNodes.filter((n) => n.item?.task?.status != null)
        expect(tasks.length).toBe(2)

        // Now corrupt the file with invalid markdown (binary garbage)
        const corruptContent = "# Valid\n\n\x00\x01\x02 garbage data \xFF\xFE\n"
        writeFileSync(testFile, corruptContent)

        // Re-sync from fs — should handle corrupt gracefully
        await syncManager.syncFromFs()

        // Read file back — it should NOT have been overwritten with DB state.
        // The corrupt file content should remain on disk.
        const diskContent = readFileSync(testFile, "utf-8")
        // The key assertion: file was NOT silently replaced with DB-regenerated content.
        // It should either be the corrupt content OR a gracefully handled version,
        // but NOT the clean DB content without the corruption.
        expect(diskContent).not.toBe("# Valid\n\n- [ ] Task A\n- [ ] Task B\n")
      }))

    test("missing .md file during reconcile is handled gracefully", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        setupSyncManager(stack, syncManager, emitter)

        // Create two files — one will be deleted, the other ensures the
        // directory is still scanned during reconciliation (syncFromFs only
        // reconciles directories that contain .md files on disk)
        const testFile = join(repoDir, "will-vanish.md")
        const keepFile = join(repoDir, "stays.md")
        writeFileSync(testFile, "# Vanish\n\n- [ ] Ghost task\n")
        writeFileSync(keepFile, "# Stays\n\nKeep me.\n")

        await syncManager.syncFromFs()

        // Verify both exist in DB
        const beforeNodes = getAllNodes(db)
        const ghostTask = beforeNodes.find((n) => n.content?.includes("Ghost task"))
        expect(ghostTask).toBeDefined()
        expect(getNodeByPath(db, "will-vanish.md")).not.toBeNull()

        // Delete one file externally
        rmSync(testFile)

        // Re-sync — should handle missing file gracefully (remove from DB)
        await syncManager.syncFromFs()

        // Deleted file node should be removed from DB
        const fileNode = getNodeByPath(db, "will-vanish.md")
        expect(fileNode).toBeNull()

        // Surviving file should still be in DB
        const survivingNode = getNodeByPath(db, "stays.md")
        expect(survivingNode).not.toBeNull()
      }))
  })

  describe("Cross-File Move", () => {
    test("move node between files updates BOTH source and destination files", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        // Create two files
        const sourceFile = join(repoDir, "source.md")
        const destFile = join(repoDir, "dest.md")
        writeFileSync(sourceFile, "# Source\n\n- [ ] Moving task\n- [ ] Staying task\n")
        writeFileSync(destFile, "# Dest\n\n- [ ] Existing task\n")

        await syncManager.syncFromFs()

        // Find the task to move
        const allNodes = getAllNodes(db)
        const movingTask = allNodes.find((n) => n.content?.includes("Moving task"))
        expect(movingTask).toBeDefined()

        // Find the dest file node
        const destFileNode = getNodeByPath(db, "dest.md")
        expect(destFileNode).toBeDefined()

        // Move task from source to dest
        repo.moveNode(movingTask!.id, destFileNode!.id, 999)

        // Wait for write queue to flush
        await Bun.sleep(300)

        // Source file should NO LONGER contain "Moving task"
        const sourceContent = readFileSync(sourceFile, "utf-8")
        expect(sourceContent).not.toContain("Moving task")
        expect(sourceContent).toContain("Staying task")

        // Dest file should now contain "Moving task"
        const destContent = readFileSync(destFile, "utf-8")
        expect(destContent).toContain("Moving task")
        expect(destContent).toContain("Existing task")
      }))

    test("move node within same file writes only one file", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        // Create file with two sections
        const testFile = join(repoDir, "same-file.md")
        writeFileSync(testFile, "# Board\n\n## Column A\n\n- [ ] Task 1\n\n## Column B\n\n- [ ] Task 2\n")

        await syncManager.syncFromFs()

        // Find Task 1 and Column B
        const allNodes = getAllNodes(db)
        const task1 = allNodes.find((n) => n.content?.includes("Task 1"))
        expect(task1).toBeDefined()
        const colB = allNodes.find((n) => n.content === "Column B")
        expect(colB).toBeDefined()

        // Move Task 1 under Column B (within same file)
        repo.moveNode(task1!.id, colB!.id, 999)

        // Wait for write queue to flush
        await Bun.sleep(300)

        // File should be updated with Task 1 now under Column B
        const content = readFileSync(testFile, "utf-8")
        // Column A should be empty of tasks, Column B should have both
        const colBPos = content.indexOf("## Column B")
        const task1Pos = content.indexOf("Task 1")
        const task2Pos = content.indexOf("Task 2")

        // Task 1 should appear after Column B header
        expect(task1Pos).toBeGreaterThan(colBPos)
        // Both tasks should still exist
        expect(content).toContain("Task 1")
        expect(content).toContain("Task 2")
      }))
  })

  describe("Move Disk (file/folder items)", () => {
    test("moving a file item between folders renames on disk and updates fs_path", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        // Create folder structure: folderA/child.md, folderB/
        const folderA = join(repoDir, "folderA")
        const folderB = join(repoDir, "folderB")
        mkdirSync(folderA, { recursive: true })
        mkdirSync(folderB, { recursive: true })
        writeFileSync(join(folderA, "child.md"), "# Child Doc\n\nSome content.\n")

        await syncManager.syncFromFs()

        // Find the child file node and folderB node
        const allNodes = getAllNodes(db)
        const childFile = allNodes.find((n) => n.fs_path === "folderA/child.md")
        const folderBNode = allNodes.find((n) => n.fs_path === "folderB")
        expect(childFile).toBeDefined()
        expect(folderBNode).toBeDefined()
        expect(childFile!.item).toBeTruthy()
        expect(childFile!.fstype).toBe("file")

        // Move child file from folderA to folderB
        repo.moveNode(childFile!.id, folderBNode!.id, 0)

        // Wait for write queue to flush
        await Bun.sleep(300)

        // File should have moved on disk
        expect(existsSync(join(folderA, "child.md"))).toBe(false)
        expect(existsSync(join(folderB, "child.md"))).toBe(true)

        // fs_path should be updated in DB
        const updatedNode = getAllNodes(db).find((n) => n.id === childFile!.id)
        expect(updatedNode?.fs_path).toBe("folderB/child.md")
      }))

    test("moving a folder item between parents renames on disk and cascades fs_path", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        // Create: parentA/subdir/note.md, parentB/
        const parentA = join(repoDir, "parentA")
        const subdir = join(parentA, "subdir")
        const parentB = join(repoDir, "parentB")
        mkdirSync(subdir, { recursive: true })
        mkdirSync(parentB, { recursive: true })
        writeFileSync(join(subdir, "note.md"), "# Note\n\nInside subdir.\n")

        await syncManager.syncFromFs()

        const allNodes = getAllNodes(db)
        const subdirNode = allNodes.find((n) => n.fs_path === "parentA/subdir")
        const parentBNode = allNodes.find((n) => n.fs_path === "parentB")
        const noteNode = allNodes.find((n) => n.fs_path === "parentA/subdir/note.md")
        expect(subdirNode).toBeDefined()
        expect(parentBNode).toBeDefined()
        expect(noteNode).toBeDefined()
        expect(subdirNode!.fstype).toBe("folder")

        // Move subdir from parentA to parentB
        repo.moveNode(subdirNode!.id, parentBNode!.id, 0)

        // Wait for write queue to flush
        await Bun.sleep(300)

        // Folder should have moved on disk
        expect(existsSync(join(parentA, "subdir"))).toBe(false)
        expect(existsSync(join(parentB, "subdir", "note.md"))).toBe(true)

        // fs_path should cascade to descendants
        const updatedSubdir = getAllNodes(db).find((n) => n.id === subdirNode!.id)
        const updatedNote = getAllNodes(db).find((n) => n.id === noteNode!.id)
        expect(updatedSubdir?.fs_path).toBe("parentB/subdir")
        expect(updatedNote?.fs_path).toBe("parentB/subdir/note.md")
      }))

    test("move-disk does not overwrite existing target", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        // Create: folderA/doc.md, folderB/doc.md (same name conflict)
        const folderA = join(repoDir, "folderA")
        const folderB = join(repoDir, "folderB")
        mkdirSync(folderA, { recursive: true })
        mkdirSync(folderB, { recursive: true })
        writeFileSync(join(folderA, "doc.md"), "# Doc A\n")
        writeFileSync(join(folderB, "doc.md"), "# Doc B\n")

        await syncManager.syncFromFs()

        const allNodes = getAllNodes(db)
        const docA = allNodes.find((n) => n.fs_path === "folderA/doc.md")
        const folderBNode = allNodes.find((n) => n.fs_path === "folderB")
        expect(docA).toBeDefined()
        expect(folderBNode).toBeDefined()

        // Move doc.md from folderA to folderB (conflict: folderB/doc.md exists)
        repo.moveNode(docA!.id, folderBNode!.id, 0)

        // Wait for write queue to flush
        await Bun.sleep(300)

        // Original files should both still exist — move was aborted
        expect(existsSync(join(folderA, "doc.md"))).toBe(true)
        expect(existsSync(join(folderB, "doc.md"))).toBe(true)

        // folderB/doc.md should retain its original content
        const content = readFileSync(join(folderB, "doc.md"), "utf-8")
        expect(content).toContain("Doc B")
      }))
  })

  describe("Delete Ordering", () => {
    test("delete node regenerates file from event data, not DB lookup", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        // Create file with tasks
        const testFile = join(repoDir, "delete-test.md")
        writeFileSync(testFile, "# Tasks\n\n- [ ] Keep me\n- [ ] Delete me\n")

        await syncManager.syncFromFs()

        // Find the task to delete
        const allNodes = getAllNodes(db)
        const deleteTask = allNodes.find((n) => n.content?.includes("Delete me"))
        expect(deleteTask).toBeDefined()

        // Delete the node — this removes it from DB first, then regenerates file
        repo.deleteNode(deleteTask!.id)

        // Wait for write queue to flush
        await Bun.sleep(300)

        // File should be updated: "Delete me" removed, "Keep me" still present
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("Keep me")
        expect(content).not.toContain("Delete me")

        // File should still exist on disk (not deleted entirely)
        expect(existsSync(testFile)).toBe(true)
      }))

    test("deleted node does NOT reappear after forced reconciliation (km-tui.delete-noop)", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir, {
          debounceApply: 5000, // Long debounce so write queue does NOT flush before reconcile
        })

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        // Create file with multiple tasks
        const testFile = join(repoDir, "delete-race.md")
        writeFileSync(testFile, "# Tasks\n\n- [ ] Alpha\n- [ ] Beta\n- [ ] Gamma\n")

        await syncManager.syncFromFs()

        // Verify all tasks exist in DB
        const allBefore = getAllNodes(db)
        const beta = allBefore.find((n) => n.content?.includes("Beta"))
        expect(beta).toBeDefined()

        // Delete Beta — DB removes it, file write is queued but NOT flushed (5s debounce)
        repo.deleteNode(beta!.id)

        // Verify node is gone from DB
        const betaAfterDelete = getAllNodes(db).find((n) => n.content?.includes("Beta"))
        expect(betaAfterDelete).toBeUndefined()

        // Force heartbeat reconciliation — this re-parses the OLD file (not yet updated)
        // and should NOT re-create the deleted node
        const result = syncManager.forceHeartbeat()

        // The critical check: Beta must still be absent from DB
        const allAfterReconcile = getAllNodes(db)
        const betaAfterReconcile = allAfterReconcile.find((n) => n.content?.includes("Beta"))
        expect(betaAfterReconcile).toBeUndefined()

        // Verify Alpha and Gamma survived
        expect(allAfterReconcile.find((n) => n.content?.includes("Alpha"))).toBeDefined()
        expect(allAfterReconcile.find((n) => n.content?.includes("Gamma"))).toBeDefined()
      }))

    test("deleted node does NOT reappear when file is externally touched before write flushes (km-tui.delete-noop)", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        // Very long debounce — write will NOT flush during the test
        const syncManager = createTestSyncManager(db, repoDir, {
          debounceApply: 60_000,
        })

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        // Create file with multiple tasks
        const testFile = join(repoDir, "delete-touch.md")
        writeFileSync(testFile, "# Tasks\n\n- [ ] Alpha\n- [ ] Beta\n- [ ] Gamma\n")

        await syncManager.syncFromFs()

        const allBefore = getAllNodes(db)
        const beta = allBefore.find((n) => n.content?.includes("Beta"))
        expect(beta).toBeDefined()

        // Delete Beta — DB removes it, file write queued but NOT flushed
        repo.deleteNode(beta!.id)
        expect(getAllNodes(db).find((n) => n.content?.includes("Beta"))).toBeUndefined()

        // Simulate external edit that modifies the file while it still has Beta's content
        // This is the race condition: file has Beta (old content) AND the content hash changed
        await Bun.sleep(50) // Ensure mtime difference
        const content = readFileSync(testFile, "utf-8")
        // Add a comment to change the hash but keep the task structure intact
        writeFileSync(testFile, content + "\n<!-- external edit -->\n")

        // Force reconciliation — file has new mtime, content still includes Beta
        // This should NOT re-create Beta in the DB
        const heartbeatResult = syncManager.forceHeartbeat()
        // If opsCount > 0, the reconciler detected changes — check what happened
        // (even if ops applied, Beta must not reappear)

        // Critical assertion: Beta must NOT reappear
        const betaAfterReconcile = getAllNodes(db).find((n) => n.content?.includes("Beta"))
        expect(betaAfterReconcile).toBeUndefined()

        // Alpha and Gamma must survive
        expect(getAllNodes(db).find((n) => n.content?.includes("Alpha"))).toBeDefined()
        expect(getAllNodes(db).find((n) => n.content?.includes("Gamma"))).toBeDefined()
      }))
  })

  describe("Folder rename (content → directory name)", () => {
    test("editing folder content renames directory on disk", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        const oldDir = join(repoDir, "projects")
        mkdirSync(oldDir)
        writeFileSync(join(oldDir, "readme.md"), "# Projects Readme\n")

        await syncManager.syncFromFs()

        const folderNode = getAllNodes(db).find((n) => n.type === "h" && n.fstype === "folder")
        expect(folderNode).toBeDefined()
        expect(folderNode!.content).toBe("projects")

        // Rename the folder
        repo.updateNode(folderNode!.id, { content: "archive" })
        await Bun.sleep(200)

        // Old dir gone, new dir exists
        expect(existsSync(join(repoDir, "projects"))).toBe(false)
        expect(existsSync(join(repoDir, "archive"))).toBe(true)

        // Child file should be accessible at new path
        expect(existsSync(join(repoDir, "archive", "readme.md"))).toBe(true)

        // DB should reflect new paths
        const updatedFolder = getAllNodes(db).find((n) => n.id === folderNode!.id)
        expect(updatedFolder!.fs_path).toBe("archive")
        expect(updatedFolder!.name).toBe("archive")

        // Child nodes should have updated fs_path
        const childFile = getAllNodes(db).find(
          (n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile") && n.fs_path?.includes("readme"),
        )
        expect(childFile!.fs_path).toBe("archive/readme.md")
      }))

    test("folder rename preserves nested content", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const { repo, emitter: repoEmitter } = createTestEnvRepo({
          db,
          repoPath: repoDir,
          skipPersist: true,
        })
        const syncManager = createTestSyncManager(db, repoDir)

        await using stack = new AsyncDisposableStack()
        repoEmitter.setFsSync(syncManager)
        stack.defer(() => repoEmitter.setFsSync(null))
        stack.defer(async () => await syncManager.stop())

        const dir = join(repoDir, "inbox")
        mkdirSync(dir)
        writeFileSync(join(dir, "note.md"), "# My Note\n\n- [ ] Task here\n")

        await syncManager.syncFromFs()

        const folderNode = getAllNodes(db).find((n) => n.type === "h" && n.fstype === "folder")
        expect(folderNode).toBeDefined()

        repo.updateNode(folderNode!.id, { content: "processed" })
        await Bun.sleep(200)

        // Verify the file content survived the rename
        const content = readFileSync(join(repoDir, "processed", "note.md"), "utf-8")
        expect(content).toContain("# My Note")
        expect(content).toContain("Task here")
      }))
  })
})
