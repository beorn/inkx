/**
 * Regression tests for two P1 data-loss bugs:
 *
 * 1. km-storage.frontmatter-wipe — externally-added frontmatter is stripped
 *    when km writes the file back after an in-app mutation.
 *
 * 2. km-storage.watcher-misses-changes — external edits that the watcher
 *    doesn't observe (coalesced FSEvents, backgrounded tab, etc.) silently
 *    turn into data loss on the next in-app mutation.
 *
 * Both bugs share a root cause: the write path trusts the DB snapshot over
 * what's actually on disk. When an external edit slips past the watcher the
 * DB is stale, and km's next write blindly overwrites the disk version —
 * quietly moving the user's edit into a sibling `.conflict.<ts>.md` backup.
 *
 * The fix is "reconcile-before-write": on a detected drift, re-parse the
 * on-disk content into the DB first, then re-serialize with the in-app
 * mutation on top. This doubles as the recovery path for missed watcher
 * events.
 */

import { describe, test, expect } from "vitest"
import { writeFileSync, readFileSync, readdirSync } from "fs"
import { join } from "path"

import { getAllNodes, withTestEnv } from "@km/storage"
import { createTestSync, setupSync, waitForReady, createStateChangeWaiter } from "./sync-test-helpers.ts"

describe("Data-loss regressions (frontmatter / watcher)", () => {
  test("externally-added frontmatter survives an in-app task toggle (watcher-observed path)", () =>
    withTestEnv(async ({ repoDir, db, data, emitter }) => {
      const waiter = createStateChangeWaiter()
      const syncManager = createTestSync(db, repoDir, {
        emitter,
        callbacks: { onStateChange: waiter.handler },
      })

      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)
      syncManager.start()
      await waitForReady(syncManager)

      // 1. Write a task file WITHOUT frontmatter; sync it into the DB.
      const testFile = join(repoDir, "tasks.md")
      writeFileSync(testFile, "# Tasks\n\n- [ ] Test task\n")
      await syncManager.syncFromFs()

      // 2. Externally add frontmatter (simulating Obsidian/user edit).
      writeFileSync(testFile, "---\ncollapsed: true\ncustom-field: keep-me\n---\n\n# Tasks\n\n- [ ] Test task\n")

      // 3. Wait for the watcher to pick up the change.
      await waiter.promise

      // 4. Toggle the task in the model (simulating a TUI edit).
      const task = getAllNodes(db).find((n) => n.item?.task?.status != null)
      expect(task).toBeDefined()
      data.updateNode(task!.id, { item: { task: { status: "done", marker: "[ ]" } } })

      // 5. Let the write queue flush.
      await Bun.sleep(300)

      // 6. Frontmatter must still be in the file.
      const content = readFileSync(testFile, "utf-8")
      expect(content).toContain("collapsed: true")
      expect(content).toContain("custom-field: keep-me")
      expect(content).toContain("[x]")
    }))

  test("externally-added frontmatter survives in-app toggle even when the watcher missed the edit", () =>
    withTestEnv(async ({ repoDir, db, data, emitter }) => {
      const syncManager = createTestSync(db, repoDir, { emitter })

      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)
      syncManager.start()
      await waitForReady(syncManager)

      // 1. Seed a file without frontmatter; bulk-sync into the DB.
      const testFile = join(repoDir, "tasks.md")
      writeFileSync(testFile, "# Tasks\n\n- [ ] Test task\n")
      await syncManager.syncFromFs()

      // 2. External edit adds frontmatter. We deliberately DO NOT wait for
      //    the watcher — this simulates missed FSEvents / coalescing (bug 2).
      writeFileSync(testFile, "---\ncollapsed: true\ncustom-field: keep-me\n---\n\n# Tasks\n\n- [ ] Test task\n")

      // 3. Immediately toggle the task in the model. The DB still thinks the
      //    file has no frontmatter because the watcher hasn't fired yet.
      const task = getAllNodes(db).find((n) => n.item?.task?.status != null)
      expect(task).toBeDefined()
      data.updateNode(task!.id, { item: { task: { status: "done", marker: "[ ]" } } })

      // 4. Let the write queue flush.
      await Bun.sleep(500)

      // 5. The frontmatter must still be on disk. Before the fix, km would
      //    overwrite the file with its stale (frontmatter-less) DB snapshot
      //    and quietly stash the disk version into a .conflict.<ts>.md
      //    sibling — silent data loss.
      const content = readFileSync(testFile, "utf-8")
      expect(content).toContain("collapsed: true")
      expect(content).toContain("custom-field: keep-me")
      expect(content).toContain("[x]")

      // And no `.conflict.*.md` sibling should have been written — that file
      // is the symptom of the old "overwrite and stash" behaviour.
      const siblings = readdirSync(repoDir).filter((f) => f.includes(".conflict."))
      expect(siblings).toEqual([])
    }))

  test("external task addition is reconciled into the DB on the next in-app write (missed-watcher recovery)", () =>
    withTestEnv(async ({ repoDir, db, data, emitter }) => {
      const syncManager = createTestSync(db, repoDir, { emitter })

      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)
      syncManager.start()
      await waitForReady(syncManager)

      // 1. Seed a file with one task; sync.
      const testFile = join(repoDir, "notes.md")
      writeFileSync(testFile, "# Notes\n\n- [ ] Initial task\n")
      await syncManager.syncFromFs()

      // 2. External edit adds a second task — watcher deliberately not awaited.
      writeFileSync(testFile, "# Notes\n\n- [ ] Initial task\n- [ ] Appended externally\n")

      // 3. In-app mutation on the OTHER task — triggers a save() on the file.
      //    Post-fix, save() must reconcile the on-disk state into the DB
      //    before it serializes, so the appended task survives.
      const initial = getAllNodes(db).find((n) => n.content === "Initial task")
      expect(initial).toBeDefined()
      data.updateNode(initial!.id, { item: { task: { status: "done", marker: "[ ]" } } })

      await Bun.sleep(500)

      // 4. Both tasks must be on disk.
      const content = readFileSync(testFile, "utf-8")
      expect(content).toContain("Initial task")
      expect(content).toContain("Appended externally")
      expect(content).toContain("[x] Initial task")
    }))
})
