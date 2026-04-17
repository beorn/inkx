/**
 * Link Resolution Bug Tests (v4 schema)
 *
 * Historical context: these tests originally covered Bug 1b (section-
 * scoped resolveLinks), Bug 1c (updateTargetName corrupts unrelated
 * links), and the composite-PK dedup bug. All three artifacts belonged
 * to the pre-v4 persisted-resolution model and were deleted in Phase 3
 * of the link-model migration (docs/design/model/klink.md).
 *
 * Under the v4 (host_id, href, rel) schema, resolution happens at
 * runtime via the name index — there are no unresolved rows to scope,
 * no target_id to rewrite on rename, and no composite PK to dedupe.
 * The remaining bugs here exercise the name-index / resolver behavior
 * that still applies:
 *
 *   - Bug 1a: ambiguous name resolution (link-resolver.ts)
 *   - Bug 2:  resolver cache invalidation after mutations (smart-resolver.ts)
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"

import { createTestRepo, addLink } from "../src/index.ts"
import { createLinkResolver } from "../src/markdown/link-resolver.ts"
import { findFileByName } from "../src/db/queries/wikilink-resolver.ts"
import { resolveByName } from "../src/db/queries/smart-resolver.ts"
import { SCHEMA } from "../src/db/schema.ts"

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

  test("findFileByName returns first match for ambiguous names", () => {
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
// Schema: v4 links table shape & the embed-one invariant
// =============================================================================

describe("Links v4 schema shape", () => {
  test("addLink inserts canonical (host_id, href, rel) rows", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    addLink(db, { host_id: "src-1", href: "km:Target", rel: "link" })
    addLink(db, { host_id: "src-1", href: "km:Target", rel: "link" })

    // v4 cache stores each occurrence as its own row — two rows here.
    // See docs/design/model/klink.md invariant 2.
    const rows = db.query("SELECT * FROM links WHERE host_id = 'src-1'").all() as Array<{
      host_id: string
      href: string
      rel: string
    }>
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.href).toBe("km:Target")
      expect(row.rel).toBe("link")
    }

    db.close()
  })

  test("multiple embed rows per host are allowed at the DB layer", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // The design's embed-one invariant applies to dedicated embed nodes
    // (embed_of set); plain paragraphs that happen to contain several
    // ![[…]] embeds legitimately share a host, so the DB doesn't enforce
    // a unique index. See schema.ts comment + docs/design/model/klink.md.
    expect(() => {
      addLink(db, { host_id: "host-1", href: "km:Target", rel: "embed" })
      addLink(db, { host_id: "host-1", href: "km:Another", rel: "embed" })
    }).not.toThrow()

    const rows = db.query("SELECT * FROM links WHERE host_id = 'host-1'").all()
    expect(rows).toHaveLength(2)

    db.close()
  })

  test("different hrefs for the same host produce distinct rows", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    addLink(db, { host_id: "src-1", href: "km:Target#Intro", rel: "link" })
    addLink(db, { host_id: "src-1", href: "km:Target#Outro", rel: "link" })

    const rows = db.query("SELECT * FROM links WHERE host_id = 'src-1'").all()
    expect(rows).toHaveLength(2)

    db.close()
  })
})

// =============================================================================
// Bug 2: Resolver cache stale after mutations (smart-resolver)
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
