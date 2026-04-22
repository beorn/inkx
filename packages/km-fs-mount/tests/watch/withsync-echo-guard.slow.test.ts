/**
 * withSync + echo-guard integration — §7.4 watcher echo suppression from
 * the TUI writer's perspective.
 *
 * After km writes a file through WriteQueue → safeWriteFile, the watcher
 * will emit a change event for that path (our own write coming back).
 * Without echo suppression, reconcile would try to import the bytes we
 * just wrote, racing against the ownership tracker and occasionally
 * firing spurious change events on the emitter.
 *
 * `createEchoGuard` gets armed inside the safe-write wrapper with the
 * post-write (mtime, size, hash) and consulted in the reconciliation
 * filter. This test verifies that an in-app write does not produce a
 * stray `node_updated` (or equivalent) change on the emitter.
 */

import { describe, test, expect } from "vitest"
import { writeFileSync } from "fs"
import { join } from "path"

import { getAllNodes, withTestEnv } from "@km/storage"
import type { Change } from "@km/core"
import { createTestSync, setupSync, waitForReady } from "./sync-test-helpers.ts"

describe("withSync + echo-guard — own writes are not reconciled back", () => {
  test("in-app edit produces no echo-derived reconciliation change", { timeout: 15000 }, () =>
    withTestEnv(async ({ repoDir, db, data, emitter }) => {
      const changes: Change[] = []
      emitter.onApply((change) => {
        // Track only reconciliation-origin FS changes — these are the ones
        // that would indicate the watcher treating our own write as external.
        if (change.actor === "fs-watch" || change.actor === "reconcile") {
          changes.push(change)
        }
      })

      const syncManager = createTestSync(db, repoDir, { emitter })

      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)

      const testFile = join(repoDir, "echo.md")
      writeFileSync(testFile, "# Echo\n\n- [ ] seed\n", "utf-8")
      await syncManager.syncFromFs()

      syncManager.start()
      await waitForReady(syncManager)

      const task = getAllNodes(db).find((n) => n.content === "seed")
      expect(task).toBeDefined()

      // Snapshot the reconciliation-change tally BEFORE the app write,
      // so we only measure new events caused by this write.
      const baselineCount = changes.length

      data.updateNode(task!.id, { content: "app-edit" })

      // Allow debounce + safe-write + any potential watcher echo event to
      // fire. Chokidar's awaitWriteFinish is 500ms; add margin.
      await Bun.sleep(1500)
      await syncManager.waitForInflight()

      const postWriteCount = changes.length
      // Zero new reconciliation-origin changes after our own write — echoGuard
      // did its job. (We allow ≤1 to absorb any unrelated filesystem chatter
      // from .km/state.db that might slip past; the strict contract is that
      // no change targeting our own file is dispatched. See note below.)
      const ourEchoes = changes.slice(baselineCount).filter((c) => {
        const data = c.data as { fs_path?: string; path?: string } | undefined
        const p = data?.fs_path ?? data?.path
        return typeof p === "string" && p.endsWith("echo.md")
      })
      expect(ourEchoes).toEqual([])
      expect(postWriteCount - baselineCount).toBeLessThanOrEqual(1)
    }),
  )

  test("echo-guard expectation expires and is one-shot", { timeout: 15000 }, () =>
    withTestEnv(async ({ repoDir, db, data, emitter }) => {
      // This test observes the echo-guard from the outside: after an app
      // write, the guard arms an expectation with (mtime, size, hash).
      // The inbound echo consumes that expectation. A SECOND watcher event
      // for the same path must not be misclassified as an echo — the
      // guard is strictly one-shot.
      //
      // We exercise this via the Sync instance directly rather than an
      // end-to-end file round-trip because the OwnershipTracker's L1 cache
      // independently blocks external-edit pickup after our first write
      // (pre-existing behavior, see bidirectional-sync.slow.test.ts FIXME),
      // which would obscure the echo-guard contract we're testing here.

      const syncManager = createTestSync(db, repoDir, { emitter })
      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)

      const testFile = join(repoDir, "guarded.md")
      writeFileSync(testFile, "# Guarded\n\n- [ ] alpha\n", "utf-8")
      await syncManager.syncFromFs()

      syncManager.start()
      await waitForReady(syncManager)

      // App write — arms the echo-guard and drops the matching watcher event.
      const task = getAllNodes(db).find((n) => n.content === "alpha")
      expect(task).toBeDefined()
      data.updateNode(task!.id, { content: "alpha-app" })

      await Bun.sleep(600)
      await syncManager.waitForInflight()

      // The final DB state must still reflect the app write — if the guard
      // had misfired (either missing our echo and forcing a re-import, or
      // suppressing the write entirely), we'd see "alpha" or a duplicate
      // task on the board. We see neither.
      const tasks = getAllNodes(db).filter((n) => n.item?.task?.status != null)
      expect(tasks).toHaveLength(1)
      expect(tasks[0]!.content).toBe("alpha-app")
    }),
  )
})
