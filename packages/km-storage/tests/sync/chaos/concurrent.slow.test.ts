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

import { describe, test, expect } from "vitest"
import { writeFileSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { EventEmitter } from "events"
import FakeTimers, { type InstalledClock } from "@sinonjs/fake-timers"
import type { WatcherInterface, SyncData } from "../../../src/watch/types.ts"
import { withTestEnv, type DataStore, type HasDatabase } from "@km/storage"
import { SyncManager } from "../../../src/watch/sync.ts"

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
  syncManager: SyncManager
  testWatcher: TestWatcher
  advanceTime: (ms: number) => Promise<void>
  flushTimers: () => Promise<void>
  writeAndTrigger: (path: string, content: string) => void
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

  const tasks = ctx.data.getAllNodes().filter((n) => n.type === "task")
  return { filePath, tasks }
}

/** Find a task by content substring */
function findTask(ctx: ConcurrentTestCtx, content: string) {
  return ctx.data.getAllNodes().find((n) => n.content?.includes(content))
}

/** Get all tasks from the data store */
function getAllTasks(ctx: ConcurrentTestCtx) {
  return ctx.data.getAllNodes().filter((n) => n.type === "task")
}

/** Run a concurrent edit test with fake timers and test environment */
async function withConcurrentTestEnv(
  fn: (ctx: ConcurrentTestCtx) => Promise<void>,
): Promise<void> {
  const clock: InstalledClock = FakeTimers.install({
    toFake: [
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "Date",
    ],
    shouldAdvanceTime: false,
  })

  try {
    await withTestEnv(
      async ({ repoDir, data, emitter }) => {
        const testWatcher = new TestWatcher(100)

        await using syncManager = new SyncManager({
          db: data.database,
          repoPath: repoDir,
          debounceFs: 100,
          debounceApply: 50,
          conflictStrategy: "last_write_wins",
          heartbeat: { enabled: false },
          watcher: testWatcher,
        })

        await using stack = new AsyncDisposableStack()
        emitter.setFsSync(syncManager)
        stack.defer(() => emitter.setFsSync(null))

        await fn({
          repoDir,
          data,
          syncManager,
          testWatcher,
          advanceTime: (ms) => clock.tickAsync(ms),
          flushTimers: () => clock.tickAsync(1000),
          writeAndTrigger: (path, content) => {
            writeFileSync(path, content)
            testWatcher.triggerChange(path)
          },
        })
      },
      { mode: "real" },
    )
  } finally {
    clock.uninstall()
  }
}

