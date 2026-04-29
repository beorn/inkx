/**
 * Tests for getEmbedPathsOnBoard — board-wide embed deduplication query.
 *
 * Bug fix: previous depth-2-only query (parent_id IN (SELECT id FROM nodes
 * WHERE parent_id = ?)) missed embeds nested deeper than two levels under
 * the board root, causing duplicate embeds on every km.add re-evaluation.
 * The recursive CTE walks the full descendant subtree.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/db/schema.ts"
import { getEmbedPathsOnBoard } from "../src/db/queries/tree-traversal.ts"

let db: Database

/**
 * Insert a node. Pass `embedOf` + `targetPath` to model an embed node — we
 * stamp embed_of (any non-null marks the node as an embed) and store the
 * dedup path in `data.targetPath` (matches how rules.ts reads it).
 */
function insertNode(opts: {
  id: string
  type: string
  parentId: string | null
  parentIdx?: number
  content?: string
  embedOf?: string
  targetPath?: string
}): void {
  const pid = opts.parentId ?? "."
  const now = Date.now()
  const data = opts.targetPath ? JSON.stringify({ targetPath: opts.targetPath }) : "{}"
  db.run(
    `INSERT INTO nodes
     (id, type, parent_id, parent_idx, content, embed_of, item, data, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'v1')`,
    [opts.id, opts.type, pid, opts.parentIdx ?? 0, opts.content ?? "", opts.embedOf ?? null, data, now, now],
  )
}

beforeEach(() => {
  db = new Database(":memory:")
  db.run(SCHEMA)
})

afterEach(() => {
  db.close()
})

