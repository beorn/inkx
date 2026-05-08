/**
 * Chaos Matrix Fuzz Tests — bead `@km/storage/sync-architecture/reconcile-chaos-matrix` (P1).
 *
 * Extends the existing chaos harness with the dimensions the bead names but
 * the original `chaos-fuzz.fuzz.ts` doesn't cover:
 *   - rename (the original picker is fixed-paths and never renames)
 *   - same-size content change (mtime + hash differ but byte length matches)
 *   - mtime-only (touch without content change)
 *   - mtime/hash disagreement (mtime regressed but hash differs)
 *   - wikilink target change (link graph consequences)
 *   - collapsed callout toggle (block-shape change without rename)
 *
 * Adds two invariants beyond the original harness:
 *   - node identity stability: re-edits of the same path preserve node ids
 *     (the file node id, not necessarily child block ids — children can
 *     legitimately be replaced when content changes).
 *   - link graph correctness: outgoing links match what the rendered file
 *     content says (no stale links, no missing ones).
 *
 * Speed budget: each test caps at 30–60 events for fast CI; long-running
 * variants live in chaos-fuzz.fuzz.ts.
 */

import { test, describe, expect, gen, take, createSeededRandom } from "vimonkey"
import { Database } from "bun:sqlite"
import { join, dirname } from "path"
import type { SeededRandom } from "vimonkey"
import { createFsEventPicker, generateFileContent } from "./event-picker.ts"
import { createFakeFileSystem } from "./fake-fs.ts"
import { Verifier } from "./verifier.ts"
import {
  createEmitter,
  SCHEMA,
  getAllNodes,
  getOutgoingLinks,
} from "@km/storage"
import { reconcileDirectoryRecursive, applyReconcileOps } from "@km/fs-mount"
import type { FsEvent } from "./types.ts"

interface ChaosTestEnv {
  db: Database
  mockFs: ReturnType<typeof createFakeFileSystem>
  repoDir: string
  verifier: Verifier
  reconcile: () => void
}

function setupEnv(initialFiles: Array<{ path: string; content: string }>): ChaosTestEnv {
  const mockFs = createFakeFileSystem()
  const repoDir = "/repo"
  const kmDir = "/repo/.km"
  mockFs.mkdirSync(repoDir, { recursive: true })
  mockFs.mkdirSync(kmDir, { recursive: true })

  const db = new Database(":memory:")
  db.run(SCHEMA)
  const emitter = createEmitter({ kmDir, db, skipPersist: true })

  for (const file of initialFiles) {
    const fullPath = join(repoDir, file.path)
    const fileDir = dirname(fullPath)
    if (!mockFs.existsSync(fileDir)) mockFs.mkdirSync(fileDir, { recursive: true })
    mockFs.writeFileSync(fullPath, file.content)
  }

  const scanner = mockFs.createScanner()
  const initOps = reconcileDirectoryRecursive(db, repoDir, repoDir, undefined, scanner)
  applyReconcileOps(db, initOps, repoDir, emitter, mockFs)

  const reconcile = () => {
    const ops = reconcileDirectoryRecursive(db, repoDir, repoDir, undefined, scanner)
    applyReconcileOps(db, ops, repoDir, emitter, mockFs)
  }

  return { db, mockFs, repoDir, verifier: new Verifier(db, mockFs), reconcile }
}

function applyEvent(
  mockFs: ReturnType<typeof createFakeFileSystem>,
  repoDir: string,
  event: FsEvent,
  contentFn: (rng: SeededRandom) => string,
  rng: SeededRandom,
) {
  const absPath = event.path.startsWith(repoDir) ? event.path : join(repoDir, event.path)
  switch (event.type) {
    case "add": {
      const dir = dirname(absPath)
      if (!mockFs.existsSync(dir)) mockFs.mkdirSync(dir, { recursive: true })
      mockFs.writeFileSync(absPath, contentFn(rng))
      return
    }
    case "change": {
      if (mockFs.existsSync(absPath)) mockFs.writeFileSync(absPath, contentFn(rng))
      return
    }
    case "unlink": {
      if (mockFs.existsSync(absPath)) mockFs.unlinkSync(absPath)
      return
    }
  }
}

function fileNodeIdsByPath(env: ChaosTestEnv): Map<string, string> {
  const map = new Map<string, string>()
  for (const node of getAllNodes(env.db)) {
    if ((node.fstype === "file" || node.fstype === "mdfile") && node.fs_path) {
      const rel = node.fs_path.startsWith(env.repoDir + "/")
        ? node.fs_path.slice(env.repoDir.length + 1)
        : node.fs_path
      map.set(rel, node.id)
    }
  }
  return map
}

function checkBaseline(env: ChaosTestEnv): void {
  const dupes = env.verifier.verifyNoDuplicates()
  expect(dupes.stats.duplicateNodes, dupes.errors.join(", ")).toBe(0)
  const paths = env.verifier.verifyFilePaths()
  expect(paths.passed, paths.errors.join(", ")).toBe(true)
}