describe("Concurrent Edit Tests", () => {
  describe("Interleaved Edits", () => {
    test.each([
      { name: "DB then FS", firstSource: "db" as const },
      { name: "FS then DB", firstSource: "fs" as const },
    ])("$name edit preserves both changes", ({ firstSource }) =>
      withConcurrentTestEnv(async (ctx) => {
        const { filePath, tasks } = await initTestFile(
          ctx,
          "tasks.md",
          "# Tasks\n\n- [ ] Task 1\n- [ ] Task 2\n",
        )
        const task1 = tasks.find((t) => t.content === "Task 1")
        expect(task1).toBeDefined()

        if (firstSource === "db") {
          ctx.data.updateNode(task1!.id, { task_status: "done" })
          await ctx.advanceTime(100)
          const content = readFileSync(filePath, "utf-8")
          ctx.writeAndTrigger(filePath, content + "- [ ] Task 3\n")
        } else {
          ctx.writeAndTrigger(
            filePath,
            "# Tasks\n\n- [ ] Task 1\n- [ ] Task 2\n- [ ] New task\n",
          )
          await ctx.advanceTime(300)
          ctx.data.updateNode(task1!.id, { task_status: "done" })
        }

        await ctx.advanceTime(500)
        await ctx.flushTimers()

        const finalTasks = getAllTasks(ctx)
        expect(finalTasks.length).toBeGreaterThanOrEqual(2)
        expect(findTask(ctx, "Task 1")?.task_status).toBe("done")
      }),
    )
  })

  describe("Rapid Concurrent Edits", () => {
    test("many rapid FS edits are coalesced", () =>
      withConcurrentTestEnv(async (ctx) => {
        const { filePath } = await initTestFile(
          ctx,
          "tasks.md",
          "# Tasks\n\n- [ ] Task\n",
        )

        let syncCount = 0
        ctx.syncManager.on("sync-complete", () => syncCount++)

        for (let i = 1; i <= 10; i++) {
          ctx.writeAndTrigger(filePath, `# Tasks\n\n- [ ] Edit ${i}\n`)
          await ctx.advanceTime(20) // Less than 100ms debounce
        }

        await ctx.advanceTime(500)
        await ctx.flushTimers()

        expect(findTask(ctx, "Edit")?.content).toBe("Edit 10")
        expect(syncCount).toBeLessThan(10)
      }))

    test("many rapid DB edits are coalesced", () =>
      withConcurrentTestEnv(async (ctx) => {
        const { filePath, tasks } = await initTestFile(
          ctx,
          "tasks.md",
          "# Tasks\n\n- [ ] Task\n",
          { start: false },
        )
        const task = tasks[0]
        expect(task).toBeDefined()

        for (let i = 1; i <= 10; i++) {
          ctx.data.updateNode(task!.id, { content: `DB Edit ${i}` })
        }

        await ctx.advanceTime(300)
        await ctx.flushTimers()

        const content = readFileSync(filePath, "utf-8")
        expect(content).toContain("DB Edit 10")
        expect(content).not.toMatch(/DB Edit [2-5]\n/)
      }))
  })

  describe("Conflict Scenarios", () => {
    test("same task edited in DB and FS resolves without crash", () =>
      withConcurrentTestEnv(async (ctx) => {
        const { filePath, tasks } = await initTestFile(
          ctx,
          "tasks.md",
          "# Tasks\n\n- [ ] Contested task\n",
        )
        const task = tasks[0]
        expect(task).toBeDefined()

        // Simultaneous edits
        ctx.data.updateNode(task!.id, { content: "DB version" })
        ctx.writeAndTrigger(filePath, "# Tasks\n\n- [ ] FS version\n")

        await ctx.advanceTime(500)
        await ctx.flushTimers()

        const finalTask = getAllTasks(ctx)[0]
        expect(finalTask).toBeDefined()
        expect(["DB version", "FS version"]).toContain(finalTask!.content ?? "")
      }))

    test("task deleted in FS while edited in DB handles gracefully", () =>
      withConcurrentTestEnv(async (ctx) => {
        const { filePath, tasks } = await initTestFile(
          ctx,
          "tasks.md",
          "# Tasks\n\n- [ ] Task to delete\n",
        )
        const taskId = tasks[0]!.id

        ctx.data.updateNode(taskId, { content: "Edited task" })
        ctx.writeAndTrigger(filePath, "# Tasks\n\n")

        await ctx.advanceTime(500)
        await ctx.flushTimers()

        // No crash = success
        expect(true).toBe(true)
      }))
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

        ctx.data.updateNode(task1!.id, { task_status: "done" })
        ctx.writeAndTrigger(file2, "# File 2\n\n- [x] Task 2 modified\n")

        await ctx.advanceTime(500)
        await ctx.flushTimers()

        expect(findTask(ctx, "Task 1")?.task_status).toBe("done")
        expect(findTask(ctx, "Task 2")?.task_status).toBe("done")
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

        ctx.data.updateNode(taskB!.id, { task_status: "done" })
        await ctx.advanceTime(100)

        const content = readFileSync(filePath, "utf-8")
        ctx.writeAndTrigger(filePath, content + "- [ ] Task D\n")

        await ctx.advanceTime(500)
        await ctx.flushTimers()

        const taskContents = getAllTasks(ctx).map((t) => t.content)
        expect(taskContents).toContain("Task A")
        expect(taskContents).toContain("Task B")
        expect(taskContents).toContain("Task C")
        expect(findTask(ctx, "Task B")?.task_status).toBe("done")
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

        ctx.data.updateNode(activeTask!.id, { task_status: "done" })

        await ctx.advanceTime(300)
        await ctx.flushTimers()

        const content = readFileSync(filePath, "utf-8")
        expect(content).toContain("## Active")
        expect(content).toContain("## Completed")
        expect(content).toContain("## Notes")
        expect(content).toContain("Important notes here")
      }))
  })
})
