/**
 * Pipeline Tests
 *
 * Tests for the composable async generator pipeline stages.
 */

import { describe, test, expect, vi } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/schema.ts"
import { applyEventWithDb } from "../src/db-events.ts"
import {
  parseFiles,
  applyNodes,
  pipelineResolveLinks,
  applyLinks,
  runPipeline,
  collect,
  type ParseSource,
  type ParsedFile,
  type AppliedFile,
} from "../src/pipeline.ts"
import type { ResolvedLink } from "../src/markdown-processing.ts"

// ============================================================================
// Test Helpers
// ============================================================================

function createTestDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

/** Create a node object with sensible defaults */
function createNode(id: string, overrides: Partial<ParsedFile["nodes"][0]> = {}): ParsedFile["nodes"][0] {
  return {
    id,
    type: "h",
    item: {},
    fstype: "mdfile",
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "",
    ...overrides,
  }
}

/** Create a parsed file with sensible defaults */
function createParsedFile(path: string, nodeId: string, overrides: Partial<ParsedFile> = {}): ParsedFile {
  return {
    path,
    nodeId,
    nodes: overrides.nodes ?? [createNode(nodeId)],
    wikilinks: [],
    hash: `hash-${nodeId}`,
    ino: 12345,
    mtime: Date.now(),
    isCreate: true,
    ...overrides,
  }
}

/** Create an applied file with sensible defaults */
function createAppliedFile(
  nodeId: string,
  name: string,
  path: string,
  wikilinks: AppliedFile["wikilinks"] = [],
): AppliedFile {
  return { nodeId, name, path, wikilinks }
}

/** Create a resolved link with sensible defaults */
function createResolvedLink(
  source_id: string,
  target_name: string,
  overrides: Partial<ResolvedLink> = {},
): ResolvedLink {
  return {
    source_id,
    target_name,
    target_id: overrides.target_id ?? null,
    section: null,
    block_id: null,
    alias: null,
    embedded: false,
    relationship: null,
    ...overrides,
  }
}

/** Mock ParsePoolService that returns pre-defined results */
function createMockPool(results: Map<string, Partial<ParsedFile>>): Parameters<typeof parseFiles>[1] {
  // Only `stream` is needed for pipeline tests
  return {
    async *stream(files: Array<{ nodeId: string; fsPath: string }>) {
      for (const file of files) {
        const result = results.get(file.fsPath)
        if (result) {
          yield {
            nodeId: file.nodeId,
            fsPath: file.fsPath,
            nodes: result.nodes ?? [],
            wikilinks: result.wikilinks ?? [],
            hash: result.hash ?? "abc123",
            ino: result.ino ?? 12345,
            mtime: result.mtime ?? Date.now(),
            error: result.error,
          }
        }
      }
    },
  } as Parameters<typeof parseFiles>[1]
}

/** Create a mock async generator from an array */
async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item
  }
}

// ============================================================================
// collect() utility tests
// ============================================================================

describe("collect()", () => {
  test("collects all items from async generator", async () => {
    const items = await collect(fromArray([1, 2, 3]))
    expect(items).toEqual([1, 2, 3])
  })

  test("returns empty array for empty generator", async () => {
    const items = await collect(fromArray([]))
    expect(items).toEqual([])
  })
})

// ============================================================================
// runPipeline() utility tests
// ============================================================================

describe("runPipeline()", () => {
  test("exhausts generator and returns count", async () => {
    const count = await runPipeline(fromArray([1, 2, 3, 4, 5]))
    expect(count).toBe(5)
  })

  test("calls onProgress for each item", async () => {
    const seen: number[] = []
    await runPipeline(fromArray([10, 20, 30]), (item) => seen.push(item))
    expect(seen).toEqual([10, 20, 30])
  })

  test("returns 0 for empty generator", async () => {
    const count = await runPipeline(fromArray([]))
    expect(count).toBe(0)
  })
})

// ============================================================================
// parseFiles() tests
// ============================================================================