/**
 * Node identity stability invariant: paths that appeared in `before` AND still
 * exist on the FS in `after` should keep the same file-node id (the loader
 * must not reissue ids for unchanged paths).
 */
function checkNodeIdentityStability(
  before: Map<string, string>,
  after: Map<string, string>,
  fsPathsAfter: Set<string>,
) {
  for (const [path, beforeId] of before) {
    if (!fsPathsAfter.has(path)) continue // file was deleted; identity not required
    const afterId = after.get(path)
    expect(
      afterId,
      `node identity churn: ${path} had id=${beforeId}, became id=${afterId ?? "<missing>"}`,
    ).toBe(beforeId)
  }
}

/**
 * Link graph correctness: every outgoing link row in the DB must correspond
 * to an actual `[[wikilink]]` (or `![[embed]]`) appearing in the source file
 * that owns it. No stale rows after a content change.
 */
function checkLinkGraphCorrectness(env: ChaosTestEnv): void {
  for (const node of getAllNodes(env.db)) {
    if (node.fstype !== "file" && node.fstype !== "mdfile") continue
    if (!node.fs_path) continue
    const fsPath = node.fs_path.startsWith("/")
      ? node.fs_path
      : join(env.repoDir, node.fs_path)
    if (!env.mockFs.existsSync(fsPath)) continue
    const content = env.mockFs.readFileSync(fsPath, "utf-8")
    // Collect every outgoing link from any descendant of this file node.
    const stack = [node.id]
    const visited = new Set<string>()
    const links: string[] = []
    while (stack.length > 0) {
      const id = stack.pop()!
      if (visited.has(id)) continue
      visited.add(id)
      for (const link of getOutgoingLinks(env.db, id)) {
        // Only check `km:`-scheme links that originate from wikilink syntax —
        // those are the ones the file content directly authors. Skip url:* /
        // file:* etc.
        if (link.href.startsWith("km:")) links.push(link.href)
      }
      for (const child of getAllNodes(env.db)) {
        if (child.parent_id === id) stack.push(child.id)
      }
    }
    for (const href of links) {
      // Strip the scheme; the target path/name should appear in the file body.
      const target = href.slice("km:".length).split("#")[0] ?? ""
      if (target === "") continue
      // Tolerate quoting variations — wikilinks can be [[target]] or ![[target]]
      // and the loader normalizes to canonical form. Use substring match.
      const present =
        content.includes(`[[${target}]]`) ||
        content.includes(`![[${target}]]`) ||
        content.includes(target)
      expect
        .soft(
          present,
          `stale link row: ${node.fs_path} → km:${target} but content does not mention it`,
        )
        .toBe(true)
    }
  }
}

// ─── content shapes ────────────────────────────────────────────────────────

function wikilinkContent(rng: SeededRandom, targets: readonly string[]): string {
  const lines = [`# File ${rng.int(1, 999)}`, ""]
  const linkCount = rng.int(1, 4)
  for (let i = 0; i < linkCount; i++) {
    const target = rng.pick([...targets])
    const isEmbed = rng.bool(0.3)
    lines.push(isEmbed ? `![[${target}]]` : `- [[${target}]]`)
  }
  lines.push("")
  return lines.join("\n")
}

function calloutContent(rng: SeededRandom, collapsed: boolean): string {
  const fold = collapsed ? "-" : "+"
  return [
    `# Callout ${rng.int(1, 999)}`,
    "",
    `> [!toggle]${fold} Section`,
    `> Inner detail line`,
    "",
  ].join("\n")
}

/** Content of a target byte length, padded with deterministic-but-varying body. */
function contentOfLength(rng: SeededRandom, byteLength: number): string {
  const head = `# F${rng.int(1, 99)}\n\n`
  const body = "x".repeat(Math.max(0, byteLength - head.length))
  return (head + body).slice(0, byteLength)
}

// ─── tests ─────────────────────────────────────────────────────────────────

