/**
 * Tests for idempotent parsing (km-storage.parse-idempotent)
 *
 * Parsing must be idempotent: parsing the same file twice must not produce
 * duplicate children. This can happen when:
 * - parseStubFile is called eagerly, then parseDeferredAsync processes the same file
 * - parseDeferredAsync runs twice (e.g., due to retry or race)
 * - A file with no children (title-only) bypasses the childCount > 0 guard
 */
import { test, expect, describe } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { SCHEMA } from "../src/schema.ts"
import { loadRepo, parseStubFile, parseDeferredAsync } from "../src/repo-loader.ts"
import { resolveNode, getChildren, getNode } from "../src/db.ts"

/** Helper: exhaust a loadRepo generator and return the result */
function runLoadRepo(...args: Parameters<typeof loadRepo>) {
  const gen = loadRepo(...args)
  let result = gen.next()
  while (!result.done) {
    result = gen.next()
  }
  return result.value
}

describe("parse idempotency", () => {
  test("parseStubFile twice does not create duplicate children", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-idempotent-"))
    const filePath = join(tmpDir, "test.md")

    writeFileSync(
      filePath,
      `# Test File

## Section One

Content for section one.

## Section Two

Content for section two.
`,
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Load with discoverOnly (creates stubs)
    const result = runLoadRepo(tmpDir, { db, discoverOnly: true })
    const fileNode = resolveNode(db, "test.md")
    expect(fileNode).toBeDefined()

    // First parse
    const success1 = parseStubFile(db, fileNode!.id, filePath)
    expect(success1).toBe(true)

    const childrenAfterFirst = getChildren(db, fileNode!.id)
    const countAfterFirst = childrenAfterFirst.length

    // Second parse (should be a no-op)
    const success2 = parseStubFile(db, fileNode!.id, filePath)
    expect(success2).toBe(true)

    const childrenAfterSecond = getChildren(db, fileNode!.id)
    expect(childrenAfterSecond.length).toBe(countAfterFirst)
  })

  test("parseStubFile then parseDeferredAsync does not create duplicates", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-idempotent-"))
    const filePath = join(tmpDir, "test.md")

    writeFileSync(
      filePath,
      `# Test File

## Section One

Content.

## Section Two

More content.
`,
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Load with discoverOnly
    const result = runLoadRepo(tmpDir, { db, discoverOnly: true })
    expect(result.deferredFiles).toBeDefined()
    expect(result.deferredFiles!.length).toBeGreaterThan(0)

    const fileNode = resolveNode(db, "test.md")
    expect(fileNode).toBeDefined()

    // Eagerly parse the stub
    const success = parseStubFile(db, fileNode!.id, filePath)
    expect(success).toBe(true)

    const childrenAfterEager = getChildren(db, fileNode!.id)
    const countAfterEager = childrenAfterEager.length
    expect(countAfterEager).toBeGreaterThan(0)

    // Now run deferred parsing on the same file list
    // This simulates the race: parseStubFile ran first, then parseDeferredAsync
    const deferredResult = await parseDeferredAsync(db, result.deferredFiles!, undefined, {
      useWorkerPool: false,
    })

    // Children should not have duplicated
    const childrenAfterDeferred = getChildren(db, fileNode!.id)
    expect(childrenAfterDeferred.length).toBe(countAfterEager)
  })

  test("title-only file (no children) preserves metadata across double-parse", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-idempotent-"))
    const filePath = join(tmpDir, "simple.md")

    // A file with ONLY a title - no sections, no list items
    writeFileSync(filePath, "# Simple Title\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Load with discoverOnly
    const result = runLoadRepo(tmpDir, { db, discoverOnly: true })
    expect(result.deferredFiles).toBeDefined()

    const fileNode = resolveNode(db, "simple.md")
    expect(fileNode).toBeDefined()

    // Parse the stub
    const success = parseStubFile(db, fileNode!.id, filePath)
    expect(success).toBe(true)

    // Simulate a metadata change (e.g., user assigns a task status)
    db.prepare("UPDATE nodes SET task_status = 'todo', task_marker = '[ ]', updated_at = ? WHERE id = ?").run(
      Date.now() + 1000,
      fileNode!.id,
    )

    const nodeWithMetadata = getNode(db, fileNode!.id)
    expect(nodeWithMetadata?.item?.task?.status).toBe("todo")

    // Second parse should NOT delete and re-insert the file node,
    // because that would lose the task_status we just set
    const success2 = parseStubFile(db, fileNode!.id, filePath)
    expect(success2).toBe(true)

    // Metadata must survive the second parse
    const nodeAfterSecondParse = getNode(db, fileNode!.id)
    expect(nodeAfterSecondParse).toBeDefined()
    expect(nodeAfterSecondParse!.id).toBe(fileNode!.id)
    expect(nodeAfterSecondParse!.item?.task?.status).toBe("todo")
  })

  test("parseDeferredAsync twice does not create duplicates", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-idempotent-"))

    writeFileSync(
      join(tmpDir, "alpha.md"),
      `# Alpha

## Part One

Content A.
`,
    )
    writeFileSync(
      join(tmpDir, "beta.md"),
      `# Beta

## Part One

Content B.
`,
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Load stubs
    const result = runLoadRepo(tmpDir, { db, discoverOnly: true })
    expect(result.deferredFiles!.length).toBe(2)

    // First deferred parse
    const result1 = await parseDeferredAsync(db, result.deferredFiles!, undefined, {
      useWorkerPool: false,
    })

    // Count all nodes
    const countAfterFirst = (
      db.prepare("SELECT COUNT(*) as cnt FROM nodes").get() as {
        cnt: number
      }
    ).cnt

    // Second deferred parse (should be idempotent)
    const result2 = await parseDeferredAsync(db, result.deferredFiles!, undefined, {
      useWorkerPool: false,
    })

    const countAfterSecond = (
      db.prepare("SELECT COUNT(*) as cnt FROM nodes").get() as {
        cnt: number
      }
    ).cnt

    expect(countAfterSecond).toBe(countAfterFirst)
  })

  test("no duplicate parent_idx per parent after double parse", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-idempotent-"))

    writeFileSync(
      join(tmpDir, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = runLoadRepo(tmpDir, { db, discoverOnly: true })
    const fileNode = resolveNode(db, "tasks.md")
    expect(fileNode).toBeDefined()

    // Parse twice
    parseStubFile(db, fileNode!.id, join(tmpDir, "tasks.md"))
    parseStubFile(db, fileNode!.id, join(tmpDir, "tasks.md"))

    // Check for duplicate parent_idx values under the same parent
    const duplicates = db
      .prepare(
        `SELECT parent_id, parent_idx, COUNT(*) as cnt
       FROM nodes
       WHERE parent_id = ?
       GROUP BY parent_id, parent_idx
       HAVING cnt > 1`,
      )
      .all(fileNode!.id) as { parent_id: string; parent_idx: number; cnt: number }[]

    expect(duplicates).toEqual([])
  })

  test("events.jsonl load + eager parse + deferred parse integration", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-idempotent-disk-"))
    const { mkdirSync } = await import("fs")
    const { ulid } = await import("ulid")

    // Create .km directory with events.jsonl
    const kmDir = join(tmpDir, ".km")
    mkdirSync(kmDir, { recursive: true })

    const fileId = "test-file-001"
    const events = [
      {
        id: ulid(),
        type: "node_created",
        actor: "test",
        ts: Date.now(),
        data: {
          id: fileId,
          type: "h",
          item: {},
          fstype: "mdfile",
          parent_id: ".",
          parent_idx: 0,
          fs_path: "project.md",
          name: "project",
          title: "project",
          data: { _stub: true },
        },
      },
    ]
    writeFileSync(join(kmDir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n")

    // Create the actual markdown file
    writeFileSync(
      join(tmpDir, "project.md"),
      `# Project

## Overview

Project overview content.

## Tasks

- [ ] Build it
- [ ] Ship it
`,
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Load in disk mode (reads events.jsonl, reconciles filesystem)
    const result = runLoadRepo(tmpDir, { db, mode: "disk" })

    // The stub from events.jsonl should exist
    const fileNode = resolveNode(db, "project.md")
    expect(fileNode).toBeDefined()

    // If reconciliation produces deferred files, parse them
    if (result.deferredFiles && result.deferredFiles.length > 0) {
      // Eagerly parse one
      const firstDeferred = result.deferredFiles.find((df) => df.nodeId === fileId || df.fsPath.endsWith("project.md"))
      if (firstDeferred) {
        parseStubFile(db, firstDeferred.nodeId, firstDeferred.fsPath)
      }

      // Then run deferred on all (should skip already-parsed)
      await parseDeferredAsync(db, result.deferredFiles, undefined, {
        useWorkerPool: false,
      })
    }

    // Verify no duplicate parent_idx under any parent
    const duplicates = db
      .prepare(
        `SELECT parent_id, parent_idx, COUNT(*) as cnt
       FROM nodes
       WHERE parent_id IS NOT NULL
       GROUP BY parent_id, parent_idx
       HAVING cnt > 1`,
      )
      .all() as { parent_id: string; parent_idx: number; cnt: number }[]

    expect(duplicates).toEqual([])
  })
})
