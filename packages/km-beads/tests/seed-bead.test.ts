/**
 * seedBead — bd-CLI-conventional thin wrapper around seedFileNode.
 *
 * Bead: @km/beads/seed-bead-as-thin-wrapper
 */

import { describe, test, expect } from "vitest"
import { createTestRepo, resolveRef } from "@km/storage"

import { seedBead } from "../src/testing/seed-bead.ts"

describe("seedBead", () => {
  test("delegates to seedFileNode with bd-conventional defaults", () => {
    const repo = createTestRepo()
    const seeded = seedBead(repo, "@km/beads/foo")

    const node = repo.getNode(seeded.nodeId)
    expect(node?.fstype).toBe("mdfile")
    expect(node?.fs_path).toBe("@km/beads/foo.md")
    expect(node?.data).toMatchObject({ type: "task", priority: "P2" })
  })

  test("accepts type / priority / status overrides", () => {
    const repo = createTestRepo()
    const seeded = seedBead(repo, "@km/beads/bar", {
      type: "bug",
      priority: "P0",
      status: "open",
    })
    const node = repo.getNode(seeded.nodeId)
    expect(node?.data).toMatchObject({ type: "bug", priority: "P0", status: "open" })
  })

  test("aliases pass through and become resolvable", () => {
    const repo = createTestRepo()
    const seeded = seedBead(repo, "@km/beads/baz", {
      aliases: ["km-beads.baz", "km-beads-baz"],
    })
    expect(resolveRef(repo, "km-beads.baz")).toBe(seeded.nodeId)
    expect(resolveRef(repo, "km-beads-baz")).toBe(seeded.nodeId)
  })

  test("path-form resolves via step 2 (no data.id needed)", () => {
    const repo = createTestRepo()
    const seeded = seedBead(repo, "@km/beads/qux")
    expect(resolveRef(repo, "@km/beads/qux")).toBe(seeded.nodeId)
  })

  test("title becomes body H1", () => {
    const repo = createTestRepo()
    const seeded = seedBead(repo, "@km/beads/with-title", { title: "My Bug" })
    const node = repo.getNode(seeded.nodeId)
    expect(node?.content).toContain("# My Bug")
  })
})
