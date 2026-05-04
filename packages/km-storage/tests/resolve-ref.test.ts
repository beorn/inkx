/**
 * Universal resolveRef — id / path-form / alias ladder.
 *
 * Bead: @km/storage/extract-resolveref
 */

import { describe, test, expect } from "vitest"

import { createTestRepo, resolveRef, type Repo } from "../src/index.ts"

function vaultWithBead(): { repo: Repo; nodeId: string } {
  const repo = createTestRepo()
  // Mirror real bead shape: parent folder, then a file under it.
  const beadsId = repo.addNode(null, {
    type: "h",
    item: {},
    fstype: "folder",
    content: "@km/beads",
    name: "@km/beads",
    fs_path: "@km/beads",
  })
  const nodeId = repo.addNode(beadsId, {
    type: "h",
    item: {},
    fstype: "mdfile",
    content: "foo",
    name: "foo",
    fs_path: "@km/beads/foo.md",
    data: { aliases: ["km-beads.foo", "km-beads-foo"] },
  })
  return { repo, nodeId }
}

describe("resolveRef", () => {
  test("step 1: ULID match returns the node", () => {
    const { repo, nodeId } = vaultWithBead()
    expect(resolveRef(repo, nodeId)).toBe(nodeId)
  })

  test("step 2: path-form (sigil-prefixed) returns the node", () => {
    const { repo, nodeId } = vaultWithBead()
    expect(resolveRef(repo, "@km/beads/foo")).toBe(nodeId)
  })

  test("step 2: relative path-form (without sigil) returns the node when fs_path matches", () => {
    const repo = createTestRepo()
    const folderId = repo.addNode(null, {
      type: "h",
      item: {},
      fstype: "folder",
      content: "scope",
      name: "scope",
      fs_path: "scope",
    })
    const nodeId = repo.addNode(folderId, {
      type: "h",
      item: {},
      fstype: "mdfile",
      content: "child",
      name: "child",
      fs_path: "scope/child.md",
    })
    expect(resolveRef(repo, "scope/child")).toBe(nodeId)
  })

  test("step 3: alias match returns the node", () => {
    const { repo, nodeId } = vaultWithBead()
    expect(resolveRef(repo, "km-beads.foo")).toBe(nodeId)
    expect(resolveRef(repo, "km-beads-foo")).toBe(nodeId)
  })

  test("missing input returns null", () => {
    const { repo } = vaultWithBead()
    expect(resolveRef(repo, "@km/missing")).toBeNull()
    expect(resolveRef(repo, "01H5XJDOESNOTEXIST00000000")).toBeNull()
    expect(resolveRef(repo, "no-such-alias")).toBeNull()
  })

  test("step 1 wins over step 2 (ULID never collides with path)", () => {
    const { repo, nodeId } = vaultWithBead()
    // ULID match short-circuits before path lookup can see anything else.
    expect(resolveRef(repo, nodeId)).toBe(nodeId)
  })

  test("does NOT include data.id json_extract fallback (that's beads-side only)", () => {
    const repo = createTestRepo()
    // Seed via raw addNode without fs_path — this is the pattern that
    // resolveShortId's step-4 fallback handles. resolveRef must NOT.
    const nodeId = repo.addNode(null, {
      type: "h",
      item: {},
      content: "orphan",
      name: "orphan",
      data: { id: "@km/orphan/no-fs-path" },
    })
    expect(resolveRef(repo, "@km/orphan/no-fs-path")).toBeNull()
    expect(repo.getNode(nodeId)).toBeTruthy() // node exists, just not findable by data.id
  })
})