describe("parseFiles()", () => {
  test("yields parsed files from pool", async () => {
    const mockPool = createMockPool(
      new Map([
        ["/test/file1.md", { nodes: [createNode("node1")], hash: "hash1" }],
        ["/test/file2.md", { nodes: [createNode("node2")], hash: "hash2" }],
      ]),
    )

    const sources: ParseSource[] = [
      { path: "/test/file1.md", nodeId: "node1", isCreate: true },
      { path: "/test/file2.md", nodeId: "node2", isCreate: true },
    ]

    const results = await collect(parseFiles(sources, mockPool as never))

    expect(results).toHaveLength(2)
    expect(results.map((r) => r.path).sort()).toEqual(["/test/file1.md", "/test/file2.md"])
  })

  test("yields empty for no sources", async () => {
    const mockPool = createMockPool(new Map())
    const results = await collect(parseFiles([], mockPool as never))
    expect(results).toEqual([])
  })

  test("skips files with parse errors (logs at warn level)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const mockPool = createMockPool(new Map([["/test/bad.md", { error: "Parse failed" }]]))

    const sources: ParseSource[] = [{ path: "/test/bad.md", nodeId: "bad1", isCreate: true }]

    const results = await collect(parseFiles(sources, mockPool as never))

    // Parse errors are now skipped entirely — no results yielded
    expect(results).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  test("respects abort signal", async () => {
    const controller = new AbortController()
    controller.abort() // Abort immediately

    const mockPool = createMockPool(new Map([["/test/file.md", { nodes: [createNode("n1")] }]]))

    const sources: ParseSource[] = [{ path: "/test/file.md", nodeId: "n1", isCreate: true }]

    const results = await collect(parseFiles(sources, mockPool as never, controller.signal))

    // Should return empty since aborted
    expect(results).toEqual([])
  })
})

// ============================================================================
// applyNodes() tests
// ============================================================================

describe("applyNodes()", () => {
  test("inserts nodes for creates", async () => {
    const db = createTestDb()
    const parsedFiles = [
      createParsedFile("/test/file1.md", "file1", {
        nodes: [createNode("file1", { data: { name: "file1" } })],
      }),
    ]

    const results = await collect(applyNodes(fromArray(parsedFiles), db))

    expect(results).toHaveLength(1)
    expect(results[0]!.nodeId).toBe("file1")

    // Verify node was inserted
    const node = db.query("SELECT * FROM nodes WHERE id = ?").get("file1")
    expect(node).toBeDefined()
  })

  test("updates metadata for updates", async () => {
    const db = createTestDb()

    // Insert existing node
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, data, created_at, updated_at, version)
       VALUES ('file1', 'file', NULL, 0, '{}', 1000, 1000, '')`,
    )

    const parsedFiles = [
      createParsedFile("/test/file1.md", "file1", {
        nodes: [createNode("file1", { created_at: 1000, updated_at: 1000 })],
        hash: "newhash",
        ino: 99999,
        mtime: 2000,
        isCreate: false,
      }),
    ]

    const results = await collect(applyNodes(fromArray(parsedFiles), db))

    expect(results).toHaveLength(1)

    // Verify metadata was updated
    const node = db.query("SELECT fs_ino, fs_mtime, content_hash FROM nodes WHERE id = ?").get("file1") as {
      fs_ino: number
      fs_mtime: number
      content_hash: string
    }
    expect(node.fs_ino).toBe(99999)
    expect(node.fs_mtime).toBe(2000)
    expect(node.content_hash).toBe("newhash")
  })

  test("skips files with errors", async () => {
    const db = createTestDb()

    const parsedFiles = [
      createParsedFile("/test/good.md", "good1"),
      createParsedFile("/test/bad.md", "bad1", {
        nodes: [],
        hash: "",
        ino: 0,
        mtime: 0,
        error: "Parse failed",
      }),
    ]

    const results = await collect(applyNodes(fromArray(parsedFiles), db))

    // Only the good file should be yielded (error file is skipped entirely)
    expect(results).toHaveLength(1)
    expect(results[0]!.nodeId).toBe("good1")

    // Only one node should be inserted
    const count = db.query("SELECT COUNT(*) as c FROM nodes").get() as {
      c: number
    }
    expect(count.c).toBe(1)
  })

  test("passes wikilinks through to output", async () => {
    const db = createTestDb()

    const parsedFiles = [
      createParsedFile("/test/file1.md", "file1", {
        wikilinks: [
          { nodeId: "file1", link: { target: "other" } },
          { nodeId: "file1", link: { target: "another" } },
        ],
      }),
    ]

    const results = await collect(applyNodes(fromArray(parsedFiles), db))

    expect(results[0]!.wikilinks).toHaveLength(2)
    expect(results[0]!.wikilinks[0]!.link.target).toBe("other")
  })
})

// ============================================================================
// pipelineResolveLinks() tests
// ============================================================================

describe("pipelineResolveLinks()", () => {
  test("resolves links to existing files", async () => {
    const db = createTestDb()

    // Insert target file with name column (used for link resolution)
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, fs_path, name, data, created_at, updated_at, version)
       VALUES ('target1', 'file', NULL, 0, '/test/target.md', 'target', '{}', 1000, 1000, '')`,
    )

    const appliedFiles = [
      createAppliedFile("source1", "source", "/test/source.md", [{ nodeId: "source1", link: { target: "target" } }]),
    ]

    const results = await collect(pipelineResolveLinks(fromArray(appliedFiles), db))

    expect(results).toHaveLength(1)
    expect(results[0]!.source_id).toBe("source1")
    expect(results[0]!.target_name).toBe("target")
    expect(results[0]!.target_id).toBe("target1")
  })

  test("resolves forward references (files in same batch)", async () => {
    const db = createTestDb()

    // No pre-existing files - both are in the batch
    const appliedFiles = [
      createAppliedFile("file1", "first", "/test/first.md", [{ nodeId: "file1", link: { target: "second" } }]),
      createAppliedFile("file2", "second", "/test/second.md"),
    ]

    const results = await collect(pipelineResolveLinks(fromArray(appliedFiles), db))

    expect(results).toHaveLength(1)
    expect(results[0]!.target_id).toBe("file2") // Forward reference resolved!
  })

  test("returns null target_id for unresolved links", async () => {
    const db = createTestDb()

    const appliedFiles = [
      createAppliedFile("file1", "source", "/test/source.md", [{ nodeId: "file1", link: { target: "nonexistent" } }]),
    ]

    const results = await collect(pipelineResolveLinks(fromArray(appliedFiles), db))

    expect(results).toHaveLength(1)
    expect(results[0]!.target_id).toBeNull()
    expect(results[0]!.target_name).toBe("nonexistent")
  })

  test("resolves links to folders by name", async () => {
    const db = createTestDb()

    // Insert a folder with name column (folders are linkable via name)
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, fs_path, name, data, created_at, updated_at, version)
       VALUES ('folder1', 'folder', NULL, 0, '/test/inbox', 'inbox', '{}', 1000, 1000, '')`,
    )

    const appliedFiles = [
      createAppliedFile("file1", "board", "/test/board.md", [
        { nodeId: "file1", link: { target: "inbox", embedded: true } },
      ]),
    ]

    const results = await collect(pipelineResolveLinks(fromArray(appliedFiles), db))

    expect(results).toHaveLength(1)
    expect(results[0]!.source_id).toBe("file1")
    expect(results[0]!.target_name).toBe("inbox")
    expect(results[0]!.target_id).toBe("folder1") // Folder resolved!
  })

  test("resolves links to sections by name", async () => {
    const db = createTestDb()

    // Insert a section with name column (sections have slugified heading as name)
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, name, title, data, created_at, updated_at, version)
       VALUES ('section1', 'section', 'file1', 0, 'my-section', 'My Section', '{}', 1000, 1000, '')`,
    )

    const appliedFiles = [
      createAppliedFile("file2", "reference", "/test/reference.md", [
        { nodeId: "file2", link: { target: "my-section" } },
      ]),
    ]

    const results = await collect(pipelineResolveLinks(fromArray(appliedFiles), db))

    expect(results).toHaveLength(1)
    expect(results[0]!.target_id).toBe("section1") // Section resolved by name!
  })
})

