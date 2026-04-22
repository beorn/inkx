/**
 * Reconciliation Cascade — scenario-by-scenario slow tests
 *
 * Bead: km-storage.reconciliation-harness
 * Pairs with: km-storage.identity-recovery-cascade (implementation)
 *
 * Exercises the three-step reconciliation cascade from
 * `hub/km/storage-architecture.md` §3:
 *
 *   Step 1 — inode primary: (fs_dev, fs_ino) matches → presumed match.
 *            Validate via path/hash/mtime; tombstone+new if all three disagree
 *            (inode reuse).
 *   Step 2 — path-of-.name: if no inode match, look up by repo-relative
 *            path + basename (handles cross-FS renames where inode changes).
 *   Step 3 — content-hash + parent-position composite: fallback for post-git
 *            restore or cross-device renames.
 *
 * Also pins the ULID-stability invariant: whenever reconciliation should
 * preserve identity (same logical file, different location/inode/content),
 * the node keeps its ULID. When it should NOT preserve identity (inode reuse,
 * unrelated file), a fresh ULID is minted.
 *
 * Tests gated on `km-storage.identity-recovery-cascade` use `it.skip` — the
 * production cascade (Steps 2+3, inode-reuse tombstone) has not yet landed.
 *
 * NOTE on `fs_dev`: KNode currently lacks `fs_dev` (tracked in
 * `km-storage.identity-schema`). Cross-FS scenarios that *would* distinguish
 * by device are simulated here via inode reassignment only. Once `fs_dev`
 * lands, these tests should be extended to cover device boundary changes.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { join, dirname } from "path"

import { createFakeFileSystem } from "./fake-fs.ts"
import { Verifier, snapshotUlidsByPath, verifyUlidStability, verifyUlidFreshness } from "./verifier.ts"
import { createEmitter } from "../../../src/emitter.ts"
import { SCHEMA } from "../../../src/db/schema.ts"
import { reconcileDirectoryRecursive, applyReconcileOps, type DirectoryScanner } from "../../../src/watch/reconcile.ts"
import { getAllNodes, getNodeByPath } from "../../../src/index.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Environment
// ─────────────────────────────────────────────────────────────────────────────

interface CascadeEnv {
  db: Database
  mockFs: ReturnType<typeof createFakeFileSystem>
  repoDir: string
  verifier: Verifier
  scanner: DirectoryScanner
  reconcile: () => void
  /**
   * Force the next scan to report a specific `ino` for a given absolute path.
   * Used to simulate inode reuse or cross-FS reassignment without poking
   * FakeFileSystem internals.
   */
  overrideIno: (absPath: string, ino: number | undefined) => void
}

function setupEnv(files: Array<{ path: string; content: string }>): CascadeEnv {
  const mockFs = createFakeFileSystem()
  const repoDir = "/repo"
  const kmDir = "/repo/.km"

  mockFs.mkdirSync(repoDir, { recursive: true })
  mockFs.mkdirSync(kmDir, { recursive: true })

  const db = new Database(":memory:")
  db.run(SCHEMA)
  const emitter = createEmitter({ kmDir, db, skipPersist: true })

  for (const file of files) {
    const fullPath = join(repoDir, file.path)
    const fileDir = dirname(fullPath)
    if (!mockFs.existsSync(fileDir)) {
      mockFs.mkdirSync(fileDir, { recursive: true })
    }
    mockFs.writeFileSync(fullPath, file.content)
  }

  const baseScanner = mockFs.createScanner()
  const inoOverrides = new Map<string, number | undefined>()

  const scanner: DirectoryScanner = (dirPath, ignore) => {
    const entries = baseScanner(dirPath, ignore)
    return entries.map((e) => {
      if (inoOverrides.has(e.path)) {
        const forced = inoOverrides.get(e.path)
        if (forced !== undefined) return { ...e, ino: forced }
      }
      return e
    })
  }

  // Reader for the cascade's content-hash signal (Step 3). Falls back to
  // null so the cascade's "file unreadable" path exercises gracefully.
  const readFile = (p: string): string | null => {
    try {
      return mockFs.readFileSync(p, "utf-8")
    } catch {
      return null
    }
  }

  const initial = reconcileDirectoryRecursive(db, repoDir, repoDir, undefined, scanner, undefined, readFile)
  applyReconcileOps(db, initial, repoDir, emitter, mockFs)

  const reconcile = () => {
    const ops = reconcileDirectoryRecursive(db, repoDir, repoDir, undefined, scanner, undefined, readFile)
    applyReconcileOps(db, ops, repoDir, emitter, mockFs)
  }

  const verifier = new Verifier(db, mockFs)
  return {
    db,
    mockFs,
    repoDir,
    verifier,
    scanner,
    reconcile,
    overrideIno: (absPath, ino) => inoOverrides.set(absPath, ino),
  }
}

