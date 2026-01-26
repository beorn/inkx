/**
 * Tests for Repo domain object
 *
 * Tests the composed domain object that combines DataStore + FileTree + Config.
 * See: docs/adr/002-domain-objects-refactor.md
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs"
import { join } from "path"

import { runGenerator } from "@km/core"
import {
  createRepo,
  createBareRepo,
  createTestRepo,
  createMemDataStore,
  type Repo,
} from "../src/index.ts"

// =============================================================================
// Test Helpers
// =============================================================================

function createTempDir(): string {
  const dir = join("/tmp", `km-repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

// =============================================================================
// createTestRepo Tests
// =============================================================================

describe("createTestRepo", () => {
  test("creates in-memory repo", () => {
    using repo = createTestRepo()

    expect(repo.data).toBeDefined()
    expect(repo.files).toBeNull() // Bare repo - no files
    expect(repo.config).toBeDefined()
  })

  test("supports basic node operations", () => {
    using repo = createTestRepo()

    const id = repo.data.addNode(null, { type: "task", content: "Test task" })
    const node = repo.data.getNode(id)

    expect(node).toBeDefined()
    expect(node?.content).toBe("Test task")
    expect(node?.type).toBe("task")
  })

  test("supports query operations", () => {
    using repo = createTestRepo()

    repo.data.addNode(null, { type: "task", content: "First task" })
    repo.data.addNode(null, { type: "task", content: "Second task" })

    const allNodes = repo.data.getAllNodes()
    expect(allNodes.length).toBe(2)
  })

  test("throws on sync (bare repo)", async () => {
    using repo = createTestRepo()

    expect(repo.sync()).rejects.toThrow("bare repo")
  })

  test("throws on watch (bare repo)", () => {
    using repo = createTestRepo()

    expect(() => repo.watch()).toThrow("bare repo")
  })

  test("is disposable", () => {
    const repo = createTestRepo()
    repo.close()

    expect(() => repo.data).toThrow("closed")
  })
})

// =============================================================================
// createBareRepo Tests
// =============================================================================

describe("createBareRepo", () => {
  test("wraps existing DataStore", () => {
    const data = createMemDataStore()
    using repo = createBareRepo(data)

    expect(repo.data).toBe(data)
    expect(repo.files).toBeNull()
  })

  test("preserves DataStore state", () => {
    const data = createMemDataStore()
    const id = data.addNode(null, { type: "task", content: "Pre-existing" })

    using repo = createBareRepo(data)
    const node = repo.data.getNode(id)

    expect(node?.content).toBe("Pre-existing")
  })

  test("mutations affect wrapped DataStore", () => {
    const data = createMemDataStore()
    using repo = createBareRepo(data)

    const id = repo.data.addNode(null, { type: "task", content: "New task" })

    // Verify via original data store
    const node = data.getNode(id)
    expect(node?.content).toBe("New task")
  })

  test("close does not close wrapped DataStore", () => {
    const data = createMemDataStore()
    const repo = createBareRepo(data)
    repo.close()

    // Wrapped store should still work (caller manages lifecycle)
    const id = data.addNode(null, { type: "task", content: "After close" })
    expect(data.getNode(id)?.content).toBe("After close")

    data.close()
  })
})

// =============================================================================
// createRepo Tests (Full Repo with Files)
// =============================================================================

describe("createRepo", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  test("creates repo with DataStore and FileTree", () => {
    using repo = runGenerator(createRepo(tempDir))

    expect(repo.data).toBeDefined()
    expect(repo.files).toBeDefined()
    expect(repo.files?.root).toBe(tempDir)
  })

  test("uses memory mode without .km directory", () => {
    using repo = runGenerator(createRepo(tempDir))

    // No .km dir = memory mode
    const id = repo.data.addNode(null, { type: "task", content: "Memory task" })
    expect(repo.data.getNode(id)).toBeDefined()
  })

  test("uses disk mode with .km directory", () => {
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    using repo = runGenerator(createRepo(tempDir))

    const id = repo.data.addNode(null, { type: "task", content: "Disk task" })
    expect(repo.data.getNode(id)).toBeDefined()

    // Verify database file was created
    expect(existsSync(join(kmDir, "state.db"))).toBe(true)
  })

  test("forceMemory option overrides disk mode", () => {
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    using repo = runGenerator(createRepo(tempDir, { forceMemory: true }))

    // Should work even with .km dir present
    const id = repo.data.addNode(null, { type: "task", content: "Forced memory" })
    expect(repo.data.getNode(id)).toBeDefined()
  })

  test("FileTree can read/write files", () => {
    using repo = runGenerator(createRepo(tempDir))

    repo.files!.write("test.md", "# Test\n- [ ] Task 1")

    const content = repo.files!.read("test.md")
    expect(content).toBe("# Test\n- [ ] Task 1")
  })

  test("sync returns empty result (not yet implemented)", async () => {
    using repo = runGenerator(createRepo(tempDir))

    const result = await repo.sync()

    expect(result.fromFiles).toBe(0)
    expect(result.fromData).toBe(0)
    expect(result.conflicts).toEqual([])
  })

  test("watch returns Watcher instance", () => {
    using repo = runGenerator(createRepo(tempDir))

    const watcher = repo.watch()

    expect(watcher).toBeDefined()
    expect(typeof watcher.start).toBe("function")
    expect(typeof watcher.stop).toBe("function")
  })

  test("close releases all resources", () => {
    const repo = runGenerator(createRepo(tempDir))
    repo.close()

    expect(() => repo.data).toThrow("closed")
    expect(() => repo.files).toThrow("closed")
    expect(() => repo.config).toThrow("closed")
  })

  test("close is idempotent", () => {
    const repo = runGenerator(createRepo(tempDir))
    repo.close()
    repo.close() // Should not throw
  })

  test("supports using syntax", () => {
    let repoRef: Repo | null = null

    {
      using repo = runGenerator(createRepo(tempDir))
      repoRef = repo
      repo.data.addNode(null, { type: "task", content: "Test" })
    }

    // After block, repo should be closed
    expect(() => repoRef!.data).toThrow("closed")
  })
})

// =============================================================================
// Repo Path Property Tests
// =============================================================================

describe("Repo.path", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  test("createRepo returns vault root path", () => {
    using repo = runGenerator(createRepo(tempDir))
    expect(repo.path).toBe(tempDir)
  })

  test("createBareRepo uses configPath if provided", () => {
    const data = createMemDataStore()
    using repo = createBareRepo(data, { configPath: "/custom/path" })
    expect(repo.path).toBe("/custom/path")
  })

  test("createBareRepo defaults to cwd", () => {
    const data = createMemDataStore()
    using repo = createBareRepo(data)
    expect(repo.path).toBe(process.cwd())
  })
})

// =============================================================================
// Repo Config Tests
// =============================================================================

describe("Repo.config", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  test("loads config from vault root", () => {
    // Write a km config file
    writeFileSync(
      join(tempDir, ".kmrc.json"),
      JSON.stringify({ specialFiles: { inbox: "custom-inbox.md" } }),
    )

    using repo = runGenerator(createRepo(tempDir))

    // Config should reflect the custom setting
    expect(repo.config).toBeDefined()
  })

  test("uses default config when no config file", () => {
    using repo = runGenerator(createRepo(tempDir))
    expect(repo.config).toBeDefined()
  })
})
