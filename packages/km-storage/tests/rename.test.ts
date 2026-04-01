/**
 * Rename Tests
 *
 * Tests for renameNode, getRenameImpact, and updateTargetName.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"

import { createTestRepo, addLink, type Repo } from "../src/index.ts"
import { updateTargetName } from "../src/db-links.ts"
import { SCHEMA } from "../src/schema.ts"

/** Create a test repo and add file-like nodes with names and backlinks */
function setupRepoWithLinks(): {
  repo: Repo
  targetId: string
  source1Id: string
  source2Id: string
} {
  const repo = createTestRepo()

  // Create a target file node (what we'll rename)
  const targetId = repo.addNode(null, {
    type: "h",
    item: {},
    fstype: "mdfile",
    content: "Old Name",
    name: "Old Name",
  })

  // Create source nodes that reference the target via wikilinks
  const source1Id = repo.addNode(null, {
    type: "p",
    content: "See [[Old Name]] for details",
    name: "task-1",
  })

  const source2Id = repo.addNode(null, {
    type: "p",
    content: "Also references [[Old Name]]",
    name: "task-2",
  })

  // Add backlinks in the links table
  addLink(repo.database, {
    source_id: source1Id,
    target_name: "Old Name",
    target_id: targetId,
    section: null,
    block_id: null,
    alias: null,
    embedded: false,
    relationship: null,
  })

  addLink(repo.database, {
    source_id: source2Id,
    target_name: "Old Name",
    target_id: targetId,
    section: null,
    block_id: null,
    alias: null,
    embedded: false,
    relationship: null,
  })

  return { repo, targetId, source1Id, source2Id }
}

describe("renameNode", () => {
  test("updates the node content", () => {
    const { repo, targetId } = setupRepoWithLinks()

    repo.renameNode(targetId, "New Name")

    const node = repo.getNode(targetId)
    expect(node?.content).toBe("New Name")
  })

  test("updates [[old-name]] in backlink source nodes", () => {
    const { repo, targetId, source1Id, source2Id } = setupRepoWithLinks()

    repo.renameNode(targetId, "New Name")

    const source1 = repo.getNode(source1Id)
    expect(source1?.content).toBe("See [[New Name]] for details")

    const source2 = repo.getNode(source2Id)
    expect(source2?.content).toBe("Also references [[New Name]]")
  })

  test("handles ![[old-name]] embeddings (preserves ! prefix)", () => {
    const repo = createTestRepo()

    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Target File",
      name: "Target File",
    })

    const sourceId = repo.addNode(null, {
      type: "p",
      content: "Embed ![[Target File]] here",
    })

    addLink(repo.database, {
      source_id: sourceId,
      target_name: "Target File",
      target_id: targetId,
      section: null,
      block_id: null,
      alias: null,
      embedded: true,
      relationship: null,
    })

    repo.renameNode(targetId, "Renamed File")

    const source = repo.getNode(sourceId)
    expect(source?.content).toBe("Embed ![[Renamed File]] here")
  })

  test("handles [[old-name|alias]] - alias preserved, target updated", () => {
    const repo = createTestRepo()

    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Original",
      name: "Original",
    })

    const sourceId = repo.addNode(null, {
      type: "p",
      content: "See [[Original|my alias]] for info",
    })

    addLink(repo.database, {
      source_id: sourceId,
      target_name: "Original",
      target_id: targetId,
      section: null,
      block_id: null,
      alias: "my alias",
      embedded: false,
      relationship: null,
    })

    repo.renameNode(targetId, "Updated")

    const source = repo.getNode(sourceId)
    expect(source?.content).toBe("See [[Updated|my alias]] for info")
  })

  test("calls onProgress with correct updated/total counts", () => {
    const { repo, targetId } = setupRepoWithLinks()

    const progressCalls: Array<{ updated: number; total: number }> = []
    repo.renameNode(targetId, "New Name", (info) => {
      progressCalls.push({ ...info })
    })

    expect(progressCalls).toEqual([
      { updated: 1, total: 2 },
      { updated: 2, total: 2 },
    ])
  })

  test("rename with no backlinks just updates content", () => {
    const repo = createTestRepo()

    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Lonely Node",
      name: "Lonely Node",
    })

    // No links added - should not error
    repo.renameNode(targetId, "Still Lonely")

    const node = repo.getNode(targetId)
    expect(node?.content).toBe("Still Lonely")
  })

  test("no-op when content does not change the name", () => {
    const repo = createTestRepo()

    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Same",
      name: "Same",
    })

    const sourceId = repo.addNode(null, {
      type: "p",
      content: "Ref [[Same]]",
    })

    addLink(repo.database, {
      source_id: sourceId,
      target_name: "Same",
      target_id: targetId,
      section: null,
      block_id: null,
      alias: null,
      embedded: false,
      relationship: null,
    })

    // Rename to same name — backlink content should not change
    repo.renameNode(targetId, "Same")

    const source = repo.getNode(sourceId)
    expect(source?.content).toBe("Ref [[Same]]")
  })

  test("handles case-insensitive wikilink matching", () => {
    const repo = createTestRepo()

    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "My Note",
      name: "My Note",
    })

    const sourceId = repo.addNode(null, {
      type: "p",
      content: "See [[my note]] and [[MY NOTE]]",
    })

    addLink(repo.database, {
      source_id: sourceId,
      target_name: "My Note",
      target_id: targetId,
      section: null,
      block_id: null,
      alias: null,
      embedded: false,
      relationship: null,
    })

    repo.renameNode(targetId, "Renamed Note")

    const source = repo.getNode(sourceId)
    expect(source?.content).toBe("See [[Renamed Note]] and [[Renamed Note]]")
  })
})

