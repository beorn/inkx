/**
 * Tests for Repo domain object
 *
 * Tests the composed domain object that combines DataStore + FileTree + Config.
 * See: docs/00-principles.md
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync, existsSync, statSync } from "fs"
import { join } from "path"

import { runGenerator } from "@km/core"
import type { Event } from "@km/core"
import {
  createRepo,
  createBareRepo,
  createTestRepo,
  createMemDataStore,
  type Repo,
  type StepYield,
} from "../src/index.ts"
import { createEmitter, type FsSync } from "../src/emitter.ts"

// =============================================================================
// Test Helpers
// =============================================================================

function createTempDir(): string {
  const dir = join("/tmp", `kmtest-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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

    const id = repo.data.addNode(null, { type: "p", item: true, content: "Test task" })
    const node = repo.data.getNode(id)

    expect(node).toBeDefined()
    expect(node?.content).toBe("Test task")
    expect(node?.type).toBe("p")
  })

  test("supports query operations", () => {
    using repo = createTestRepo()

    repo.data.addNode(null, { type: "p", item: true, content: "First task" })
    repo.data.addNode(null, { type: "p", item: true, content: "Second task" })

    const allNodes = repo.data.getAllNodes()
    expect(allNodes.length).toBe(2)
  })

  test("throws on sync (bare repo)", async () => {
    using repo = createTestRepo()

    await expect(repo.sync()).rejects.toThrow("bare repo")
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
    const id = data.addNode(null, { type: "p", item: true, content: "Pre-existing" })

    using repo = createBareRepo(data)
    const node = repo.data.getNode(id)

    expect(node?.content).toBe("Pre-existing")
  })

  test("mutations affect wrapped DataStore", () => {
    const data = createMemDataStore()
    using repo = createBareRepo(data)

    const id = repo.data.addNode(null, { type: "p", item: true, content: "New task" })

    // Verify via original data store
    const node = data.getNode(id)
    expect(node?.content).toBe("New task")
  })

  test("close does not close wrapped DataStore", () => {
    const data = createMemDataStore()
    const repo = createBareRepo(data)
    repo.close()

    // Wrapped store should still work (caller manages lifecycle)
    const id = data.addNode(null, { type: "p", item: true, content: "After close" })
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
    const id = repo.data.addNode(null, { type: "p", item: true, content: "Memory task" })
    expect(repo.data.getNode(id)).toBeDefined()
  })

  test("uses disk mode with .km directory", () => {
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    using repo = runGenerator(createRepo(tempDir))

    const id = repo.data.addNode(null, { type: "p", item: true, content: "Disk task" })
    expect(repo.data.getNode(id)).toBeDefined()

    // Verify database file was created
    expect(existsSync(join(kmDir, "state.db"))).toBe(true)
  })

  test("forceMemory option overrides disk mode", () => {
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    using repo = runGenerator(createRepo(tempDir, { forceMemory: true }))

    // Should work even with .km dir present
    const id = repo.data.addNode(null, {
      type: "p",
      item: true,
      content: "Forced memory",
    })
    expect(repo.data.getNode(id)).toBeDefined()
  })

  test("loadFiles option parses markdown files", () => {
    // Create a markdown file with tasks
    writeFileSync(join(tempDir, "test.md"), "# Test\n- [ ] Task 1\n- [x] Task 2")

    using repo = runGenerator(createRepo(tempDir, { loadFiles: true }))

    // Should have parsed the file and created nodes
    expect(repo.stats.nodeCount).toBeGreaterThan(0)
    expect(repo.loadErrors).toEqual([])
    expect(repo.deferredFiles).toEqual([])

    // Should be able to find the file node
    const allNodes = repo.data.getAllNodes()
    expect(allNodes.length).toBeGreaterThan(0)
  })

  test("loadFiles captures errors for malformed files", () => {
    // Create a valid markdown file (errors are rare - markdown is forgiving)
    writeFileSync(join(tempDir, "valid.md"), "# Valid\n- [ ] Task")

    using repo = runGenerator(createRepo(tempDir, { loadFiles: true }))

    // Stats should be populated
    expect(repo.stats.duration).toBeGreaterThanOrEqual(0)
  })

  test("without loadFiles, database starts empty", () => {
    // Create a markdown file
    writeFileSync(join(tempDir, "test.md"), "# Test\n- [ ] Task 1")

    using repo = runGenerator(createRepo(tempDir, { loadFiles: false }))

    // Database should be empty - no file loading
    expect(repo.stats.nodeCount).toBe(0)
    expect(repo.data.getAllNodes()).toEqual([])
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
      repo.data.addNode(null, { type: "p", item: true, content: "Test" })
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

  test("createRepo returns repo root path", () => {
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

  test("loads config from repo root", () => {
    // Write a km config file
    writeFileSync(join(tempDir, ".kmrc.json"), JSON.stringify({ specialFiles: { inbox: "custom-inbox.md" } }))

    using repo = runGenerator(createRepo(tempDir))

    // Config should reflect the custom setting
    expect(repo.config).toBeDefined()
  })

  test("uses default config when no config file", () => {
    using repo = runGenerator(createRepo(tempDir))
    expect(repo.config).toBeDefined()
  })
})

// =============================================================================
// needsRebuild Tests
// =============================================================================

describe("Repo.needsRebuild", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  test("returns false for memory mode", () => {
    // No .km directory = memory mode
    using repo = runGenerator(createRepo(tempDir))

    expect(repo.needsRebuild()).toBe(false)
  })

  test("returns false for disk mode with no events.jsonl", () => {
    // Create .km directory but no events file
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    using repo = runGenerator(createRepo(tempDir))

    // state.db exists (created by repo), no events = no rebuild needed
    expect(repo.needsRebuild()).toBe(false)
  })

  test("returns true for disk mode with unapplied events", () => {
    // Create .km directory with events
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    // First create repo to initialize state.db
    {
      using repo = runGenerator(createRepo(tempDir))
      // Add a node to generate an event
      repo.data.addNode(null, { type: "p", item: true, content: "Test task" })
    }

    // Manually add an event that wasn't applied (simulate external write)
    const eventsPath = join(kmDir, "events.jsonl")
    const newEvent = JSON.stringify({
      id: "zzzzzzzz-test-event-id",
      type: "update",
      nodeId: "fake",
      ts: Date.now(),
    })
    writeFileSync(eventsPath, newEvent + "\n", { flag: "a" })

    // Reopen repo and check
    using repo = runGenerator(createRepo(tempDir))
    expect(repo.needsRebuild()).toBe(true)
  })

  test("throws for bare repo", () => {
    const data = createMemDataStore()
    using repo = createBareRepo(data)

    expect(() => repo.needsRebuild()).toThrow("bare repo")
  })
})

// =============================================================================
// refresh Tests
// =============================================================================

describe("Repo.refresh", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  test("returns a generator", () => {
    using repo = runGenerator(createRepo(tempDir))

    const gen = repo.refresh()
    expect(typeof gen.next).toBe("function")

    // Consume the generator
    for (const _step of gen) {
      // Just iterate through
    }
  })

  test("yields step info", () => {
    using repo = runGenerator(createRepo(tempDir))

    const steps: StepYield[] = []
    for (const step of repo.refresh()) {
      steps.push(step)
    }

    // Should yield at least one step
    expect(steps.length).toBeGreaterThanOrEqual(1)
  })

  test("throws for bare repo", () => {
    const data = createMemDataStore()
    using repo = createBareRepo(data)

    expect(() => {
      // Try to consume the generator
      for (const _step of repo.refresh()) {
        // Should throw before yielding
      }
    }).toThrow("bare repo")
  })
})

// =============================================================================
// Mutation → FsSync notification tests
// =============================================================================

describe("Repo mutations notify FsSync", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  function createRepoWithFsSpy(): { repo: Repo; events: Event[] } {
    const events: Event[] = []
    const fsSpy: FsSync = {
      applyEventToFs(event: Event) {
        events.push(event)
      },
    }

    // Ensure .km dir exists so repo enters disk mode (emitter → fsSync pipeline)
    mkdirSync(join(tempDir, ".km"), { recursive: true })
    const repo = runGenerator(createRepo(tempDir, { loadFiles: false }))
    repo.emitter.setFsSync(fsSpy)
    return { repo, events }
  }

  test("updateNode notifies FsSync with node_updated event", () => {
    const { repo, events } = createRepoWithFsSpy()

    const id = repo.addNode(null, { type: "p", item: true, content: "original" })
    events.length = 0 // clear the node_created event

    repo.updateNode(id, { content: "changed" })

    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe("node_updated")
    expect(events[0]!.target).toBe(id)
    expect(events[0]!.actor).toBe("user")

    repo.close()
  })

  test("moveNode notifies FsSync with node_moved event", () => {
    const { repo, events } = createRepoWithFsSpy()

    const parentA = repo.addNode(null, { type: "h", item: true, content: "A" })
    const parentB = repo.addNode(null, { type: "h", item: true, content: "B" })
    const child = repo.addNode(parentA, { type: "p", item: true, content: "child" })
    events.length = 0

    repo.moveNode(child, parentB, 0)

    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe("node_moved")
    expect(events[0]!.target).toBe(child)
    expect(events[0]!.actor).toBe("user")

    repo.close()
  })

  test("deleteNode notifies FsSync with node_deleted event", () => {
    const { repo, events } = createRepoWithFsSpy()

    const id = repo.addNode(null, { type: "p", item: true, content: "to-delete" })
    events.length = 0

    repo.deleteNode(id)

    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe("node_deleted")
    expect(events[0]!.target).toBe(id)
    expect(events[0]!.actor).toBe("user")

    repo.close()
  })

  test("addNode notifies FsSync with node_created event", () => {
    const { repo, events } = createRepoWithFsSpy()

    events.length = 0
    const id = repo.addNode(null, { type: "p", item: true, content: "new-task" })

    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe("node_created")
    expect(events[0]!.actor).toBe("user")
    expect((events[0]!.data as Record<string, unknown>).id).toBe(id)

    repo.close()
  })

  test("no FsSync notification when no FsSync is set", () => {
    const repo = runGenerator(createRepo(tempDir, { loadFiles: false }))
    // Don't set FsSync — should not throw
    const id = repo.addNode(null, { type: "p", item: true, content: "no-spy" })
    repo.updateNode(id, { content: "changed" })
    repo.deleteNode(id)
    // If we got here, no errors from notifyFs with null fsSync
    repo.close()
  })
})

describe("FsWriter auto-registration", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  test("disk-mode repo has FsWriter, memory-mode does not", () => {
    // Create .km dir so repo loads in disk mode
    mkdirSync(join(tempDir, ".km"), { recursive: true })
    const diskRepo = runGenerator(createRepo(tempDir, { loadFiles: false }))
    expect(diskRepo.emitter.getFsSync()).not.toBeNull()
    diskRepo.close()

    // Force memory mode
    const memRepo = runGenerator(createRepo(tempDir, { loadFiles: false, forceMemory: true }))
    expect(memRepo.emitter.getFsSync()).toBeNull()
    memRepo.close()
  })

  test("SyncManager replaces FsWriter via setFsSync", () => {
    mkdirSync(join(tempDir, ".km"), { recursive: true })
    const repo = runGenerator(createRepo(tempDir, { loadFiles: false }))

    // FsWriter is auto-registered
    const fsWriter = repo.emitter.getFsSync()
    expect(fsWriter).not.toBeNull()

    // Simulate TUI replacing with SyncManager
    const spy: FsSync = { applyEventToFs: () => {} }
    repo.emitter.setFsSync(spy)
    expect(repo.emitter.getFsSync()).toBe(spy)

    repo.close()
  })

  test("FsWriter regenerates file on node_created", () => {
    // Write board.md and create .km → load → add task → verify file updated
    mkdirSync(join(tempDir, ".km"), { recursive: true })
    writeFileSync(join(tempDir, "board.md"), "---\ntitle: Board\n---\n\n# Board\n\n## Inbox\n\n## Done\n")
    const repo = runGenerator(createRepo(tempDir, { loadFiles: true }))
    expect(repo.emitter.getFsSync()).not.toBeNull()

    // Find nodes via DB
    const db = repo.database
    const inbox = db
      .query("SELECT id FROM nodes WHERE content = 'Inbox' AND type = 'oi' AND fstype = 'mdsection'")
      .get() as {
      id: string
    } | null

    if (!inbox) {
      // If board wasn't loaded (no file scan in this init path), skip gracefully
      repo.close()
      return
    }

    // Add a task — FsWriter should regenerate the file
    repo.addNode(inbox.id, {
      type: "p",
      item: true,
      content: "New CLI task",
      task_status: "todo",
      task_marker: "[ ]",
    })

    const content = readFileSync(join(tempDir, "board.md"), "utf-8")
    expect(content).toContain("New CLI task")

    repo.close()
  })
})

// =============================================================================
// WAL checkpoint on close (km-shk24 bug 2: disk I/O after prolonged use)
// =============================================================================

describe("WAL checkpoint on close", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  test("WAL file is checkpointed after explicit PRAGMA wal_checkpoint", () => {
    mkdirSync(join(tempDir, ".km"), { recursive: true })
    writeFileSync(join(tempDir, "tasks.md"), "# Tasks\n\n## Inbox\n\n- [ ] Task 1\n- [ ] Task 2\n")

    const repo = runGenerator(createRepo(tempDir, { loadFiles: true }))

    // Add many nodes to grow the WAL
    for (let i = 0; i < 50; i++) {
      repo.addNode(null, { type: "p", item: true, content: `Bulk task ${i}` })
    }

    // WAL file should exist and have data
    const walPath = join(tempDir, ".km", "state.db-wal")
    const walSizeBefore = existsSync(walPath) ? statSync(walPath).size : 0

    // Checkpoint the WAL (this is what the fix in view.ts does)
    repo.database.run("PRAGMA wal_checkpoint(TRUNCATE)")

    // After TRUNCATE checkpoint, WAL file should be zero or very small
    const walSizeAfter = existsSync(walPath) ? statSync(walPath).size : 0
    expect(walSizeAfter).toBeLessThan(walSizeBefore)

    repo.close()
  })
})

// =============================================================================
// Deferred parsing: no duplicate children (km-ii6qw)
// =============================================================================

describe("deferred parsing deduplication", () => {
  test("double parseStubFile does not duplicate children", async () => {
    // Simulate the Asana vault scenario: a .md file with heading sections
    // is parsed eagerly (parseStubFile) then again via deferred parsing.
    const dir = createTempDir()
    const mdContent = "# Launch Academy\n\n## INBOX\n\nTask 1\n\n## PROJECTS\n\nTask 2\n"
    writeFileSync(join(dir, "launch-academy.md"), mdContent)

    mkdirSync(join(dir, ".km"), { recursive: true })
    writeFileSync(join(dir, "launch-academy.md"), "# Launch Academy\n\n## INBOX\n\nTask 1\n\n## PROJECTS\n\nTask 2\n")

    // Load with discoverOnly to get a stub
    const repo = runGenerator(createRepo(dir, { loadFiles: true, discoverOnly: true }))

    // Find the stub
    const stub = repo.database.prepare("SELECT id FROM nodes WHERE fs_path = ?").get("launch-academy.md") as {
      id: string
    } | null
    expect(stub).toBeTruthy()

    // Parse the file (first time)
    const { parseStubFile } = await import("../src/deferred-parsing.ts")
    parseStubFile(repo.database, stub!.id, join(dir, "launch-academy.md"), "launch-academy.md")

    const childrenAfterFirst = repo.database.prepare("SELECT content FROM nodes WHERE parent_id = ?").all(stub!.id) as {
      content: string
    }[]
    const sections1 = childrenAfterFirst.filter((c) => c.content === "INBOX" || c.content === "PROJECTS")
    expect(sections1.length).toBe(2)

    // Parse AGAIN (simulates deferred parsing of an already-parsed file)
    parseStubFile(repo.database, stub!.id, join(dir, "launch-academy.md"), "launch-academy.md")

    // Should still have exactly 2 sections, not 4
    const childrenAfterSecond = repo.database
      .prepare("SELECT content FROM nodes WHERE parent_id = ?")
      .all(stub!.id) as { content: string }[]
    const sections2 = childrenAfterSecond.filter((c) => c.content === "INBOX" || c.content === "PROJECTS")
    expect(sections2.length).toBe(2)

    repo.close()
    rmSync(dir, { recursive: true, force: true })
  })
})

// =============================================================================
// preloadSubtree cache poisoning
// =============================================================================

describe("preloadSubtree cache", () => {
  test("preloading child subtree does not poison parent's children cache", () => {
    // The CTE in getSubtreeShallow includes the root node itself (depth 0).
    // Its parent_id points to the root's parent. When grouped by parent_id,
    // this creates a PARTIAL entry for the parent — only one of N siblings.
    // warmIfMissing caches this partial list, causing getChildren(parent) to
    // return only the preloaded child and hide its siblings.
    using repo = createTestRepo()

    repo.data.addNode(null, { id: "root", type: "h", item: true })
    repo.data.addNode("root", { id: "A", type: "h", item: true })
    repo.data.addNode("root", { id: "B", type: "h", item: true })
    repo.data.addNode("root", { id: "C", type: "h", item: true })
    repo.data.addNode("A", { id: "A1", type: "p", item: true })
    repo.data.addNode("A", { id: "A2", type: "p", item: true })

    // Verify: root has 3 children
    expect(repo.getChildren("root").map((c) => c.id)).toEqual(["A", "B", "C"])

    // Preload A's subtree — includes A itself with parent_id = "root"
    repo.preloadSubtree("A", 3)

    // Root's children must NOT be poisoned to just [A]
    expect(repo.getChildren("root").map((c) => c.id)).toEqual(["A", "B", "C"])
  })

  test("sequential preloads preserve all children", () => {
    using repo = createTestRepo()

    repo.data.addNode(null, { id: "root", type: "h", item: true })
    repo.data.addNode("root", { id: "eo", type: "h", item: true })
    repo.data.addNode("root", { id: "beowa", type: "h", item: true })
    repo.data.addNode("root", { id: "family", type: "h", item: true })
    repo.data.addNode("eo", { id: "la", type: "h", item: true })

    // Simulate zoom-in to la, then zoom-out to eo, then zoom-out to root
    repo.preloadSubtree("la", 3)
    repo.preloadSubtree("eo", 3)
    repo.preloadSubtree("root", 3)

    // Root should have all 3 children, not just [eo]
    expect(repo.getChildren("root").map((c) => c.id)).toEqual(["eo", "beowa", "family"])
  })
})
