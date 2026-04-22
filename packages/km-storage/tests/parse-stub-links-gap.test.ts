/**
 * parseStubFile → canonical `links` table population.
 *
 * Bug km-storage.parse-stub-links-gap:
 * When a collapsed stub is promoted to a full parse via `parseStubFile`,
 * the child nodes get inserted but the canonical `links` table is never
 * populated. The collapsed_file_links rows are deleted (per the
 * invalidation contract in db/schema.ts) — which means the outgoing
 * edges of that file disappear from the backlink view until the next
 * full-load / state.db rebuild.
 *
 * Fix contract:
 *   After `parseStubFile(...)` returns, for every [[target]] the file
 *   contains:
 *     - a row (host_id = <some node inside the promoted file>,
 *              href = "km:target", rel = "link")
 *       must exist in `links`, AND
 *     - `collapsed_file_links` rows for the promoted host_id must be
 *       gone (replaced by the canonical `links` edges).
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
import { normalizeLinkHref } from "@km/markdown"

function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), "km-psl-"))
}

function runLoad(tmpDir: string, db: Database, patterns: string[]): void {
  const collapseMatcher = patterns.length > 0 ? createCollapseParseMatcher(patterns) : undefined
  const gen = loadRepo(tmpDir, { db, collapseMatcher })
  let r = gen.next()
  while (!r.done) r = gen.next()
}

describe("parseStubFile: canonical links population", () => {
  test("promotion populates `links` with host inside the promoted subtree", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })

    // A real target so backlink asserts can resolve.
    writeFileSync(join(tmpDir, "target.md"), "# Target\n\nA node to be linked to.\n")
    // A stub file matching the collapse pattern; outgoing [[target]] edge.
    const stubPath = join(tmpDir, "raw", "chats", "stub.md")
    writeFileSync(stubPath, "# Stub\n\nThis references [[target]] once.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["raw/chats/**"])

    const stubNode = resolveNode(db, "raw/chats/stub.md")
    expect(stubNode).toBeDefined()

    const href = normalizeLinkHref("wiki", "target")

    // Precondition: stub form — collapsed_file_links has the edge, links doesn't.
    const cflBefore = (
      db.query("SELECT COUNT(*) as c FROM collapsed_file_links WHERE host_id = ? AND href = ?").get(stubNode!.id, href) as {
        c: number
      }
    ).c
    expect(cflBefore).toBeGreaterThan(0)

    const linksBefore = (
      db.query("SELECT COUNT(*) as c FROM links WHERE href = ?").get(href) as { c: number }
    ).c
    expect(linksBefore).toBe(0)

    // Promote.
    const ok = parseStubFile(db, stubNode!.id, stubPath, "raw/chats/stub.md")
    expect(ok).toBe(true)

    // Postcondition 1: collapsed_file_links rows gone for this host.
    const cflAfter = (
      db.query("SELECT COUNT(*) as c FROM collapsed_file_links WHERE host_id = ?").get(stubNode!.id) as { c: number }
    ).c
    expect(cflAfter).toBe(0)

    // Postcondition 2: `links` now carries the outgoing edge. host_id can be
    // the file node itself or any descendant created by the full parse —
    // what matters is the edge is canonical now.
    const descendants = new Set(
      (
        db
          .query(
            "WITH RECURSIVE tree AS (SELECT id FROM nodes WHERE id = ? UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent_id = t.id) SELECT id FROM tree",
          )
          .all(stubNode!.id) as Array<{ id: string }>
      ).map((r) => r.id),
    )

    const linkRows = db.query("SELECT host_id, href, rel FROM links WHERE href = ?").all(href) as Array<{
      host_id: string
      href: string
      rel: string
    }>
    expect(linkRows.length).toBeGreaterThan(0)
    expect(linkRows.some((r) => descendants.has(r.host_id) && r.rel === "link")).toBe(true)

    // Postcondition 3: backlink view surfaces the edge post-promotion.
    const postBacklinks = getBacklinksByHref(db, href)
    const fromPromoted = postBacklinks.filter((bl) => descendants.has(bl.host_id))
    expect(fromPromoted.length).toBeGreaterThan(0)
  })

  test("promotion of a file with multiple outgoing edges populates all of them", () => {
    const tmpDir = freshTmp()
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })

    writeFileSync(join(tmpDir, "Alpha.md"), "# Alpha\n")
    writeFileSync(join(tmpDir, "Beta.md"), "# Beta\n")
    const stubPath = join(tmpDir, "raw", "chats", "multi.md")
    writeFileSync(stubPath, "# Multi\n\nRefs [[Alpha]] and [[Beta]] and [[Alpha]] again.\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoad(tmpDir, db, ["raw/chats/**"])

    const stubNode = resolveNode(db, "raw/chats/multi.md")
    expect(stubNode).toBeDefined()

    parseStubFile(db, stubNode!.id, stubPath, "raw/chats/multi.md")

    const alphaHref = normalizeLinkHref("wiki", "Alpha")
    const betaHref = normalizeLinkHref("wiki", "Beta")

    const alphaCount = (
      db.query("SELECT COUNT(*) as c FROM links WHERE href = ?").get(alphaHref) as { c: number }
    ).c
    const betaCount = (
      db.query("SELECT COUNT(*) as c FROM links WHERE href = ?").get(betaHref) as { c: number }
    ).c

    // Two occurrences of [[Alpha]], one of [[Beta]].
    expect(alphaCount).toBe(2)
    expect(betaCount).toBe(1)
  })
})
