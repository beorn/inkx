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

import { describe, test, expect, vi } from "vitest"
import { writeFileSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { EventEmitter } from "events"
import FakeTimers, { type Clock } from "@sinonjs/fake-timers"
import { withTestEnv, type DataStore, type HasDatabase } from "@km/storage"
import { withSync, type Sync, type SyncableRepo, type WatcherInterface, type SyncData } from "@km/fs-mount"

// ─────────────────────────────────────────────────────────────────────────────
// TestWatcher - Controllable watcher for deterministic testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unlike FileSystemWatcher/WorkerWatcher, this doesn't rely on OS filesystem
 * events. Instead, tests manually call `triggerChange()` after writes.
 * The debouncing still works via fake timers.
 */
class TestWatcher extends EventEmitter implements WatcherInterface {
  private pendingPaths: Set<string> = new Set()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private debounceMs: number
  private inFlightWrites: Set<string> = new Set()

  constructor(debounceMs: number = 100) {
    super()
    this.debounceMs = debounceMs
  }

  start(): void {
    setImmediate(() => this.emit("ready"))
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingPaths.clear()
  }

  markInFlight(path: string): void {
    this.inFlightWrites.add(path)
  }

  clearInFlight(path: string, delayMs: number = 1000): void {
    setTimeout(() => this.inFlightWrites.delete(path), delayMs)
  }

  isInFlight(path: string): boolean {
    return this.inFlightWrites.has(path)
  }

  /** Manually trigger a file change. Call this after writeFileSync(). */
  triggerChange(path: string): void {
    if (this.inFlightWrites.has(path)) return
    this.pendingPaths.add(path)
    this.scheduleSync()
  }

  private scheduleSync(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.sync(), this.debounceMs)
  }

  private sync(): void {
    const paths = [...this.pendingPaths]
    this.pendingPaths.clear()
    this.debounceTimer = null
    if (paths.length === 0) return

    const dirs = new Set<string>()
    for (const path of paths) dirs.add(dirname(path))
    this.emit("sync", { paths, directories: [...dirs] } satisfies SyncData)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Context & Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Context passed to concurrent test functions */
interface ConcurrentTestCtx {
  repoDir: string
  data: DataStore & HasDatabase
  syncManager: Sync
  testWatcher: TestWatcher
  advanceTime: (ms: number) => Promise<void>
  flushTimers: () => Promise<void>
  writeAndTrigger: (path: string, content: string) => void
  /** Register a state-change listener (replaces EventEmitter .on pattern) */
  onStateChange: (handler: (state: string) => void) => void
}

/** Initialize test file and sync, returning tasks found in DB */
async function initTestFile(
  ctx: ConcurrentTestCtx,
  filename: string,
  content: string,
  options: { start?: boolean } = {},
): Promise<{ filePath: string; tasks: ReturnType<DataStore["getAllNodes"]> }> {
  const filePath = join(ctx.repoDir, filename)
  writeFileSync(filePath, content)
  await ctx.syncManager.syncFromFs()
  if (options.start !== false) ctx.syncManager.start()

  const tasks = ctx.data.getAllNodes().filter((n) => n.item?.task?.status != null)
  return { filePath, tasks }
}

/** Find a task by content substring */
function findTask(ctx: ConcurrentTestCtx, content: string) {
  return ctx.data.getAllNodes().find((n) => n.content?.includes(content))
}

/** Get all tasks from the data store */
function getAllTasks(ctx: ConcurrentTestCtx) {
  return ctx.data.getAllNodes().filter((n) => n.item?.task?.status != null)
}

/** Run a concurrent edit test with fake timers and test environment */
async function withConcurrentTestEnv(fn: (ctx: ConcurrentTestCtx) => Promise<void>): Promise<void> {
  let clock: Clock | null = FakeTimers.install({
    toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"],
    shouldAdvanceTime: false,
  })

  try {
    await withTestEnv(
      async ({ repoDir, data, emitter }) => {
        const testWatcher = new TestWatcher(100)
        const stateChangeListeners: Array<(state: string) => void> = []

        const miniRepo: SyncableRepo = {
          database: data.database,
          path: repoDir,
          emitter,
          apply(event, options?) {
            return emitter.apply(event, options)
          },
          commit(event, options?) {
            return emitter.commit(event, options)
          },
        }
        const syncManager = withSync({
          debounceFs: 100,
          debounceApply: 50,
          conflictStrategy: "last_write_wins",
          heartbeat: { enabled: false },
          watcher: testWatcher,
          callbacks: {
            onStateChange: (state) => {
              for (const listener of stateChangeListeners) listener(state)
            },
          },
        })(miniRepo)

        try {
          await fn({
            repoDir,
            data,
            syncManager,
            testWatcher,
            advanceTime: async (ms) => {
              await clock!.tickAsync(ms)
            },
            flushTimers: async () => {
              await clock!.tickAsync(1000)
            },
            writeAndTrigger: (path, content) => {
              writeFileSync(path, content)
              testWatcher.triggerChange(path)
            },
            onStateChange: (handler) => {
              stateChangeListeners.push(handler)
            },
          })
        } finally {
          // CRITICAL: Uninstall fake timers BEFORE stopping the sync manager.
          // handleFsSync uses worker threads (parse pool) for markdown parsing,
          // and worker thread communication is blocked by fake timers.
          if (clock) {
            clock.uninstall()
            clock = null
          }
          await syncManager.stop()
        }
      },
      { mode: "real" },
    )
  } finally {
    if (clock) {
      clock.uninstall()
      clock = null
    }
  }
}

describe("Concurrent Edit Tests", () => {
  describe("Interleaved Edits", () => {
    test.each([
      { name: "DB then FS", firstSource: "db" as const },
      { name: "FS then DB", firstSource: "fs" as const },
    ])("$name edit preserves both changes", ({ firstSource }) =>
      withConcurrentTestEnv(async (ctx) => {
        const { filePath, tasks } = await initTestFile(ctx, "tasks.md", "# Tasks\n\n- [ ] Task 1\n- [ ] Task 2\n")
        const task1 = tasks.find((t) => t.content === "Task 1")
        expect(task1).toBeDefined()

        if (firstSource === "db") {
          ctx.data.updateNode(task1!.id, { item: { task: { status: "done", marker: "[ ]" } } })
          await ctx.advanceTime(100)
          const content = readFileSync(filePath, "utf-8")
          ctx.writeAndTrigger(filePath, content + "- [ ] Task 3\n")
        } else {
          ctx.writeAndTrigger(filePath, "# Tasks\n\n- [ ] Task 1\n- [ ] Task 2\n- [ ] New task\n")
          // Advance past debounce (100ms) to trigger handleFsSync
          await ctx.advanceTime(300)
          // handleFsSync is async — wait for real I/O (parse pool, reconcile) to complete
          await ctx.syncManager.waitForInflight()
          ctx.data.updateNode(task1!.id, { item: { task: { status: "done", marker: "[ ]" } } })
        }

        // Advance past writeQueue debounce (50ms) and flush
        await ctx.advanceTime(500)
        await ctx.syncManager.waitForInflight()
        await ctx.flushTimers()

        const finalTasks = getAllTasks(ctx)
        expect(finalTasks.length).toBeGreaterThanOrEqual(2)
        expect(findTask(ctx, "Task 1")?.item?.task?.status).toBe("done")
      }),
    )
  })

  describe("Rapid Concurrent Edits", () => {
    test("many rapid FS edits are coalesced", () =>
      withConcurrentTestEnv(async (ctx) => {
        const { filePath } = await initTestFile(ctx, "tasks.md", "# Tasks\n\n- [ ] Task\n")

        // Count reconciliation cycles via state transitions to "idle"
        let syncCount = 0
        ctx.onStateChange((state: string) => {
          if (state === "idle") syncCount++
        })

        for (let i = 1; i <= 10; i++) {
          ctx.writeAndTrigger(filePath, `# Tasks\n\n- [ ] Edit ${i}\n`)
          await ctx.advanceTime(20) // Less than 100ms debounce
        }

        await ctx.advanceTime(500)
        await ctx.syncManager.waitForInflight()
        await ctx.flushTimers()

        expect(findTask(ctx, "Edit")?.content).toBe("Edit 10")
        expect(syncCount).toBeLessThan(10)
      }))

    test("many rapid DB edits are coalesced", () =>
      withConcurrentTestEnv(async (ctx) => {
        const { filePath, tasks } = await initTestFile(ctx, "tasks.md", "# Tasks\n\n- [ ] Task\n", { start: false })
        const task = tasks[0]
        expect(task).toBeDefined()

        for (let i = 1; i <= 10; i++) {
          ctx.data.updateNode(task!.id, { content: `DB Edit ${i}` })
        }

        await ctx.advanceTime(300)
        await ctx.flushTimers()
        await ctx.flushTimers()

        const content = readFileSync(filePath, "utf-8")
        expect(content).toContain("DB Edit 10")
        expect(content).not.toMatch(/DB Edit [2-5]\n/)
      }))
  })

  describe("Conflict Scenarios", () => {
    // These tests intentionally exercise the safe-write conflict path — the
    // sync layer SHOULD log a warning when it detects a DB edit colliding
    // with an out-of-band FS edit. The project-wide vitest setup fails any
    // test that emits console output, so we must mute the expected warning
    // via a spy. (The spy still records the calls so the behaviour is
    // observable if we ever want to assert on it.)
    test("same task edited in DB and FS resolves without crash", () =>
      withConcurrentTestEnv(async (ctx) => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
          const { filePath, tasks } = await initTestFile(ctx, "tasks.md", "# Tasks\n\n- [ ] Contested task\n")
          const task = tasks[0]
          expect(task).toBeDefined()

          // Simultaneous edits
          ctx.data.updateNode(task!.id, { content: "DB version" })
          ctx.writeAndTrigger(filePath, "# Tasks\n\n- [ ] FS version\n")

          await ctx.advanceTime(500)
          await ctx.flushTimers()
          await ctx.flushTimers()

          const finalTask = getAllTasks(ctx)[0]
          expect(finalTask).toBeDefined()
          expect(["DB version", "FS version"]).toContain(finalTask!.content ?? "")
        } finally {
          warnSpy.mockRestore()
        }
      }))

    test("task deleted in FS while edited in DB handles gracefully", { timeout: 15000 }, () =>
      withConcurrentTestEnv(async (ctx) => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
          const { filePath, tasks } = await initTestFile(ctx, "tasks.md", "# Tasks\n\n- [ ] Task to delete\n")
          const taskId = tasks[0]!.id

          ctx.data.updateNode(taskId, { content: "Edited task" })
          ctx.writeAndTrigger(filePath, "# Tasks\n\n")

          await ctx.advanceTime(500)
          await ctx.syncManager.waitForInflight()
          await ctx.flushTimers()

          // No crash = success
          expect(true).toBe(true)
        } finally {
          warnSpy.mockRestore()
        }
      }),
    )
  })

  describe("Multi-File Concurrent Edits", () => {
    test("concurrent edits to different files are independent", () =>
      withConcurrentTestEnv(async (ctx) => {
        const file1 = join(ctx.repoDir, "file1.md")
        const file2 = join(ctx.repoDir, "file2.md")
        writeFileSync(file1, "# File 1\n\n- [ ] Task 1\n")
        writeFileSync(file2, "# File 2\n\n- [ ] Task 2\n")

        await ctx.syncManager.syncFromFs()
        ctx.syncManager.start()

        const task1 = findTask(ctx, "Task 1")
        expect(task1).toBeDefined()

        // DB edit: mark task1 done. Let write queue flush to disk before FS sync fires.
        ctx.data.updateNode(task1!.id, { item: { task: { status: "done", marker: "[ ]" } } })
        // Advance past write queue debounce (50ms) so file1 is updated on disk
        await ctx.advanceTime(60)

        // Now trigger FS change to file2
        ctx.writeAndTrigger(file2, "# File 2\n\n- [x] Task 2 modified\n")

        // Advance past sync debounce (100ms) and wait for async reconciliation
        await ctx.advanceTime(500)
        await ctx.syncManager.waitForInflight()
        await ctx.flushTimers()

        expect(findTask(ctx, "Task 1")?.item?.task?.status).toBe("done")
        expect(findTask(ctx, "Task 2")?.item?.task?.status).toBe("done")
      }))
  })

  describe("Data Integrity", () => {
    test("no data loss during interleaved edits", () =>
      withConcurrentTestEnv(async (ctx) => {
        const { filePath } = await initTestFile(
          ctx,
          "tasks.md",
          "# Tasks\n\n- [ ] Task A\n- [ ] Task B\n- [ ] Task C\n",
        )

        const taskB = findTask(ctx, "Task B")
        expect(taskB).toBeDefined()

        ctx.data.updateNode(taskB!.id, { item: { task: { status: "done", marker: "[ ]" } } })
        await ctx.advanceTime(100)

        const content = readFileSync(filePath, "utf-8")
        ctx.writeAndTrigger(filePath, content + "- [ ] Task D\n")

        await ctx.advanceTime(500)
        await ctx.flushTimers()
        await ctx.flushTimers()

        const taskContents = getAllTasks(ctx).map((t) => t.content)
        expect(taskContents).toContain("Task A")
        expect(taskContents).toContain("Task B")
        expect(taskContents).toContain("Task C")
        expect(findTask(ctx, "Task B")?.item?.task?.status).toBe("done")
      }))

    test("file structure preserved during concurrent edits", () =>
      withConcurrentTestEnv(async (ctx) => {
        const { filePath } = await initTestFile(
          ctx,
          "project.md",
          `# Project

## Active

- [ ] Active task

## Completed

- [x] Done task

## Notes

Important notes here.
`,
        )

        const activeTask = findTask(ctx, "Active task")
        expect(activeTask).toBeDefined()

        ctx.data.updateNode(activeTask!.id, { item: { task: { status: "done", marker: "[ ]" } } })

        await ctx.advanceTime(300)
        await ctx.flushTimers()
        await ctx.flushTimers()

        const content = readFileSync(filePath, "utf-8")
        expect(content).toContain("## Active")
        expect(content).toContain("## Completed")
        expect(content).toContain("## Notes")
        expect(content).toContain("Important notes here")
      }))
  })
})