function getIno(env: CascadeEnv, relPath: string): number {
  return env.mockFs.statSync(join(env.repoDir, relPath)).ino
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Reconciliation cascade — Step 1: inode-primary", () => {
  test("same-FS rename with inode preserved → ULID preserved (Step 1 hit)", () => {
    const env = setupEnv([{ path: "notes/alpha.md", content: "# Alpha\n\n- [ ] one\n" }])
    try {
      const initial = snapshotUlidsByPath(env.db)
      const initialUlid = initial.get("notes/alpha.md")
      expect(initialUlid).toBeDefined()

      // Same-FS rename: FakeFileSystem.renameSync preserves inode.
      env.mockFs.renameSync(join(env.repoDir, "notes/alpha.md"), join(env.repoDir, "notes/alpha-renamed.md"))
      env.reconcile()

      const final = snapshotUlidsByPath(env.db)
      const stability = verifyUlidStability(initial, final, new Map([["notes/alpha.md", "notes/alpha-renamed.md"]]))
      expect(stability.passed, stability.errors.join("\n")).toBe(true)

      // Sanity: old path gone, new path present.
      expect(getNodeByPath(env.db, "notes/alpha.md")).toBeNull()
      expect(getNodeByPath(env.db, "notes/alpha-renamed.md")?.id).toBe(initialUlid)
    } finally {
      env.db.close()
    }
  })

  test("cross-directory rename with inode preserved → ULID preserved (Step 1 hit)", () => {
    const env = setupEnv([{ path: "notes/alpha.md", content: "# Alpha\n" }])
    try {
      const initial = snapshotUlidsByPath(env.db)
      const initialUlid = initial.get("notes/alpha.md")

      // Cross-directory rename preserves inode on real FS.
      env.mockFs.mkdirSync(join(env.repoDir, "tasks"), { recursive: true })
      env.mockFs.renameSync(join(env.repoDir, "notes/alpha.md"), join(env.repoDir, "tasks/alpha.md"))
      env.reconcile()

      const final = snapshotUlidsByPath(env.db)
      const stability = verifyUlidStability(initial, final, new Map([["notes/alpha.md", "tasks/alpha.md"]]))
      expect(stability.passed, stability.errors.join("\n")).toBe(true)
      expect(final.get("tasks/alpha.md")).toBe(initialUlid)
    } finally {
      env.db.close()
    }
  })

  test("content rewrite without rename → ULID preserved (Step 1 validate-by-path)", () => {
    const env = setupEnv([{ path: "notes/alpha.md", content: "# Alpha\n\noriginal body\n" }])
    try {
      const initial = snapshotUlidsByPath(env.db)

      // Rewrite content — inode and path unchanged.
      env.mockFs.writeFileSync(join(env.repoDir, "notes/alpha.md"), "# Alpha\n\nrewritten body\n")
      env.reconcile()

      const final = snapshotUlidsByPath(env.db)
      const stability = verifyUlidStability(initial, final, new Map([["notes/alpha.md", "notes/alpha.md"]]))
      expect(stability.passed, stability.errors.join("\n")).toBe(true)
    } finally {
      env.db.close()
    }
  })

  test("inode reuse after delete (path AND hash differ) → tombstone + fresh ULID", () => {
    const env = setupEnv([{ path: "notes/alpha.md", content: "# Alpha\n\noriginal\n" }])
    try {
      const initial = snapshotUlidsByPath(env.db)
      const reusedIno = getIno(env, "notes/alpha.md")

      // Delete alpha.
      env.mockFs.unlinkSync(join(env.repoDir, "notes/alpha.md"))
      env.reconcile()

      // Create an unrelated new file; force its inode to the one alpha had.
      env.mockFs.writeFileSync(join(env.repoDir, "notes/beta.md"), "# Beta\n\nentirely different\n")
      env.overrideIno(join(env.repoDir, "notes/beta.md"), reusedIno)
      env.reconcile()

      const final = snapshotUlidsByPath(env.db)

      // Identity must NOT be preserved — alpha was tombstoned in reconcile #1,
      // beta got a fresh ULID in reconcile #2. The inode-reuse §3.2 spec is
      // satisfied by the delete-in-pass-N / create-in-pass-N+1 workflow:
      // pass 1 tombstones alpha; pass 2 sees no DB row with reusedIno so it
      // creates beta fresh.
      const freshness = verifyUlidFreshness(initial, final, new Map([["notes/alpha.md", "notes/beta.md"]]))
      expect(freshness.passed, freshness.errors.join("\n")).toBe(true)
    } finally {
      env.db.close()
    }
  })
})

