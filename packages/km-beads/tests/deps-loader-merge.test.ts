/**
 * Loader merge: frontmatter `dependencies:` → `data.props["blocked-by"]`.
 *
 * Frontmatter `dependencies:` is a YAML-first authoring affordance for bead
 * blockers; inline `blocked-by:: [[X]]` is the body-prose form. Before the
 * loader merge, only the inline form was indexed by the SQLite `deps` table
 * — frontmatter `dependencies:` was a write-only fossil. These tests pin
 * the new behavior:
 *
 *   - frontmatter-only authoring produces deps rows.
 *   - inline-only authoring still produces deps rows.
 *   - both forms together produce two rows (merge preserves both).
 *   - existing `data.props["blocked-by"]` (e.g. carried by H1 data merge)
 *     is unioned with frontmatter targets, not overwritten.
 *
 * Wires real Repo objects so the schema's INSERT triggers actually fire.
 *
 * See bead `@km/storage/deps-first-class`.
 */

import { describe, test, expect } from "vitest"
import { parseMarkdownWithLinks, mergeFrontmatterDepsIntoBlockedBy } from "@km/markdown"
import { createTestRepo, type Repo } from "@km/storage"

function loadMarkdownIntoRepo(repo: Repo, fsPath: string, content: string): string[] {
  const { nodes } = parseMarkdownWithLinks(content, fsPath)
  // Re-parent under repo root in dependency order (file node first, then
  // children whose parent_id may reference the file node by id).
  const idMap = new Map<string, string>()
  const ids: string[] = []
  for (const node of nodes) {
    const oldId = node.id
    const oldParentId = node.parent_id
    const newParentId = oldParentId ? (idMap.get(oldParentId) ?? null) : null
    const { id: _drop, parent_id: _drop2, ...rest } = node
    const newId = repo.addNode(newParentId, rest)
    if (oldId) idMap.set(oldId, newId)
    ids.push(newId)
  }
  return ids
}

function readBlockedByDeps(repo: Repo, hostId: string): Array<{ target: string; kind: string }> {
  return repo.rawQuery<{ target: string; kind: string }>(
    "SELECT target, kind FROM deps WHERE host_id = ? AND kind = 'blocked-by' ORDER BY target",
    [hostId],
  )
}

function readAllBlockedByTargets(repo: Repo): Set<string> {
  const rows = repo.rawQuery<{ target: string }>("SELECT DISTINCT target FROM deps WHERE kind = 'blocked-by'")
  return new Set(rows.map((r) => r.target))
}

describe("mergeFrontmatterDepsIntoBlockedBy (unit)", () => {
  test("noop when no dependencies", () => {
    const data: Record<string, unknown> = { id: "@km/foo/bar" }
    mergeFrontmatterDepsIntoBlockedBy(data)
    expect(data.props).toBeUndefined()
  })

  test("string dependency entries become a single-link blocked-by", () => {
    const data: Record<string, unknown> = { dependencies: ["@km/foo"] }
    mergeFrontmatterDepsIntoBlockedBy(data)
    expect(data.props).toEqual({
      "blocked-by": { type: "link", target: "@km/foo" },
    })
  })

  test("multiple string dependencies become a list-of-links blocked-by", () => {
    const data: Record<string, unknown> = { dependencies: ["@km/foo", "@km/bar"] }
    mergeFrontmatterDepsIntoBlockedBy(data)
    expect(data.props).toEqual({
      "blocked-by": {
        type: "list",
        values: [
          { type: "link", target: "@km/foo" },
          { type: "link", target: "@km/bar" },
        ],
      },
    })
  })

  test("bd-export edge objects pull target from depends_on_id", () => {
    const data: Record<string, unknown> = {
      dependencies: [
        { issue_id: "self-id", depends_on_id: "@km/foo", type: "blocks" },
        { issue_id: "self-id", depends_on_id: "@km/bar", type: "blocks" },
      ],
    }
    mergeFrontmatterDepsIntoBlockedBy(data)
    expect(data.props).toEqual({
      "blocked-by": {
        type: "list",
        values: [
          { type: "link", target: "@km/foo" },
          { type: "link", target: "@km/bar" },
        ],
      },
    })
  })

  test("merges with existing blocked-by, deduping targets", () => {
    const data: Record<string, unknown> = {
      dependencies: ["@km/foo", "@km/shared"],
      props: {
        "blocked-by": {
          type: "list",
          values: [
            { type: "link", target: "@km/shared" },
            { type: "link", target: "@km/inline" },
          ],
        },
      },
    }
    mergeFrontmatterDepsIntoBlockedBy(data)
    const props = data.props as Record<string, unknown>
    const blockedBy = props["blocked-by"] as { type: string; values: Array<{ target: string }> }
    expect(blockedBy.type).toBe("list")
    expect(new Set(blockedBy.values.map((v) => v.target))).toEqual(new Set(["@km/foo", "@km/shared", "@km/inline"]))
  })

  test("preserves single-link existing blocked-by when frontmatter adds another target", () => {
    const data: Record<string, unknown> = {
      dependencies: ["@km/foo"],
      props: {
        "blocked-by": { type: "link", target: "@km/inline" },
      },
    }
    mergeFrontmatterDepsIntoBlockedBy(data)
    const props = data.props as Record<string, unknown>
    const blockedBy = props["blocked-by"] as { type: string; values: Array<{ target: string }> }
    expect(blockedBy.type).toBe("list")
    expect(new Set(blockedBy.values.map((v) => v.target))).toEqual(new Set(["@km/foo", "@km/inline"]))
  })

  test("handles entries with explicit { target } shape", () => {
    const data: Record<string, unknown> = {
      dependencies: [{ target: "@km/foo" }, { target: "@km/bar" }],
    }
    mergeFrontmatterDepsIntoBlockedBy(data)
    expect(data.props).toEqual({
      "blocked-by": {
        type: "list",
        values: [
          { type: "link", target: "@km/foo" },
          { type: "link", target: "@km/bar" },
        ],
      },
    })
  })

  test("ignores empty / malformed entries", () => {
    const data: Record<string, unknown> = {
      dependencies: [null, undefined, "", { foo: "bar" }, "@km/keep"],
    }
    mergeFrontmatterDepsIntoBlockedBy(data)
    expect(data.props).toEqual({
      "blocked-by": { type: "link", target: "@km/keep" },
    })
  })
})