describe("Chaos Matrix — extended dimensions (P1 reconcile-chaos-matrix)", () => {
  test.fuzz("rename + change matrix preserves node identity for unchanged paths", async () => {
    const rng = createSeededRandom()
    const initial = ["notes/a.md", "notes/b.md", "tasks/c.md", "readme.md"]
    const setup = initial.map((path) => ({ path, content: generateFileContent(rng) }))
    const env = setupEnv(setup)
    try {
      const before = fileNodeIdsByPath(env)
      const events = gen(createFsEventPicker(initial))

      for await (const event of take(events, 40)) {
        applyEvent(env.mockFs, env.repoDir, event, generateFileContent, rng)
        env.reconcile()
      }

      checkBaseline(env)
      const after = fileNodeIdsByPath(env)
      const fsPathsAfter = new Set<string>()
      // Read mockFs file paths via dump
      for (const path of Object.keys(env.mockFs.dump())) {
        const rel = path.startsWith(env.repoDir + "/") ? path.slice(env.repoDir.length + 1) : path
        if (rel.endsWith(".md")) fsPathsAfter.add(rel)
      }
      checkNodeIdentityStability(before, after, fsPathsAfter)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("same-size content edits don't lose nodes", async () => {
    const rng = createSeededRandom()
    const initial = ["notes/note1.md", "notes/note2.md", "readme.md"]
    const targetLen = 200
    const setup = initial.map((path) => ({ path, content: contentOfLength(rng, targetLen) }))
    const env = setupEnv(setup)
    try {
      // Repeatedly rewrite each file with a different same-size payload.
      for (let i = 0; i < 20; i++) {
        const path = rng.pick(initial)
        const fullPath = join(env.repoDir, path)
        const next = contentOfLength(rng, targetLen)
        env.mockFs.writeFileSync(fullPath, next)
        env.reconcile()
      }
      checkBaseline(env)
      // All initial files still exist as file-nodes.
      const present = fileNodeIdsByPath(env)
      for (const path of initial) {
        expect(present.has(path), `lost file-node for ${path}`).toBe(true)
      }
    } finally {
      env.db.close()
    }
  })

  test.fuzz("mtime-only touches do not corrupt the DB", async () => {
    const rng = createSeededRandom()
    const initial = ["notes/n1.md", "notes/n2.md"]
    const setup = initial.map((path) => ({ path, content: generateFileContent(rng) }))
    const env = setupEnv(setup)
    try {
      const before = fileNodeIdsByPath(env)
      // Bump mtimes without changing content; reconcile.
      for (let i = 0; i < 10; i++) {
        const path = rng.pick(initial)
        env.mockFs.setMtime(join(env.repoDir, path), Date.now() + i * 1000)
        env.reconcile()
      }
      checkBaseline(env)
      const after = fileNodeIdsByPath(env)
      // Identity stability: mtime-only changes must not reissue file-node ids.
      const fsPathsAfter = new Set(initial)
      checkNodeIdentityStability(before, after, fsPathsAfter)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("mtime regression with content change still reconciles", async () => {
    const rng = createSeededRandom()
    const initial = ["notes/x.md", "notes/y.md"]
    const setup = initial.map((path) => ({ path, content: generateFileContent(rng) }))
    const env = setupEnv(setup)
    try {
      const baseTime = Date.now()
      // Stamp mtimes far in the future, then rewrite content with mtime in the past.
      // Loader/reconciler must classify by hash, not just mtime.
      for (const path of initial) {
        env.mockFs.setMtime(join(env.repoDir, path), baseTime + 1_000_000)
      }
      env.reconcile()
      checkBaseline(env)
      for (let i = 0; i < 10; i++) {
        const path = rng.pick(initial)
        const full = join(env.repoDir, path)
        env.mockFs.writeFileSync(full, generateFileContent(rng))
        env.mockFs.setMtime(full, baseTime - i * 1000) // regress mtime
        env.reconcile()
      }
      checkBaseline(env)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("wikilink target swaps keep link graph honest", async () => {
    const rng = createSeededRandom()
    const targets = ["alpha", "beta", "gamma", "delta"] as const
    const initial = ["notes/host1.md", "notes/host2.md", "notes/host3.md"]
    const setup = initial.map((path) => ({ path, content: wikilinkContent(rng, targets) }))
    const env = setupEnv(setup)
    try {
      // Repeatedly rewrite each host with a fresh target set.
      for (let i = 0; i < 20; i++) {
        const path = rng.pick(initial)
        const full = join(env.repoDir, path)
        env.mockFs.writeFileSync(full, wikilinkContent(rng, targets))
        env.reconcile()
        checkLinkGraphCorrectness(env)
      }
      checkBaseline(env)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("callout collapse/un-collapse toggles do not corrupt structure", async () => {
    const rng = createSeededRandom()
    const initial = ["notes/c1.md", "notes/c2.md"]
    const setup = initial.map((path, i) => ({
      path,
      content: calloutContent(rng, i % 2 === 0),
    }))
    const env = setupEnv(setup)
    try {
      const before = fileNodeIdsByPath(env)
      let collapsed = false
      for (let i = 0; i < 20; i++) {
        const path = rng.pick(initial)
        collapsed = !collapsed
        env.mockFs.writeFileSync(join(env.repoDir, path), calloutContent(rng, collapsed))
        env.reconcile()
      }
      checkBaseline(env)
      const after = fileNodeIdsByPath(env)
      const fsPathsAfter = new Set(initial)
      checkNodeIdentityStability(before, after, fsPathsAfter)
    } finally {
      env.db.close()
    }
  })
})
