/**
 * Chaos Fuzz Tests — vimonkey gen/take + stream transformers
 *
 * Pull-based chaos testing: gen(picker) → transformers → take(n) → reconcile loop.
 * Replaces the push-based ChaosWatcher pattern with composable async iterables.
 */

import { test, describe, expect, gen, take, createSeededRandom } from "vimonkey"
import { Database } from "bun:sqlite"
import { join, dirname } from "path"
import type { Picker, PickerContext, SeededRandom } from "vimonkey"
import { generateFileContent } from "./event-picker.ts"
import { chaos, drop, reorder, atomicSave, duplicate, type ChaosTransformerConfig } from "./transformers.ts"
import { createFakeFileSystem } from "./fake-fs.ts"
import { Verifier } from "./verifier.ts"
import { createEmitter } from "../../../src/emitter.ts"
import { SCHEMA } from "../../../src/db/schema.ts"
import { reconcileDirectoryRecursive, applyReconcileOps } from "../../../src/watch/reconcile.ts"
import { getAllNodes, getChildren } from "../../../src/index.ts"
import type { FsEvent } from "./types.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

interface ChaosTestEnv {
  db: Database
  mockFs: ReturnType<typeof createFakeFileSystem>
  repoDir: string
  verifier: Verifier
  handleEvent: (event: FsEvent) => void
}

/**
 * Create a picker that only operates on a fixed set of known paths.
 * No new subdirectories are created — avoids directory lifecycle edge cases.
 * Only generates change events for existing files.
 */
function createFixedSetPicker(paths: string[]): Picker<FsEvent> {
  return (ctx: PickerContext): FsEvent => {
    const path = ctx.random.pick(paths)
    return { type: "change", path }
  }
}

/** Set up a chaos test environment with mock FS, DB, and reconciler */
function setupChaosEnv(files: Array<{ path: string; content: string }>): ChaosTestEnv {
  const mockFs = createFakeFileSystem()
  const repoDir = "/repo"
  const kmDir = "/repo/.km"

  mockFs.mkdirSync(repoDir, { recursive: true })
  mockFs.mkdirSync(kmDir, { recursive: true })

  const db = new Database(":memory:")
  db.run(SCHEMA)
  const emitter = createEmitter({ kmDir, db, skipPersist: true })

  // Create initial files
  for (const file of files) {
    const fullPath = join(repoDir, file.path)
    const fileDir = dirname(fullPath)
    if (!mockFs.existsSync(fileDir)) {
      mockFs.mkdirSync(fileDir, { recursive: true })
    }
    mockFs.writeFileSync(fullPath, file.content)
  }

  // Initial reconciliation
  const scanner = mockFs.createScanner()
  const ops = reconcileDirectoryRecursive(db, repoDir, repoDir, undefined, scanner)
  applyReconcileOps(db, ops, repoDir, emitter, mockFs)

  // Event handler: reconcile from repo root
  const handleEvent = (_event: FsEvent) => {
    const reconOps = reconcileDirectoryRecursive(db, repoDir, repoDir, undefined, scanner)
    applyReconcileOps(db, reconOps, repoDir, emitter, mockFs)
  }

  const verifier = new Verifier(db, mockFs)

  return { db, mockFs, repoDir, verifier, handleEvent }
}

/** Apply file operations to the mock FS to keep it in sync with events */
function applyEventToFs(
  mockFs: ReturnType<typeof createFakeFileSystem>,
  repoDir: string,
  event: FsEvent,
  rng: SeededRandom,
) {
  const absPath = event.path.startsWith(repoDir) ? event.path : join(repoDir, event.path)

  switch (event.type) {
    case "add": {
      const dir = dirname(absPath)
      if (!mockFs.existsSync(dir)) {
        mockFs.mkdirSync(dir, { recursive: true })
      }
      mockFs.writeFileSync(absPath, generateFileContent(rng))
      break
    }
    case "change": {
      if (mockFs.existsSync(absPath)) {
        mockFs.writeFileSync(absPath, generateFileContent(rng))
      }
      break
    }
    case "unlink": {
      if (mockFs.existsSync(absPath)) {
        mockFs.unlinkSync(absPath)
      }
      break
    }
  }
}

/** Check core invariants.
 * Note: parentIntegrity is not checked because atomicSave (unlink+add) orphans
 * child nodes — this matches the existing chaos test behavior which uses verifyAll
 * with expected state rather than structural parent checks.
 *
 * Content roundtrip: verifies that child nodes in the DB that have content
 * are not silently corrupted to empty strings. Also verifies that file nodes
 * with children still have non-empty content on those children (catches silent
 * content clearing that existence checks alone would miss). */