describe("getEmbedPathsOnBoard", () => {
  test("returns empty when board root is null", () => {
    const result = getEmbedPathsOnBoard(db, null)
    expect(result.exactPaths.size).toBe(0)
    expect(result.filePaths.size).toBe(0)
  })

  test("returns empty when board has no embeds", () => {
    insertNode({ id: "board", type: "h", parentId: null })
    insertNode({ id: "section", type: "h", parentId: "board" })
    insertNode({ id: "p1", type: "p", parentId: "section", content: "plain text" })

    const result = getEmbedPathsOnBoard(db, "board")
    expect(result.exactPaths.size).toBe(0)
    expect(result.filePaths.size).toBe(0)
  })

  test("dedup catches embeds at depth 2 (board > section > embed)", () => {
    // Existing baseline: depth-2 embeds should keep working.
    insertNode({ id: "board", type: "h", parentId: null })
    insertNode({ id: "section", type: "h", parentId: "board" })
    insertNode({
      id: "embed-a",
      type: "p",
      parentId: "section",
      embedOf: "target-a",
      targetPath: "notes/foo.md",
    })

    const result = getEmbedPathsOnBoard(db, "board")
    expect(result.exactPaths.has("notes/foo.md")).toBe(true)
    expect(result.filePaths.has("notes/foo.md")).toBe(true)
  })

  test("dedup catches embeds at depth 3 (board > section > subsection > embed)", () => {
    // The bug: a depth-2-only WHERE parent_id IN (children-of-board) misses
    // this case because the embed's parent is a subsection, not a section.
    insertNode({ id: "board", type: "h", parentId: null })
    insertNode({ id: "section", type: "h", parentId: "board" })
    insertNode({ id: "subsection", type: "h", parentId: "section" })
    insertNode({
      id: "deep-embed",
      type: "p",
      parentId: "subsection",
      embedOf: "target-deep",
      targetPath: "notes/deep.md",
    })

    const result = getEmbedPathsOnBoard(db, "board")
    expect(result.exactPaths.has("notes/deep.md")).toBe(true)
    expect(result.filePaths.has("notes/deep.md")).toBe(true)
  })

  test("dedup catches embeds at depth 4+ (deeply nested)", () => {
    insertNode({ id: "board", type: "h", parentId: null })
    insertNode({ id: "l1", type: "h", parentId: "board" })
    insertNode({ id: "l2", type: "h", parentId: "l1" })
    insertNode({ id: "l3", type: "h", parentId: "l2" })
    insertNode({
      id: "very-deep",
      type: "p",
      parentId: "l3",
      embedOf: "target-deep",
      targetPath: "notes/very-deep.md#^anchor",
    })

    const result = getEmbedPathsOnBoard(db, "board")
    expect(result.exactPaths.has("notes/very-deep.md#^anchor")).toBe(true)
    // File-level dedup strips the #anchor suffix
    expect(result.filePaths.has("notes/very-deep.md")).toBe(true)
  })

  test("collects embeds across all depths in one call", () => {
    insertNode({ id: "board", type: "h", parentId: null })
    insertNode({ id: "section", type: "h", parentId: "board" })
    insertNode({ id: "subsection", type: "h", parentId: "section" })
    insertNode({
      id: "shallow",
      type: "p",
      parentId: "section",
      embedOf: "t1",
      targetPath: "shallow.md",
    })
    insertNode({
      id: "deep",
      type: "p",
      parentId: "subsection",
      embedOf: "t2",
      targetPath: "deep.md",
    })

    const result = getEmbedPathsOnBoard(db, "board")
    expect(result.exactPaths.size).toBe(2)
    expect(result.exactPaths.has("shallow.md")).toBe(true)
    expect(result.exactPaths.has("deep.md")).toBe(true)
  })

  test("falls back to content regex when data.targetPath is missing", () => {
    // Models a legacy embed node where the target only lives in markdown content.
    insertNode({ id: "board", type: "h", parentId: null })
    insertNode({ id: "section", type: "h", parentId: "board" })
    insertNode({
      id: "legacy",
      type: "p",
      parentId: "section",
      embedOf: "target-legacy",
      content: "![[notes/legacy.md#^foo]]",
      // No targetPath in data
    })

    const result = getEmbedPathsOnBoard(db, "board")
    expect(result.exactPaths.has("notes/legacy.md#^foo")).toBe(true)
    expect(result.filePaths.has("notes/legacy.md")).toBe(true)
  })

  test("ignores non-embed nodes (embed_of IS NULL)", () => {
    insertNode({ id: "board", type: "h", parentId: null })
    insertNode({ id: "section", type: "h", parentId: "board" })
    insertNode({ id: "para", type: "p", parentId: "section", content: "regular paragraph" })
    insertNode({
      id: "real-embed",
      type: "p",
      parentId: "section",
      embedOf: "target",
      targetPath: "kept.md",
    })

    const result = getEmbedPathsOnBoard(db, "board")
    expect(result.exactPaths.size).toBe(1)
    expect(result.exactPaths.has("kept.md")).toBe(true)
  })

  test("excludes embeds outside the board subtree", () => {
    insertNode({ id: "board-a", type: "h", parentId: null })
    insertNode({ id: "board-b", type: "h", parentId: null, parentIdx: 1 })
    insertNode({ id: "sec-a", type: "h", parentId: "board-a" })
    insertNode({ id: "sec-b", type: "h", parentId: "board-b" })
    insertNode({
      id: "embed-a",
      type: "p",
      parentId: "sec-a",
      embedOf: "ta",
      targetPath: "in-a.md",
    })
    insertNode({
      id: "embed-b",
      type: "p",
      parentId: "sec-b",
      embedOf: "tb",
      targetPath: "in-b.md",
    })

    const resultA = getEmbedPathsOnBoard(db, "board-a")
    expect(resultA.exactPaths.has("in-a.md")).toBe(true)
    expect(resultA.exactPaths.has("in-b.md")).toBe(false)

    const resultB = getEmbedPathsOnBoard(db, "board-b")
    expect(resultB.exactPaths.has("in-b.md")).toBe(true)
    expect(resultB.exactPaths.has("in-a.md")).toBe(false)
  })

  test("performance: recursive walk completes quickly on a moderate vault", () => {
    // 500 sections, each with 1 deep-nested embed (depth 3) — 1500 nodes total.
    // Recursive CTE should stay well under 50ms.
    insertNode({ id: "board", type: "h", parentId: null })
    for (let i = 0; i < 500; i++) {
      const sec = `sec-${i}`
      const sub = `sub-${i}`
      const emb = `emb-${i}`
      insertNode({ id: sec, type: "h", parentId: "board", parentIdx: i })
      insertNode({ id: sub, type: "h", parentId: sec })
      insertNode({
        id: emb,
        type: "p",
        parentId: sub,
        embedOf: `t-${i}`,
        targetPath: `target-${i}.md`,
      })
    }

    const start = performance.now()
    const result = getEmbedPathsOnBoard(db, "board")
    const elapsed = performance.now() - start

    expect(result.exactPaths.size).toBe(500)
    expect(elapsed).toBeLessThan(50)
  })
})
