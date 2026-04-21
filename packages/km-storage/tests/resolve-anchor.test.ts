/**
 * resolveAnchor — Public API Tests
 *
 * Integration tests for the link-resolution API. Covers the four kinds:
 * parsed, referenced-anchor, whole-file, not-found.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { SCHEMA } from "../src/db/schema.ts"
import { loadRepo } from "../src/repo/loader.ts"
import { resolveInboundAnchors } from "../src/markdown/resolve-inbound-anchors.ts"
import { resolveAnchor } from "../src/links/resolve-anchor.ts"
import { resolveNode } from "../src/db/db.ts"
import { createCollapseParseMatcher } from "../src/markdown/collapse-parse.ts"

function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), "km-resolve-anchor-"))
}

function runLoad(tmpDir: string, db: Database, patterns: string[] = []): void {
  const collapseMatcher = patterns.length > 0 ? createCollapseParseMatcher(patterns) : undefined
  const gen = loadRepo(tmpDir, { db, collapseMatcher })
  let r = gen.next()
  while (!r.done) r = gen.next()
}

describe("resolveAnchor: parsed file", () => {
  test("heading in fully-parsed file → 'parsed' with child node id", () => {
    const tmpDir = freshTmp()
    writeFileSync(join(tmpDir, "plain.md"), "# Plain\n\n## Section\n\nBody.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db)

    const result = resolveAnchor(db, { path: "plain", anchor: "Section" })
    expect(result.kind).toBe("parsed")
    expect(result.nodeId).toBeDefined()
    // Should be the heading node, NOT the file node
    const fileNode = resolveNode(db, "plain.md")!
    expect(result.nodeId).not.toBe(fileNode.id)
  })

  test("missing heading in parsed file → 'whole-file'", () => {
    const tmpDir = freshTmp()
    writeFileSync(join(tmpDir, "plain.md"), "# Plain\n\n## Section\n\nBody.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db)

    const result = resolveAnchor(db, { path: "plain", anchor: "NonExistent" })
    expect(result.kind).toBe("whole-file")
    const fileNode = resolveNode(db, "plain.md")!
    expect(result.nodeId).toBe(fileNode.id)
  })
})

describe("resolveAnchor: collapsed file with referenced anchor", () => {
  test("referenced heading → 'referenced-anchor' with offset", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(
      join(tmpDir, "chats", "s.md"),
      "# Chat\n\n## Turn 0\n\nbody0\n\n## Turn 5\n\nbody5\n",
    )
    writeFileSync(join(tmpDir, "notes.md"), "# N\n\n[[s#Turn 5]] is interesting.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])
    resolveInboundAnchors(db, { repoRoot: tmpDir })

    const result = resolveAnchor(db, { path: "s", anchor: "Turn 5" })
    expect(result.kind).toBe("referenced-anchor")
    expect(result.nodeId).toBeDefined()
    expect(result.offset).toBeGreaterThan(0)
    expect(result.headingLevel).toBe(2)

    // nodeId is the FILE node, not a synthetic heading node
    const fileNode = resolveNode(db, "chats/s.md")!
    expect(result.nodeId).toBe(fileNode.id)
  })

  test("block ref → 'referenced-anchor' with null heading_level", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(join(tmpDir, "chats", "s.md"), "# Chat\n\nFirst. ^para-1\n")
    writeFileSync(join(tmpDir, "notes.md"), "# N\n\nLink [[s^para-1]]\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])
    resolveInboundAnchors(db, { repoRoot: tmpDir })

    const result = resolveAnchor(db, { path: "s", anchor: "^para-1" })
    expect(result.kind).toBe("referenced-anchor")
    expect(result.headingLevel).toBeNull()
  })
})

describe("resolveAnchor: collapsed file without cached anchor", () => {
  test("anchor not in referenced_anchors → 'whole-file' (fallback)", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "chats"), { recursive: true })

    writeFileSync(join(tmpDir, "chats", "s.md"), "# Chat\n\n## Turn 0\n\nbody0\n")
    writeFileSync(join(tmpDir, "notes.md"), "# N\n\n[[s#Turn 0]]\n") // only Turn 0 referenced

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["chats/**"])
    resolveInboundAnchors(db, { repoRoot: tmpDir })

    // Querying an anchor that was never recorded → whole-file
    const result = resolveAnchor(db, { path: "s", anchor: "Turn 99" })
    expect(result.kind).toBe("whole-file")
    const fileNode = resolveNode(db, "chats/s.md")!
    expect(result.nodeId).toBe(fileNode.id)
    expect(result.offset).toBeUndefined()
  })
})

describe("resolveAnchor: missing file", () => {
  test("path resolves to nothing → 'not-found'", () => {
    const tmpDir = freshTmp()
    writeFileSync(join(tmpDir, "other.md"), "# Other\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db)

    const result = resolveAnchor(db, { path: "NonExistent", anchor: "Section" })
    expect(result.kind).toBe("not-found")
    expect(result.nodeId).toBeUndefined()
  })

  test("empty path or anchor → 'not-found'", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    expect(resolveAnchor(db, { path: "", anchor: "Section" }).kind).toBe("not-found")
    expect(resolveAnchor(db, { path: "file", anchor: "" }).kind).toBe("not-found")
  })
})
