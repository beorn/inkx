/**
 * Regression tests for three P1 storage/memory bugs:
 *
 * - km-storage.frontmatter-wipe: user frontmatter preserved across task edits
 * - km-storage.watcher-misses-changes: shell-append external edits picked up
 *
 * These tests exercise the full file → DB → file round-trip through the
 * real watcher (useWorker: false) to catch integration-level regressions.
 */

import { describe, test, expect } from "vitest"
import { writeFileSync, readFileSync, appendFileSync } from "fs"
import { join } from "path"

import { getAllNodes, withTestEnv, createTestEnvRepo, getNodeByPath } from "@km/storage"
import { createTestSync, setupSync, waitForReady, createStateChangeWaiter, withTimeout } from "./sync-test-helpers.ts"

describe("km-storage.frontmatter-wipe (P1)", () => {
  test("user frontmatter survives task status toggle via TUI", { timeout: 15000 }, () =>
    withTestEnv(async ({ repoDir, db }) => {
      const { repo, emitter } = createTestEnvRepo({
        db,
        repoPath: repoDir,
        skipPersist: true,
      })
      const syncManager = createTestSync(db, repoDir, { emitter })

      await using stack = new AsyncDisposableStack()
      stack.defer(async () => await syncManager.stop())

      // Initial file with user-supplied frontmatter (collapsed + custom field).
      const testFile = join(repoDir, "frontmatter-task.md")
      const initial = `---
collapsed: true
custom_field: hello
tags:
  - project-a
  - urgent
---

# Tasks

- [ ] Test task
`
      writeFileSync(testFile, initial)
      await syncManager.syncFromFs()

      // Verify frontmatter was stored in the file node
      const fileNode = getNodeByPath(db, "frontmatter-task.md")
      expect(fileNode).not.toBeNull()
      expect(fileNode!.data).toMatchObject({
        collapsed: true,
        custom_field: "hello",
      })

      // Find the task and toggle its status via the repo (simulates a TUI edit)
      const task = getAllNodes(db).find((n) => n.item?.task?.status === "todo")
      expect(task).toBeDefined()
      repo.updateNode(task!.id, { item: { task: { status: "done", marker: "[x]" } } })

      // Wait for the write queue to flush to disk
      await Bun.sleep(300)

      // The on-disk file must still contain the user's frontmatter fields
      const after = readFileSync(testFile, "utf-8")
      expect(after).toContain("collapsed: true")
      expect(after).toContain("custom_field: hello")
      expect(after).toContain("project-a")
      expect(after).toContain("[x] Test task")
    }),
  )
})

describe("km-storage.watcher-misses-changes (P1)", () => {
  test("external shell-style append is detected in-session (worker watcher)", { timeout: 20000 }, () =>
    withTestEnv(async ({ repoDir, db }) => {
      const waiter = createStateChangeWaiter()
      const syncManager = createTestSync(db, repoDir, {
        useWorker: true, // Exercise the worker path — this is the production default
        callbacks: { onStateChange: waiter.handler },
      })

      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)

      // Initial file with a single task
      const testFile = join(repoDir, "shell-append.md")
      writeFileSync(testFile, "# Tasks\n\n- [ ] First\n")
      await syncManager.syncFromFs()

      expect(getAllNodes(db).filter((n) => n.item?.task?.status === "todo").length).toBe(1)

      // Start the live watcher
      syncManager.start()
      await waitForReady(syncManager)

      // Simulate a shell append (echo '- [ ] Second' >> file.md)
      appendFileSync(testFile, "- [ ] Second\n")

      // Wait for the watcher to deliver the change
      await withTimeout(waiter.promise, 15000, "Timeout waiting for watcher to pick up shell append")

      const tasks = getAllNodes(db).filter((n) => n.item?.task?.status === "todo")
      expect(tasks.length).toBe(2)
    }),
  )

  test("external frontmatter add is seen before next TUI write", { timeout: 20000 }, () =>
    withTestEnv(async ({ repoDir, db }) => {
      const waiter = createStateChangeWaiter()
      const { repo, emitter } = createTestEnvRepo({
        db,
        repoPath: repoDir,
        skipPersist: true,
      })
      const syncManager = createTestSync(db, repoDir, {
        emitter,
        callbacks: { onStateChange: waiter.handler },
      })

      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)

      const testFile = join(repoDir, "fm-add.md")
      writeFileSync(testFile, "# Tasks\n\n- [ ] Alpha\n")
      await syncManager.syncFromFs()

      syncManager.start()
      await waitForReady(syncManager)

      // External user rewrites file adding frontmatter
      writeFileSync(
        testFile,
        `---
collapsed: true
---

# Tasks

- [ ] Alpha
`,
      )

      await withTimeout(waiter.promise, 15000, "Timeout waiting for external frontmatter add")

      // Wait for everything to settle — reconciliation must finish writing the DB
      await Bun.sleep(200)

      const fileNode = getNodeByPath(db, "fm-add.md")
      expect(fileNode).not.toBeNull()
      expect(fileNode!.data).toMatchObject({ collapsed: true })

      // Now toggle the task via the repo, file should keep the frontmatter
      const task = getAllNodes(db).find((n) => n.item?.task?.status === "todo")
      expect(task).toBeDefined()
      repo.updateNode(task!.id, { item: { task: { status: "done", marker: "[x]" } } })

      await Bun.sleep(400)

      const content = readFileSync(testFile, "utf-8")
      expect(content).toContain("collapsed: true")
      expect(content).toContain("[x] Alpha")
    }),
  )
})