// ============================================================================
// applyLinks() tests
// ============================================================================

describe("applyLinks()", () => {
  test("inserts links into database", async () => {
    const db = createTestDb()
    const links = [createResolvedLink("src1", "target", { target_id: "tgt1" })]

    await runPipeline(applyLinks(fromArray(links), db))

    const dbLinks = db.query("SELECT * FROM links").all()
    expect(dbLinks).toHaveLength(1)
  })

  test("updates node embed_source for embedded links", async () => {
    const db = createTestDb()

    // Insert source node
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, data, created_at, updated_at, version)
       VALUES ('src1', 'paragraph', 'file1', 0, '{}', 1000, 1000, '')`,
    )

    const links = [
      createResolvedLink("src1", "embed", {
        target_id: "tgt1",
        alias: "My Alias",
        embedded: true,
      }),
    ]

    await runPipeline(applyLinks(fromArray(links), db))

    // Verify embed_source was updated on node
    const node = db.query("SELECT embed_source, name FROM nodes WHERE id = ?").get("src1") as {
      embed_source: string
      name: string
    }
    expect(node.embed_source).toBe("tgt1")
    expect(node.name).toBe("My Alias")
  })

  test("handles empty input", async () => {
    const db = createTestDb()
    const count = await runPipeline(applyLinks(fromArray([]), db))
    expect(count).toBe(0)
  })
})

// ============================================================================
// Pipeline composition tests
// ============================================================================

// ============================================================================
// Event replay with failures
// ============================================================================

describe("event replay with failures", () => {
  test("failed node_created causes dependent events to be skippable", () => {
    const db = createTestDb()

    // Simulate replay: first create a node that exists (to establish the pattern)
    const createEvent = {
      id: "evt-001",
      ts: Date.now(),
      type: "node_created" as const,
      actor: "user",
      data: {
        id: "node-alpha",
        type: "h",
        parent_id: null,
        parent_idx: 0,
        data: {},
      },
    }

    // This should succeed
    applyEventWithDb(db, createEvent)

    // Verify node exists
    const node = db.query("SELECT id FROM nodes WHERE id = ?").get("node-alpha") as { id: string } | null
    expect(node).not.toBeNull()

    // Now simulate a dependent update event for this node
    const updateEvent = {
      id: "evt-002",
      ts: Date.now(),
      type: "node_updated" as const,
      actor: "user",
      target: "node-alpha",
      data: { content: "Updated content" },
    }

    // This should succeed
    applyEventWithDb(db, updateEvent)

    // Verify update applied
    const updated = db.query("SELECT content FROM nodes WHERE id = ?").get("node-alpha") as { content: string } | null
    expect(updated?.content).toBe("Updated content")

    // Now simulate an update for a node that was NEVER created (simulates
    // the cascade-skip scenario where node_created failed)
    const orphanUpdate = {
      id: "evt-003",
      ts: Date.now(),
      type: "node_updated" as const,
      actor: "user",
      target: "node-never-created",
      data: { content: "This should be a no-op" },
    }

    // This should NOT throw — applyNodeUpdated just runs UPDATE with 0 rows affected
    expect(() => applyEventWithDb(db, orphanUpdate)).not.toThrow()

    // The non-existent node should still not exist (no accidental creation)
    const ghost = db.query("SELECT id FROM nodes WHERE id = ?").get("node-never-created")
    expect(ghost).toBeNull()
  })

  test("delete event for non-existent node does not throw", () => {
    const db = createTestDb()

    // Simulate replaying a delete event for a node that was never created
    // (cascade scenario: node_created failed, then node_deleted replays)
    const deleteEvent = {
      id: "evt-del-001",
      ts: Date.now(),
      type: "node_deleted" as const,
      actor: "user",
      target: "nonexistent-node",
      data: { reason: "test" },
    }

    // Should not throw — deleteSubtree handles missing nodes gracefully
    expect(() => applyEventWithDb(db, deleteEvent)).not.toThrow()
  })

  test("move event for non-existent node does not throw", () => {
    const db = createTestDb()

    // Simulate replaying a move event for a node that was never created
    const moveEvent = {
      id: "evt-move-001",
      ts: Date.now(),
      type: "node_moved" as const,
      actor: "user",
      target: "nonexistent-node",
      data: { parent_id: "also-nonexistent", parent_idx: 0 },
    }

    // Should not throw — UPDATE with 0 rows affected is a no-op
    expect(() => applyEventWithDb(db, moveEvent)).not.toThrow()
  })

  test("duplicate node_created (INSERT OR IGNORE) does not corrupt existing node", () => {
    const db = createTestDb()

    // Create a node
    const createEvent1 = {
      id: "evt-dup-001",
      ts: Date.now(),
      type: "node_created" as const,
      actor: "user",
      data: {
        id: "dup-node",
        type: "h",
        content: "Original content",
        parent_id: null,
        parent_idx: 0,
        data: {},
      },
    }

    applyEventWithDb(db, createEvent1)

    // Verify original content
    const original = db.query("SELECT content FROM nodes WHERE id = ?").get("dup-node") as { content: string } | null
    expect(original?.content).toBe("Original content")

    // Now replay a duplicate create with different content (simulates stale event log)
    const createEvent2 = {
      id: "evt-dup-002",
      ts: Date.now(),
      type: "node_created" as const,
      actor: "user",
      data: {
        id: "dup-node",
        type: "h",
        content: "Duplicate content",
        parent_id: null,
        parent_idx: 0,
        data: {},
      },
    }

    // Should not throw (INSERT OR IGNORE)
    expect(() => applyEventWithDb(db, createEvent2)).not.toThrow()

    // Original content should be preserved (not overwritten by duplicate)
    const afterDup = db.query("SELECT content FROM nodes WHERE id = ?").get("dup-node") as { content: string } | null
    expect(afterDup?.content).toBe("Original content")
  })
})

describe("pipeline composition", () => {
  test("full pipeline: parse → apply → resolve → applyLinks", async () => {
    const db = createTestDb()

    // Mock pool with two files that link to each other
    const mockPool = createMockPool(
      new Map([
        [
          "/test/a.md",
          {
            nodes: [createNode("a", { data: { name: "a" } })],
            wikilinks: [{ nodeId: "a", link: { target: "b" } }],
          },
        ],
        [
          "/test/b.md",
          {
            nodes: [createNode("b", { data: { name: "b" } })],
            wikilinks: [{ nodeId: "b", link: { target: "a" } }],
          },
        ],
      ]),
    )

    const sources: ParseSource[] = [
      { path: "/test/a.md", nodeId: "a", isCreate: true },
      { path: "/test/b.md", nodeId: "b", isCreate: true },
    ]

    // Compose pipeline
    const parsed = parseFiles(sources, mockPool as never)
    const applied = applyNodes(parsed, db)
    const resolved = pipelineResolveLinks(applied, db)
    const done = applyLinks(resolved, db)

    // Run pipeline
    await runPipeline(done)

    // Verify nodes inserted
    const nodes = db.query("SELECT id FROM nodes ORDER BY id").all() as Array<{
      id: string
    }>
    expect(nodes.map((n) => n.id)).toEqual(["a", "b"])

    // Verify links created with resolved targets
    const links = db.query("SELECT * FROM links ORDER BY source_id").all() as Array<{
      source_id: string
      target_id: string
    }>
    expect(links).toHaveLength(2)
    expect(links[0]!.source_id).toBe("a")
    expect(links[0]!.target_id).toBe("b")
    expect(links[1]!.source_id).toBe("b")
    expect(links[1]!.target_id).toBe("a")
  })
})
