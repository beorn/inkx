/**
 * Ref filters (`@person` / `#tag` / `+project`) execute via the `links` table.
 *
 * Phase 1 of `@km/all/L5-deprecation-purge` switched `buildRefCondition`
 * from `data.{mentions,tags,projects}` JSON LIKE to an EXISTS join on
 * the canonical `links` table. These tests prove:
 *
 *   1. positive ref filters resolve nodes that have the expected
 *      `(host_id, href, rel='link')` row,
 *   2. negated ref filters exclude them,
 *   3. tag-href percent-encoding (`#` → `%23`) is applied,
 *   4. path-form sigils (`@scope/sub`) flow through unchanged
 *      (sigil-boards Phase 1.1 emits these straight into the links table).
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import type { Database } from "bun:sqlite"
import { parseQuery, executeQuery } from "../../src/query.ts"
import { createTestDatabase } from "../query-test-helpers.ts"

function seedNodeWithLinks(
  db: Database,
  id: string,
  content: string,
  links: Array<{ href: string; rel?: string }>,
): void {
  const now = Date.now()
  db.run(
    `INSERT INTO nodes (id, type, content, created_at, updated_at, version, parent_idx)
     VALUES (?, 'p', ?, ?, ?, 'v1', 0)`,
    [id, content, now, now],
  )
  for (const link of links) {
    db.run(`INSERT INTO links (host_id, href, rel) VALUES (?, ?, ?)`, [id, link.href, link.rel ?? "link"])
  }
}

describe("Ref filters resolve via links table", () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
    // Three nodes, each with a different sigil href in the links table —
    // and intentionally NO `data.{mentions,tags,projects}` JSON.
    seedNodeWithLinks(db, "n-person", "Talk to Alice", [{ href: "km:@alice" }])
    seedNodeWithLinks(db, "n-tag", "Bug to fix", [{ href: "km:%23bug" }])
    seedNodeWithLinks(db, "n-project", "Cleanup task", [{ href: "km:+cleanup" }])
    seedNodeWithLinks(db, "n-pathform", "Owned by km/agent/3", [{ href: "km:@agent/3" }])
    seedNodeWithLinks(db, "n-empty", "no refs here", [])
  })

  afterEach(() => {
    db.close()
  })

  test("positive @person filter matches via links table", () => {
    const ast = parseQuery("@alice")
    const results = executeQuery(db, ast)
    expect(results.map((r) => r.id).sort()).toEqual(["n-person"])
  })

  test("positive #tag filter matches percent-encoded href", () => {
    const ast = parseQuery("#bug")
    const results = executeQuery(db, ast)
    expect(results.map((r) => r.id).sort()).toEqual(["n-tag"])
  })

  test("positive +project filter matches via links table", () => {
    const ast = parseQuery("+cleanup")
    const results = executeQuery(db, ast)
    expect(results.map((r) => r.id).sort()).toEqual(["n-project"])
  })

  test("negated -@person excludes the matching node, includes others", () => {
    const ast = parseQuery("-@alice")
    const results = executeQuery(db, ast)
    const ids = results.map((r) => r.id).sort()
    expect(ids).toContain("n-tag")
    expect(ids).toContain("n-project")
    expect(ids).toContain("n-pathform")
    expect(ids).toContain("n-empty")
    expect(ids).not.toContain("n-person")
  })

  test("negated -#tag excludes the matching node", () => {
    const ast = parseQuery("-#bug")
    const results = executeQuery(db, ast)
    const ids = results.map((r) => r.id).sort()
    expect(ids).not.toContain("n-tag")
    expect(ids).toContain("n-person")
  })

  test("negated -+project excludes the matching node", () => {
    const ast = parseQuery("-+cleanup")
    const results = executeQuery(db, ast)
    const ids = results.map((r) => r.id).sort()
    expect(ids).not.toContain("n-project")
    expect(ids).toContain("n-person")
  })

  test("path-form sigil @scope/sub resolves via canonical href", () => {
    // Verifies sigil-boards Phase 1.1 integration: `@agent/3` lands in the
    // links table as `km:@agent/3` (slash passes through, no encoding).
    const ast = parseQuery("@agent/3")
    const results = executeQuery(db, ast)
    expect(results.map((r) => r.id)).toEqual(["n-pathform"])
  })

  test("ref filter does NOT match on data.mentions JSON when links row absent", () => {
    // Seed a node with the legacy `data.mentions` shape but NO links row —
    // proves the query no longer falls back to the JSON sidecar.
    const now = Date.now()
    db.run(
      `INSERT INTO nodes (id, type, content, data, created_at, updated_at, version, parent_idx)
       VALUES ('n-jsonOnly', 'p', 'legacy', '{"mentions":["zara"]}', ?, ?, 'v1', 99)`,
      [now, now],
    )
    const ast = parseQuery("@zara")
    const results = executeQuery(db, ast)
    expect(results.map((r) => r.id)).toEqual([])
  })

  test("priority:Px resolves via links table (#P1 hashtag href)", () => {
    // Phase 1 also routes `priority:P1` queries through the links table —
    // canonical authored form is the H1 `#P1` hashtag, materialized as
    // `km:%23P1` in the links table by `collectSigilLinks`.
    seedNodeWithLinks(db, "n-prio-p1", "Important #P1", [{ href: "km:%23P1" }])
    seedNodeWithLinks(db, "n-prio-p2", "Less important #P2", [{ href: "km:%23P2" }])
    const p1 = executeQuery(db, parseQuery("priority:P1"))
    expect(p1.map((r) => r.id)).toEqual(["n-prio-p1"])
    const p2 = executeQuery(db, parseQuery("priority:P2"))
    expect(p2.map((r) => r.id)).toEqual(["n-prio-p2"])
  })

  test("priority:P1,P2 (comma-separated OR) matches either via links table", () => {
    seedNodeWithLinks(db, "n-prio-p1", "a #P1", [{ href: "km:%23P1" }])
    seedNodeWithLinks(db, "n-prio-p2", "b #P2", [{ href: "km:%23P2" }])
    seedNodeWithLinks(db, "n-prio-p3", "c #P3", [{ href: "km:%23P3" }])
    const both = executeQuery(db, parseQuery("priority:P1,P2"))
    expect(both.map((r) => r.id).sort()).toEqual(["n-prio-p1", "n-prio-p2"])
  })
})
