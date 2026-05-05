/**
 * resolveShortId — Tagged ambiguity-aware resolver.
 *
 * Pins the L4 invariant: short ids never silently mis-resolve. Either
 * exactly one node matches (kind: "found"), the caller gets the candidate
 * list (kind: "ambiguous"), or nothing matched (kind: "none").
 *
 * Bead: @km/cli/task-bd-collapse
 */

import { describe, test, expect } from "vitest"

import { createTestRepo, resolveShortId, formatAmbiguityError, type Repo } from "../../src/index.ts"

function makeFolder(repo: Repo, parent: string | null, name: string, fs_path: string): string {
  return repo.addNode(parent, {
    type: "h",
    item: {},
    fstype: "folder",
    content: name,
    name,
    fs_path,
  })
}

function makeFile(
  repo: Repo,
  parent: string | null,
  name: string,
  fs_path: string,
  data: Record<string, unknown> = {},
): string {
  return repo.addNode(parent, {
    type: "h",
    item: {},
    fstype: "mdfile",
    content: name,
    name,
    fs_path,
    data,
  })
}

describe("resolveShortId", () => {
  test("exact ULID match returns 'found'", () => {
    const repo = createTestRepo()
    const folder = makeFolder(repo, null, "@km/storage", "@km/storage")
    const id = makeFile(repo, folder, "foo", "@km/storage/foo.md")

    const r = resolveShortId(repo, id)
    expect(r.kind).toBe("found")
    if (r.kind === "found") expect(r.node.id).toBe(id)
  })

  test("exact name match returns 'found'", () => {
    const repo = createTestRepo()
    const folder = makeFolder(repo, null, "@km/storage", "@km/storage")
    const id = makeFile(repo, folder, "foo", "@km/storage/foo.md")

    const r = resolveShortId(repo, "foo")
    expect(r.kind).toBe("found")
    if (r.kind === "found") expect(r.node.id).toBe(id)
  })

  test("suffix match resolves a unique slug", () => {
    const repo = createTestRepo()
    // Storage has only one file with the suffix `bar.md`.
    const a = makeFolder(repo, null, "@km/storage", "@km/storage")
    const id = makeFile(repo, a, "bar", "@km/storage/bar.md")
    const b = makeFolder(repo, null, "@km/api", "@km/api")
    makeFile(repo, b, "baz", "@km/api/baz.md")

    const r = resolveShortId(repo, "bar")
    expect(r.kind).toBe("found")
    if (r.kind === "found") expect(r.node.id).toBe(id)
  })

  test("ambiguous suffix returns candidate list", () => {
    const repo = createTestRepo()
    const a = makeFolder(repo, null, "@km/storage", "@km/storage")
    makeFile(repo, a, "shared", "@km/storage/shared.md")
    const b = makeFolder(repo, null, "@km/api", "@km/api")
    makeFile(repo, b, "shared", "@km/api/shared.md")

    const r = resolveShortId(repo, "shared")
    expect(r.kind).toBe("ambiguous")
    if (r.kind === "ambiguous") {
      expect(r.candidates).toHaveLength(2)
      // Stable order: alphabetical by fs_path.
      expect(r.candidates[0]?.fs_path).toBe("@km/api/shared.md")
      expect(r.candidates[1]?.fs_path).toBe("@km/storage/shared.md")
    }
  })

  test("formatAmbiguityError prints all candidates", () => {
    const repo = createTestRepo()
    const a = makeFolder(repo, null, "@km/storage", "@km/storage")
    makeFile(repo, a, "x", "@km/storage/x.md")
    const b = makeFolder(repo, null, "@km/api", "@km/api")
    makeFile(repo, b, "x", "@km/api/x.md")

    const r = resolveShortId(repo, "x")
    if (r.kind !== "ambiguous") throw new Error("expected ambiguous")
    const msg = formatAmbiguityError("x", r.candidates)
    expect(msg).toContain('"x" is ambiguous')
    expect(msg).toContain("@km/storage/x.md")
    expect(msg).toContain("@km/api/x.md")
  })

  test("bd-form alias resolves to canonical path-form node", () => {
    const repo = createTestRepo()
    const folder = makeFolder(repo, null, "@km/storage", "@km/storage")
    const id = makeFile(repo, folder, "foo", "@km/storage/foo.md", {
      aliases: ["km-storage.foo", "km-storage-foo"],
    })

    expect(resolveShortId(repo, "km-storage.foo")).toMatchObject({ kind: "found", node: { id } })
    expect(resolveShortId(repo, "km-storage-foo")).toMatchObject({ kind: "found", node: { id } })
  })

  test("bd-form translates even without alias when fs_path exists", () => {
    // Stub-state node — file is on disk but data.aliases is empty.
    // bdIdToPathForm should derive the path-form and resolveNode finds it.
    const repo = createTestRepo()
    const folder = makeFolder(repo, null, "@km/storage", "@km/storage")
    const id = makeFile(repo, folder, "leaf", "@km/storage/leaf.md")

    const r = resolveShortId(repo, "km-storage.leaf")
    expect(r.kind).toBe("found")
    if (r.kind === "found") expect(r.node.id).toBe(id)
  })

  test("data.id exact match wins (canonical bead)", () => {
    const repo = createTestRepo()
    const folder = makeFolder(repo, null, "@km/storage", "@km/storage")
    const id = makeFile(repo, folder, "alpha", "@km/storage/alpha.md", {
      id: "@km/storage/alpha",
    })

    const r = resolveShortId(repo, "@km/storage/alpha")
    expect(r.kind).toBe("found")
    if (r.kind === "found") expect(r.node.id).toBe(id)
  })

  test("no match returns 'none'", () => {
    const repo = createTestRepo()
    makeFolder(repo, null, "@km/storage", "@km/storage")

    const r = resolveShortId(repo, "totally-missing-slug")
    expect(r.kind).toBe("none")
  })

  test("empty input returns 'none'", () => {
    const repo = createTestRepo()
    expect(resolveShortId(repo, "").kind).toBe("none")
    expect(resolveShortId(repo, "   ").kind).toBe("none")
  })

  test("candidate ordering is stable across repeated calls", () => {
    // Property-style: random insertion order, deterministic candidate order.
    const repo = createTestRepo()
    const scopes = ["@km/storage", "@km/api", "@km/cli", "@km/board"]
    // Insert in shuffled order.
    const order = [2, 0, 3, 1]
    const ids: string[] = []
    for (const i of order) {
      const scope = scopes[i]
      if (!scope) continue
      const folder = makeFolder(repo, null, scope, scope)
      ids.push(makeFile(repo, folder, "dup", `${scope}/dup.md`))
    }

    const r1 = resolveShortId(repo, "dup")
    const r2 = resolveShortId(repo, "dup")
    expect(r1.kind).toBe("ambiguous")
    expect(r2.kind).toBe("ambiguous")
    if (r1.kind === "ambiguous" && r2.kind === "ambiguous") {
      const paths1 = r1.candidates.map((c) => c.fs_path)
      const paths2 = r2.candidates.map((c) => c.fs_path)
      expect(paths1).toEqual(paths2)
      // Confirm alphabetical sort.
      expect(paths1).toEqual([...paths1].sort())
    }
  })

  test("query containing slash falls through to layer 5 only via bd path translation", () => {
    // Slashed input should not hit the suffix arm — it's path-shaped already.
    const repo = createTestRepo()
    const folder = makeFolder(repo, null, "@km/storage", "@km/storage")
    const id = makeFile(repo, folder, "thing", "@km/storage/thing.md")

    // Path-shaped lookup goes through resolveNode (existing behavior).
    const r = resolveShortId(repo, "@km/storage/thing")
    expect(r.kind).toBe("found")
    if (r.kind === "found") expect(r.node.id).toBe(id)
  })
})
