/**
 * Pipeline Tests
 *
 * Tests for the composable async generator pipeline stages.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/schema.ts"
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

/** Mock ParsePoolService that returns pre-defined results */
function createMockPool(results: Map<string, Partial<ParsedFile>>): {
  stream: typeof parseFiles extends (s: ParseSource[], p: infer P) => unknown
    ? P
    : never
} {
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
  } as ReturnType<typeof createMockPool>
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
        [
          "/test/file1.md",
          {
            nodes: [{ id: "node1", type: "file" }],
            wikilinks: [],
            hash: "hash1",
          },
        ],
        [
          "/test/file2.md",
          {
            nodes: [{ id: "node2", type: "file" }],
            wikilinks: [],
            hash: "hash2",
          },
        ],
      ]),
    )

    const sources: ParseSource[] = [
      { path: "/test/file1.md", nodeId: "node1", isCreate: true },
      { path: "/test/file2.md", nodeId: "node2", isCreate: true },
    ]

    const results = await collect(parseFiles(sources, mockPool as never))

    expect(results).toHaveLength(2)
    expect(results.map((r) => r.path).sort()).toEqual([
      "/test/file1.md",
      "/test/file2.md",
    ])
  })

  test("yields empty for no sources", async () => {
    const mockPool = createMockPool(new Map())
    const results = await collect(parseFiles([], mockPool as never))
    expect(results).toEqual([])
  })

  test("includes error in result when parse fails", async () => {
    const mockPool = createMockPool(
      new Map([["/test/bad.md", { error: "Parse failed" }]]),
    )

    const sources: ParseSource[] = [
      { path: "/test/bad.md", nodeId: "bad1", isCreate: true },
    ]

    const results = await collect(parseFiles(sources, mockPool as never))

    expect(results).toHaveLength(1)
    expect(results[0].error).toBe("Parse failed")
    expect(results[0].nodes).toEqual([])
  })

  test("respects abort signal", async () => {
    const controller = new AbortController()
    controller.abort() // Abort immediately

    const mockPool = createMockPool(
      new Map([["/test/file.md", { nodes: [{ id: "n1", type: "file" }] }]]),
    )

    const sources: ParseSource[] = [
      { path: "/test/file.md", nodeId: "n1", isCreate: true },
    ]

    const results = await collect(
      parseFiles(sources, mockPool as never, controller.signal),
    )

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

    const parsedFiles: ParsedFile[] = [
      {
        path: "/test/file1.md",
        nodeId: "file1",
        nodes: [
          {
            id: "file1",
            type: "file",
            parent_id: null,
            parent_idx: 0,
            link_to: null,
            data: { name: "file1" },
            created_at: Date.now(),
            updated_at: Date.now(),
            version: "",
          },
        ],
        wikilinks: [],
        hash: "hash1",
        ino: 12345,
        mtime: Date.now(),
        isCreate: true,
      },
    ]

    const results = await collect(applyNodes(fromArray(parsedFiles), db))

    expect(results).toHaveLength(1)
    expect(results[0].nodeId).toBe("file1")

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

    const parsedFiles: ParsedFile[] = [
      {
        path: "/test/file1.md",
        nodeId: "file1",
        nodes: [
          {
            id: "file1",
            type: "file",
            parent_id: null,
            parent_idx: 0,
            link_to: null,
            data: {},
            created_at: 1000,
            updated_at: 1000,
            version: "",
          },
        ],
        wikilinks: [],
        hash: "newhash",
        ino: 99999,
        mtime: 2000,
        isCreate: false,
      },
    ]

    const results = await collect(applyNodes(fromArray(parsedFiles), db))

    expect(results).toHaveLength(1)

    // Verify metadata was updated
    const node = db
      .query("SELECT fs_ino, fs_mtime, content_hash FROM nodes WHERE id = ?")
      .get("file1") as {
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

    const parsedFiles: ParsedFile[] = [
      {
        path: "/test/good.md",
        nodeId: "good1",
        nodes: [
          {
            id: "good1",
            type: "file",
            parent_id: null,
            parent_idx: 0,
            link_to: null,
            data: {},
            created_at: Date.now(),
            updated_at: Date.now(),
            version: "",
          },
        ],
        wikilinks: [],
        hash: "hash1",
        ino: 12345,
        mtime: Date.now(),
        isCreate: true,
      },
      {
        path: "/test/bad.md",
        nodeId: "bad1",
        nodes: [],
        wikilinks: [],
        hash: "",
        ino: 0,
        mtime: 0,
        isCreate: true,
        error: "Parse failed",
      },
    ]

    const results = await collect(applyNodes(fromArray(parsedFiles), db))

    // Only the good file should be yielded (error file is skipped entirely)
    expect(results).toHaveLength(1)
    expect(results[0].nodeId).toBe("good1")

    // Only one node should be inserted
    const count = db.query("SELECT COUNT(*) as c FROM nodes").get() as {
      c: number
    }
    expect(count.c).toBe(1)
  })

  test("passes wikilinks through to output", async () => {
    const db = createTestDb()

    const parsedFiles: ParsedFile[] = [
      {
        path: "/test/file1.md",
        nodeId: "file1",
        nodes: [
          {
            id: "file1",
            type: "file",
            parent_id: null,
            parent_idx: 0,
            link_to: null,
            data: {},
            created_at: Date.now(),
            updated_at: Date.now(),
            version: "",
          },
        ],
        wikilinks: [
          { nodeId: "file1", link: { target: "other" } },
          { nodeId: "file1", link: { target: "another" } },
        ],
        hash: "hash1",
        ino: 12345,
        mtime: Date.now(),
        isCreate: true,
      },
    ]

    const results = await collect(applyNodes(fromArray(parsedFiles), db))

    expect(results[0].wikilinks).toHaveLength(2)
    expect(results[0].wikilinks[0].link.target).toBe("other")
  })
})

