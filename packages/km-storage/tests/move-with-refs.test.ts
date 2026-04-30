/**
 * Move/rename with reference rewriting — the canonical primitive.
 *
 * Tests cover the test plan from hub/km/design/move-rewrite-refs.md §7:
 * unit tests on the primitive's surface, opt-out behaviour, idempotence,
 * code-block safety, and integration with the existing backlink index.
 *
 * Bead: km-storage.move-with-rewrite-refs
 */

import { describe, test, expect } from "vitest"

import { addLink, createTestRepo, rewriteBareIdMentions, rewriteWikilinks, type Repo } from "../src/index.ts"

// =============================================================================
// Fixture helpers
// =============================================================================

function setupVault(): { repo: Repo; targetId: string; sourceId: string } {
  const repo = createTestRepo()
  const targetId = repo.addNode(null, {
    type: "h",
    item: {},
    fstype: "mdfile",
    content: "Old Name",
    name: "Old Name",
    fs_path: "Old Name.md",
  })
  const sourceId = repo.addNode(null, {
    type: "p",
    content: "See [[Old Name]] for details",
    name: "task-1",
  })
  addLink(repo.database, { host_id: sourceId, href: "km:Old Name", rel: "link" })
  return { repo, targetId, sourceId }
}

// =============================================================================
// rewriteWikilinks — pure helper
// =============================================================================

describe("rewriteWikilinks", () => {
  test("plain wikilink", () => {
    expect(rewriteWikilinks("See [[Old]]", "Old", "New")).toEqual({ text: "See [[New]]", count: 1 })
  })

  test("aliased wikilink preserves alias", () => {
    expect(rewriteWikilinks("See [[Old|the old one]]", "Old", "New")).toEqual({
      text: "See [[New|the old one]]",
      count: 1,
    })
  })

  test("section ref preserves section", () => {
    expect(rewriteWikilinks("See [[Old#Heading]]", "Old", "New")).toEqual({
      text: "See [[New#Heading]]",
      count: 1,
    })
  })

  test("block ref preserves ^id", () => {
    expect(rewriteWikilinks("See [[Old^abc]]", "Old", "New")).toEqual({
      text: "See [[New^abc]]",
      count: 1,
    })
  })

  test("transclusion preserves !", () => {
    expect(rewriteWikilinks("![[Old]]", "Old", "New")).toEqual({ text: "![[New]]", count: 1 })
  })

  test("case-insensitive on target", () => {
    expect(rewriteWikilinks("See [[old]] and [[OLD]]", "Old", "New")).toEqual({
      text: "See [[New]] and [[New]]",
      count: 2,
    })
  })

  test("no rename: same name returns count 0", () => {
    expect(rewriteWikilinks("[[Old]]", "Old", "Old")).toEqual({ text: "[[Old]]", count: 0 })
  })

  test("ignores unrelated wikilinks", () => {
    expect(rewriteWikilinks("[[Old]] [[Other]]", "Old", "New")).toEqual({
      text: "[[New]] [[Other]]",
      count: 1,
    })
  })
})

// =============================================================================
// rewriteBareIdMentions — pure helper
// =============================================================================

describe("rewriteBareIdMentions", () => {
  test("rewrites bd-form dot mention", () => {
    const out = rewriteBareIdMentions("See km-scope.old for context", "@km/scope/old", "@km/scope/new")
    expect(out.text).toBe("See @km/scope/new for context")
    expect(out.count).toBe(1)
  })

  test("rewrites path-form mention", () => {
    const out = rewriteBareIdMentions("See @km/scope/old for context", "@km/scope/old", "@km/scope/new")
    expect(out.text).toBe("See @km/scope/new for context")
    expect(out.count).toBe(1)
  })

  test("preserves wikilinks verbatim", () => {
    const out = rewriteBareIdMentions(
      "Wikilink [[km-scope.old]] stays; bare km-scope.old rewrites",
      "@km/scope/old",
      "@km/scope/new",
    )
    expect(out.text).toBe("Wikilink [[km-scope.old]] stays; bare @km/scope/new rewrites")
    expect(out.count).toBe(1)
  })

  test("preserves inline code", () => {
    const out = rewriteBareIdMentions("`km-scope.old` stays as-is", "@km/scope/old", "@km/scope/new")
    expect(out.text).toBe("`km-scope.old` stays as-is")
    expect(out.count).toBe(0)
  })

  test("preserves fenced code blocks", () => {
    const input = "Outside km-scope.old\n```\nInside km-scope.old\n```\n"
    const out = rewriteBareIdMentions(input, "@km/scope/old", "@km/scope/new")
    expect(out.text).toBe("Outside @km/scope/new\n```\nInside km-scope.old\n```\n")
    expect(out.count).toBe(1)
  })
})