describe("getRenameImpact", () => {
  test("returns correct backlink count and child count", () => {
    const { repo, targetId } = setupRepoWithLinks()

    // Add a child node
    repo.addNode(targetId, {
      type: "p",
      item: {},
      content: "Child task",
    })

    const impact = repo.getRenameImpact(targetId)
    expect(impact.backlinks).toHaveLength(2)
    expect(impact.childCount).toBe(1)
    expect(impact.ruleRefs).toBe(0)
    expect(impact.propRefs).toBe(0)
  })

  test("returns empty for node with no backlinks or children", () => {
    const repo = createTestRepo()

    const nodeId = repo.addNode(null, {
      type: "h",
      fstype: "mdfile",
      content: "Isolated",
      name: "Isolated",
    })

    const impact = repo.getRenameImpact(nodeId)
    expect(impact.backlinks).toHaveLength(0)
    expect(impact.childCount).toBe(0)
    expect(impact.ruleRefs).toBe(0)
    expect(impact.propRefs).toBe(0)
  })

  test("counts rule references and blocked-by references", () => {
    const repo = createTestRepo()

    // Create a folder node
    const folderId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "inbox",
      name: "inbox",
      fs_path: "inbox",
    })

    // Create a section with a rule referencing the folder
    repo.addNode(null, {
      type: "h",
      content: "Open km.add:: ./inbox/**",
      name: "Open",
      rules: { add: "./inbox/**" },
      data: { rules: { add: "./inbox/**" } },
    })

    // Create a task blocked by "inbox"
    repo.addNode(null, {
      type: "p",
      item: {},
      content: "Blocked task",
      data: {
        props: {
          "blocked-by": { type: "link", target: "inbox" },
        },
      },
    })

    const impact = repo.getRenameImpact(folderId)
    expect(impact.ruleRefs).toBe(1)
    expect(impact.propRefs).toBe(1)
  })
})

describe("renameNode - rule path references", () => {
  test("updates km.add:: rule path when folder is renamed", () => {
    const repo = createTestRepo()

    // Create a folder node that we'll rename
    const folderId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "inbox",
      name: "inbox",
      fs_path: "inbox",
    })

    // Create a section with a km.add:: rule referencing the folder
    const sectionId = repo.addNode(null, {
      type: "h",
      content: "Open km.add:: ./inbox/**",
      name: "Open",
      rules: { add: "./inbox/**" },
      data: { rules: { add: "./inbox/**" } },
    })

    // Rename the folder
    repo.renameNode(folderId, "tasks")

    // Verify the section's rules were updated
    const section = repo.getNode(sectionId)
    expect(section?.rules?.add).toBe("./tasks/**")
    expect(section?.content).toContain("./tasks/**")
  })

  test("updates multiple km.add:: rule queries when path matches", () => {
    const repo = createTestRepo()

    const folderId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "projects",
      name: "projects",
      fs_path: "projects",
    })

    const sectionId = repo.addNode(null, {
      type: "h",
      content: "Work km.add:: ./projects/** status:todo",
      name: "Work",
      rules: { add: "./projects/** status:todo" },
      data: { rules: { add: "./projects/** status:todo" } },
    })

    repo.renameNode(folderId, "workstreams")

    const section = repo.getNode(sectionId)
    expect(section?.rules?.add).toBe("./workstreams/** status:todo")
  })

  test("updates array km.add:: rules when path matches", () => {
    const repo = createTestRepo()

    const folderId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "inbox",
      name: "inbox",
      fs_path: "inbox",
    })

    const sectionId = repo.addNode(null, {
      type: "h",
      content: "Mixed km.add:: ./inbox/** km.add:: status:open",
      name: "Mixed",
      rules: { add: ["./inbox/**", "status:open"] },
      data: { rules: { add: ["./inbox/**", "status:open"] } },
    })

    repo.renameNode(folderId, "tasks")

    const section = repo.getNode(sectionId)
    expect(section?.rules?.add).toEqual(["./tasks/**", "status:open"])
  })

  test("does not update rules that do not reference the renamed path", () => {
    const repo = createTestRepo()

    const folderId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "inbox",
      name: "inbox",
      fs_path: "inbox",
    })

    const sectionId = repo.addNode(null, {
      type: "h",
      content: "Tags km.add:: #important",
      name: "Tags",
      rules: { add: "#important" },
      data: { rules: { add: "#important" } },
    })

    repo.renameNode(folderId, "tasks")

    const section = repo.getNode(sectionId)
    expect(section?.rules?.add).toBe("#important")
  })
})

