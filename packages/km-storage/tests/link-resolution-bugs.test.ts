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
import { createLinkResolver } from "../src/link-resolver.ts"
import { resolveLinks, resolveLinksBatch, updateTargetName } from "../src/db-links.ts"
import { findFileByName } from "../src/db-queries/wikilink-resolver.ts"
import { resolveByName, clearNameIndex, clearResolveCache } from "../src/db-queries/smart-resolver.ts"
import { SCHEMA } from "../src/schema.ts"

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

    // Should return null because "project" is ambiguous (two nodes share that name)
    expect(resolver.resolveTarget("Project")).toBeNull()

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

    // Now it's ambiguous — should return null
    expect(resolver.resolveTarget("Notes")).toBeNull()

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

    // Should return null for ambiguous name, not pick one arbitrarily
    expect(result).toBeNull()

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
      item: true,
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
      item: true,
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
      item: true,
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
      item: true,
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
      item: true,
      name: "Parent",
      content: "Parent",
    })

    const childId = repo.addNode(null, {
      type: "h",
      item: true,
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
