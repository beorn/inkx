/**
 * withSync + safe-write integration — the TUI writer path under the
 * content-as-CAS contract (hub/km/storage-architecture.md §7.1).
 *
 * The bead `km-storage.writeback-cas-adopt-in-withsync` (April 2026) replaced
 * WriteQueue's home-grown baseline-hash check with `safeWriteFile`. These
 * tests pin the new contract from the perspective of a long-running sync
 * session:
 *
 *   - External edit between load and save → safe-write refuses → conflict_created
 *     is emitted → disk bytes preserved intact.
 *   - Sequential in-app edits that don't race with external edits succeed
 *     (the post-write fs_content_hash update keeps the CAS guard aligned).
 *   - Concurrent interleaving (app write, external edit, app write again)
 *     flags the mid-sequence conflict but doesn't corrupt either side.
 */

import { describe, test, expect, beforeEach, vi } from "vitest"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

import { getAllNodes, withTestEnv } from "@km/storage"
import type { Change } from "@km/core"
import { createTestSync, setupSync, waitForReady } from "./sync-test-helpers.ts"
import type { ConflictInfo } from "../../src/watch/sync.ts"

// Conflicts deliberately log a warning so a human operator sees them in
// production. In these tests the warning IS the expected outcome — silence
// it so the global no-console-output gate doesn't red-card the run.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("withSync + safe-write — external-edit conflict detection", () => {
  test("external edit racing the write queue flush → conflict_created + disk preserved", { timeout: 15000 }, () =>
    withTestEnv(async ({ repoDir, db, data, emitter }) => {
      const conflicts: ConflictInfo[] = []
      const changes: Change[] = []
      emitter.onApply((change) => {
        changes.push(change)
      })

      // Use a slower WriteQueue debounce to create a deterministic race
      // window: we queue the write, then external-edit disk before the
      // debounce fires, so mergeExternalDrift has already run and the
      // only remaining guard is safeWriteFile's CAS check.
      const syncManager = createTestSync(db, repoDir, {
        emitter,
        debounceApply: 400,
        callbacks: {
          onConflicts: (batch) => conflicts.push(...batch),
        },
      })

      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)

      const testFile = join(repoDir, "notes.md")
      const initialContent = "# Notes\n\n- [ ] Original\n"
      writeFileSync(testFile, initialContent, "utf-8")
      await syncManager.syncFromFs()

      syncManager.start()
      await waitForReady(syncManager)

      // In-app mutation — save() runs mergeExternalDrift (disk still matches
      // baseline, no drift), serializes new content, queues the write.
      const task = getAllNodes(db).find((n) => n.item?.task?.status != null)
      expect(task).toBeDefined()
      data.updateNode(task!.id, { content: "Original — km edited" })

      // Race window: queue has not flushed yet. External writer clobbers
      // disk from under us.
      await Bun.sleep(50) // let save() run, write land in queue
      const externalContent = "# Notes\n\n- [ ] Injected by external editor\n"
      writeFileSync(testFile, externalContent, "utf-8")

      // Now let the queue flush. safeWriteFile reads disk (= externalContent),
      // compares to expectedHash (baseline set by mergeExternalDrift, = initial
      // content's hash) — mismatch → conflict, disk stays intact.
      await Bun.sleep(500) // debounce + write
      await syncManager.waitForInflight()

      // Disk bytes MUST be preserved — safe-write never overwrites.
      expect(readFileSync(testFile, "utf-8")).toBe(externalContent)

      // A conflict must be surfaced through the onConflicts callback.
      expect(conflicts.length).toBeGreaterThanOrEqual(1)
      const conflict = conflicts.find((c) => c.path === testFile)
      expect(conflict).toBeDefined()
      expect(conflict!.resolution).toBe("discarded")
      expect(conflict!.baselineHash).toBeTruthy()
      expect(conflict!.currentHash).toBeTruthy()
      expect(conflict!.baselineHash).not.toBe(conflict!.currentHash)

      // The `conflict_created` change must also have been emitted so downstream
      // consumers (audit log, agents) see the divergence.
      const conflictChange = changes.find((c) => c.type === "conflict_created")
      expect(conflictChange).toBeDefined()
      expect((conflictChange!.data as { reason?: string }).reason).toBe("external_edit_detected")
    }),
  )

  test("sequential in-app writes succeed (baseline stays aligned)", { timeout: 15000 }, () =>
    withTestEnv(async ({ repoDir, db, data, emitter }) => {
      const conflicts: ConflictInfo[] = []
      const syncManager = createTestSync(db, repoDir, {
        emitter,
        callbacks: { onConflicts: (batch) => conflicts.push(...batch) },
      })

      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)

      const testFile = join(repoDir, "rapid.md")
      writeFileSync(testFile, "# Rapid\n\n- [ ] a\n- [ ] b\n", "utf-8")
      await syncManager.syncFromFs()

      syncManager.start()
      await waitForReady(syncManager)

      // Mutate the first task three times in a row — without safeWriteFile
      // aligning the baseline post-write, iteration 2+ would spuriously
      // conflict because the DB's fs_content_hash would lag the disk bytes.
      const task = getAllNodes(db).find((n) => n.content === "a")
      expect(task).toBeDefined()
      data.updateNode(task!.id, { content: "a1" })
      await Bun.sleep(200)
      await syncManager.waitForInflight()

      data.updateNode(task!.id, { content: "a2" })
      await Bun.sleep(200)
      await syncManager.waitForInflight()

      data.updateNode(task!.id, { content: "a3" })
      await Bun.sleep(200)
      await syncManager.waitForInflight()

      // No conflicts — every write was km's own, baseline was refreshed each time.
      expect(conflicts).toEqual([])
      expect(readFileSync(testFile, "utf-8")).toContain("a3")
    }),
  )

  test("interleaved app+external edits: clean write → race → conflict", { timeout: 15000 }, () =>
    withTestEnv(async ({ repoDir, db, data, emitter }) => {
      const conflicts: ConflictInfo[] = []
      const syncManager = createTestSync(db, repoDir, {
        emitter,
        debounceApply: 400,
        callbacks: { onConflicts: (batch) => conflicts.push(...batch) },
      })

      await using stack = new AsyncDisposableStack()
      setupSync(stack, syncManager)

      const testFile = join(repoDir, "interleave.md")
      writeFileSync(testFile, "# Interleave\n\n- [ ] step1\n", "utf-8")
      await syncManager.syncFromFs()

      syncManager.start()
      await waitForReady(syncManager)

      // Round 1 — clean app write, should succeed.
      const task = getAllNodes(db).find((n) => n.content === "step1")
      expect(task).toBeDefined()
      data.updateNode(task!.id, { content: "step1-app" })
      await Bun.sleep(600) // debounce (400) + write
      await syncManager.waitForInflight()
      expect(readFileSync(testFile, "utf-8")).toContain("step1-app")

      // Round 2 — app edit queued, then external clobber races the flush.
      data.updateNode(task!.id, { content: "step1-clobber" })
      await Bun.sleep(50)
      const externalRound2 = "# Interleave\n\n- [ ] injected by external\n"
      writeFileSync(testFile, externalRound2, "utf-8")
      await Bun.sleep(600)
      await syncManager.waitForInflight()

      // Conflict flagged, external disk bytes preserved intact.
      expect(conflicts.length).toBeGreaterThanOrEqual(1)
      expect(readFileSync(testFile, "utf-8")).toBe(externalRound2)
    }),
  )
})