describe("frontmatter dependencies → deps table (round-trip)", () => {
  test("frontmatter-only `dependencies: [@km/foo]` produces a deps row", () => {
    using repo = createTestRepo()
    const content = `---
id: "@km/scope/me"
dependencies:
  - "@km/foo"
---

# Me

Body without inline blocked-by.
`
    const ids = loadMarkdownIntoRepo(repo, "@km/scope/me.md", content)
    // The file node is the first inserted node.
    const fileId = ids[0]!
    const rows = readBlockedByDeps(repo, fileId)
    expect(rows).toEqual([{ target: "@km/foo", kind: "blocked-by" }])
  })

  test("inline-only `blocked-by:: [[@km/foo]]` on H1 produces a deps row (regression)", () => {
    using repo = createTestRepo()
    // Inline-prop on the H1 lands in fileNode.data.props after H1-merge.
    const content = `---
id: "@km/scope/me"
---

# Me blocked-by:: [[@km/foo]]
`
    loadMarkdownIntoRepo(repo, "@km/scope/me.md", content)
    expect(readAllBlockedByTargets(repo)).toContain("@km/foo")
  })

  test("frontmatter `[@km/foo]` AND inline list-item `blocked-by:: [[@km/bar]]` produce TWO deps rows", () => {
    using repo = createTestRepo()
    // Frontmatter feeds the file node; the list-item carries its own blocked-by
    // on the child node — both rows hit the deps table with different host_ids.
    const content = `---
id: "@km/scope/me"
dependencies:
  - "@km/foo"
---

# Me

- [ ] subtask blocked-by:: [[@km/bar]]
`
    loadMarkdownIntoRepo(repo, "@km/scope/me.md", content)
    const all = readAllBlockedByTargets(repo)
    expect(all).toContain("@km/foo")
    expect(all).toContain("@km/bar")
  })

  test("bd-export edge shape in frontmatter still produces deps rows", () => {
    using repo = createTestRepo()
    const content = `---
id: "@km/scope/me"
dependencies:
  - issue_id: "@km/scope/me"
    depends_on_id: "@km/foo"
    type: blocks
  - issue_id: "@km/scope/me"
    depends_on_id: "@km/bar"
    type: blocks
---

# Me
`
    const ids = loadMarkdownIntoRepo(repo, "@km/scope/me.md", content)
    const fileId = ids[0]!
    const rows = readBlockedByDeps(repo, fileId)
    expect(rows.map((r) => r.target).sort()).toEqual(["@km/bar", "@km/foo"])
  })

  test("multiple frontmatter targets fan out into per-target deps rows", () => {
    using repo = createTestRepo()
    const content = `---
id: "@km/scope/me"
dependencies:
  - "@km/foo"
  - "@km/bar"
  - "@km/baz"
---

# Me
`
    const ids = loadMarkdownIntoRepo(repo, "@km/scope/me.md", content)
    const fileId = ids[0]!
    const rows = readBlockedByDeps(repo, fileId)
    expect(rows.map((r) => r.target).sort()).toEqual(["@km/bar", "@km/baz", "@km/foo"])
  })
})