describe("renameNode - blocked-by property references", () => {
  test("updates blocked-by target when referenced node is renamed", () => {
    const repo = createTestRepo()

    // Create the blocker node
    const blockerId = repo.addNode(null, {
      type: "p",
      item: { task: { status: "todo", marker: "[ ]" } },
      content: "Blocker Task",
      name: "Blocker Task",
    })

    // Create a task blocked by the blocker
    const blockedId = repo.addNode(null, {
      type: "p",
      content: "Blocked Task",
      name: "Blocked Task",
      data: {
        props: {
          "blocked-by": { type: "link", target: "Blocker Task" },
        },
      },
    })

    // Rename the blocker
    repo.renameNode(blockerId, "Renamed Blocker")

    // Verify the blocked-by reference was updated
    const blocked = repo.getNode(blockedId)
    const props = blocked?.data?.props as Record<string, { type: string; target?: string }> | undefined
    expect(props?.["blocked-by"]?.target).toBe("Renamed Blocker")
  })

  test("does not update blocked-by that references a different node", () => {
    const repo = createTestRepo()

    const nodeId = repo.addNode(null, {
      type: "p",
      item: {},
      content: "Some Node",
      name: "Some Node",
    })

    const blockedId = repo.addNode(null, {
      type: "p",
      content: "Blocked Task",
      name: "Blocked Task",
      data: {
        props: {
          "blocked-by": { type: "link", target: "Other Node" },
        },
      },
    })

    repo.renameNode(nodeId, "Renamed Node")

    const blocked = repo.getNode(blockedId)
    const props = blocked?.data?.props as Record<string, { type: string; target?: string }> | undefined
    expect(props?.["blocked-by"]?.target).toBe("Other Node")
  })
})

describe("updateTargetName", () => {
  test("updates matching rows case-insensitively", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Insert some links with different cases
    db.run(
      `INSERT INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
       VALUES ('s1', 'My File', 't1', NULL, NULL, NULL, 0, NULL, 1)`,
    )
    db.run(
      `INSERT INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
       VALUES ('s2', 'my file', 't1', NULL, NULL, NULL, 0, NULL, 2)`,
    )
    db.run(
      `INSERT INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
       VALUES ('s3', 'other file', 't2', NULL, NULL, NULL, 0, NULL, 3)`,
    )

    const updated = updateTargetName(db, "My File", "Renamed File")

    expect(updated).toBe(2)

    // Verify the target_name values
    const rows = db.query("SELECT source_id, target_name FROM links ORDER BY source_id").all() as Array<{
      source_id: string
      target_name: string
    }>

    expect(rows).toEqual([
      { source_id: "s1", target_name: "Renamed File" },
      { source_id: "s2", target_name: "Renamed File" },
      { source_id: "s3", target_name: "other file" },
    ])

    db.close()
  })

  test("handles .md extension stripping", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    db.run(
      `INSERT INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
       VALUES ('s1', 'notes.md', 't1', NULL, NULL, NULL, 0, NULL, 1)`,
    )

    const updated = updateTargetName(db, "notes", "renamed-notes")

    expect(updated).toBe(1)

    const row = db.query("SELECT target_name FROM links WHERE source_id = 's1'").get() as { target_name: string }

    expect(row.target_name).toBe("renamed-notes")

    db.close()
  })
})