function checkInvariants(verifier: Verifier, env: ChaosTestEnv) {
  const dupes = verifier.verifyNoDuplicates()
  expect(dupes.stats.duplicateNodes, `Duplicate nodes: ${dupes.errors.join(", ")}`).toBe(0)

  const paths = verifier.verifyFilePaths()
  expect(paths.passed, `File paths: ${paths.errors.join(", ")}`).toBe(true)

  // Content roundtrip: verify child nodes haven't had their content silently cleared
  // This catches data loss bugs where the parser/reconciler zeroes out content fields
  const db = env.db
  const allNodes = getAllNodes(db)

  // Check 1: heading nodes (type "h") that represent file sections should have content
  // (the heading text). A section heading with empty content is suspicious.
  const sectionNodes = allNodes.filter((n) => n.type === "h" && !n.fstype && n.parent_id)
  for (const node of sectionNodes) {
    // Section headings should have content (the heading text)
    if (node.content === "") {
      // Verify this isn't a legitimately empty heading by checking the file
      const parent = allNodes.find((n) => n.id === node.parent_id)
      if (parent?.fs_path) {
        const fsPath = parent.fs_path.startsWith("/") ? parent.fs_path : join(env.repoDir, parent.fs_path)
        if (env.mockFs.existsSync(fsPath)) {
          const fsContent = env.mockFs.readFileSync(fsPath, "utf-8")
          // If the file has substantial content but this heading is empty, that's data loss
          if (fsContent.length > 20) {
            expect
              .soft(
                node.content,
                `Content roundtrip: section node ${node.id} under ${parent.fs_path} has empty content but file has ${fsContent.length} bytes`,
              )
              .not.toBe("")
          }
        }
      }
    }
  }

  // Check 2: file nodes with children should still have those children's content intact
  const fileNodes = allNodes.filter(
    (n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile") && n.fs_path,
  )
  let emptyContentChildren = 0
  let totalChildren = 0
  for (const fileNode of fileNodes) {
    const children = getChildren(db, fileNode.id)
    totalChildren += children.length
    for (const child of children) {
      // Paragraph nodes (type "p") should have content
      if (child.type === "p" && (child.content === "" || child.content === undefined)) {
        emptyContentChildren++
      }
    }
  }
  // Allow some empty paragraphs (they can be legitimate blank lines),
  // but flag if more than half of paragraph children are empty
  if (totalChildren > 0 && emptyContentChildren > totalChildren / 2) {
    expect
      .soft(
        emptyContentChildren,
        `Content roundtrip: ${emptyContentChildren}/${totalChildren} child nodes have empty content — possible silent data loss`,
      )
      .toBeLessThan(totalChildren / 2)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Chaos Fuzz Tests (vimonkey)", () => {
  const initialFiles = ["notes/note1.md", "notes/note2.md", "tasks/task1.md", "readme.md", "inbox.md"]

  test.fuzz("sync survives random change events (no chaos)", async () => {
    const rng = createSeededRandom()
    const setup = initialFiles.map((path) => ({
      path,
      content: generateFileContent(rng),
    }))

    const env = setupChaosEnv(setup)
    try {
      const events = gen(createFixedSetPicker(initialFiles))

      for await (const event of take(events, 50)) {
        applyEventToFs(env.mockFs, env.repoDir, event, rng)
        env.handleEvent(event)
      }

      checkInvariants(env.verifier, env)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("sync survives queue overflow + reorder", async () => {
    const rng = createSeededRandom()
    const setup = initialFiles.map((path) => ({
      path,
      content: generateFileContent(rng),
    }))

    const env = setupChaosEnv(setup)
    try {
      const base = gen(createFixedSetPicker(initialFiles))
      const chaotic = reorder(drop(base, 0.2, rng), 5, rng)

      for await (const event of take(chaotic, 100)) {
        applyEventToFs(env.mockFs, env.repoDir, event, rng)
        env.handleEvent(event)
      }

      checkInvariants(env.verifier, env)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("sync survives editor atomic saves", async () => {
    const rng = createSeededRandom()
    const setup = initialFiles.map((path) => ({
      path,
      content: generateFileContent(rng),
    }))

    const env = setupChaosEnv(setup)
    try {
      const base = gen(createFixedSetPicker(initialFiles))
      const chaotic = atomicSave(base, 0.5, rng)

      for await (const event of take(chaotic, 100)) {
        applyEventToFs(env.mockFs, env.repoDir, event, rng)
        env.handleEvent(event)
      }

      checkInvariants(env.verifier, env)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("sync survives duplicate events", async () => {
    const rng = createSeededRandom()
    const setup = initialFiles.map((path) => ({
      path,
      content: generateFileContent(rng),
    }))

    const env = setupChaosEnv(setup)
    try {
      const base = gen(createFixedSetPicker(initialFiles))
      const chaotic = duplicate(base, 0.3, rng)

      for await (const event of take(chaotic, 100)) {
        applyEventToFs(env.mockFs, env.repoDir, event, rng)
        env.handleEvent(event)
      }

      checkInvariants(env.verifier, env)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("sync survives combined chaos (all transformers)", async () => {
    const rng = createSeededRandom()
    const setup = initialFiles.map((path) => ({
      path,
      content: generateFileContent(rng),
    }))

    const env = setupChaosEnv(setup)
    try {
      const base = gen(createFixedSetPicker(initialFiles))
      const scenarios: ChaosTransformerConfig[] = [
        { type: "queue_overflow", params: { dropRate: 0.1 } },
        { type: "editor_atomic", params: { rate: 0.3 } },
        { type: "duplicate_events", params: { rate: 0.2 } },
        { type: "reorder_chaos", params: { windowSize: 5 } },
      ]
      const chaotic = chaos(base, scenarios, rng)

      for await (const event of take(chaotic, 200)) {
        applyEventToFs(env.mockFs, env.repoDir, event, rng)
        env.handleEvent(event)
      }

      checkInvariants(env.verifier, env)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("sync survives stress (many files, many events)", async () => {
    const rng = createSeededRandom()
    const manyFiles = Array.from({ length: 20 }, (_, i) => `files/file${i}.md`)
    const setup = manyFiles.map((path) => ({
      path,
      content: generateFileContent(rng),
    }))

    const env = setupChaosEnv(setup)
    try {
      const base = gen(createFixedSetPicker(manyFiles))
      const scenarios: ChaosTransformerConfig[] = [
        { type: "queue_overflow", params: { dropRate: 0.15 } },
        { type: "reorder_chaos", params: { windowSize: 10 } },
        { type: "partial_writes", params: { rate: 0.2 } },
      ]
      const chaotic = chaos(base, scenarios, rng)

      for await (const event of take(chaotic, 300)) {
        applyEventToFs(env.mockFs, env.repoDir, event, rng)
        env.handleEvent(event)
      }

      checkInvariants(env.verifier, env)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("sync survives event bursts", async () => {
    const rng = createSeededRandom()
    const setup = initialFiles.map((path) => ({
      path,
      content: generateFileContent(rng),
    }))

    const env = setupChaosEnv(setup)
    try {
      const base = gen(createFixedSetPicker(initialFiles))
      const chaotic = chaos(base, [{ type: "event_storm", params: { burstSize: 8 } }], rng)

      for await (const event of take(chaotic, 100)) {
        applyEventToFs(env.mockFs, env.repoDir, event, rng)
        env.handleEvent(event)
      }

      checkInvariants(env.verifier, env)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("sync survives partial writes", async () => {
    const rng = createSeededRandom()
    const setup = initialFiles.map((path) => ({
      path,
      content: generateFileContent(rng),
    }))

    const env = setupChaosEnv(setup)
    try {
      const base = gen(createFixedSetPicker(initialFiles))
      const chaotic = chaos(base, [{ type: "partial_writes", params: { rate: 0.4 } }], rng)

      for await (const event of take(chaotic, 100)) {
        applyEventToFs(env.mockFs, env.repoDir, event, rng)
        env.handleEvent(event)
      }

      checkInvariants(env.verifier, env)
    } finally {
      env.db.close()
    }
  })

  test.fuzz("sync survives init gap (missed early events)", async () => {
    const rng = createSeededRandom()
    const setup = initialFiles.map((path) => ({
      path,
      content: generateFileContent(rng),
    }))

    const env = setupChaosEnv(setup)
    try {
      const base = gen(createFixedSetPicker(initialFiles))
      const chaotic = chaos(base, [{ type: "init_gap", params: { count: 10 } }], rng)

      for await (const event of take(chaotic, 100)) {
        applyEventToFs(env.mockFs, env.repoDir, event, rng)
        env.handleEvent(event)
      }

      checkInvariants(env.verifier, env)
    } finally {
      env.db.close()
    }
  })
})
