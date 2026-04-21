/**
 * Inbound Anchor Resolution — Integration Tests
 *
 * End-to-end pipeline:
 *   1. Discovery writes a collapsed file stub + its outbound link rows.
 *   2. A separate fully-parsed file has outbound `[[chat#turn-5]]` links
 *      pointing at the collapsed file.
 *   3. resolveInboundAnchors() runs, reads outbound links, identifies
 *      referenced fragments for each collapsed file, extracts the
 *      anchors in the collapsed file content, and writes the matching
 *      (file_id, anchor, source_offset, ref_count) rows.
 *
 * Validates the key properties:
 *   - Pruning: unreferenced headings are NOT recorded.
 *   - Ref counting: a fragment referenced 3 times gets ref_count=3.
 *   - Non-collapsed files: no referenced_anchor rows written for them.
 *   - Idempotence: re-running produces the same output.
 *
 * Covers km-storage.collapsed-file-anchors (C4).
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { SCHEMA } from "../src/db/schema.ts"
import { loadRepo } from "../src/repo/loader.ts"
import { resolveInboundAnchors } from "../src/markdown/resolve-inbound-anchors.ts"
import {
  countReferencedAnchors,
  getReferencedAnchorsForFile,
  getReferencedAnchor,
} from "../src/db/referenced-anchors.ts"
import { resolveNode } from "../src/db/db.ts"
import { createCollapseParseMatcher } from "../src/markdown/collapse-parse.ts"

function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), "km-inbound-anchors-"))
}

function runLoad(tmpDir: string, db: Database, patterns: string[]): void {
  const collapseMatcher = patterns.length > 0 ? createCollapseParseMatcher(patterns) : undefined
  const gen = loadRepo(tmpDir, { db, collapseMatcher })
  let r = gen.next()
  while (!r.done) r = gen.next()
}

describe("resolveInboundAnchors: pruning", () => {
  test("only referenced anchors are recorded, unreferenced headings are skipped", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    // Collapsed file with 10 headings.
    const chatLines: string[] = ["# Chat\n"]
    for (let i = 0; i < 10; i++) chatLines.push(`## Turn ${i}\n\nContent turn ${i}.\n`)
    writeFileSync(join(tmpDir, "chats", "session.md"), chatLines.join("\n"))

    // A fully-parsed notes file references 3 of the 10 turns.
    writeFileSync(
      join(tmpDir, "notes.md"),
      "# Notes\n\nSee [[session#Turn 0]], [[session#Turn 3]], and [[session#Turn 7]].\n",
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])

    const chatNode = resolveNode(db, "chats/session.md")
    expect(chatNode).toBeDefined()

    const result = resolveInboundAnchors(db, { repoRoot: tmpDir })

    // Exactly 3 anchors written (referenced), not 10.
    expect(result.anchorsWritten).toBe(3)
    expect(result.filesScanned).toBe(1)
    expect(countReferencedAnchors(db)).toBe(3)

    const rows = getReferencedAnchorsForFile(db, chatNode!.id)
    expect(rows.map((r) => r.anchor).sort()).toEqual(["Turn 0", "Turn 3", "Turn 7"])

    // Each has ref_count=1 and heading_level=2.
    for (const r of rows) {
      expect(r.ref_count).toBe(1)
      expect(r.heading_level).toBe(2)
      expect(r.source_offset).toBeGreaterThan(0)
    }
  })
})

describe("resolveInboundAnchors: ref counting", () => {
  test("a fragment referenced multiple times has ref_count summed", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(join(tmpDir, "chats", "session.md"), "# Chat\n\n## Turn 0\n\nbody0\n\n## Turn 1\n\nbody1\n")

    writeFileSync(
      join(tmpDir, "notes.md"),
      // "Turn 0" is linked 3 times; "Turn 1" is linked once
      "# Notes\n\n[[session#Turn 0]] A.\n\n[[session#Turn 0]] B.\n\n[[session#Turn 1]] C.\n\n[[session#Turn 0]] D.\n",
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])

    resolveInboundAnchors(db, { repoRoot: tmpDir })

    const chatNode = resolveNode(db, "chats/session.md")
    const turn0 = getReferencedAnchor(db, chatNode!.id, "Turn 0")
    const turn1 = getReferencedAnchor(db, chatNode!.id, "Turn 1")

    expect(turn0?.ref_count).toBe(3)
    expect(turn1?.ref_count).toBe(1)
  })
})

describe("resolveInboundAnchors: inbound from another collapsed file", () => {
  test("links from one collapsed file to another are tracked", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    // Two collapsed chat files; one links to a section in the other.
    writeFileSync(join(tmpDir, "chats", "session-a.md"), "# Chat A\n\n## Intro\n\nSee [[session-b#Conclusions]].\n")
    writeFileSync(join(tmpDir, "chats", "session-b.md"), "# Chat B\n\n## Conclusions\n\nThe end.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])

    resolveInboundAnchors(db, { repoRoot: tmpDir })

    const bNode = resolveNode(db, "chats/session-b.md")
    const rows = getReferencedAnchorsForFile(db, bNode!.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.anchor).toBe("Conclusions")
    expect(rows[0]?.ref_count).toBe(1)
  })
})

describe("resolveInboundAnchors: non-collapsed files ignored", () => {
  test("references TO non-collapsed files do not create rows", () => {
    const tmpDir = freshTmp()

    // Non-collapsed file with a heading
    writeFileSync(join(tmpDir, "plain.md"), "# Plain\n\n## Section\n\nBody.\n")
    writeFileSync(join(tmpDir, "notes.md"), "# Notes\n\n[[plain#Section]]\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["never-matches/**"]) // collapse-parse off

    resolveInboundAnchors(db, { repoRoot: tmpDir })

    // No collapsed files → no rows.
    expect(countReferencedAnchors(db)).toBe(0)
  })
})

describe("resolveInboundAnchors: no inbound references", () => {
  test("collapsed file with no inbound links produces zero rows", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(join(tmpDir, "chats", "orphan.md"), "# Chat\n\n## T1\n\n## T2\n\n## T3\n")
    writeFileSync(join(tmpDir, "notes.md"), "# Notes\n\nNothing linked.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])

    const result = resolveInboundAnchors(db, { repoRoot: tmpDir })

    expect(result.filesScanned).toBe(0)
    expect(result.anchorsWritten).toBe(0)
    expect(countReferencedAnchors(db)).toBe(0)
  })
})

describe("resolveInboundAnchors: block refs", () => {
  test("obsidian-style [[file^blk]] resolves to a block anchor", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(
      join(tmpDir, "chats", "session.md"),
      "# Chat\n\nFirst paragraph. ^para-1\n\nSecond paragraph. ^para-2\n",
    )
    writeFileSync(join(tmpDir, "notes.md"), "# Notes\n\nSee [[session^para-1]] for context.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])

    resolveInboundAnchors(db, { repoRoot: tmpDir })

    const chatNode = resolveNode(db, "chats/session.md")
    const rows = getReferencedAnchorsForFile(db, chatNode!.id)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.anchor).toBe("^para-1")
    expect(rows[0]?.heading_level).toBeNull()
    expect(rows[0]?.source_offset).toBeGreaterThan(0)
  })
})

describe("resolveInboundAnchors: idempotence", () => {
  test("running twice produces the same rows (delete-then-insert)", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(join(tmpDir, "chats", "s.md"), "# Chat\n\n## One\n\n## Two\n")
    writeFileSync(join(tmpDir, "notes.md"), "# N\n\n[[s#One]] and [[s#Two]].\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])

    const first = resolveInboundAnchors(db, { repoRoot: tmpDir })
    const countAfterFirst = countReferencedAnchors(db)
    expect(first.anchorsWritten).toBe(2)
    expect(countAfterFirst).toBe(2)

    // Run again — same result, no duplicates.
    const second = resolveInboundAnchors(db, { repoRoot: tmpDir })
    expect(second.anchorsWritten).toBe(2)
    expect(countReferencedAnchors(db)).toBe(2)
  })
})

describe("resolveInboundAnchors: scoped to specific files", () => {
  test("fileIds option limits the pass to selected files", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(join(tmpDir, "chats", "a.md"), "# A\n\n## AA\n")
    writeFileSync(join(tmpDir, "chats", "b.md"), "# B\n\n## BB\n")
    writeFileSync(join(tmpDir, "notes.md"), "# N\n\n[[a#AA]] and [[b#BB]].\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])

    const aNode = resolveNode(db, "chats/a.md")!
    const bNode = resolveNode(db, "chats/b.md")!

    // loadRepo's auto-pass populated rows for both files.
    expect(getReferencedAnchorsForFile(db, aNode.id)).toHaveLength(1)
    expect(getReferencedAnchorsForFile(db, bNode.id)).toHaveLength(1)

    // Simulate: file A's content changed on disk but B didn't.
    // A scoped re-run should refresh A's rows and leave B's intact.
    const result = resolveInboundAnchors(db, { repoRoot: tmpDir, fileIds: [aNode.id] })

    expect(result.filesScanned).toBe(1)
    expect(result.anchorsWritten).toBe(1)

    const aRows = getReferencedAnchorsForFile(db, aNode.id)
    expect(aRows.map((r) => r.anchor)).toEqual(["AA"])

    // B's rows are preserved — the scoped call didn't touch them.
    const bRows = getReferencedAnchorsForFile(db, bNode.id)
    expect(bRows.map((r) => r.anchor)).toEqual(["BB"])
  })

  test("fileIds with a file whose referrers vanished → rows cleared", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(join(tmpDir, "chats", "a.md"), "# A\n\n## AA\n")
    writeFileSync(join(tmpDir, "notes.md"), "# N\n\n[[a#AA]] exists.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])

    const aNode = resolveNode(db, "chats/a.md")!
    expect(getReferencedAnchorsForFile(db, aNode.id)).toHaveLength(1)

    // Simulate: the only referrer file was deleted. Wipe the outbound rows
    // and re-scope the resolver to file A.
    db.run("DELETE FROM links")
    db.run("DELETE FROM collapsed_file_links")

    const result = resolveInboundAnchors(db, { repoRoot: tmpDir, fileIds: [aNode.id] })
    expect(result.anchorsWritten).toBe(0)
    expect(getReferencedAnchorsForFile(db, aNode.id)).toHaveLength(0)
  })
})

describe("resolveInboundAnchors: missing fragment skipped", () => {
  test("referencing an anchor that doesn't exist in the file produces no row", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(join(tmpDir, "chats", "s.md"), "# Chat\n\n## Exists\n")
    writeFileSync(join(tmpDir, "notes.md"), "# N\n\n[[s#Exists]] and [[s#Missing]].\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])

    resolveInboundAnchors(db, { repoRoot: tmpDir })

    const chatNode = resolveNode(db, "chats/s.md")!
    const rows = getReferencedAnchorsForFile(db, chatNode.id)

    // "Missing" has no matching heading — only "Exists" is recorded.
    expect(rows).toHaveLength(1)
    expect(rows[0]?.anchor).toBe("Exists")
  })
})
