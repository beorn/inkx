/**
 * After km's own writeback (rule materialization, sync-to-fs, heartbeat
 * reproject), the DB row's stat-tracking fields must match the post-write
 * file state. Otherwise the next reconcile loop sees `entry.mtime !==
 * existingByPath.fs_mtime` and emits a spurious update op → re-parse →
 * re-emit node_created/updated/deleted events → leak recomputable noise
 * into changes.jsonl.
 *
 * This is the @km/storage/dont-journal-rule-derived-events fix: refresh
 * fs_mtime + fs_size + fs_ino + fs_content_hash atomically in the
 * post-write CAS update so subsequent reconciles see no drift.
 */

import { describe, test, expect, beforeEach, vi } from "vitest"
import { readFileSync, statSync, writeFileSync } from "fs"
import { join } from "path"

import { getAllNodes, withTestEnv } from "@km/storage"
import { createTestSync, setupSync, waitForReady } from "./sync-test-helpers.ts"

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("withSync writeback — stat-field refresh closes the rule-derived-event leak", () => {
  test("post-write fs_mtime + fs_size match the disk state for in-app edits", { timeout: 15000 }, () =>
    withTestEnv(async ({ repoDir, db, data, emitter }) => {
      const syncManager = createTestSync(db, repoDir, { emitter })
      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)

      const testFile = join(repoDir, "leak.md")
      writeFileSync(testFile, "# Leak\n\n- [ ] task1\n", "utf-8")
      await syncManager.syncFromFs()

      syncManager.start()
      await waitForReady(syncManager)

      // The pre-edit DB row already tracks the file's stat. Sleep so the
      // mtime distinguishes the upcoming km-write from this baseline.
      const fileNode = getAllNodes(db).find((n) => n.fs_path?.endsWith("leak.md"))
      expect(fileNode).toBeDefined()

      const task = getAllNodes(db).find((n) => n.content === "task1")
      expect(task).toBeDefined()

      // Trigger a writeback by mutating the in-memory model.
      data.updateNode(task!.id, { content: "task1-renamed" })
      await Bun.sleep(200)
      await syncManager.waitForInflight()

      // The disk file now reflects the rename.
      expect(readFileSync(testFile, "utf-8")).toContain("task1-renamed")

      // The DB row's fs_mtime + fs_size + fs_content_hash must now match
      // the post-write disk state. If they don't, the next reconcile would
      // re-emit events for this file.
      const stat = statSync(testFile)
      const refreshed = getAllNodes(db).find((n) => n.fs_path?.endsWith("leak.md"))
      expect(refreshed).toBeDefined()
      expect(refreshed!.fs_mtime).toBe(stat.mtimeMs)
      expect(refreshed!.fs_size).toBe(stat.size)
      expect(refreshed!.fs_ino).toBe(stat.ino)
      expect(typeof refreshed!.fs_content_hash).toBe("string")
    }),
  )

  test("subsequent syncFromFs after a writeback emits zero new events", { timeout: 15000 }, () =>
    withTestEnv(async ({ repoDir, db, data, emitter }) => {
      const syncManager = createTestSync(db, repoDir, { emitter })
      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)

      const testFile = join(repoDir, "noop-reconcile.md")
      writeFileSync(testFile, "# NoopReconcile\n\n- [ ] alpha\n", "utf-8")
      await syncManager.syncFromFs()

      syncManager.start()
      await waitForReady(syncManager)

      const task = getAllNodes(db).find((n) => n.content === "alpha")
      expect(task).toBeDefined()
      data.updateNode(task!.id, { content: "alpha-renamed" })
      await Bun.sleep(200)
      await syncManager.waitForInflight()

      // Now run a syncFromFs — without the fix, this would see the stat
      // drift between disk and DB, emit an update, re-parse, and re-emit
      // node events for every line. With the fix the file is already
      // in-sync.
      const beforeChangeCount: import("@km/core").Change[] = []
      const off = emitter.onApply((change) => {
        beforeChangeCount.push(change)
      })

      await syncManager.syncFromFs()
      off()

      // No update / re-parse events for the just-written file.
      const fsWatchEvents = beforeChangeCount.filter(
        (c) =>
          c.actor === "fs-watch" &&
          (c.type === "node_updated" || c.type === "node_created" || c.type === "node_deleted"),
      )
      expect(fsWatchEvents).toEqual([])
    }),
  )
})
