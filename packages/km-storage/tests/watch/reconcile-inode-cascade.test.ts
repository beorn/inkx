/**
 * Reconciliation identity cascade — deterministic unit coverage
 *
 * Bead: km-storage.identity-recovery-cascade
 *
 * Pairs with tests/sync/chaos/reconcile-cascade.slow.test.ts (fake-fs based)
 * by exercising the cascade against the real filesystem + real scanner via
 * `withTestEnv`. Covers the four canonical scenarios from
 * hub/km/storage-architecture.md §3:
 *
 *   Step 1 — inode-primary:
 *     • Same-FS rename (inode stable, path changes) → ULID preserved
 *     • Content rewrite in place (inode + path stable, bytes change) → ULID preserved
 *     • Inode reuse (same inode + different path + different content + different mtime)
 *       → old DB row tombstoned, fresh ULID minted on a later reconcile.
 *   Step 3 — content-hash + parent-position composite:
 *     • Cross-FS rename (new inode, new basename, same parent, same content)
 *       → ULID preserved via hash match.
 */

import { describe, test, expect } from "vitest"
import { writeFileSync, unlinkSync, renameSync, utimesSync } from "fs"
import { join } from "path"
import type { Database } from "bun:sqlite"

import {
  reconcileDirectory,
  reconcileDirectoryRecursive,
  applyReconcileOps,
  type DirectoryScanner,
} from "../../src/watch/reconcile.ts"
import { scanDirectory } from "../../src/watch/watcher.ts"
import { getNodeByPath } from "../../src/db/queries/core-lookup.ts"
import { withTestEnv } from "@km/storage"
import type { Emitter } from "../../src/emitter.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createMdFile(dir: string, name: string, content: string): string {
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}

async function sync(db: Database, dir: string, repoDir: string, emitter: Emitter): Promise<void> {
  const ops = reconcileDirectoryRecursive(db, dir, repoDir)
  await applyReconcileOps(db, ops, repoDir, emitter)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("reconcile identity cascade", () => {
  test("Step 1 — same-FS rename: ULID preserved (inode stable, path changed)", () =>
    withTestEnv(async ({ db, repoDir, emitter }) => {
      const oldPath = createMdFile(repoDir, "alpha.md", "# Alpha\n\nbody\n")
      await sync(db, repoDir, repoDir, emitter)

      const nodeA = getNodeByPath(db, "alpha.md")
      expect(nodeA).not.toBeNull()
      const initialUlid = nodeA!.id

      // Rename in place — real FS rename preserves inode.
      const newPath = join(repoDir, "alpha-renamed.md")
      renameSync(oldPath, newPath)

      await sync(db, repoDir, repoDir, emitter)

      const renamed = getNodeByPath(db, "alpha-renamed.md")
      expect(renamed, "renamed node should exist").not.toBeNull()
      expect(renamed!.id, "ULID preserved across rename").toBe(initialUlid)
      expect(getNodeByPath(db, "alpha.md"), "old path should be gone").toBeNull()
    }))

  test("Step 1 — content rewrite in place: ULID preserved, fs_content_hash updates", () =>
    withTestEnv(async ({ db, repoDir, emitter }) => {
      createMdFile(repoDir, "alpha.md", "# Alpha\n\noriginal\n")
      await sync(db, repoDir, repoDir, emitter)

      const before = getNodeByPath(db, "alpha.md")!
      const beforeUlid = before.id
      const beforeHash = before.fs_content_hash

      // Rewrite content; inode + path stable.
      writeFileSync(join(repoDir, "alpha.md"), "# Alpha\n\nrewritten\n")
      // Bump mtime to force reconcile to notice the change (test runs fast
      // enough that identical millisecond timestamps could hide the rewrite).
      const future = new Date(Date.now() + 1000)
      utimesSync(join(repoDir, "alpha.md"), future, future)

      await sync(db, repoDir, repoDir, emitter)

      const after = getNodeByPath(db, "alpha.md")
      expect(after, "node still present after rewrite").not.toBeNull()
      expect(after!.id, "ULID preserved across content rewrite").toBe(beforeUlid)
      expect(after!.fs_content_hash, "fs_content_hash updated to new content").not.toBe(beforeHash)
      expect(after!.fs_content_hash, "fs_content_hash populated").toBeTruthy()
    }))

  test("Step 1 — inode reuse (mock same inode + different path + content + mtime): tombstone + fresh ULID", () =>
    withTestEnv(async ({ db, repoDir, emitter }) => {
      createMdFile(repoDir, "alpha.md", "# Alpha\n\noriginal body\n")
      await sync(db, repoDir, repoDir, emitter)

      const alpha = getNodeByPath(db, "alpha.md")!
      const inoA = alpha.fs_ino!
      const alphaUlid = alpha.id

      // Delete alpha (real FS) and reconcile — tombstones the DB row.
      unlinkSync(join(repoDir, "alpha.md"))
      await sync(db, repoDir, repoDir, emitter)
      expect(getNodeByPath(db, "alpha.md"), "alpha tombstoned").toBeNull()

      // Create an unrelated file; force its inode to the one alpha had via a
      // custom scanner. Different path, different content — clearly not alpha.
      createMdFile(repoDir, "beta.md", "# Beta\n\nentirely different\n")
      const fakeScanner: DirectoryScanner = (dir) => {
        // Read the real FS scan but override beta.md's inode to inoA.
        const entries = scanDirectory(dir)
        return entries.map((e) => (e.path.endsWith("beta.md") ? { ...e, ino: inoA } : e))
      }

      const ops = reconcileDirectory(db, repoDir, repoDir, undefined, fakeScanner)
      await applyReconcileOps(db, ops, repoDir, emitter)

      const beta = getNodeByPath(db, "beta.md")
      expect(beta, "beta should exist").not.toBeNull()
      expect(beta!.id, "beta should have a fresh ULID, NOT alpha's old one").not.toBe(alphaUlid)
    }))

  test("Step 3 — cross-FS rename (different inode, same content): ULID preserved via hash match", () =>
    withTestEnv(async ({ db, repoDir, emitter }) => {
      createMdFile(repoDir, "alpha.md", "# Alpha\n\nstable content\n")
      await sync(db, repoDir, repoDir, emitter)

      const alpha = getNodeByPath(db, "alpha.md")!
      const initialUlid = alpha.id

      // Simulate a cross-FS rename: delete old, create new at a different
      // path with IDENTICAL content. The new file gets a fresh inode (real FS
      // semantics). Step 3 should match by content hash + same parent.
      unlinkSync(join(repoDir, "alpha.md"))
      createMdFile(repoDir, "alpha-moved.md", "# Alpha\n\nstable content\n")

      // Single reconcile: the scanner sees alpha.md missing + alpha-moved.md
      // present with a new inode. Step 1 inode lookup misses, Step 2 path
      // lookup misses, Step 3 hash lookup should find alpha by content.
      await sync(db, repoDir, repoDir, emitter)

      const moved = getNodeByPath(db, "alpha-moved.md")
      expect(moved, "alpha-moved.md exists").not.toBeNull()
      expect(moved!.id, "ULID preserved via Step 3 hash match").toBe(initialUlid)
      expect(getNodeByPath(db, "alpha.md"), "old path gone").toBeNull()
    }))
})
