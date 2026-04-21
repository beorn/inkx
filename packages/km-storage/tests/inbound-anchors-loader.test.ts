/**
 * Inbound Anchor Resolution — End-to-End Loader Integration
 *
 * Confirms `loadRepo()` automatically runs the inbound-anchor pass when
 * collapseParse is configured. Tests the full pipeline — discovery,
 * reconciliation, outbound extraction, inbound resolution — producing
 * queryable referenced_anchors rows without any explicit follow-up call.
 *
 * Companion to `resolve-inbound-anchors.test.ts` (which calls the
 * resolver directly) and `resolve-anchor.test.ts` (which tests the
 * lookup API).
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { SCHEMA } from "../src/db/schema.ts"
import { loadRepo } from "../src/repo/loader.ts"
import {
  countReferencedAnchors,
  getReferencedAnchorsForFile,
} from "../src/db/referenced-anchors.ts"
import { resolveNode } from "../src/db/db.ts"
import { createCollapseParseMatcher } from "../src/markdown/collapse-parse.ts"

function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), "km-inbound-loader-"))
}

function runLoad(tmpDir: string, db: Database, patterns: string[] = []): void {
  const collapseMatcher = patterns.length > 0 ? createCollapseParseMatcher(patterns) : undefined
  const gen = loadRepo(tmpDir, { db, collapseMatcher })
  let r = gen.next()
  while (!r.done) r = gen.next()
}

describe("loadRepo: auto-runs inbound anchor resolution", () => {
  test("end-to-end: loadRepo populates referenced_anchors for collapsed files", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(
      join(tmpDir, "chats", "s.md"),
      "# Chat\n\n## Intro\n\n## Turn 1\n\n## Turn 2\n\n## Turn 3\n",
    )
    writeFileSync(
      join(tmpDir, "notes.md"),
      "# N\n\n[[s#Turn 1]] and [[s#Turn 3]] — both interesting.\n",
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Single loadRepo call — no explicit resolveInboundAnchors follow-up.
    runLoad(tmpDir, db, ["chats/**"])

    // After load, referenced_anchors is populated.
    const count = countReferencedAnchors(db)
    expect(count).toBe(2)

    const chatNode = resolveNode(db, "chats/s.md")!
    const rows = getReferencedAnchorsForFile(db, chatNode.id)
    expect(rows.map((r) => r.anchor).sort()).toEqual(["Turn 1", "Turn 3"])
  })

  test("no collapse-parse patterns → no anchor rows (backward-compat)", () => {
    const tmpDir = freshTmp()
    writeFileSync(join(tmpDir, "a.md"), "# A\n\n## Section\n")
    writeFileSync(join(tmpDir, "b.md"), "# B\n\n[[a#Section]]\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // No patterns — effectively disabled.
    runLoad(tmpDir, db)

    expect(countReferencedAnchors(db)).toBe(0)
  })

  test("collapsed files but no inbound references → no rows", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(join(tmpDir, "chats", "orphan.md"), "# Chat\n\n## Turn 0\n\n## Turn 1\n")
    // No file links to it.

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])

    expect(countReferencedAnchors(db)).toBe(0)
  })
})
