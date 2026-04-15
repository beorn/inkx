/**
 * FTS5 sigil-aware search
 *
 * Verifies that the nodes_fts virtual table:
 *   1. Indexes `name` and `title` (not just `content`)
 *   2. Uses unicode61 with tokenchars '@#+~' so sigils survive tokenization
 *
 * These tests pin the behavior the Omnibox depends on — a file literally named
 * `@next.md` with an empty body MUST be findable via `repo.search("@next")` at
 * the index level, without a JS-side name/title scan fallback.
 *
 * Related: km-storage.fts-sigil-tokenchars, docs/design/omnibox.md
 */
import { test, expect, describe } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA, migrateSchema, rebuildFtsIndex } from "../src/db/schema.ts"
import { search, toFts5Query } from "../src/db/queries/full-text-search.ts"

function freshDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

function insertNode(
  db: Database,
  {
    id,
    type = "p",
    name = null,
    title = null,
    content = null,
  }: { id: string; type?: string; name?: string | null; title?: string | null; content?: string | null },
): void {
  db.run("INSERT INTO nodes (id, type, name, title, content) VALUES (?, ?, ?, ?, ?)", [id, type, name, title, content])
}

describe("FTS5 sigil-aware search", () => {
  test("finds file by name with @ sigil (empty content)", () => {
    const db = freshDb()
    insertNode(db, { id: "n1", name: "@next.md", title: "@next", content: "" })

    const results = search(db, "@next")
    expect(results.map((n) => n.id)).toContain("n1")
  })

  test("prefix-matches file by name with + sigil", () => {
    const db = freshDb()
    insertNode(db, { id: "n1", name: "+taxes", title: "+taxes", content: "" })

    const results = search(db, "+ta")
    expect(results.map((n) => n.id)).toContain("n1")
  })

  test("finds node by title with # sigil", () => {
    const db = freshDb()
    insertNode(db, { id: "n1", type: "h", name: null, title: "#urgent", content: "" })

    const results = search(db, "#urgent")
    expect(results.map((n) => n.id)).toContain("n1")
  })

  test("finds content containing @ sigil", () => {
    const db = freshDb()
    insertNode(db, { id: "n1", name: null, title: null, content: "see @delei for this" })

    const results = search(db, "@delei")
    expect(results.map((n) => n.id)).toContain("n1")
  })

  test("backwards compat: plain content queries still work", () => {
    const db = freshDb()
    insertNode(db, { id: "n1", name: null, title: null, content: "buy milk today" })

    const results = search(db, "buy milk")
    expect(results.map((n) => n.id)).toContain("n1")
  })

  test("prefix matching still works for plain words", () => {
    const db = freshDb()
    insertNode(db, { id: "n1", name: null, title: "todo", content: "things to do" })

    const results = search(db, "tod")
    expect(results.map((n) => n.id)).toContain("n1")
  })

  test("case insensitive: @Next matches @next", () => {
    const db = freshDb()
    insertNode(db, { id: "n1", name: "@next.md", title: "@next", content: "" })

    const results = search(db, "@Next")
    expect(results.map((n) => n.id)).toContain("n1")
  })

  test("title match surfaces nodes whose content is unrelated", () => {
    const db = freshDb()
    insertNode(db, { id: "n1", name: null, title: "@inbox", content: "nothing here" })
    insertNode(db, { id: "n2", name: null, title: "unrelated", content: "something about inboxes" })

    const results = search(db, "@inbox")
    const ids = results.map((n) => n.id)
    expect(ids).toContain("n1")
    // n2 should not match because "@inbox" sigil search is specific to the @-prefixed token
    // (content "inboxes" would match plain "inbox" but not "@inbox")
    expect(ids).not.toContain("n2")
  })

  test("UPDATE trigger re-indexes name/title", () => {
    const db = freshDb()
    insertNode(db, { id: "n1", name: "old.md", title: "old", content: "" })

    expect(search(db, "@next").map((n) => n.id)).not.toContain("n1")

    db.run("UPDATE nodes SET name = ?, title = ? WHERE id = 'n1'", ["@next.md", "@next"])

    expect(search(db, "@next").map((n) => n.id)).toContain("n1")
  })

  test("DELETE trigger removes from FTS index", () => {
    const db = freshDb()
    insertNode(db, { id: "n1", name: "@next.md", title: "@next", content: "" })

    expect(search(db, "@next").map((n) => n.id)).toContain("n1")

    db.run("DELETE FROM nodes WHERE id = 'n1'")

    expect(search(db, "@next").map((n) => n.id)).not.toContain("n1")
  })

  test("toFts5Query preserves sigil in token", () => {
    // Tokens with sigils are quoted so FTS5's query parser doesn't interpret
    // them as operators. Prefix match still applied.
    expect(toFts5Query("@next")).toBe('"@next"*')
    expect(toFts5Query("#urgent")).toBe('"#urgent"*')
    expect(toFts5Query("+taxes")).toBe('"+taxes"*')
    // Plain tokens stay bare
    expect(toFts5Query("hello")).toBe("hello*")
  })

  test("migration: existing DB with old nodes_fts schema is upgraded", () => {
    const db = new Database(":memory:")

    // Simulate the OLD schema — create a pre-migration FTS table (content-only, no name/title)
    // using ONLY the nodes_fts virtual table + triggers.
    //
    // Strategy: open a fresh DB, run the current SCHEMA (which creates nodes + nodes_fts +
    // triggers), then manually DROP nodes_fts and its triggers and recreate them in the old
    // shape. This mimics a DB that was created before this bead shipped.
    db.run(SCHEMA)
    db.run("DROP TRIGGER IF EXISTS nodes_ai")
    db.run("DROP TRIGGER IF EXISTS nodes_ad")
    db.run("DROP TRIGGER IF EXISTS nodes_au")
    db.run("DROP TABLE nodes_fts")
    db.run(`
      CREATE VIRTUAL TABLE nodes_fts USING fts5(
        id,
        content,
        content='nodes',
        content_rowid='rowid',
        prefix='2,3,4'
      )
    `)
    db.run(`
      CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
        INSERT INTO nodes_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
      END
    `)
    // Clear any old schema_version marker so migration runs
    db.run("DELETE FROM meta WHERE key = 'schema_version'")

    // Insert data using the OLD trigger shape
    db.run("INSERT INTO nodes (id, type, name, title, content) VALUES ('n1', 'p', '@next.md', '@next', '')")
    db.run("INSERT INTO nodes (id, type, name, title, content) VALUES ('n2', 'p', 'regular.md', 'regular', 'buy milk')")

    // With the old schema, @next is NOT findable
    const preMigration = db
      .prepare("SELECT id FROM nodes_fts WHERE nodes_fts MATCH ?")
      .all("next*") as { id: string }[]
    // Old schema strips @ via default unicode61, and content is empty for n1
    expect(preMigration.map((r) => r.id)).not.toContain("n1")

    // Run migration — drops old nodes_fts. SCHEMA rerun recreates the v2 table.
    // rebuildFtsIndex then rebuilds the index from the existing nodes rows.
    const migrateResult = migrateSchema(db)
    db.run(SCHEMA)
    expect(migrateResult.ftsDropped).toBe(true)
    if (migrateResult.ftsDropped) rebuildFtsIndex(db)

    // After migration, @next queries at the repopulated index work
    const postResults = search(db, "@next")
    expect(postResults.map((n) => n.id)).toContain("n1")

    // Plain content still works
    const plain = search(db, "buy milk")
    expect(plain.map((n) => n.id)).toContain("n2")
  })

  test("migration: idempotent re-run is a no-op", () => {
    const db = freshDb()
    insertNode(db, { id: "n1", name: "@next.md", title: "@next", content: "" })

    // Run migration twice on an already-migrated DB
    migrateSchema(db)
    migrateSchema(db)

    const results = search(db, "@next")
    expect(results.map((n) => n.id)).toContain("n1")
  })
})
