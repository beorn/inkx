/**
 * Collapse-Parse Discovery Integration Tests
 *
 * End-to-end: ingest a vault where some folders match a collapse-parse
 * pattern, verify those files become opaque stubs (no children, not queued
 * for background parse), non-matching files get fully parsed, and stubs
 * promote correctly when `parseStubFile` is invoked.
 *
 * Corresponds to the remediation for km-storage.vault-node-explosion —
 * vaults with 70%+ nodes under `raw/chats/` or `archive/` should see that
 * overhead vanish once the folder is declared collapse-parse.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { SCHEMA } from "../src/db/schema.ts"
import { loadRepo, parseStubFile } from "../src/repo/loader.ts"
import { resolveNode, getChildren } from "../src/db/db.ts"
import { createCollapseParseMatcher } from "../src/markdown/collapse-parse.ts"

function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), "km-collapse-"))
}

// Heavy chat-transcript-shaped content: headings + bullets per turn.
// Mirrors the real-world shape producing 15-30K nodes per file.
function bigChatTranscript(): string {
  const turns: string[] = ["# Chat Session\n"]
  for (let i = 0; i < 25; i++) {
    turns.push(`## Turn ${i}\n`)
    turns.push(`### User\n\n- question ${i}\n- follow-up\n- third bullet\n`)
    turns.push(`### Assistant\n\n- answer ${i}\n- nuance\n- caveat\n- example\n`)
  }
  return turns.join("\n")
}

function runLoad(tmpDir: string, db: Database, patterns: string[] = []): { nodeCount: number } {
  const collapseMatcher = patterns.length > 0 ? createCollapseParseMatcher(patterns) : undefined
  const gen = loadRepo(tmpDir, { db, collapseMatcher })
  let r = gen.next()
  while (!r.done) r = gen.next()
  return { nodeCount: r.value.nodeCount }
}

describe("collapse-parse: discovery integration", () => {
  test("file under collapse pattern stays opaque (no children parsed)", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    writeFileSync(join(tmpDir, "raw", "chats", "session.md"), bigChatTranscript())
    writeFileSync(join(tmpDir, "notes.md"), "# Notes\n\n## Section\n\n- item 1\n- item 2\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    runLoad(tmpDir, db, ["raw/chats/**"])

    // Chat transcript: stub, no children.
    const chatNode = resolveNode(db, "raw/chats/session.md")
    expect(chatNode).toBeDefined()
    const chatChildren = getChildren(db, chatNode!.id)
    expect(chatChildren.length).toBe(0)

    // And is marked collapsed in the JSON blob.
    const row = db.prepare("SELECT data FROM nodes WHERE id = ?").get(chatNode!.id) as { data: string }
    const parsed = JSON.parse(row.data) as { _stub?: boolean; _collapsed?: boolean }
    expect(parsed._stub).toBe(true)
    expect(parsed._collapsed).toBe(true)

    // Notes file: fully parsed (has section children).
    const notesNode = resolveNode(db, "notes.md")
    expect(notesNode).toBeDefined()
    const notesChildren = getChildren(db, notesNode!.id)
    expect(notesChildren.length).toBeGreaterThan(0)
  })

  test("without collapse pattern, same file gets fully parsed (regression)", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    writeFileSync(join(tmpDir, "raw", "chats", "session.md"), bigChatTranscript())

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // No patterns → default behavior preserved.
    runLoad(tmpDir, db, [])

    const chatNode = resolveNode(db, "raw/chats/session.md")
    expect(chatNode).toBeDefined()
    const children = getChildren(db, chatNode!.id)
    // Without collapse, the file produces many child nodes (25 turn headings + descendants).
    expect(children.length).toBeGreaterThan(10)
  })

  test("collapsed stub is not queued for background parse", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    writeFileSync(join(tmpDir, "raw", "chats", "a.md"), "# A\n\n- x\n")
    writeFileSync(join(tmpDir, "raw", "chats", "b.md"), "# B\n\n- y\n")
    writeFileSync(join(tmpDir, "notes.md"), "# Notes\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Use discoverOnly so deferredFiles is populated (stub mode).
    const collapseMatcher = createCollapseParseMatcher(["raw/chats/**"])
    const gen = loadRepo(tmpDir, { db, discoverOnly: true, collapseMatcher })
    let r = gen.next()
    while (!r.done) r = gen.next()
    const result = r.value

    const deferred = result.deferredFiles ?? []
    const deferredPaths = new Set(deferred.map((f) => f.fsPath))
    // Notes should be queued for background parse.
    expect([...deferredPaths].some((p) => p.endsWith("notes.md"))).toBe(true)
    // Collapsed stubs should NOT be queued.
    expect([...deferredPaths].some((p) => p.endsWith("raw/chats/a.md"))).toBe(false)
    expect([...deferredPaths].some((p) => p.endsWith("raw/chats/b.md"))).toBe(false)
  })

  test("navigating into a collapsed stub promotes it (parseStubFile)", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    const chatPath = join(tmpDir, "raw", "chats", "session.md")
    writeFileSync(chatPath, "# Chat Session\n\n## Section One\n\nHello.\n\n## Section Two\n\nWorld.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    runLoad(tmpDir, db, ["raw/chats/**"])

    const chatNode = resolveNode(db, "raw/chats/session.md")
    expect(chatNode).toBeDefined()

    // Before navigation: no children.
    expect(getChildren(db, chatNode!.id).length).toBe(0)

    // parsed=0 initially.
    const before = db.prepare("SELECT parsed FROM nodes WHERE id = ?").get(chatNode!.id) as { parsed: number }
    expect(before.parsed).toBe(0)

    // Simulate "user navigates into" → parseStubFile.
    const ok = parseStubFile(db, chatNode!.id, chatPath, "raw/chats/session.md")
    expect(ok).toBe(true)

    // After promotion: children materialized.
    const after = getChildren(db, chatNode!.id)
    expect(after.length).toBeGreaterThan(0)

    // parsed=1 flag is set.
    const afterFlag = db.prepare("SELECT parsed FROM nodes WHERE id = ?").get(chatNode!.id) as { parsed: number }
    expect(afterFlag.parsed).toBe(1)
  })

  test("multiple collapse patterns (raw/chats + archive) both skip parse", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    mkdirSync(join(tmpDir, "archive", "Asana"), { recursive: true })
    mkdirSync(join(tmpDir, "projects"), { recursive: true })

    writeFileSync(join(tmpDir, "raw", "chats", "a.md"), "# A\n\n## X\n\n- 1\n- 2\n")
    writeFileSync(join(tmpDir, "archive", "Asana", "b.md"), "# B\n\n## Y\n\n- 3\n- 4\n")
    writeFileSync(join(tmpDir, "projects", "c.md"), "# C\n\n## Z\n\n- 5\n- 6\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    runLoad(tmpDir, db, ["raw/chats/**", "archive/**"])

    const a = resolveNode(db, "raw/chats/a.md")
    const b = resolveNode(db, "archive/Asana/b.md")
    const c = resolveNode(db, "projects/c.md")

    expect(getChildren(db, a!.id).length).toBe(0)
    expect(getChildren(db, b!.id).length).toBe(0)
    // Non-collapsed file gets full parse.
    expect(getChildren(db, c!.id).length).toBeGreaterThan(0)
  })

  test("promoted stub no longer carries _collapsed flag — won't re-queue", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    const chatPath = join(tmpDir, "raw", "chats", "session.md")
    writeFileSync(chatPath, "# Chat\n\n## T1\n\n- a\n- b\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    runLoad(tmpDir, db, ["raw/chats/**"])
    const chatNode = resolveNode(db, "raw/chats/session.md")
    expect(chatNode).toBeDefined()

    // Verify the stub has _collapsed.
    const stubRow = db.prepare("SELECT data FROM nodes WHERE id = ?").get(chatNode!.id) as { data: string }
    const stubData = JSON.parse(stubRow.data) as { _stub?: boolean; _collapsed?: boolean }
    expect(stubData._collapsed).toBe(true)

    // Promote.
    parseStubFile(db, chatNode!.id, chatPath, "raw/chats/session.md")

    // After promotion the file node no longer matches the _stub/_collapsed
    // LIKE queries that loader.ts uses to re-queue stubs on subsequent loads.
    const promotedRow = db.prepare("SELECT data, parsed FROM nodes WHERE id = ?").get(chatNode!.id) as {
      data: string
      parsed: number
    }
    expect(promotedRow.parsed).toBe(1)
    const promotedData = JSON.parse(promotedRow.data) as { _stub?: boolean; _collapsed?: boolean }
    expect(promotedData._stub).toBeUndefined()
    expect(promotedData._collapsed).toBeUndefined()

    // The re-queue SQL (same shape as loader.ts) should return zero rows.
    const reQueueMatches = db
      .prepare(
        "SELECT COUNT(*) as c FROM nodes WHERE id = ? AND parsed = 0 AND data LIKE '%_stub%' AND (data NOT LIKE '%_collapsed%')",
      )
      .get(chatNode!.id) as { c: number }
    expect(reQueueMatches.c).toBe(0)
  })

  test("loading without config key leaves behavior unchanged (backward compat)", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    writeFileSync(join(tmpDir, "raw", "chats", "session.md"), "# Chat\n\n## T1\n\n- a\n- b\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // No explicit matcher, no config file present in tmpDir.
    const gen = loadRepo(tmpDir, { db })
    let r = gen.next()
    while (!r.done) r = gen.next()

    const chatNode = resolveNode(db, "raw/chats/session.md")
    expect(chatNode).toBeDefined()
    // Default behavior: the file gets parsed (non-zero children).
    expect(getChildren(db, chatNode!.id).length).toBeGreaterThan(0)
  })
})
