/**
 * Rename Tests
 *
 * Tests for renameNode and getRenameImpact under the v4 links schema
 * (see docs/design/model/klink.md). The legacy updateTargetName helper is
 * gone — rename rewrites content in host nodes and updates links.href
 * rows keyed on the renamed node's canonical href.
 */

import { describe, test, expect } from "vitest"

import { createTestRepo, addLink, type Repo } from "../src/index.ts"

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

  // Add backlinks — under the v4 links schema, the target is keyed by
  // its canonical href (normalizeLinkHref("wiki", name)). "Old Name"
  // → "km:Old Name".
  addLink(repo.database, { host_id: source1Id, href: "km:Old Name", rel: "link" })
  addLink(repo.database, { host_id: source2Id, href: "km:Old Name", rel: "link" })

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

    addLink(repo.database, { host_id: sourceId, href: "km:Target File", rel: "embed" })

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

    addLink(repo.database, { host_id: sourceId, href: "km:Original", rel: "link" })

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

    addLink(repo.database, { host_id: sourceId, href: "km:Same", rel: "link" })

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

    addLink(repo.database, { host_id: sourceId, href: "km:My Note", rel: "link" })

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

describe("renameNode updates links.href rows", () => {
  test("rewrites href on all link rows pointing at the old name", () => {
    const repo = createTestRepo()

    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Old Title",
      name: "Old Title",
    })

    const sourceId = repo.addNode(null, {
      type: "p",
      content: "See [[Old Title]] here",
    })

    addLink(repo.database, { host_id: sourceId, href: "km:Old Title", rel: "link" })

    repo.renameNode(targetId, "New Title")

    const rows = repo.database.query("SELECT host_id, href, rel FROM links WHERE host_id = ?").all(sourceId) as Array<{
      host_id: string
      href: string
      rel: string
    }>

    // Even though content rewrite would produce a fresh href on re-parse,
    // the in-memory rows are eagerly updated so backlink queries stay
    // correct until the next reconciliation pass.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.href).toBe("km:New Title")
    expect(rows[0]!.rel).toBe("link")
  })

  test("leaves unrelated hrefs untouched", () => {
    const repo = createTestRepo()

    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Alpha",
      name: "Alpha",
    })

    const sourceId = repo.addNode(null, {
      type: "p",
      content: "See [[Alpha]] and also [[Beta]]",
    })

    addLink(repo.database, { host_id: sourceId, href: "km:Alpha", rel: "link" })
    addLink(repo.database, { host_id: sourceId, href: "km:Beta", rel: "link" })

    repo.renameNode(targetId, "Gamma")

    const hrefs = (
      repo.database.query("SELECT href FROM links WHERE host_id = ? ORDER BY href").all(sourceId) as Array<{
        href: string
      }>
    ).map((r) => r.href)

    expect(hrefs).toEqual(["km:Beta", "km:Gamma"])
  })
})
