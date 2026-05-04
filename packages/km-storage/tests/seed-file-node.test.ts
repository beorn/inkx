/**
 * seedFileNode — universal fs-materialized node test helper.
 *
 * Bead: @km/storage/seed-file-node-helper
 */

import { describe, test, expect } from "vitest"

import { createTestRepo, resolveRef, seedFileNode } from "../src/index.ts"

describe("seedFileNode", () => {
  test("seeds a single mdfile under root with computed fs_path", () => {
    const repo = createTestRepo()
    const seeded = seedFileNode(repo, "@km/notes/foo")
    expect(seeded.fsPath).toBe("@km/notes/foo.md")
    expect(seeded.name).toBe("foo")

    const node = repo.getNode(seeded.nodeId)
    expect(node?.fstype).toBe("mdfile")
    expect(node?.fs_path).toBe("@km/notes/foo.md")
  })

  test("creates ancestor folders implicitly", () => {
    const repo = createTestRepo()
    const seeded = seedFileNode(repo, "@km/beads/cutover")

    // Walk should find the @km folder, beads folder, and cutover file.
    const km = repo.resolveNode("@km")
    const beads = repo.resolveNode("@km/beads")
    expect(km?.fstype).toBe("folder")
    expect(beads?.fstype).toBe("folder")

    const file = repo.getNode(seeded.nodeId)
    expect(file?.parent_id).toBe(beads?.id)
  })

  test("does NOT duplicate ancestors when seeding multiple files in the same folder", () => {
    const repo = createTestRepo()
    seedFileNode(repo, "@km/beads/foo")
    seedFileNode(repo, "@km/beads/bar")

    const beadsFolders = repo.rawQuery<{ id: string }>(
      `SELECT id FROM nodes WHERE name = '@km' AND fstype = 'folder'`,
      [],
    )
    expect(beadsFolders).toHaveLength(1) // One @km folder, not two.
  })

  test("aliases land in data.aliases and become indexed in node_aliases", () => {
    const repo = createTestRepo()
    const seeded = seedFileNode(repo, "@km/beads/foo", {
      aliases: ["km-beads.foo", "km-beads-foo"],
    })

    // resolveRef finds via alias (step 3, indexed table).
    expect(resolveRef(repo, "km-beads.foo")).toBe(seeded.nodeId)
    expect(resolveRef(repo, "km-beads-foo")).toBe(seeded.nodeId)
  })

  test("resolveRef step 2 (path-form) finds the seeded node — no data.id fallback needed", () => {
    const repo = createTestRepo()
    const seeded = seedFileNode(repo, "@km/notes/myfile")
    // Step 2 (indexed fs_path) — this is the production code path.
    expect(resolveRef(repo, "@km/notes/myfile")).toBe(seeded.nodeId)
  })

  test("frontmatter values land in data", () => {
    const repo = createTestRepo()
    const seeded = seedFileNode(repo, "@km/beads/foo", {
      frontmatter: { type: "task", priority: "P1" },
    })
    const node = repo.getNode(seeded.nodeId)
    expect(node?.data).toMatchObject({ type: "task", priority: "P1" })
  })

  test("folder fstype seeds without .md extension", () => {
    const repo = createTestRepo()
    const seeded = seedFileNode(repo, "@km/scope", { fstype: "folder" })
    expect(seeded.fsPath).toBe("@km/scope")

    const node = repo.getNode(seeded.nodeId)
    expect(node?.fstype).toBe("folder")
  })

  test("rejects empty path", () => {
    const repo = createTestRepo()
    expect(() => seedFileNode(repo, "")).toThrow(/at least one segment/)
    expect(() => seedFileNode(repo, "/")).toThrow(/at least one segment/)
  })
})
