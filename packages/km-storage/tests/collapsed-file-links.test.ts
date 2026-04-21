/**
 * Collapsed File Links — Integration Tests
 *
 * End-to-end: a file matched by `collapseParse.patterns` becomes an opaque
 * stub AND its outgoing link edges are preserved in `collapsed_file_links`.
 * Backlink queries UNION parsed-node edges (`links`) with collapsed-file
 * edges so the target sees them regardless of which source is collapsed.
 *
 * Covers:
 *   - Edges populate on discovery when a file matches a collapse pattern.
 *   - Non-collapsed files' edges go to `links` as before.
 *   - Backlink query unions over both tables.
 *   - Promoting a collapsed stub (parseStubFile) deletes its collapsed-link
 *     rows so the parsed-node `links` table becomes the sole edge source.
 *   - Deleting a node cascades the cleanup.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { SCHEMA } from "../src/db/schema.ts"
import { loadRepo, parseStubFile } from "../src/repo/loader.ts"
import { resolveNode } from "../src/db/db.ts"
import { createCollapseParseMatcher } from "../src/markdown/collapse-parse.ts"
import { getBacklinksByHref } from "../src/db/links.ts"
import {
  getCollapsedFileBacklinks,
  removeCollapsedFileLinks,
} from "../src/db/collapsed-file-links.ts"
import { normalizeLinkHref } from "@km/markdown"
import { deleteSubtree } from "../src/db/ops.ts"

function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), "km-cfl-"))
}

function runLoad(tmpDir: string, db: Database, patterns: string[] = []): void {
  const collapseMatcher = patterns.length > 0 ? createCollapseParseMatcher(patterns) : undefined
  const gen = loadRepo(tmpDir, { db, collapseMatcher })
  let r = gen.next()
  while (!r.done) r = gen.next()
}

describe("collapsed_file_links: discovery integration", () => {
  test("3 wiki-links + 2 md-links in a collapsed file → 5 edges in table", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })

    const content = [
      "# Chat Session",
      "",
      "Discussed [[Alpha]] and [[Beta|the beta]] today.",
      "",
      "See [[Project/Gamma#Plans]] for details.",
      "",
      "Reference [docs](./delta.md) and [external](https://example.com).",
    ].join("\n")
    writeFileSync(join(tmpDir, "raw", "chats", "session.md"), content)

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["raw/chats/**"])

    const host = resolveNode(db, "raw/chats/session.md")
    expect(host).toBeDefined()

    const rows = db
      .query("SELECT * FROM collapsed_file_links WHERE host_id = ? ORDER BY source_offset")
      .all(host!.id) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(5)

    // Verify link_types split as authored.
    const types = rows.map((r) => r.link_type)
    expect(types.filter((t) => t === "wiki")).toHaveLength(3)
    expect(types.filter((t) => t === "md")).toHaveLength(2)

    // Verify hrefs normalized.
    const hrefs = rows.map((r) => r.href)
    expect(hrefs).toContain("km:Alpha")
    expect(hrefs).toContain("km:Beta")
    expect(hrefs).toContain("km:Project/Gamma#Plans")
    expect(hrefs).toContain("./delta.md")
    expect(hrefs).toContain("https://example.com")
  })

  test("non-collapsed file writes to `links`, not `collapsed_file_links`", () => {
    const tmpDir = freshTmp()
    writeFileSync(join(tmpDir, "notes.md"), "# Notes\n\nSee [[Alpha]] and [[Beta]] here.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, [])

    const cflCount = (db.query("SELECT COUNT(*) as c FROM collapsed_file_links").get() as { c: number }).c
    expect(cflCount).toBe(0)

    // Parsed-node edges land in `links` with the standard pipeline. We don't
    // assert exact count because the parser also emits edges for sub-nodes;
    // just verify at least the wiki links surface.
    const linkCount = (
      db.query("SELECT COUNT(*) as c FROM links WHERE href IN (?, ?)").get("km:Alpha", "km:Beta") as {
        c: number
      }
    ).c
    expect(linkCount).toBeGreaterThanOrEqual(2)
  })
})

describe("collapsed_file_links: backlink UNION", () => {
  test("target sees backlinks from a collapsed source via UNION query", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    // The target node gets an actual file so it's resolvable.
    writeFileSync(join(tmpDir, "Alpha.md"), "# Alpha\n\nA knowledge node.\n")
    // The source is collapsed; its outgoing links should surface.
    writeFileSync(
      join(tmpDir, "raw", "chats", "session.md"),
      "# Session\n\nRefers to [[Alpha]] in many places.\n",
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["raw/chats/**"])

    const href = normalizeLinkHref("wiki", "Alpha")
    const backlinks = getBacklinksByHref(db, href)

    // Expect >= 1 row from the collapsed session.
    expect(backlinks.length).toBeGreaterThan(0)
    const session = resolveNode(db, "raw/chats/session.md")
    expect(session).toBeDefined()
    expect(backlinks.some((bl) => bl.host_id === session!.id)).toBe(true)
  })

  test("UNION works when both tables have rows pointing at the same target", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    writeFileSync(join(tmpDir, "Alpha.md"), "# Alpha\n")
    writeFileSync(join(tmpDir, "refs-a.md"), "# Refs A\n\nLinks [[Alpha]].\n")
    writeFileSync(
      join(tmpDir, "raw", "chats", "chat.md"),
      "# Chat\n\nAlso mentions [[Alpha]] casually.\n",
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["raw/chats/**"])

    // Both tables should now have rows targeting km:Alpha. The UNION
    // surfaces them all via a single query.
    const backlinks = getBacklinksByHref(db, "km:Alpha")

    // Count rows contributed by each side so we can assert the UNION
    // covers both.
    const linksCount = (
      db.query("SELECT COUNT(*) as c FROM links WHERE href = ?").get("km:Alpha") as { c: number }
    ).c
    const cflCount = (
      db
        .query("SELECT COUNT(*) as c FROM collapsed_file_links WHERE href = ?")
        .get("km:Alpha") as { c: number }
    ).c
    expect(linksCount).toBeGreaterThan(0)
    expect(cflCount).toBeGreaterThan(0)
    expect(backlinks.length).toBe(linksCount + cflCount)

    // The chat.md file is collapsed, so its edge lives in
    // `collapsed_file_links` with host_id = the file's node id.
    const chat = resolveNode(db, "raw/chats/chat.md")
    expect(chat).toBeDefined()
    expect(backlinks.some((bl) => bl.host_id === chat!.id)).toBe(true)
  })
})

describe("collapsed_file_links: invalidation", () => {
  test("promoting a collapsed stub deletes its collapsed-link rows", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    const filePath = join(tmpDir, "raw", "chats", "session.md")
    writeFileSync(filePath, "# Chat\n\nRefers to [[Alpha]] here.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["raw/chats/**"])

    const host = resolveNode(db, "raw/chats/session.md")
    expect(host).toBeDefined()

    // Before promotion: collapsed-link rows present.
    const before = (
      db.query("SELECT COUNT(*) as c FROM collapsed_file_links WHERE host_id = ?").get(host!.id) as {
        c: number
      }
    ).c
    expect(before).toBeGreaterThan(0)

    // Promote.
    const ok = parseStubFile(db, host!.id, filePath, "raw/chats/session.md")
    expect(ok).toBe(true)

    // After promotion: rows gone.
    const after = (
      db.query("SELECT COUNT(*) as c FROM collapsed_file_links WHERE host_id = ?").get(host!.id) as {
        c: number
      }
    ).c
    expect(after).toBe(0)
  })

  test("promotion drops collapsed edges; target loses the pre-promotion backlink", () => {
    // Contract: parseStubFile promotes a stub to fully-parsed nodes and
    // clears its `collapsed_file_links` rows. The descendants it creates
    // DO NOT repopulate the `links` table — that's a separate pipeline
    // (resolveLinksGen) that runs during full-load only. After promotion,
    // the file's outgoing edges disappear from the backlink view until
    // either a re-sync runs or a content edit triggers the write path.
    // This test documents that behavior so a regression would surface.
    //
    // Follow-up: parseStubFile should also populate `links` — bead TBD.
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    writeFileSync(join(tmpDir, "Alpha.md"), "# Alpha\n")
    const filePath = join(tmpDir, "raw", "chats", "session.md")
    writeFileSync(filePath, "# Chat\n\nLinks [[Alpha]].\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["raw/chats/**"])

    const session = resolveNode(db, "raw/chats/session.md")
    expect(session).toBeDefined()

    const href = normalizeLinkHref("wiki", "Alpha")

    // Before promotion: collapsed edge visible with host_id=file.id.
    const preBacklinks = getBacklinksByHref(db, href)
    expect(preBacklinks.some((bl) => bl.host_id === session!.id)).toBe(true)

    // Promote the stub.
    parseStubFile(db, session!.id, filePath, "raw/chats/session.md")

    // Collapsed edges gone.
    const leftover = (
      db
        .query("SELECT COUNT(*) as c FROM collapsed_file_links WHERE host_id = ?")
        .get(session!.id) as { c: number }
    ).c
    expect(leftover).toBe(0)

    // Pre-existing limitation: `links` not populated by parseStubFile, so
    // the Alpha backlink from this host disappears until a full resync.
    // When that limitation is fixed, the assertion below will flip to
    // "postBacklinks contains a host within session's subtree".
    const postBacklinks = getBacklinksByHref(db, href)
    const descendants = new Set(
      (
        db
          .query(
            "WITH RECURSIVE tree AS (SELECT id FROM nodes WHERE id = ? UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent_id = t.id) SELECT id FROM tree",
          )
          .all(session!.id) as Array<{ id: string }>
      ).map((r) => r.id),
    )
    const fromSession = postBacklinks.filter((bl) => descendants.has(bl.host_id))
    expect(fromSession.length).toBe(0)
  })

  test("deleteSubtree cascades to collapsed_file_links", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    writeFileSync(
      join(tmpDir, "raw", "chats", "session.md"),
      "# Chat\n\nLinks [[Alpha]] and [[Beta]].\n",
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["raw/chats/**"])

    const host = resolveNode(db, "raw/chats/session.md")
    expect(host).toBeDefined()

    const before = (
      db.query("SELECT COUNT(*) as c FROM collapsed_file_links WHERE host_id = ?").get(host!.id) as {
        c: number
      }
    ).c
    expect(before).toBeGreaterThan(0)

    deleteSubtree(db, host!.id)

    const after = (
      db.query("SELECT COUNT(*) as c FROM collapsed_file_links WHERE host_id = ?").get(host!.id) as {
        c: number
      }
    ).c
    expect(after).toBe(0)
  })

  test("getCollapsedFileBacklinks + removeCollapsedFileLinks CRUD", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Manual insert to exercise the CRUD helpers in isolation.
    db.run(
      "INSERT INTO collapsed_file_links (host_id, href, rel, target_path, target_heading, link_text, link_type, source_offset, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["host-1", "km:Alpha", "link", "Alpha", null, "Alpha", "wiki", 0, Date.now()],
    )
    db.run(
      "INSERT INTO collapsed_file_links (host_id, href, rel, target_path, target_heading, link_text, link_type, source_offset, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["host-1", "km:Beta", "link", "Beta", null, "Beta", "wiki", 10, Date.now()],
    )

    const rows = getCollapsedFileBacklinks(db, ["km:Alpha", "km:Beta", "km:Gamma"])
    expect(rows).toHaveLength(2)

    removeCollapsedFileLinks(db, "host-1")
    const after = getCollapsedFileBacklinks(db, ["km:Alpha", "km:Beta"])
    expect(after).toHaveLength(0)
  })
})

describe("collapsed_file_links: backward compat", () => {
  test("without collapse patterns, table stays empty", () => {
    const tmpDir = freshTmp()
    writeFileSync(join(tmpDir, "notes.md"), "# Notes\n\n[[Alpha]] [[Beta]]\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, [])

    const count = (db.query("SELECT COUNT(*) as c FROM collapsed_file_links").get() as { c: number }).c
    expect(count).toBe(0)
  })
})