// =============================================================================
// moveNodeWithRefs — primitive surface
// =============================================================================

describe("moveNodeWithRefs", () => {
  test("pure rename, no backlinks", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Lonely",
      name: "Lonely",
    })
    const result = repo.moveNodeWithRefs(id, { newContent: "Solo" })
    expect(result.rewroteHosts).toBe(0)
    expect(result.rewroteRefs).toBe(0)
    expect(repo.getNode(id)?.content).toBe("Solo")
  })

  test("rename with 1 wikilink backlink", () => {
    const { repo, targetId, sourceId } = setupVault()
    const result = repo.moveNodeWithRefs(targetId, { newContent: "New Name" })
    expect(result.rewroteRefs).toBe(1)
    expect(repo.getNode(sourceId)?.content).toBe("See [[New Name]] for details")
  })

  test("rename with aliased wikilink preserves alias", () => {
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
      content: "See [[Original|display]]",
    })
    addLink(repo.database, { host_id: sourceId, href: "km:Original", rel: "link" })

    repo.moveNodeWithRefs(targetId, { newContent: "Updated" })
    expect(repo.getNode(sourceId)?.content).toBe("See [[Updated|display]]")
  })

  test("rename with section ref preserves section", () => {
    const repo = createTestRepo()
    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Note",
      name: "Note",
    })
    const sourceId = repo.addNode(null, {
      type: "p",
      content: "Jump to [[Note#Background]]",
    })
    addLink(repo.database, { host_id: sourceId, href: "km:Note", rel: "link" })

    repo.moveNodeWithRefs(targetId, { newContent: "Doc" })
    expect(repo.getNode(sourceId)?.content).toBe("Jump to [[Doc#Background]]")
  })

  test("rename with transclusion", () => {
    const repo = createTestRepo()
    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Embed Me",
      name: "Embed Me",
    })
    const sourceId = repo.addNode(null, {
      type: "p",
      content: "Here: ![[Embed Me]]",
    })
    addLink(repo.database, { host_id: sourceId, href: "km:Embed Me", rel: "embed" })

    repo.moveNodeWithRefs(targetId, { newContent: "Renamed" })
    expect(repo.getNode(sourceId)?.content).toBe("Here: ![[Renamed]]")
  })

  test("rename rewrites frontmatter aliases", () => {
    const repo = createTestRepo()
    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Old Name",
      name: "Old Name",
    })
    const otherId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Other",
      name: "Other",
      data: { aliases: ["Old Name", "foo"] } as never,
    })

    repo.moveNodeWithRefs(targetId, { newContent: "New Name" })
    const otherNode = repo.getNode(otherId)
    const aliases = (otherNode?.data as { aliases?: string[] } | undefined)?.aliases
    expect(aliases).toEqual(["New Name", "foo"])
  })

  test("rename promotes old name to moved node's aliases", () => {
    const repo = createTestRepo()
    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Old",
      name: "Old",
    })
    repo.moveNodeWithRefs(targetId, { newContent: "New" })
    const data = repo.getNode(targetId)?.data as { aliases?: string[] } | undefined
    expect(data?.aliases).toContain("Old")
  })

  test("alias promotion respects preserveAliases cap", () => {
    const repo = createTestRepo()
    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Old",
      name: "Old",
      data: { aliases: ["a", "b", "c"] } as never,
    })
    repo.moveNodeWithRefs(targetId, { newContent: "New" }, { preserveAliases: 2 })
    const data = repo.getNode(targetId)?.data as { aliases?: string[] } | undefined
    expect(data?.aliases).toHaveLength(2)
    expect(data?.aliases?.[0]).toBe("Old") // newest first
  })

  test("preserveAliases: 0 disables alias promotion", () => {
    const repo = createTestRepo()
    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Old",
      name: "Old",
    })
    repo.moveNodeWithRefs(targetId, { newContent: "New" }, { preserveAliases: 0 })
    const data = repo.getNode(targetId)?.data as { aliases?: string[] } | undefined
    expect(data?.aliases).toBeUndefined()
  })

  test("rename rewrites blocked-by link prop", () => {
    const repo = createTestRepo()
    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Inbox",
      name: "Inbox",
    })
    const taskId = repo.addNode(null, {
      type: "p",
      item: {},
      content: "Blocked task",
      data: {
        props: { "blocked-by": { type: "link", target: "Inbox" } },
      } as never,
    })

    repo.moveNodeWithRefs(targetId, { newContent: "Tasks" })
    const taskData = repo.getNode(taskId)?.data as { props?: { "blocked-by"?: { target?: string } } } | undefined
    expect(taskData?.props?.["blocked-by"]?.target).toBe("Tasks")
  })

  test("rename rewrites blocked-by list prop", () => {
    const repo = createTestRepo()
    const targetId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Item-A",
      name: "Item-A",
    })
    const taskId = repo.addNode(null, {
      type: "p",
      item: {},
      content: "Multi-blocked",
      data: {
        props: {
          "blocked-by": {
            type: "list",
            values: [{ target: "Item-A" }, { target: "Other" }],
          },
        },
      } as never,
    })

    repo.moveNodeWithRefs(targetId, { newContent: "Item-Alpha" })
    const taskData = repo.getNode(taskId)?.data as
      | { props?: { "blocked-by"?: { values?: Array<{ target: string }> } } }
      | undefined
    expect(taskData?.props?.["blocked-by"]?.values?.[0]?.target).toBe("Item-Alpha")
    expect(taskData?.props?.["blocked-by"]?.values?.[1]?.target).toBe("Other")
  })

  test("rename rewrites km.add:: rule path references", () => {
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
      content: "Open km.add:: ./inbox/**",
      name: "Open",
      rules: { add: "./inbox/**" },
      data: { rules: { add: "./inbox/**" } },
    })

    repo.moveNodeWithRefs(folderId, { newContent: "tasks" })
    const section = repo.getNode(sectionId)
    expect(section?.rules?.add).toBe("./tasks/**")
  })

  test("bd-id rewrite (newShortId) updates short_id and aliases", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Bead",
      name: "Bead",
      data: { short_id: "@km/scope/old" } as never,
    })
    repo.moveNodeWithRefs(id, { newShortId: "@km/scope/new" })
    const data = repo.getNode(id)?.data as { short_id?: string; aliases?: string[] } | undefined
    expect(data?.short_id).toBe("@km/scope/new")
    expect(data?.aliases).toContain("@km/scope/old")
  })

  test("bd-id rewrite updates frontmatter parent_id on other nodes", () => {
    const repo = createTestRepo()
    const epicId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Epic",
      name: "Epic",
      data: { short_id: "@km/scope/epic" } as never,
    })
    const childId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Child",
      name: "Child",
      data: { parent_id: "@km/scope/epic" } as never,
    })

    repo.moveNodeWithRefs(epicId, { newShortId: "@km/scope/big-epic" })
    const childData = repo.getNode(childId)?.data as { parent_id?: string } | undefined
    expect(childData?.parent_id).toBe("@km/scope/big-epic")
  })

  test("bd-id rewrite, --include-prose rewrites bare prose mentions", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Bead",
      name: "Bead",
      data: { short_id: "@km/scope/old" } as never,
    })
    const otherId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Other",
      name: "Other",
    })
    // Place a prose mention inside Other's content
    repo.updateNode(otherId, { content: "Other\n\nSee km-scope.old for context" })

    repo.moveNodeWithRefs(id, { newShortId: "@km/scope/new" }, { includeProse: true })
    const updated = repo.getNode(otherId)?.content
    expect(updated).toContain("@km/scope/new")
    expect(updated).not.toContain("km-scope.old")
  })

  test("bd-id rewrite without --include-prose leaves bare mentions alone", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Bead",
      name: "Bead",
      data: { short_id: "@km/scope/old" } as never,
    })
    const otherId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Other",
      name: "Other",
    })
    repo.updateNode(otherId, { content: "Other\n\nSee km-scope.old for context" })

    repo.moveNodeWithRefs(id, { newShortId: "@km/scope/new" })
    expect(repo.getNode(otherId)?.content).toContain("km-scope.old")
  })

  test("noRewrite skips backlink walk", () => {
    const { repo, targetId, sourceId } = setupVault()
    const result = repo.moveNodeWithRefs(targetId, { newContent: "New Name" }, { noRewrite: true })
    expect(result.rewroteHosts).toBe(0)
    expect(result.rewroteRefs).toBe(0)
    expect(repo.getNode(sourceId)?.content).toBe("See [[Old Name]] for details")
  })

  test("name collision throws when errorOnNameCollision (default)", () => {
    const repo = createTestRepo()
    const a = repo.addNode(null, {
      type: "p",
      item: {},
      content: "Alpha",
      name: "Alpha",
    })
    repo.addNode(null, {
      type: "p",
      item: {},
      content: "Beta",
      name: "Beta",
    })
    expect(() => repo.moveNodeWithRefs(a, { newContent: "Beta" })).toThrow(/Name collision/)
  })

  test("name collision allowed when errorOnNameCollision: false", () => {
    const repo = createTestRepo()
    const a = repo.addNode(null, {
      type: "p",
      item: {},
      content: "Alpha",
      name: "Alpha",
    })
    repo.addNode(null, {
      type: "p",
      item: {},
      content: "Beta",
      name: "Beta",
    })
    expect(() => repo.moveNodeWithRefs(a, { newContent: "Beta" }, { errorOnNameCollision: false })).not.toThrow()
  })

  test("idempotence: second run is a no-op", () => {
    const { repo, targetId, sourceId } = setupVault()
    const r1 = repo.moveNodeWithRefs(targetId, { newContent: "New Name" })
    expect(r1.rewroteRefs).toBe(1)
    const r2 = repo.moveNodeWithRefs(targetId, { newContent: "New Name" })
    expect(r2.rewroteRefs).toBe(0)
    expect(repo.getNode(sourceId)?.content).toBe("See [[New Name]] for details")
  })

  test("re-parent only: no name change leaves backlinks alone", () => {
    const repo = createTestRepo()
    const parent1 = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "folder",
      content: "p1",
      name: "p1",
      fs_path: "p1",
    })
    const parent2 = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "folder",
      content: "p2",
      name: "p2",
      fs_path: "p2",
    })
    const child = repo.addNode(parent1, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Child",
      name: "Child",
      fs_path: "p1/Child.md",
    })
    const sourceId = repo.addNode(null, {
      type: "p",
      content: "See [[Child]]",
    })
    addLink(repo.database, { host_id: sourceId, href: "km:Child", rel: "link" })

    repo.moveNodeWithRefs(child, { newParentId: parent2 })
    expect(repo.getNode(child)?.parent_id).toBe(parent2)
    // Wikilink unchanged because name didn't change
    expect(repo.getNode(sourceId)?.content).toBe("See [[Child]]")
  })

  test("link cache href row repointed after rewrite", () => {
    const { repo, targetId } = setupVault()
    repo.moveNodeWithRefs(targetId, { newContent: "New Name" })
    // After rewrite, link rows should match the new href, not the old one
    const oldBacklinks = repo.database!.query("SELECT host_id FROM links WHERE href = 'km:Old Name'").all() as Array<{
      host_id: string
    }>
    expect(oldBacklinks).toHaveLength(0)
    const newBacklinks = repo.database!.query("SELECT host_id FROM links WHERE href = 'km:New Name'").all() as Array<{
      host_id: string
    }>
    expect(newBacklinks).toHaveLength(1)
  })

  test("returns failedHosts as empty array when all updates succeed", () => {
    const { repo, targetId } = setupVault()
    const result = repo.moveNodeWithRefs(targetId, { newContent: "New Name" })
    expect(result.failedHosts).toEqual([])
  })

  test("self-ref in moved node's own content not double-rewritten", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Self",
      name: "Self",
    })
    // Add a self-link
    repo.updateNode(id, { content: "Self\n\nSee [[Self]] (self-ref)" })
    addLink(repo.database, { host_id: id, href: "km:Self", rel: "link" })

    const result = repo.moveNodeWithRefs(id, { newContent: "Renamed" })
    // The moved node is updated in phase 1; phase 2 must skip it
    expect(repo.getNode(id)?.content).toBe("Renamed")
    expect(result.rewroteRefs).toBe(0) // phase 2 didn't touch self
  })

  test("MoveResult shape includes oldName/newName/old/new short id and fs_path", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "Old",
      name: "Old",
      fs_path: "Old.md",
      data: { short_id: "@km/scope/old" } as never,
    })
    const result = repo.moveNodeWithRefs(id, {
      newContent: "New",
      newShortId: "@km/scope/new",
    })
    expect(result.oldName).toBe("Old")
    expect(result.newName).toBe("New")
    expect(result.oldShortId).toBe("@km/scope/old")
    expect(result.newShortId).toBe("@km/scope/new")
    expect(result.oldFsPath).toBe("Old.md")
    // newFsPath derives a slugified leaf from the new name
    expect(result.newFsPath).toBe("New.md")
  })

  test("progress callback fires during rewrite", () => {
    const { repo, targetId } = setupVault()
    const phases = new Set<string>()
    repo.moveNodeWithRefs(targetId, { newContent: "New Name" }, { onProgress: (info) => phases.add(info.phase) })
    expect(phases.has("data-layer")).toBe(true)
  })
})
