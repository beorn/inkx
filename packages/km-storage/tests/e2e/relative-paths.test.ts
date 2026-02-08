/**
 * Relative fs_path E2E Tests
 *
 * Verifies that all fs_path values in the database are relative to the repo root,
 * that absolute paths are detected and rejected on disk-mode open, and that
 * repos with relative paths are portable (can be moved to a different directory).
 */

import { describe, test, expect, afterEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync, cpSync } from "fs"
import { join, isAbsolute } from "path"
import { Database } from "bun:sqlite"

import { runGenerator } from "@km/core"
import { createRepo, IncompleteDatabase, SCHEMA } from "../../src/index.ts"

const createdDirs: string[] = []

function createTempDir(suffix: string): string {
  const dir = join(
    "/tmp",
    `kmtest-relpath-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  createdDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of createdDirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }
  createdDirs.length = 0
})

/** Set up a minimal repo with markdown files (no .km — memory mode scans files) */
function setupFiles(dir: string): void {
  mkdirSync(join(dir, "Projects"), { recursive: true })
  writeFileSync(join(dir, "@inbox.md"), "# Inbox\n\n- [ ] Buy milk\n- [x] Done task\n")
  writeFileSync(join(dir, "Projects/work.md"), "# Work\n\n- [ ] Ship feature\n")
}

describe("relative fs_path storage", () => {
  test("all fs_path values are relative after loading", () => {
    const dir = createTempDir("rel-store")
    setupFiles(dir)

    // Memory mode scans filesystem and creates nodes
    using repo = runGenerator(createRepo(dir, { loadFiles: true }))

    const nodes = repo.data.getAllNodes()
    expect(nodes.length).toBeGreaterThan(0)

    for (const node of nodes) {
      if (node.fs_path) {
        expect(
          isAbsolute(node.fs_path),
          `fs_path "${node.fs_path}" should be relative (node: ${node.id}, type: ${node.type})`,
        ).toBe(false)
      }
    }
  })

  test("root node has fs_path '.'", () => {
    const dir = createTempDir("rel-root")
    setupFiles(dir)

    using repo = runGenerator(createRepo(dir, { loadFiles: true }))

    const root = repo.getRepoRootNode()
    expect(root).not.toBeNull()
    expect(root!.fs_path).toBe(".")
  })

  test("file nodes have relative fs_path matching filesystem structure", () => {
    const dir = createTempDir("rel-struct")
    setupFiles(dir)

    using repo = runGenerator(createRepo(dir, { loadFiles: true }))

    const nodes = repo.data.getAllNodes()
    const fsPaths = nodes.map((n) => n.fs_path).filter(Boolean).sort()

    expect(fsPaths).toContain(".")
    expect(fsPaths).toContain("@inbox.md")
    expect(fsPaths).toContain("Projects")
    expect(fsPaths).toContain("Projects/work.md")
  })
})

describe("absolute path detection", () => {
  test("throws IncompleteDatabase when disk DB contains absolute fs_path", () => {
    const dir = createTempDir("abs-detect")
    setupFiles(dir)
    mkdirSync(join(dir, ".km"), { recursive: true })

    // Manually create a state.db with absolute paths (simulates pre-migration DB)
    const dbPath = join(dir, ".km/state.db")
    const db = new Database(dbPath)
    db.run(SCHEMA)
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, fs_path, created_at, updated_at, version, data)
       VALUES ('.', 'folder', NULL, 0, '/old/absolute/repo', ${Date.now()}, ${Date.now()}, '1', '{}')`,
    )
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, fs_path, created_at, updated_at, version, data)
       VALUES ('file1', 'file', '.', 0, '/old/absolute/repo/@inbox.md', ${Date.now()}, ${Date.now()}, '1', '{}')`,
    )
    // Write events.jsonl so the DB isn't considered "fresh"
    writeFileSync(join(dir, ".km/events.jsonl"), "")
    db.close()

    // Reopening in disk mode should throw due to absolute paths
    expect(() => {
      runGenerator(createRepo(dir, { loadFiles: true }))
    }).toThrow(IncompleteDatabase)
  })

  test("does not throw when disk DB has only relative paths", () => {
    const dir = createTempDir("rel-ok")
    setupFiles(dir)
    mkdirSync(join(dir, ".km"), { recursive: true })

    // Create a state.db with relative paths
    const dbPath = join(dir, ".km/state.db")
    const db = new Database(dbPath)
    db.run(SCHEMA)
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, fs_path, created_at, updated_at, version, data)
       VALUES ('.', 'folder', NULL, 0, '.', ${Date.now()}, ${Date.now()}, '1', '{}')`,
    )
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, fs_path, created_at, updated_at, version, data)
       VALUES ('file1', 'file', '.', 0, '@inbox.md', ${Date.now()}, ${Date.now()}, '1', '{}')`,
    )
    writeFileSync(join(dir, ".km/events.jsonl"), "")
    db.close()

    // Should open without error
    expect(() => {
      using _repo = runGenerator(createRepo(dir, { loadFiles: true }))
    }).not.toThrow()
  })
})

describe("portable repo", () => {
  test("repo can be copied to a new location and still works", () => {
    const dirA = createTempDir("portable-a")
    setupFiles(dirA)

    // Load files in memory mode at location A
    let nodeCount: number
    {
      using repo = runGenerator(createRepo(dirA, { loadFiles: true }))
      nodeCount = repo.stats.nodeCount
      expect(nodeCount).toBeGreaterThan(0)

      // Verify paths are relative
      for (const n of repo.data.getAllNodes()) {
        if (n.fs_path) expect(isAbsolute(n.fs_path)).toBe(false)
      }
    }

    // Copy entire directory to location B
    const dirB = createTempDir("portable-b")
    rmSync(dirB, { recursive: true, force: true })
    cpSync(dirA, dirB, { recursive: true })

    // Open at location B — memory mode rescans, should find same structure
    using repo = runGenerator(createRepo(dirB, { loadFiles: true }))
    expect(repo.loadErrors).toEqual([])
    expect(repo.stats.nodeCount).toBe(nodeCount)

    // All paths still relative
    for (const node of repo.data.getAllNodes()) {
      if (node.fs_path) {
        expect(
          isAbsolute(node.fs_path),
          `fs_path "${node.fs_path}" should be relative at new location`,
        ).toBe(false)
      }
    }

    // Edit a node — DB update works at new location
    const inboxNode = repo.data.getAllNodes().find((n) => n.fs_path === "@inbox.md")
    expect(inboxNode).toBeDefined()

    repo.updateNode(inboxNode!.id, { content: "# Inbox\n\n- [ ] Updated task\n" })
    const updated = repo.data.getNode(inboxNode!.id)
    expect(updated?.content).toContain("Updated task")
  })
})
