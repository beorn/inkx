/**
 * pipeline-update-file-metadata-emit.test.ts
 *
 * Closes the last op-surface site from the op-vocabulary audit:
 * applyNodes → updateFileMetadata routes through emitter.commit when an
 * emitter is provided (G9, km-storage.pipeline-update-file-metadata-emit).
 *
 * Asserts:
 *   - Exactly one journal entry per invocation (no double-writes).
 *   - DB columns (fs_mtime, fs_ino, content_hash) reflect the emit.
 *   - The entry carries actor: "fs-watch" and the expected data payload.
 *   - The bootstrap fallback (no emitter) still writes the DB directly.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { SCHEMA } from "../src/db/schema.ts"
import { applyNodes, collect, type ParsedFile } from "../src/markdown/pipeline.ts"
import { createEmitter } from "../src/emitter.ts"

function createTestDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

/** Build a minimal node suitable for ParsedFile.nodes[0] — applyNodes only
 * reads `nodes[0]` truthiness for the update path, so we keep it minimal. */
function createFileNode(id: string): ParsedFile["nodes"][0] {
  return {
    id,
    type: "h",
    item: {},
    fstype: "mdfile",
    parent_id: null,
    parent_idx: 0,
    embed_of: null,
    data: {},
    created_at: 1000,
    updated_at: 1000,
    version: "",
  }
}

function createParsedFile(path: string, nodeId: string, overrides: Partial<ParsedFile> = {}): ParsedFile {
  return {
    path,
    nodeId,
    nodes: [createFileNode(nodeId)],
    wikilinks: [],
    hash: `hash-${nodeId}`,
    ino: 12345,
    mtime: Date.now(),
    isCreate: false,
    ...overrides,
  }
}

async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item
  }
}

describe("applyNodes() updateFileMetadata — emitter path (G9)", () => {
  test("routes metadata back-writes through emitter.commit (single journal entry, no double-write)", async () => {
    const db = createTestDb()

    // Seed existing file node that will receive a metadata update.
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, fstype, data, created_at, updated_at, version)
       VALUES ('file1', 'h', NULL, 0, 'mdfile', '{}', 1000, 1000, '')`,
    )

    const tmpKm = mkdtempSync(join(tmpdir(), "pipeline-updatefilemetadata-"))
    const emitter = createEmitter({ kmDir: tmpKm, db, skipPersist: false })

    const parsed = [
      createParsedFile("/test/file1.md", "file1", {
        hash: "newhash",
        ino: 99999,
        mtime: 2000,
        isCreate: false,
      }),
    ]

    await collect(applyNodes(fromArray(parsed), db, { emitter }))

    // DB: metadata columns reflect the emit.
    const node = db.query("SELECT fs_ino, fs_mtime, content_hash FROM nodes WHERE id = ?").get("file1") as {
      fs_ino: number
      fs_mtime: number
      content_hash: string
    }
    expect(node.fs_ino).toBe(99999)
    expect(node.fs_mtime).toBe(2000)
    expect(node.content_hash).toBe("newhash")

    // Journal: exactly one node_updated for file1 carrying the metadata.
    const changesPath = join(tmpKm, "changes.jsonl")
    expect(existsSync(changesPath)).toBe(true)
    const entries = readFileSync(changesPath, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)

    const matching = entries.filter((e) => {
      if (e.type !== "node_updated" || e.target !== "file1") return false
      const data = e.data as Record<string, unknown>
      return data?.content_hash === "newhash"
    })
    expect(matching.length).toBe(1)

    const entry = matching[0]!
    expect(entry.actor).toBe("fs-watch")
    const entryData = entry.data as Record<string, unknown>
    expect(entryData.fs_ino).toBe(99999)
    expect(entryData.fs_mtime).toBe(2000)
    expect(entryData.content_hash).toBe("newhash")
  })

  test("produces exactly one journal entry per file across a multi-file batch (no double-writes)", async () => {
    const db = createTestDb()

    for (const id of ["f1", "f2", "f3"]) {
      db.run(
        `INSERT INTO nodes (id, type, parent_id, parent_idx, fstype, data, created_at, updated_at, version)
         VALUES (?, 'h', NULL, 0, 'mdfile', '{}', 1000, 1000, '')`,
        [id],
      )
    }

    const tmpKm = mkdtempSync(join(tmpdir(), "pipeline-updatefilemetadata-multi-"))
    const emitter = createEmitter({ kmDir: tmpKm, db, skipPersist: false })

    const parsed = [
      createParsedFile("/test/f1.md", "f1", { hash: "h1", ino: 1, mtime: 10, isCreate: false }),
      createParsedFile("/test/f2.md", "f2", { hash: "h2", ino: 2, mtime: 20, isCreate: false }),
      createParsedFile("/test/f3.md", "f3", { hash: "h3", ino: 3, mtime: 30, isCreate: false }),
    ]

    await collect(applyNodes(fromArray(parsed), db, { emitter }))

    const entries = readFileSync(join(tmpKm, "changes.jsonl"), "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)

    // Exactly 3 node_updated entries (one per file), all fs-watch.
    const updates = entries.filter((e) => e.type === "node_updated")
    expect(updates.length).toBe(3)
    for (const u of updates) {
      expect(u.actor).toBe("fs-watch")
    }

    // And per-file content_hash column ended up correct.
    for (const { id, hash } of [
      { id: "f1", hash: "h1" },
      { id: "f2", hash: "h2" },
      { id: "f3", hash: "h3" },
    ]) {
      const row = db.query("SELECT content_hash FROM nodes WHERE id = ?").get(id) as { content_hash: string }
      expect(row.content_hash).toBe(hash)
    }
  })

  test("bootstrap fallback (no emitter): direct UPDATE still works, no journal written", async () => {
    const db = createTestDb()

    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, fstype, data, created_at, updated_at, version)
       VALUES ('file1', 'h', NULL, 0, 'mdfile', '{}', 1000, 1000, '')`,
    )

    const parsed = [
      createParsedFile("/test/file1.md", "file1", {
        hash: "bootstrap-hash",
        ino: 7777,
        mtime: 4242,
        isCreate: false,
      }),
    ]

    // Intentionally no emitter — initial repo-load path.
    await collect(applyNodes(fromArray(parsed), db))

    const node = db.query("SELECT fs_ino, fs_mtime, content_hash FROM nodes WHERE id = ?").get("file1") as {
      fs_ino: number
      fs_mtime: number
      content_hash: string
    }
    expect(node.fs_ino).toBe(7777)
    expect(node.fs_mtime).toBe(4242)
    expect(node.content_hash).toBe("bootstrap-hash")
  })
})