// ============================================================================
// pipelineResolveLinks() tests
// ============================================================================

describe("pipelineResolveLinks()", () => {
  test("resolves links to existing files", async () => {
    const db = createTestDb()

    // Insert target file
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, fs_path, data, created_at, updated_at, version)
       VALUES ('target1', 'file', NULL, 0, '/test/target.md', '{"name":"target"}', 1000, 1000, '')`,
    )

    const appliedFiles: AppliedFile[] = [
      {
        nodeId: "source1",
        name: "source",
        path: "/test/source.md",
        wikilinks: [{ nodeId: "source1", link: { target: "target" } }],
      },
    ]

    const results = await collect(
      pipelineResolveLinks(fromArray(appliedFiles), db),
    )

    expect(results).toHaveLength(1)
    expect(results[0].source_id).toBe("source1")
    expect(results[0].target_name).toBe("target")
    expect(results[0].target_id).toBe("target1")
  })

  test("resolves forward references (files in same batch)", async () => {
    const db = createTestDb()

    // No pre-existing files - both are in the batch
    const appliedFiles: AppliedFile[] = [
      {
        nodeId: "file1",
        name: "first",
        path: "/test/first.md",
        wikilinks: [{ nodeId: "file1", link: { target: "second" } }],
      },
      {
        nodeId: "file2",
        name: "second",
        path: "/test/second.md",
        wikilinks: [],
      },
    ]

    const results = await collect(
      pipelineResolveLinks(fromArray(appliedFiles), db),
    )

    expect(results).toHaveLength(1)
    expect(results[0].target_id).toBe("file2") // Forward reference resolved!
  })

  test("returns null target_id for unresolved links", async () => {
    const db = createTestDb()

    const appliedFiles: AppliedFile[] = [
      {
        nodeId: "file1",
        name: "source",
        path: "/test/source.md",
        wikilinks: [{ nodeId: "file1", link: { target: "nonexistent" } }],
      },
    ]

    const results = await collect(
      pipelineResolveLinks(fromArray(appliedFiles), db),
    )

    expect(results).toHaveLength(1)
    expect(results[0].target_id).toBeNull()
    expect(results[0].target_name).toBe("nonexistent")
  })
})

// ============================================================================
// applyLinks() tests
// ============================================================================

describe("applyLinks()", () => {
  test("inserts links into database", async () => {
    const db = createTestDb()

    const links: ResolvedLink[] = [
      {
        source_id: "src1",
        target_name: "target",
        target_id: "tgt1",
        section: null,
        block_id: null,
        alias: null,
        embedded: false,
        relationship: null,
      },
    ]

    await runPipeline(applyLinks(fromArray(links), db))

    const dbLinks = db.query("SELECT * FROM links").all()
    expect(dbLinks).toHaveLength(1)
  })

  test("updates node link_to for embedded links", async () => {
    const db = createTestDb()

    // Insert source node
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, data, created_at, updated_at, version)
       VALUES ('src1', 'paragraph', 'file1', 0, '{}', 1000, 1000, '')`,
    )

    const links: ResolvedLink[] = [
      {
        source_id: "src1",
        target_name: "embed",
        target_id: "tgt1",
        section: null,
        block_id: null,
        alias: "My Alias",
        embedded: true,
        relationship: null,
      },
    ]

    await runPipeline(applyLinks(fromArray(links), db))

    // Verify link_to was updated on node
    const node = db
      .query("SELECT link_to, link_alias FROM nodes WHERE id = ?")
      .get("src1") as { link_to: string; link_alias: string }
    expect(node.link_to).toBe("tgt1")
    expect(node.link_alias).toBe("My Alias")
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

describe("pipeline composition", () => {
  test("full pipeline: parse → apply → resolve → applyLinks", async () => {
    const db = createTestDb()

    // Mock pool with two files that link to each other
    const mockPool = createMockPool(
      new Map([
        [
          "/test/a.md",
          {
            nodes: [
              {
                id: "a",
                type: "file",
                parent_id: null,
                parent_idx: 0,
                data: { name: "a" },
              },
            ],
            wikilinks: [{ nodeId: "a", link: { target: "b" } }],
          },
        ],
        [
          "/test/b.md",
          {
            nodes: [
              {
                id: "b",
                type: "file",
                parent_id: null,
                parent_idx: 0,
                data: { name: "b" },
              },
            ],
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
    const links = db
      .query("SELECT * FROM links ORDER BY source_id")
      .all() as Array<{
      source_id: string
      target_id: string
    }>
    expect(links).toHaveLength(2)
    expect(links[0].source_id).toBe("a")
    expect(links[0].target_id).toBe("b")
    expect(links[1].source_id).toBe("b")
    expect(links[1].target_id).toBe("a")
  })
})
