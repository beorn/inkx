/**
 * Reconciliation Cascade — property-style fuzz tests
 *
 * Bead: km-storage.reconciliation-harness
 * Pairs with: km-storage.identity-recovery-cascade (implementation)
 *
 * Randomized versions of the scenarios covered deterministically in
 * `reconcile-cascade.slow.test.ts`. Each fuzz test generates a random
 * sequence of the scenario's canonical mutation shape and asserts the
 * ULID-stability invariant plus tree consistency.
 *
 * Scenarios (see §3 of `hub/km/storage-architecture.md`):
 *
 *   Step 1 — inode primary:
 *     • Same-FS rename with inode preserved (ULID preserved)
 *     • Content rewrite, no rename (ULID preserved)
 *     • Inode reuse after delete (ULID minted fresh)            [gated: skip]
 *
 *   Step 2 — path-of-.name:
 *     • Cross-FS rename with inode reassigned (ULID preserved)  [gated: skip]
 *
 *   Step 3 — content-hash + parent-position composite:
 *     • Post-git restore with identical content (ULID preserved) [gated: skip]
 *
 *   Non-goal edge cases:
 *     • Split-file and merge-file → fresh ULIDs, graceful
 *
 * NOTE on `fs_dev`: not yet on KNode. Cross-FS scenarios are simulated via
 * an inode-override scanner shim.
 */

import { test, describe, expect, gen, take, createSeededRandom } from "vimonkey"
import { Database } from "bun:sqlite"
import { join, dirname } from "path"
import type { Picker, PickerContext } from "vimonkey"

import { createFakeFileSystem } from "./fake-fs.ts"
import { Verifier, snapshotUlidsByPath, verifyUlidStability, verifyUlidFreshness } from "./verifier.ts"
import { createEmitter } from "../../../src/emitter.ts"
import { SCHEMA } from "../../../src/db/schema.ts"
import {
  reconcileDirectoryRecursive,
  applyReconcileOps,
  type DirectoryScanner,
} from "../../../src/watch/reconcile.ts"
import { getAllNodes } from "../../../src/index.ts"
import { generateFileContent } from "./event-picker.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Environment
// ─────────────────────────────────────────────────────────────────────────────

interface FuzzEnv {
  db: Database
  mockFs: ReturnType<typeof createFakeFileSystem>
  repoDir: string
  verifier: Verifier
  reconcile: () => void
  overrideIno: (absPath: string, ino: number | undefined) => void
}

