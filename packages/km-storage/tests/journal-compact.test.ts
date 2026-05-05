/**
 * Tests for compactJournal — snapshot-based truncation of changes.jsonl.
 *
 * The DB is the source of truth; everything past meta.last_event_offset is
 * the unapplied tail. compactJournal drops the applied prefix and keeps only
 * the tail, then resets the cursor to EOF and stamps last_snapshot_event so
 * subsequent runs can tell where the on-disk journal starts.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { SCHEMA } from "../src/db/schema.ts"
import { compactJournal } from "../src/change-compaction.ts"

function createTestDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

function setupKmDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "km-compact-"))
  const kmDir = join(dir, ".km")
  mkdirSync(kmDir, { recursive: true })
  return kmDir
}

function setMeta(db: Database, key: string, value: string): void {
  db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value])
}

function getMeta(db: Database, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined
  return row?.value
}

describe("compactJournal", () => {
  test("returns empty result when no changes.jsonl exists", () => {
    const kmDir = setupKmDir()
    const db = createTestDb()
    const result = compactJournal(kmDir, db)
    expect(result.bytesBefore).toBe(0)
    expect(result.bytesAfter).toBe(0)
    expect(result.truncated).toBe(false)
  })

  test("truncates journal entirely when cursor is at EOF (everything applied)", () => {
    const kmDir = setupKmDir()
    const changesPath = join(kmDir, "changes.jsonl")
    const lines = [
      '{"id":"01HXX1","ts":1,"type":"node_created","actor":"user","data":{"id":"a"}}',
      '{"id":"01HXX2","ts":2,"type":"node_updated","actor":"user","target":"a","data":{"content":"x"}}',
      '{"id":"01HXX3","ts":3,"type":"node_deleted","actor":"user","target":"a","data":{}}',
    ]
    writeFileSync(changesPath, lines.join("\n") + "\n")
    const sizeBefore = statSync(changesPath).size

    const db = createTestDb()
    setMeta(db, "last_event_offset", String(sizeBefore))
    setMeta(db, "last_event", "01HXX3")

    const result = compactJournal(kmDir, db)

    expect(result.bytesBefore).toBe(sizeBefore)
    expect(result.bytesAfter).toBe(0)
    expect(result.bytesReclaimed).toBe(sizeBefore)
    expect(result.truncated).toBe(true)

    expect(readFileSync(changesPath, "utf-8")).toBe("")
    expect(getMeta(db, "last_event_offset")).toBe("0")
    expect(getMeta(db, "last_snapshot_event")).toBe("01HXX3")
  })

  test("preserves the unapplied tail past the cursor", () => {
    const kmDir = setupKmDir()
    const changesPath = join(kmDir, "changes.jsonl")
    const appliedLine = '{"id":"01HXX1","ts":1,"type":"node_created","actor":"user","data":{"id":"a"}}\n'
    const tailLine1 = '{"id":"01HXX2","ts":2,"type":"node_updated","actor":"user","target":"a","data":{"x":1}}\n'
    const tailLine2 = '{"id":"01HXX3","ts":3,"type":"node_deleted","actor":"user","target":"a","data":{}}\n'
    writeFileSync(changesPath, appliedLine + tailLine1 + tailLine2)
    const sizeBefore = statSync(changesPath).size
    const cursor = Buffer.byteLength(appliedLine, "utf-8")

    const db = createTestDb()
    setMeta(db, "last_event_offset", String(cursor))
    setMeta(db, "last_event", "01HXX1")

    const result = compactJournal(kmDir, db)

    expect(result.truncated).toBe(true)
    expect(result.bytesBefore).toBe(sizeBefore)
    expect(result.bytesAfter).toBe(Buffer.byteLength(tailLine1 + tailLine2, "utf-8"))

    const remaining = readFileSync(changesPath, "utf-8")
    expect(remaining).toBe(tailLine1 + tailLine2)
    expect(getMeta(db, "last_event_offset")).toBe(String(result.bytesAfter))
    expect(getMeta(db, "last_snapshot_event")).toBe("01HXX1")
  })

  test("handles cursor mid-line (drops the partial first line)", () => {
    const kmDir = setupKmDir()
    const changesPath = join(kmDir, "changes.jsonl")
    const fullLine1 = '{"id":"01HXX1","ts":1,"type":"node_created","actor":"user","data":{"id":"a"}}\n'
    const fullLine2 = '{"id":"01HXX2","ts":2,"type":"node_updated","actor":"user","target":"a","data":{"x":1}}\n'
    writeFileSync(changesPath, fullLine1 + fullLine2)
    // Cursor lands inside the first line (simulating the discoverFromChanges
    // mid-line landing case the loader already handles).
    const cursor = 10

    const db = createTestDb()
    setMeta(db, "last_event_offset", String(cursor))
    setMeta(db, "last_event", "01HXX0")

    compactJournal(kmDir, db)

    // The partial-line dropping logic mirrors readChanges' tail reader: the
    // first newline boundary delimits the start of the kept tail.
    const remaining = readFileSync(changesPath, "utf-8")
    expect(remaining).toBe(fullLine2)
  })

  test("is idempotent — running twice on a clean journal is a no-op", () => {
    const kmDir = setupKmDir()
    const changesPath = join(kmDir, "changes.jsonl")
    const lines = [
      '{"id":"01HXX1","ts":1,"type":"node_created","actor":"user","data":{"id":"a"}}',
      '{"id":"01HXX2","ts":2,"type":"node_deleted","actor":"user","target":"a","data":{}}',
    ]
    writeFileSync(changesPath, lines.join("\n") + "\n")
    const sizeBefore = statSync(changesPath).size

    const db = createTestDb()
    setMeta(db, "last_event_offset", String(sizeBefore))
    setMeta(db, "last_event", "01HXX2")

    const r1 = compactJournal(kmDir, db)
    expect(r1.bytesAfter).toBe(0)

    const r2 = compactJournal(kmDir, db)
    expect(r2.bytesBefore).toBe(0)
    expect(r2.bytesAfter).toBe(0)
    expect(r2.truncated).toBe(false)
  })
})
