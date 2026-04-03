/**
 * Tests for plain text (.txt) file discovery and parsing
 *
 * Verifies that .txt files are discovered alongside .md files
 * and parsed into txtfile nodes with raw content preserved.
 */
import { test, expect, describe } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { SCHEMA } from "../src/db/schema.ts"
import { loadRepo, parseStubFile } from "../src/repo/loader.ts"
import { resolveNode, getChildren } from "../src/db/db.ts"

/** Run generator to completion */
function exhaust<T>(gen: Generator<unknown, T, unknown>): T {
  let result = gen.next()
  while (!result.done) {
    result = gen.next()
  }
  return result.value
}

describe("plain text file discovery", () => {
  test(".txt file is discovered in full mode", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-txt-"))

    writeFileSync(join(tmpDir, "notes.txt"), "Hello, plain text world!")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = exhaust(loadRepo(tmpDir, { db, mode: "memory" }))

    expect(result.nodeCount).toBeGreaterThanOrEqual(2) // root + notes.txt

    // Find the txt file node
    const rows = db.prepare("SELECT * FROM nodes WHERE fstype = 'txtfile'").all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)

    const txtNode = rows[0]!
    expect(txtNode.type).toBe("h")
    expect(txtNode.fstype).toBe("txtfile")
    expect(txtNode.content).toBe("Hello, plain text world!")
    expect(txtNode.name).toBe("notes")
    expect(txtNode.title).toBe("notes")
  })

  test(".txt file is discovered alongside .md files", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-txt-"))

    writeFileSync(join(tmpDir, "readme.md"), "# Readme\n\nSome content.\n")
    writeFileSync(join(tmpDir, "notes.txt"), "Plain text notes")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = exhaust(loadRepo(tmpDir, { db, mode: "memory" }))

    const mdFiles = db.prepare("SELECT * FROM nodes WHERE fstype = 'mdfile'").all() as Array<Record<string, unknown>>
    const txtFiles = db.prepare("SELECT * FROM nodes WHERE fstype = 'txtfile'").all() as Array<Record<string, unknown>>

    expect(mdFiles).toHaveLength(1)
    expect(txtFiles).toHaveLength(1)
    expect((mdFiles[0] as Record<string, unknown>).name).toBe("readme")
    expect((txtFiles[0] as Record<string, unknown>).name).toBe("notes")
  })

  test(".txt file has no children (single node)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-txt-"))

    writeFileSync(join(tmpDir, "test.txt"), "# Not a heading\n- Not a list\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    exhaust(loadRepo(tmpDir, { db, mode: "memory" }))

    const rows = db.prepare("SELECT id FROM nodes WHERE fstype = 'txtfile'").all() as Array<{ id: string }>
    expect(rows).toHaveLength(1)

    const children = getChildren(db, rows[0]!.id)
    expect(children).toHaveLength(0)
  })

  test(".txt file preserves exact content", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-txt-"))

    const content = "Line 1\n  indented\n\n\nmultiple blanks\n\ttabbed\n"
    writeFileSync(join(tmpDir, "whitespace.txt"), content)

    const db = new Database(":memory:")
    db.run(SCHEMA)

    exhaust(loadRepo(tmpDir, { db, mode: "memory" }))

    const rows = db.prepare("SELECT content FROM nodes WHERE fstype = 'txtfile'").all() as Array<{ content: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.content).toBe(content)
  })

  test(".txt file in subdirectory is discovered", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-txt-"))
    mkdirSync(join(tmpDir, "subdir"))

    writeFileSync(join(tmpDir, "subdir", "deep.txt"), "Deep content")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    exhaust(loadRepo(tmpDir, { db, mode: "memory" }))

    const rows = db.prepare("SELECT * FROM nodes WHERE fstype = 'txtfile'").all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.content).toBe("Deep content")
  })
})

describe("plain text file stub mode", () => {
  test(".txt file is created as stub in discoverOnly mode", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-txt-"))

    writeFileSync(join(tmpDir, "notes.txt"), "Stub content")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = exhaust(loadRepo(tmpDir, { db, discoverOnly: true }))

    // Should have deferred files including .txt
    expect(result.deferredFiles).toBeDefined()
    const txtDeferred = result.deferredFiles!.filter((f) => f.fsPath.endsWith(".txt"))
    expect(txtDeferred).toHaveLength(1)

    // The stub node should exist
    const rows = db.prepare("SELECT * FROM nodes WHERE fstype = 'txtfile'").all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe("notes")
  })

  test("parseStubFile works for .txt files", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-txt-"))
    const filePath = join(tmpDir, "test.txt")

    writeFileSync(filePath, "Parsed stub content")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = exhaust(loadRepo(tmpDir, { db, discoverOnly: true }))

    const txtDeferred = result.deferredFiles!.find((f) => f.fsPath.endsWith(".txt"))
    expect(txtDeferred).toBeDefined()

    // Parse the stub
    const success = parseStubFile(db, txtDeferred!.nodeId, txtDeferred!.fsPath)
    expect(success).toBe(true)

    // Verify the parsed content
    const rows = db.prepare("SELECT content, fstype FROM nodes WHERE id = ?").all(txtDeferred!.nodeId) as Array<{
      content: string
      fstype: string
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.fstype).toBe("txtfile")
    expect(rows[0]!.content).toBe("Parsed stub content")
  })
})
