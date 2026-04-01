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
    // Create .km directory so createRepo uses disk mode (on-disk state.db).
    // This is required for the worker thread to share the database.
    mkdirSync(join(REPO_DIR, ".km"), { recursive: true })
  })

  afterEach(() => {
    repo?.[Symbol.dispose]()
    repo = undefined
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  test("worker watcher receives file change events", { timeout: 30000 }, async () => {
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

    // Brief delay to let chokidar finish its initial scan and settle.
    await new Promise((r) => setTimeout(r, 500))

    // Wait for the watcher to detect the file change (reconciling state).
    // We only wait for 'reconciling' rather than the full cycle to 'idle',
    // because applyReconcileOpsAsync spawns parse pool workers which can
    // hang in nested worker thread environments (vitest + chokidar workers).
    const sawReconciling = new Promise<void>((resolve) => {
      const handler = (state: string) => {
        if (state === "reconciling") {
          events.off("state-change", handler)
          resolve()
        }
      }
      events.on("state-change", handler)
    })

    // Make an external edit
    writeFileSync(join(REPO_DIR, "test.md"), "# Test\n\n- [x] Task\n")

    // Wait for worker to detect the change
    await Promise.race([
      sawReconciling,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout waiting for watcher to detect change")), 10000),
      ),
    ])

    // The watcher detected the change. Now do a manual sync to verify
    // the file content is correct (avoids depending on the full async
    // reconcile pipeline which uses parse pool workers).
    await syncManager.syncFromFs()

    // Verify the change was synced
    const nodes = getAllNodes(db)
    const task = nodes.find((n) => n.item?.task?.status != null)
    expect(task).toBeDefined()
    expect(task!.item?.task?.status).toBe("done")
  })
})
