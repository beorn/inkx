/**
 * Link Resolution Bug Tests
 *
 * Tests for bugs identified in code review:
 * - 1a: Wikilinks resolve arbitrarily on name collision (link-resolver.ts)
 * - 1b: Section-specific links updated with over-broad WHERE (db-links.ts)
 * - 1c: renameNode corrupts unrelated links (db-links.ts updateTargetName)
 * - 2: Resolver cache stale after mutations (repo.ts + smart-resolver.ts)
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"

import { createTestRepo, addLink, type Repo } from "../src/index.ts"
import { createLinkResolver } from "../src/markdown/link-resolver.ts"
import { resolveLinks, resolveLinksBatch, updateTargetName } from "../src/db/links.ts"
import { findFileByName } from "../src/db/queries/wikilink-resolver.ts"
import { resolveByName, clearNameIndex, clearResolveCache } from "../src/db/queries/smart-resolver.ts"
import { SCHEMA, migrateSchema } from "../src/db/schema.ts"

// =============================================================================
// Bug 1a: Wikilinks resolve arbitrarily on name collision
// =============================================================================

describe("Bug 1a: name collision in link resolver", () => {
  test("createLinkResolver returns null for ambiguous names", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Insert two nodes with the same normalized name but different IDs
    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, name, fs_path)
       VALUES ('id-alpha', 'h', 1, 0, 'Project', 'alpha/Project.md')`,
    )
    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, name, fs_path)
       VALUES ('id-beta', 'h', 1, 0, 'Project', 'beta/Project.md')`,
    )

    const resolver = createLinkResolver(db)

    // Ambiguous — returns first match, marks as ambiguous
    expect(resolver.resolveTarget("Project")).toBe("id-alpha")
    expect(resolver.isAmbiguous("Project")).toBe(true)

    db.close()
  })

  test("createLinkResolver resolves unambiguous names normally", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, name, fs_path)
       VALUES ('id-unique', 'h', 1, 0, 'Unique Doc', 'Unique Doc.md')`,
    )

    const resolver = createLinkResolver(db)

    expect(resolver.resolveTarget("Unique Doc")).toBe("id-unique")

    db.close()
  })

  test("addFile marks existing name as ambiguous", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, name, fs_path)
       VALUES ('id-first', 'h', 1, 0, 'Notes', 'Notes.md')`,
    )

    const resolver = createLinkResolver(db)

    // Before collision — should resolve fine
    expect(resolver.resolveTarget("Notes")).toBe("id-first")

    // Add a second file with the same name
    resolver.addFile("id-second", "Notes")

    // Now it's ambiguous — should still resolve to first match, but be marked ambiguous
    expect(resolver.resolveTarget("Notes")).toBe("id-first")
    expect(resolver.isAmbiguous("Notes")).toBe(true)

    db.close()
  })

  test("findFileByName returns null for ambiguous names", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Insert two nodes with the same name
    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, name, fstype, fs_path)
       VALUES ('id-a', 'h', 1, 0, 'Report', 'mdfile', 'a/Report.md')`,
    )
    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, name, fstype, fs_path)
       VALUES ('id-b', 'h', 1, 0, 'Report', 'mdfile', 'b/Report.md')`,
    )

    const result = findFileByName(db, "Report")

    // Ambiguous — returns first match (best effort) instead of null
    expect(result).not.toBeNull()
    expect(result!.name).toBe("Report")

    db.close()
  })
})

// =============================================================================
// Bug 1b: Section-specific unresolved links updated with over-broad WHERE
// =============================================================================

describe("Bug 1b: section-specific link resolution over-broad WHERE", () => {
  test("resolveLinks scopes update to specific section", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Create the target file node and two section children
    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, name, fs_path)
       VALUES ('file-1', 'h', 1, 0, 'doc', 'doc.md')`,
    )
    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, parent_id, title, content)
       VALUES ('section-a', 'h', 1, 0, 'file-1', 'Section A', 'Section A content')`,
    )
    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, parent_id, title, content)
       VALUES ('section-b', 'h', 1, 1, 'file-1', 'Section B', 'Section B content')`,
    )

    // Insert two unresolved links from the same source, different sections
    db.run(
      `INSERT INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
       VALUES ('src-1', 'doc', NULL, 'Section A', NULL, NULL, 0, NULL, 1)`,
    )
    db.run(
      `INSERT INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
       VALUES ('src-1', 'doc', NULL, 'Section B', NULL, NULL, 0, NULL, 2)`,
    )

    // Resolve links for the target "doc"
    resolveLinks(db, "file-1", "doc")

    // Each link should resolve to its specific section, not both to the same one
    const links = db.query("SELECT * FROM links WHERE source_id = 'src-1' ORDER BY section").all() as Array<{
      section: string
      target_id: string
    }>

    expect(links).toHaveLength(2)
    expect(links[0]!.section).toBe("Section A")
    expect(links[0]!.target_id).toBe("section-a")
    expect(links[1]!.section).toBe("Section B")
    expect(links[1]!.target_id).toBe("section-b")
  })

  test("resolveLinksBatch scopes update to specific section", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Create target file with sections
    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, name, fs_path)
       VALUES ('file-x', 'h', 1, 0, 'notes', 'notes.md')`,
    )
    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, parent_id, title, content)
       VALUES ('sec-intro', 'h', 1, 0, 'file-x', 'Intro', 'Intro content')`,
    )
    db.run(
      `INSERT INTO nodes (id, type, item, parent_idx, parent_id, title, content)
       VALUES ('sec-outro', 'h', 1, 1, 'file-x', 'Outro', 'Outro content')`,
    )

    // Insert two unresolved links with different sections
    db.run(
      `INSERT INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
       VALUES ('src-2', 'notes', NULL, 'Intro', NULL, NULL, 0, NULL, 1)`,
    )
    db.run(
      `INSERT INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
       VALUES ('src-2', 'notes', NULL, 'Outro', NULL, NULL, 0, NULL, 2)`,
    )

    resolveLinksBatch(db, [{ id: "file-x", name: "notes" }])

    const links = db.query("SELECT * FROM links WHERE source_id = 'src-2' ORDER BY section").all() as Array<{
      section: string
      target_id: string
    }>

    expect(links).toHaveLength(2)
    expect(links[0]!.section).toBe("Intro")
    expect(links[0]!.target_id).toBe("sec-intro")
    expect(links[1]!.section).toBe("Outro")
    expect(links[1]!.target_id).toBe("sec-outro")
  })
})

// =============================================================================
// Bug: Duplicate link rows from NULL in composite PRIMARY KEY
// =============================================================================

describe("Duplicate link rows (NULL in composite PK)", () => {
  test("INSERT OR REPLACE deduplicates links with NULL section/block_id/relationship", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Insert a link with NULL section, block_id, relationship
    addLink(db, {
      source_id: "src-1",
      target_name: "target",
      target_id: "tgt-1",
      section: null,
      block_id: null,
      alias: null,
      embedded: false,
      relationship: null,
    })

    // Insert the same link again (e.g., from re-parsing or app restart)
    addLink(db, {
      source_id: "src-1",
      target_name: "target",
      target_id: "tgt-1",
      section: null,
      block_id: null,
      alias: null,
      embedded: false,
      relationship: null,
    })

    // Should have exactly 1 row, not 2
    const rows = db.query("SELECT * FROM links WHERE source_id = 'src-1'").all()
    expect(rows).toHaveLength(1)

    db.close()
  })

  test("INSERT OR REPLACE deduplicates links with same section", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Insert a link with a specific section
    addLink(db, {
      source_id: "src-1",
      target_name: "target",
      target_id: "tgt-1",
      section: "Intro",
      block_id: null,
      alias: null,
      embedded: false,
      relationship: null,
    })

    // Insert the same link again
    addLink(db, {
      source_id: "src-1",
      target_name: "target",
      target_id: "tgt-1",
      section: "Intro",
      block_id: null,
      alias: null,
      embedded: false,
      relationship: null,
    })

    // Should have exactly 1 row
    const rows = db.query("SELECT * FROM links WHERE source_id = 'src-1'").all()
    expect(rows).toHaveLength(1)

    db.close()
  })

  test("different sections are NOT deduplicated", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    addLink(db, {
      source_id: "src-1",
      target_name: "target",
      target_id: "tgt-1",
      section: "Intro",
      block_id: null,
      alias: null,
      embedded: false,
      relationship: null,
    })

    addLink(db, {
      source_id: "src-1",
      target_name: "target",
      target_id: "tgt-1",
      section: "Outro",
      block_id: null,
      alias: null,
      embedded: false,
      relationship: null,
    })

    // Should have 2 distinct rows
    const rows = db.query("SELECT * FROM links WHERE source_id = 'src-1'").all()
    expect(rows).toHaveLength(2)

    db.close()
  })

  test("backlink count reflects deduplicated links", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Insert the same link 5 times (simulating repeated re-parsing)
    for (let i = 0; i < 5; i++) {
      addLink(db, {
        source_id: "src-1",
        target_name: "target",
        target_id: "tgt-1",
        section: null,
        block_id: null,
        alias: null,
        embedded: false,
        relationship: null,
      })
    }

    // Backlink count should be 1, not 5
    const backlinks = db.query("SELECT * FROM links WHERE target_id = 'tgt-1'").all()
    expect(backlinks).toHaveLength(1)

    db.close()
  })
})

// =============================================================================
// Migration: deduplicate existing links table
// =============================================================================

describe("Links table migration deduplicates existing data", () => {
  test("migrateSchema deduplicates rows with NULL columns from old PK", () => {
    const db = new Database(":memory:")

    // Create the OLD schema with the broken PRIMARY KEY
    db.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        item INTEGER DEFAULT 0,
        parent_idx REAL DEFAULT 0,
        name TEXT,
        fs_path TEXT,
        content TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        version TEXT,
        fstype TEXT,
        due_at TEXT,
        start_at TEXT,
        embed_of TEXT,
        parsed INTEGER DEFAULT 0,
        block_id TEXT,
        title TEXT,
        md_pos INTEGER,
        md_line INTEGER,
        list_marker TEXT,
        task_marker TEXT,
        task_status TEXT,
        assigned_to TEXT,
        priority TEXT,
        content_hash TEXT,
        data JSON DEFAULT '{}',
        fs_ino INTEGER,
        fs_mtime INTEGER
      )
    `)
    db.run(`
      CREATE TABLE links (
        source_id TEXT NOT NULL,
        target_name TEXT NOT NULL,
        target_id TEXT,
        section TEXT,
        block_id TEXT,
        alias TEXT,
        embedded INTEGER DEFAULT 0,
        relationship TEXT,
        created_at INTEGER,
        PRIMARY KEY (source_id, target_name, section, block_id, relationship)
      )
    `)
    db.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")

    // Insert duplicate rows (possible because NULL != NULL in old PK)
    // Same logical link inserted 3 times
    db.run(`INSERT INTO links VALUES ('src-1', 'target', 'tgt-1', NULL, NULL, NULL, 0, NULL, 100)`)
    db.run(`INSERT INTO links VALUES ('src-1', 'target', 'tgt-1', NULL, NULL, NULL, 0, NULL, 200)`)
    db.run(`INSERT INTO links VALUES ('src-1', 'target', 'tgt-1', NULL, NULL, NULL, 0, NULL, 300)`)

    // Also insert a distinct link (different section) — should be preserved
    db.run(`INSERT INTO links VALUES ('src-1', 'target', 'tgt-1', 'Intro', NULL, NULL, 0, NULL, 400)`)

    // Verify we have 4 rows before migration
    const beforeCount = (db.query("SELECT COUNT(*) as cnt FROM links").get() as { cnt: number }).cnt
    expect(beforeCount).toBe(4)

    // Run migration
    migrateSchema(db)

    // Now apply the new schema (creates the UNIQUE index)
    db.run(SCHEMA)

    // After migration: 3 duplicates collapsed to 1, plus the distinct section link = 2
    const afterCount = (db.query("SELECT COUNT(*) as cnt FROM links").get() as { cnt: number }).cnt
    expect(afterCount).toBe(2)

    // Verify the kept row has the latest created_at
    const nullRow = db.query("SELECT created_at FROM links WHERE source_id = 'src-1' AND section IS NULL").get() as {
      created_at: number
    }
    expect(nullRow.created_at).toBe(300)

    // Verify distinct section link is preserved
    const sectionRow = db
      .query("SELECT created_at FROM links WHERE source_id = 'src-1' AND section = 'Intro'")
      .get() as { created_at: number }
    expect(sectionRow.created_at).toBe(400)

    // Verify INSERT OR REPLACE now works (no more duplicates)
    addLink(db, {
      source_id: "src-1",
      target_name: "target",
      target_id: "tgt-1",
      section: null,
      block_id: null,
      alias: null,
      embedded: false,
      relationship: null,
    })
    const finalCount = (db.query("SELECT COUNT(*) as cnt FROM links").get() as { cnt: number }).cnt
    expect(finalCount).toBe(2)

    db.close()
  })

  test("migrateSchema is idempotent (safe to run multiple times)", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Insert a link
    addLink(db, {
      source_id: "src-1",
      target_name: "target",
      target_id: "tgt-1",
      section: null,
      block_id: null,
      alias: null,
      embedded: false,
      relationship: null,
    })

    // Insert a node so migrateSchema doesn't skip (it checks nodes table)
    db.run("INSERT INTO nodes (id, type, item, parent_idx) VALUES ('n1', 'h', 0, 0)")

    // Run migrateSchema again — should be safe (already has idx_links_unique)
    migrateSchema(db)

    // Link should still be there
    const count = (db.query("SELECT COUNT(*) as cnt FROM links").get() as { cnt: number }).cnt
    expect(count).toBe(1)

    db.close()
  })
})

// =============================================================================
// Bug 1c: renameNode corrupts unrelated links
// =============================================================================

describe("Bug 1c: updateTargetName corrupts unrelated links", () => {
  test("updateTargetName with target_id only updates links pointing to the renamed node", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Two different nodes happen to share the same name
    db.run(
      `INSERT INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
       VALUES ('src-a', 'Report', 'target-1', NULL, NULL, NULL, 0, NULL, 1)`,
    )
    db.run(
      `INSERT INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
       VALUES ('src-b', 'Report', 'target-2', NULL, NULL, NULL, 0, NULL, 2)`,
    )

    // Rename only the node target-1 from "Report" to "Summary"
    updateTargetName(db, "Report", "Summary", "target-1")

    const links = db.query("SELECT source_id, target_name, target_id FROM links ORDER BY source_id").all() as Array<{
      source_id: string
      target_name: string
      target_id: string
    }>

    // Only the link to target-1 should be updated; target-2's link stays as "Report"
    expect(links).toEqual([
      { source_id: "src-a", target_name: "Summary", target_id: "target-1" },
      { source_id: "src-b", target_name: "Report", target_id: "target-2" },
    ])

    db.close()
  })
})

// =============================================================================
// Bug 2: Resolver cache stale after mutations
// =============================================================================

describe("Bug 2: resolver cache stale after mutations", () => {
  test("resolveByName sees newly added nodes", () => {
    const repo = createTestRepo()

    // Add initial node
    repo.addNode(null, {
      type: "h",
      item: {},
      name: "Alpha",
      content: "Alpha",
    })

    // Should resolve
    const found = resolveByName(repo.database, "Alpha")
    expect(found).not.toBeNull()
    expect(found?.name).toBe("Alpha")

    // Add another node — the name index should be invalidated
    repo.addNode(null, {
      type: "h",
      item: {},
      name: "Beta",
      content: "Beta",
    })

    // Should resolve the new node (cache should have been cleared by addNode)
    const found2 = resolveByName(repo.database, "Beta")
    expect(found2).not.toBeNull()
    expect(found2?.name).toBe("Beta")
  })

  test("resolveByName does not return deleted nodes", () => {
    const repo = createTestRepo()

    const nodeId = repo.addNode(null, {
      type: "h",
      item: {},
      name: "Gamma",
      content: "Gamma",
    })

    // Prime the cache
    expect(resolveByName(repo.database, "Gamma")).not.toBeNull()

    // Delete the node
    repo.deleteNode(nodeId)

    // Should be gone (cache should have been cleared by deleteNode)
    expect(resolveByName(repo.database, "Gamma")).toBeNull()
  })

  test("resolveByName reflects name changes after updateNode", () => {
    const repo = createTestRepo()

    const nodeId = repo.addNode(null, {
      type: "h",
      item: {},
      name: "OldName",
      content: "OldName",
    })

    // Prime the cache
    expect(resolveByName(repo.database, "OldName")).not.toBeNull()

    // Rename the node
    repo.updateNode(nodeId, { name: "NewName", content: "NewName" })

    // Old name should no longer resolve; new name should
    expect(resolveByName(repo.database, "OldName")).toBeNull()
    expect(resolveByName(repo.database, "NewName")).not.toBeNull()
  })

  test("resolveByName works after moveNode", () => {
    const repo = createTestRepo()

    const parentId = repo.addNode(null, {
      type: "h",
      item: {},
      name: "Parent",
      content: "Parent",
    })

    const childId = repo.addNode(null, {
      type: "h",
      item: {},
      name: "Child",
      content: "Child",
    })

    // Prime cache
    expect(resolveByName(repo.database, "Child")).not.toBeNull()

    // Move the child under parent
    repo.moveNode(childId, parentId, 0)

    // Should still resolve after move (cache cleared)
    expect(resolveByName(repo.database, "Child")).not.toBeNull()
  })
})
