/**
 * Worker Thread Integration Test
 *
 * This is the ONLY test file using describe.sequential for watcher tests - it tests
 * the actual worker thread watcher which can't use AsyncLocalStorage context.
 *
 * All other watcher tests use useWorker: false for parallel execution.
 *
 * NOTE: This test cannot use withTestEnv because worker thread messages trigger
 * handlers outside the AsyncLocalStorage context. Instead, we use file-based
 * database storage so the SyncManager's internal runWithKmDir calls can access
 * the same database during async operations.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { EventEmitter } from "events"
import { SyncManager } from "../../src/watch/sync.ts"
import { getAllNodes, createRepo } from "../../src/index.ts"
import { runGenerator } from "@km/core"
import type { Repo } from "../../src/repo.ts"

const TEST_DIR = "/tmp/kmtest-worker-thread"
const REPO_DIR = join(TEST_DIR, "repo")

describe.sequential("Worker Thread Integration", () => {
  let repo: Repo | undefined

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
  })

  afterEach(() => {
    repo?.[Symbol.dispose]()
    repo = undefined
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  test("worker watcher receives file change events", async () => {
    const events = new EventEmitter()

    // Create initial file
    writeFileSync(join(REPO_DIR, "test.md"), "# Test\n\n- [ ] Task\n")

    // Create repo which owns the database
    // This creates .km/state.db on disk for the worker thread to share
    repo = runGenerator(createRepo(REPO_DIR, { loadFiles: false }))
    const db = repo.database

    // Create SyncManager with the repo's database
    // SyncManager handles its own runWithKmDir internally for async operations
    await using syncManager = new SyncManager({
      db,
      repoPath: REPO_DIR,
      debounceFs: 100,
      debounceApply: 50,
      conflictStrategy: "last_write_wins",
      // useWorker defaults to true - uses real worker thread
    })

    syncManager.on("state-change", (state) => {
      events.emit("state-change", state)
    })

    // Initial sync (internally wraps with runWithKmDir)
    await syncManager.syncFromFs()

    // Start watching and wait for ready
    syncManager.start()
    await new Promise<void>((resolve) => {
      syncManager.once("ready", resolve)
    })

    // Wait for full sync cycle: reconciling → idle
    const stateChanged = new Promise<void>((resolve) => {
      let sawReconciling = false
      const handler = (state: string) => {
        if (state === "reconciling") {
          sawReconciling = true
        }
        if (state === "idle" && sawReconciling) {
          events.off("state-change", handler)
          resolve()
        }
      }
      events.on("state-change", handler)
    })

    // Make an external edit
    writeFileSync(join(REPO_DIR, "test.md"), "# Test\n\n- [x] Task\n")

    // Wait for worker to detect and sync (with timeout)
    await Promise.race([
      stateChanged,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for sync")), 5000)),
    ])

    // Verify the change was synced
    const nodes = getAllNodes(db)
    const task = nodes.find((n) => n.type === "task")
    expect(task).toBeDefined()
    expect(task!.task_status).toBe("done")
  })
})