function setupEnv(files: Array<{ path: string; content: string }>): FuzzEnv {
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
    const d = dirname(fullPath)
    if (!mockFs.existsSync(d)) {
      mockFs.mkdirSync(d, { recursive: true })
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

  const initial = reconcileDirectoryRecursive(db, repoDir, repoDir, undefined, scanner)
  applyReconcileOps(db, initial, repoDir, emitter, mockFs)

  const reconcile = () => {
    const ops = reconcileDirectoryRecursive(db, repoDir, repoDir, undefined, scanner)
    applyReconcileOps(db, ops, repoDir, emitter, mockFs)
  }

  const verifier = new Verifier(db, mockFs)
  return {
    db,
    mockFs,
    repoDir,
    verifier,
    reconcile,
    overrideIno: (absPath, ino) => inoOverrides.set(absPath, ino),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Operation shapes + pickers
// ─────────────────────────────────────────────────────────────────────────────

type CascadeOp =
  | { kind: "same_fs_rename"; oldPath: string; newPath: string }
  | { kind: "content_rewrite"; path: string; content: string }
  | { kind: "inode_reuse"; oldPath: string; newPath: string; content: string }
  | { kind: "cross_fs_rename"; oldPath: string; newPath: string }
  | { kind: "git_restore"; path: string; content: string }

const DIR_NAMES = ["notes", "tasks", "docs"] as const
const FILE_STEMS = ["alpha", "beta", "gamma", "delta", "epsilon"] as const

function randomPath(ctx: PickerContext, existing: Set<string>, seed = 0): string {
  for (let i = 0; i < 100; i++) {
    const dir = ctx.random.pick(DIR_NAMES)
    const stem = ctx.random.pick(FILE_STEMS)
    const suffix = ctx.random.bool(0.6) ? `-${ctx.random.int(1, 9999) + seed}` : ""
    const p = `${dir}/${stem}${suffix}.md`
    if (!existing.has(p)) return p
  }
  return `notes/fallback-${seed}-${ctx.random.int(0, 999999)}.md`
}

function createSameFsRenamePicker(files: Set<string>): Picker<CascadeOp> {
  return (ctx: PickerContext): CascadeOp => {
    const oldPath = ctx.random.pick([...files])
    const newPath = randomPath(ctx, files)
    files.delete(oldPath)
    files.add(newPath)
    return { kind: "same_fs_rename", oldPath, newPath }
  }
}

function createContentRewritePicker(files: Set<string>): Picker<CascadeOp> {
  return (ctx: PickerContext): CascadeOp => {
    const path = ctx.random.pick([...files])
    return { kind: "content_rewrite", path, content: generateFileContent(ctx.random) }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Op applicator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply an op robustly — returns `false` when the op references a path
 * that no longer exists (can happen on shrink-replay, where the shrinker
 * synthesizes sequences without re-running picker state-mutation). Callers
 * should track whether an op actually ran before updating their own
 * expectation maps.
 */
function applyOp(env: FuzzEnv, op: CascadeOp): boolean {
  const exists = (rel: string) => env.mockFs.existsSync(join(env.repoDir, rel))

  switch (op.kind) {
    case "same_fs_rename": {
      if (!exists(op.oldPath)) return false
      if (exists(op.newPath)) return false
      const newAbs = join(env.repoDir, op.newPath)
      if (!env.mockFs.existsSync(dirname(newAbs))) {
        env.mockFs.mkdirSync(dirname(newAbs), { recursive: true })
      }
      env.mockFs.renameSync(join(env.repoDir, op.oldPath), newAbs)
      return true
    }
    case "content_rewrite": {
      if (!exists(op.path)) return false
      env.mockFs.writeFileSync(join(env.repoDir, op.path), op.content)
      return true
    }
    case "inode_reuse": {
      if (!exists(op.oldPath)) return false
      if (exists(op.newPath)) return false
      const oldAbs = join(env.repoDir, op.oldPath)
      const oldIno = env.mockFs.statSync(oldAbs).ino
      env.mockFs.unlinkSync(oldAbs)
      env.reconcile()
      const newAbs = join(env.repoDir, op.newPath)
      if (!env.mockFs.existsSync(dirname(newAbs))) {
        env.mockFs.mkdirSync(dirname(newAbs), { recursive: true })
      }
      env.mockFs.writeFileSync(newAbs, op.content)
      env.overrideIno(newAbs, oldIno)
      return true
    }
    case "cross_fs_rename": {
      if (!exists(op.oldPath)) return false
      if (exists(op.newPath)) return false
      const oldAbs = join(env.repoDir, op.oldPath)
      const newAbs = join(env.repoDir, op.newPath)
      const content = env.mockFs.readFileSync(oldAbs, "utf-8")
      env.mockFs.unlinkSync(oldAbs)
      if (!env.mockFs.existsSync(dirname(newAbs))) {
        env.mockFs.mkdirSync(dirname(newAbs), { recursive: true })
      }
      env.mockFs.writeFileSync(newAbs, content)
      return true
    }
    case "git_restore": {
      if (!exists(op.path)) return false
      const abs = join(env.repoDir, op.path)
      env.mockFs.unlinkSync(abs)
      env.reconcile()
      env.mockFs.writeFileSync(abs, op.content)
      return true
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared setup
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_PATHS: readonly string[] = [
  "notes/alpha.md",
  "notes/beta.md",
  "tasks/gamma.md",
  "docs/delta.md",
  "docs/epsilon.md",
] as const

function seedFiles(rng: ReturnType<typeof createSeededRandom>): Array<{ path: string; content: string }> {
  return INITIAL_PATHS.map((p) => ({ path: p, content: generateFileContent(rng) }))
}

function freshInitialPaths(): Set<string> {
  return new Set<string>(INITIAL_PATHS)
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuzz tests
// ─────────────────────────────────────────────────────────────────────────────

// gated by km-storage.identity-recovery-cascade — inode-primary cascade not wired yet.
// Re-enable the describe block once the cascade lands; the fuzz runner already shrinks
// failing cases. Individual `test.fuzz` calls don't have a `.skip` form, so gate at the
// `describe` level instead.
describe.skip("Reconciliation cascade fuzz — Step 1 (inode primary)", () => {
  test.fuzz("same-FS renames preserve ULIDs", async () => {
    const rng = createSeededRandom()
    const env = setupEnv(seedFiles(rng))
    try {
      const liveFiles = freshInitialPaths()
      const events = gen(createSameFsRenamePicker(liveFiles))

      // Accumulate path → ULID for every node we expect to preserve across
      // a chain of renames.
      const cumulativeMapping = new Map<string, string>() // initial path → current path
      const initialSnap = snapshotUlidsByPath(env.db)
      for (const p of [...liveFiles]) cumulativeMapping.set(p, p)

      for await (const op of take(events, 15)) {
        const ok = applyOp(env, op)
        if (!ok) continue
        env.reconcile()

        if (op.kind === "same_fs_rename") {
          // Update any initial paths currently pointing at oldPath.
          for (const [init, cur] of cumulativeMapping) {
            if (cur === op.oldPath) cumulativeMapping.set(init, op.newPath)
          }
        }
      }

      const finalSnap = snapshotUlidsByPath(env.db)
      const stability = verifyUlidStability(initialSnap, finalSnap, cumulativeMapping)
      expect(stability.passed, stability.errors.join("\n")).toBe(true)

      const dupes = env.verifier.verifyNoDuplicates()
      expect(dupes.stats.duplicateNodes, `Dupes: ${dupes.errors.join(", ")}`).toBe(0)
      const paths = env.verifier.verifyFilePaths()
      expect(paths.passed, paths.errors.join("\n")).toBe(true)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("content rewrites preserve ULIDs (no rename)", async () => {
    const rng = createSeededRandom()
    const env = setupEnv(seedFiles(rng))
    try {
      const liveFiles = freshInitialPaths()
      const events = gen(createContentRewritePicker(liveFiles))
      const initialSnap = snapshotUlidsByPath(env.db)

      for await (const op of take(events, 20)) {
        const ok = applyOp(env, op)
        if (!ok) continue
        env.reconcile()
      }

      const finalSnap = snapshotUlidsByPath(env.db)
      const mapping = new Map<string, string>()
      for (const p of liveFiles) mapping.set(p, p)

      const stability = verifyUlidStability(initialSnap, finalSnap, mapping)
      expect(stability.passed, stability.errors.join("\n")).toBe(true)

      const dupes = env.verifier.verifyNoDuplicates()
      expect(dupes.stats.duplicateNodes, `Dupes: ${dupes.errors.join(", ")}`).toBe(0)
    } finally {
      env.db.close()
    }
  })
})

describe("Reconciliation cascade fuzz — Step 1 inode-reuse tombstone", () => {
  // gated by km-storage.identity-recovery-cascade — implementation lands after harness
  test.skip("inode-reuse-after-delete: mints fresh ULID + tombstones old", async () => {
    const rng = createSeededRandom()
    const env = setupEnv(seedFiles(rng))
    try {
      const initialSnap = snapshotUlidsByPath(env.db)
      const liveFiles = freshInitialPaths()

      const expectedFresh = new Map<string, string>()
      let seed = 0
      for (let i = 0; i < 5; i++) {
        const oldPath = rng.pick([...liveFiles])
        const ctx: PickerContext = { random: rng } as PickerContext
        const newPath = randomPath(ctx, liveFiles, seed++)
        liveFiles.delete(oldPath)
        liveFiles.add(newPath)
        applyOp(env, {
          kind: "inode_reuse",
          oldPath,
          newPath,
          content: `# Fresh ${seed}\n\nunrelated body\n`,
        })
        env.reconcile()
        expectedFresh.set(oldPath, newPath)
      }

      const finalSnap = snapshotUlidsByPath(env.db)
      const freshness = verifyUlidFreshness(initialSnap, finalSnap, expectedFresh)
      expect(freshness.passed, freshness.errors.join("\n")).toBe(true)

      // TODO(km-storage.identity-recovery-cascade): production code should
      // tombstone old + mint fresh ULID when inode matches but path AND
      // content hash both differ.
    } finally {
      env.db.close()
    }
  })
})

describe("Reconciliation cascade fuzz — Step 2 (path-of-.name fallback)", () => {
  // gated by km-storage.identity-recovery-cascade — implementation lands after harness
  test.skip("cross-FS rename: new inode, stable name → ULID preserved", async () => {
    const rng = createSeededRandom()
    const env = setupEnv(seedFiles(rng))
    try {
      const initialSnap = snapshotUlidsByPath(env.db)
      const liveFiles = freshInitialPaths()
      const mapping = new Map<string, string>()
      let seed = 0

      for (let i = 0; i < 5; i++) {
        const oldPath = rng.pick([...liveFiles])
        const ctx: PickerContext = { random: rng } as PickerContext
        const newPath = randomPath(ctx, liveFiles, seed++)
        liveFiles.delete(oldPath)
        liveFiles.add(newPath)
        applyOp(env, { kind: "cross_fs_rename", oldPath, newPath })
        env.reconcile()
        mapping.set(oldPath, newPath)
      }

      const finalSnap = snapshotUlidsByPath(env.db)
      const stability = verifyUlidStability(initialSnap, finalSnap, mapping)
      expect(stability.passed, stability.errors.join("\n")).toBe(true)

      // TODO(km-storage.identity-recovery-cascade): Step 2 fallback — look up
      // by (parent path, basename) when inode lookup misses — not yet wired.
    } finally {
      env.db.close()
    }
  })
})

describe("Reconciliation cascade fuzz — Step 3 (hash + parent-position composite)", () => {
  // gated by km-storage.identity-recovery-cascade — implementation lands after harness
  test.skip("git restore: identical content after wipe → ULID preserved", async () => {
    const rng = createSeededRandom()
    const env = setupEnv(seedFiles(rng))
    try {
      const initialSnap = snapshotUlidsByPath(env.db)
      const liveFiles = seedFiles(rng).map((f) => f.path)

      const mapping = new Map<string, string>()
      for (let i = 0; i < 3; i++) {
        const path = rng.pick(liveFiles)
        const snap = env.mockFs.readFileSync(join(env.repoDir, path), "utf-8")
        applyOp(env, { kind: "git_restore", path, content: snap })
        env.reconcile()
        mapping.set(path, path)
      }

      const finalSnap = snapshotUlidsByPath(env.db)
      const stability = verifyUlidStability(initialSnap, finalSnap, mapping)
      expect(stability.passed, stability.errors.join("\n")).toBe(true)

      // TODO(km-storage.identity-recovery-cascade): Step 3 fallback (content
      // hash + parent position) — not yet wired. Currently a delete + fresh
      // create sequence produces a new ULID.
    } finally {
      env.db.close()
    }
  })
})

describe("Reconciliation cascade fuzz — non-goal edges", () => {
  test.fuzz("split + merge sequences keep tree consistent", async () => {
    const rng = createSeededRandom()
    const env = setupEnv(seedFiles(rng))
    try {
      // Split alpha into a/b, merge c/d into combined.
      for (let i = 0; i < 3; i++) {
        const source = `notes/alpha${i > 0 ? i : ""}.md`
        if (env.mockFs.existsSync(join(env.repoDir, source))) {
          env.mockFs.unlinkSync(join(env.repoDir, source))
          env.mockFs.writeFileSync(join(env.repoDir, `notes/split-a${i}.md`), "# A\n")
          env.mockFs.writeFileSync(join(env.repoDir, `notes/split-b${i}.md`), "# B\n")
          env.reconcile()
        }
      }

      const dupes = env.verifier.verifyNoDuplicates()
      expect(dupes.stats.duplicateNodes, `Dupes: ${dupes.errors.join(", ")}`).toBe(0)
      const paths = env.verifier.verifyFilePaths()
      expect(paths.passed, paths.errors.join("\n")).toBe(true)

      // Ensure no "zombie" node remains with an invalid fs_path.
      const fsNodes = getAllNodes(env.db).filter(
        (n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile"),
      )
      for (const n of fsNodes) {
        expect(n.fs_path, `file node ${n.id} missing fs_path`).toBeTruthy()
      }
    } finally {
      env.db.close()
    }
  })
})