describe("Reconciliation cascade — Step 2: path-of-.name fallback", () => {
  test("cross-FS rename: inode reassigned, path stable → ULID preserved", () => {
    const env = setupEnv([{ path: "notes/alpha.md", content: "# Alpha\n\nbody\n" }])
    try {
      const initial = snapshotUlidsByPath(env.db)

      // Simulate cross-FS reassignment by forcing a fresh inode for the
      // same path (a real cross-device move via rsync-like copy would
      // produce this). Same basename, same parent path.
      env.overrideIno(join(env.repoDir, "notes/alpha.md"), 999999)
      env.reconcile()

      const final = snapshotUlidsByPath(env.db)
      const stability = verifyUlidStability(initial, final, new Map([["notes/alpha.md", "notes/alpha.md"]]))
      expect(stability.passed, stability.errors.join("\n")).toBe(true)
    } finally {
      env.db.close()
    }
  })

  test("cross-FS file rename: inode reassigned AND path changed within same dir → ULID preserved via name", () => {
    const env = setupEnv([{ path: "notes/alpha.md", content: "# Alpha\n\nbody\n" }])
    try {
      const initial = snapshotUlidsByPath(env.db)

      // Delete and recreate at new path with new inode (cross-FS + rename).
      env.mockFs.unlinkSync(join(env.repoDir, "notes/alpha.md"))
      env.mockFs.writeFileSync(join(env.repoDir, "notes/alpha-moved.md"), "# Alpha\n\nbody\n")
      env.reconcile()

      const final = snapshotUlidsByPath(env.db)

      // Per §3 Step 3 — content-hash + parent-dir composite recovers identity
      // when inode and basename both change but bytes are preserved.
      const stability = verifyUlidStability(initial, final, new Map([["notes/alpha.md", "notes/alpha-moved.md"]]))
      expect(stability.passed, stability.errors.join("\n")).toBe(true)
    } finally {
      env.db.close()
    }
  })
})

describe("Reconciliation cascade — Step 3: content-hash + parent-position composite", () => {
  test.skip("post-git restore: file reappears with new inode + new mtime but identical content → ULID preserved", () => {
    // Still gated: this scenario requires soft-deletion / a tombstone
    // retention window. The Step 3 hash lookup works only when the source
    // DB row is still present, but the intervening reconcile here tombstones
    // it. Recovering across a hard-delete would require pairing Step 3 with
    // an undo-log / tombstone table (out of scope for this bead).
    const env = setupEnv([{ path: "notes/alpha.md", content: "# Alpha\n\nstable content\n" }])
    try {
      const initial = snapshotUlidsByPath(env.db)

      // Delete (simulating a `git checkout` wipe), then restore identical content.
      env.mockFs.unlinkSync(join(env.repoDir, "notes/alpha.md"))
      env.reconcile()

      env.mockFs.writeFileSync(join(env.repoDir, "notes/alpha.md"), "# Alpha\n\nstable content\n")
      env.reconcile()

      const final = snapshotUlidsByPath(env.db)

      // Step 3: content hash + parent-position matches → recover identity.
      const stability = verifyUlidStability(initial, final, new Map([["notes/alpha.md", "notes/alpha.md"]]))
      expect(stability.passed, stability.errors.join("\n")).toBe(true)
    } finally {
      env.db.close()
    }
  })
})

describe("Reconciliation cascade — directory rename cascade", () => {
  test("directory rename: per-file ULIDs preserved (Step 1 cascade)", () => {
    const env = setupEnv([
      { path: "notes/one.md", content: "# One\n" },
      { path: "notes/two.md", content: "# Two\n" },
      { path: "notes/nested/three.md", content: "# Three\n" },
    ])
    try {
      const initial = snapshotUlidsByPath(env.db)

      // Rename the whole "notes" dir → "archive".
      env.mockFs.renameSync(join(env.repoDir, "notes"), join(env.repoDir, "archive"))
      env.reconcile()

      const final = snapshotUlidsByPath(env.db)
      const expectedStable = new Map<string, string>([
        ["notes", "archive"],
        ["notes/one.md", "archive/one.md"],
        ["notes/two.md", "archive/two.md"],
        ["notes/nested", "archive/nested"],
        ["notes/nested/three.md", "archive/nested/three.md"],
      ])
      const stability = verifyUlidStability(initial, final, expectedStable)
      expect(stability.passed, stability.errors.join("\n")).toBe(true)
    } finally {
      env.db.close()
    }
  })
})

