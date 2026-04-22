/**
 * FS-reconcile → backlinksState invalidation.
 *
 * Closes the last open thread from the lazy-hydration work: when a file
 * changes on disk, the FS reconcile path must populate `delta.linkChanges`
 * so reactive `backlinksState(targetId)` signals invalidate without a
 * manual refresh.
 *
 * Verifies two layers:
 *
 * 1. Unit — `applyReconcileOps` returns the link-table mutations it
 *    performed (ApplyResult.hostIds / targetHrefs). This is the extension
 *    point wired in by km-storage.lazy-hydration-linkchanges-emit.
 *
 * 2. End-to-end — an external `.md` edit flows through the reconcile
 *    pipeline (the same pipeline `createFsStore` drives from its watcher)
 *    and the returned `linkChanges` delta, when forwarded through
 *    `store.notifyLinkChange`, invalidates a `backlinksState` signal on
 *    the reactive store. This mirrors what `FsStore.handleFsSync` does
 *    with the delta inside its `onCommit` broadcast.
 */

import { describe, test, expect } from "vitest"
import { mkdtempSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { Database } from "bun:sqlite"
import { effect } from "alien-signals"

import { SCHEMA } from "../../src/db/schema.ts"
import { createSQLiteStore } from "../../src/store/sqlite.ts"
import { withReactive } from "../../src/store/reactive.ts"
import { ResourceState } from "../../src/store/commit-types.ts"
import { createEmitter } from "../../src/emitter.ts"
import { normalizeLinkHref } from "@km/markdown"
import { reconcileDirectoryRecursive, applyReconcileOps } from "@km/fs-mount"

// =============================================================================
// Unit layer — applyReconcileOps returns link-table delta
// =============================================================================

describe("applyReconcileOps — returns link-table delta", () => {
  test("create of a file with [[target]] reports host + target href", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "fs-reconcile-links-"))
    writeFileSync(join(repoDir, "target.md"), "# Target\n\nTarget body.\n")
    writeFileSync(join(repoDir, "source.md"), "# Source\n\n[[target]]\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    const emitter = createEmitter({ kmDir: join(repoDir, ".km"), db, skipPersist: true })
    try {
      const ops = reconcileDirectoryRecursive(db, repoDir, repoDir)
      const result = applyReconcileOps(db, ops, repoDir, emitter)

      // At least one host had outgoing link rows (the source node).
      expect(result.hostIds.length).toBeGreaterThan(0)
      // The canonical href of Target must appear in the delta so
      // `backlinksState(targetId)` invalidates on this reconcile pass.
      const targetHref = normalizeLinkHref("wiki", "target")
      expect(result.targetHrefs).toContain(targetHref)
    } finally {
      emitter.close()
      db.close()
    }
  })

  test("update that adds [[target]] reports target href", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "fs-reconcile-links-"))
    writeFileSync(join(repoDir, "target.md"), "# Target\n\nTarget body.\n")
    writeFileSync(join(repoDir, "source.md"), "# Source\n\nNo link yet.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    const emitter = createEmitter({ kmDir: join(repoDir, ".km"), db, skipPersist: true })
    try {
      // Initial reconcile — creates the files.
      {
        const ops = reconcileDirectoryRecursive(db, repoDir, repoDir)
        applyReconcileOps(db, ops, repoDir, emitter)
      }

      // External edit: add a wikilink to source.md.
      writeFileSync(join(repoDir, "source.md"), "# Source\n\n[[target]]\n")

      const ops = reconcileDirectoryRecursive(db, repoDir, repoDir)
      expect(ops.some((o) => o.type === "update")).toBe(true)
      const result = applyReconcileOps(db, ops, repoDir, emitter)

      const targetHref = normalizeLinkHref("wiki", "target")
      expect(result.targetHrefs).toContain(targetHref)
    } finally {
      emitter.close()
      db.close()
    }
  })

  test("update that removes [[target]] reports target href", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "fs-reconcile-links-"))
    writeFileSync(join(repoDir, "target.md"), "# Target\n\nTarget body.\n")
    writeFileSync(join(repoDir, "source.md"), "# Source\n\n[[target]]\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    const emitter = createEmitter({ kmDir: join(repoDir, ".km"), db, skipPersist: true })
    try {
      // Initial reconcile — creates the files with [[target]] link.
      {
        const ops = reconcileDirectoryRecursive(db, repoDir, repoDir)
        applyReconcileOps(db, ops, repoDir, emitter)
      }

      // External edit: remove the wikilink.
      writeFileSync(join(repoDir, "source.md"), "# Source\n\nNo link.\n")

      const ops = reconcileDirectoryRecursive(db, repoDir, repoDir)
      const result = applyReconcileOps(db, ops, repoDir, emitter)

      // Even when the new content has no links, the REMOVED href must flow
      // through the delta so subscribers to `backlinksState(Target)` see
      // the count drop.
      const targetHref = normalizeLinkHref("wiki", "target")
      expect(result.targetHrefs).toContain(targetHref)
    } finally {
      emitter.close()
      db.close()
    }
  })
})

// =============================================================================
// End-to-end — FsStore onCommit carries linkChanges, backlinksState fires
// =============================================================================

describe("FsStore — onCommit linkChanges flows through reactive backlinks", () => {
  test("backlinksState signal re-fires when FS-driven linkChanges commit arrives", async () => {
    // This test wires withReactive onto a SHARED in-memory DB driven by the
    // same reconcile pipeline the FsStore uses internally. That's the real
    // consumer side: a UI computing backlinks on nodeId via the reactive
    // signal, watching for updates from the FS reconcile path.
    const repoDir = mkdtempSync(join(tmpdir(), "fs-reconcile-links-"))
    writeFileSync(join(repoDir, "target.md"), "# Target\n\nTarget body.\n")
    writeFileSync(join(repoDir, "source.md"), "# Source\n\nNo link yet.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    const emitter = createEmitter({ kmDir: join(repoDir, ".km"), db, skipPersist: true })
    try {
      // Initial reconcile — creates target + source files.
      {
        const ops = reconcileDirectoryRecursive(db, repoDir, repoDir)
        applyReconcileOps(db, ops, repoDir, emitter)
      }

      // Find the target node id.
      const targetRow = db.query("SELECT id FROM nodes WHERE fs_path = 'target.md'").get() as {
        id: string
      } | null
      expect(targetRow).not.toBeNull()
      const targetId = targetRow!.id

      using store = withReactive(createSQLiteStore(db), { db })
      const sig = store.backlinksState(targetId)

      const seen: number[] = []
      const dispose = effect(() => {
        const s = sig()
        if (ResourceState.isLoaded(s)) seen.push(s.value.length)
      })
      expect(seen).toEqual([0])

      // External edit: add [[target]] link.
      writeFileSync(join(repoDir, "source.md"), "# Source\n\n[[target]]\n")

      // Simulate the watcher -> reconcile path that createFsStore would run:
      // reconcile, apply, then forward link changes via notifyLinkChange.
      const ops = reconcileDirectoryRecursive(db, repoDir, repoDir)
      const result = applyReconcileOps(db, ops, repoDir, emitter)
      store.notifyLinkChange({
        hostIds: result.hostIds,
        targetHrefs: result.targetHrefs,
      })

      // Signal should have fired — Target now has exactly 1 backlink.
      expect(seen).toEqual([0, 1])

      dispose()
    } finally {
      emitter.close()
      db.close()
    }
  })
})