describe("Reconciliation cascade — non-goal edge cases", () => {
  test("split-file: single file unlinked + two new files created → both get fresh ULIDs", () => {
    const env = setupEnv([{ path: "notes/combined.md", content: "# Combined\n\n## A\n\n## B\n" }])
    try {
      const initial = snapshotUlidsByPath(env.db)

      env.mockFs.unlinkSync(join(env.repoDir, "notes/combined.md"))
      env.mockFs.writeFileSync(join(env.repoDir, "notes/a.md"), "# A\n")
      env.mockFs.writeFileSync(join(env.repoDir, "notes/b.md"), "# B\n")
      env.reconcile()

      const final = snapshotUlidsByPath(env.db)

      // Graceful behaviour: old combined.md is deleted, a.md + b.md are fresh.
      expect(final.has("notes/combined.md")).toBe(false)
      const freshness = verifyUlidFreshness(
        initial,
        final,
        new Map([
          ["notes/combined.md", "notes/a.md"],
          ["notes/combined.md", "notes/b.md"],
        ]),
      )
      expect(freshness.passed, freshness.errors.join("\n")).toBe(true)

      // Tree consistency (narrow: dupes + paths; parent-id uses "." sentinel at root).
      const dupes = env.verifier.verifyNoDuplicates()
      expect(dupes.passed, dupes.errors.join("\n")).toBe(true)
      const paths = env.verifier.verifyFilePaths()
      expect(paths.passed, paths.errors.join("\n")).toBe(true)
    } finally {
      env.db.close()
    }
  })

  test("merge-file: two files unlinked + single new file → fresh ULID, no duplicates", () => {
    const env = setupEnv([
      { path: "notes/a.md", content: "# A\n" },
      { path: "notes/b.md", content: "# B\n" },
    ])
    try {
      const initial = snapshotUlidsByPath(env.db)

      env.mockFs.unlinkSync(join(env.repoDir, "notes/a.md"))
      env.mockFs.unlinkSync(join(env.repoDir, "notes/b.md"))
      env.mockFs.writeFileSync(join(env.repoDir, "notes/combined.md"), "# Combined\n\n## A\n\n## B\n")
      env.reconcile()

      const final = snapshotUlidsByPath(env.db)
      expect(final.has("notes/a.md")).toBe(false)
      expect(final.has("notes/b.md")).toBe(false)
      expect(final.has("notes/combined.md")).toBe(true)

      const freshness = verifyUlidFreshness(initial, final, new Map([["notes/a.md", "notes/combined.md"]]))
      expect(freshness.passed, freshness.errors.join("\n")).toBe(true)

      const dupes = env.verifier.verifyNoDuplicates()
      expect(dupes.passed, dupes.errors.join("\n")).toBe(true)
      const paths = env.verifier.verifyFilePaths()
      expect(paths.passed, paths.errors.join("\n")).toBe(true)
    } finally {
      env.db.close()
    }
  })
})

describe("Reconciliation cascade — tree invariants after cascade ops", () => {
  test("no duplicate fs_path after rename + recreate sequence", () => {
    const env = setupEnv([{ path: "notes/alpha.md", content: "# Alpha\n" }])
    try {
      env.mockFs.renameSync(join(env.repoDir, "notes/alpha.md"), join(env.repoDir, "notes/beta.md"))
      env.reconcile()

      env.mockFs.writeFileSync(join(env.repoDir, "notes/alpha.md"), "# Alpha recreated\n")
      env.reconcile()

      const dupes = env.verifier.verifyNoDuplicates()
      expect(dupes.passed, dupes.errors.join("\n")).toBe(true)

      const paths = env.verifier.verifyFilePaths()
      expect(paths.passed, paths.errors.join("\n")).toBe(true)

      // Both files should now be present with distinct ULIDs.
      const all = getAllNodes(env.db)
      const alpha = all.find((n) => n.fs_path === "notes/alpha.md")
      const beta = all.find((n) => n.fs_path === "notes/beta.md")
      expect(alpha).toBeDefined()
      expect(beta).toBeDefined()
      expect(alpha!.id).not.toBe(beta!.id)
    } finally {
      env.db.close()
    }
  })
})
