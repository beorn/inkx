/**
 * `nodeToBead` resolver tests — `@km/beads/queries-decompose-node-to-bead`.
 *
 * `nodeToBead` was decomposed into named pure resolvers (each ≤30 LOC,
 * no I/O beyond the optional Repo, no module state). This file exercises
 * each resolver's decision branches independently so a regression in one
 * branch surfaces locally rather than via a property-test failure on
 * `nodeToBead`.
 *
 * Resolvers under test:
 *   - resolveBlockedBy   — props["blocked-by"] → string[]?
 *   - resolveStatus      — node.item.task.status + blockedBy fallback
 *   - resolveType        — hashtag scan against BEAD_TYPE_KEYWORDS
 *   - resolveBeadShortId — data.id / data.short_id / fs_path-derived
 *
 * Each resolver has 3+ tests covering its decision branches; together
 * they pin the orchestrator's public behaviour without re-running the
 * full property suite.
 */

import { describe, expect, test } from "vitest"
import { createTestRepo, type Repo } from "@km/storage"
import type { KNode } from "@km/core"
import { __resolvers, nodeToBead } from "../src/queries.ts"

const { resolveBlockedBy, resolveStatus, resolveType, resolveBeadShortId } = __resolvers

/**
 * Seed a hashtag link row directly. Mirrors what the parser writes after
 * scanning `#<tag>` in content (per `@km/all/dissolve-data-tags-to-links`):
 *   `(host_id, href='km:%23<tag>', rel='link')`
 * Tests that need to exercise `resolveType` use this to bypass the parser.
 */
function seedTagLink(repo: Repo, hostId: string, tag: string): void {
  repo.rawQuery("INSERT INTO links (host_id, href, rel) VALUES (?, ?, ?)", [hostId, `km:%23${tag}`, "link"])
}

// =============================================================================
// resolveBlockedBy
// =============================================================================

describe("resolveBlockedBy — props['blocked-by'] extraction", () => {
  test("returns undefined when no props blob present", () => {
    const node = { id: "n1", data: undefined } as unknown as KNode
    expect(resolveBlockedBy(node)).toBeUndefined()
  })

  test("returns undefined when props is empty / blocked-by missing", () => {
    const node = { id: "n1", data: { props: {} } } as unknown as KNode
    expect(resolveBlockedBy(node)).toBeUndefined()
  })

  test("link-shaped prop with one target → single-element array", () => {
    const node = {
      id: "n1",
      data: { props: { "blocked-by": { type: "link", target: "@km/scope/dep" } } },
    } as unknown as KNode
    expect(resolveBlockedBy(node)).toStrictEqual(["@km/scope/dep"])
  })

  test("list-shaped prop with multiple values preserves order", () => {
    const node = {
      id: "n1",
      data: {
        props: {
          "blocked-by": {
            type: "list",
            values: [{ target: "a" }, { target: "b" }, { target: "c" }],
          },
        },
      },
    } as unknown as KNode
    expect(resolveBlockedBy(node)).toStrictEqual(["a", "b", "c"])
  })

  test("list-shaped prop without values → undefined (defensive)", () => {
    const node = {
      id: "n1",
      data: { props: { "blocked-by": { type: "list" } } },
    } as unknown as KNode
    expect(resolveBlockedBy(node)).toBeUndefined()
  })

  test("link-shaped prop without target → undefined (defensive)", () => {
    const node = {
      id: "n1",
      data: { props: { "blocked-by": { type: "link" } } },
    } as unknown as KNode
    expect(resolveBlockedBy(node)).toBeUndefined()
  })

  test("unknown prop type → undefined (forward-compat)", () => {
    const node = {
      id: "n1",
      data: { props: { "blocked-by": { type: "text", value: "literal" } } },
    } as unknown as KNode
    expect(resolveBlockedBy(node)).toBeUndefined()
  })
})

// =============================================================================
// resolveStatus
// =============================================================================

describe("resolveStatus — task.status + blockedBy fallback", () => {
  function nodeWithStatus(s: string | undefined): KNode {
    return {
      id: "n1",
      item: s === undefined ? undefined : { task: { status: s } },
    } as unknown as KNode
  }

  test("explicit `done` always wins (even with open blockers)", () => {
    expect(resolveStatus(nodeWithStatus("done"), ["a", "b"])).toBe("done")
  })

  test("explicit `wip` always wins (even with open blockers)", () => {
    expect(resolveStatus(nodeWithStatus("wip"), ["a"])).toBe("wip")
  })

  test("explicit `blocked` is preserved", () => {
    expect(resolveStatus(nodeWithStatus("blocked"), undefined)).toBe("blocked")
  })

  test("explicit `dropped` is preserved", () => {
    expect(resolveStatus(nodeWithStatus("dropped"), undefined)).toBe("dropped")
  })

  test("default (no status) + open blockers → blocked (the fallback)", () => {
    expect(resolveStatus(nodeWithStatus(undefined), ["a"])).toBe("blocked")
  })

  test("default (no status) + no blockers → todo", () => {
    expect(resolveStatus(nodeWithStatus(undefined), undefined)).toBe("todo")
    expect(resolveStatus(nodeWithStatus(undefined), [])).toBe("todo")
  })

  test("explicit `todo` + blockers → blocked (fallback fires for default-shaped)", () => {
    // The `todo` checkbox marker is the default `[ ]` value — anything
    // not in {done,wip,blocked,dropped} falls through to the fallback.
    expect(resolveStatus(nodeWithStatus("todo"), ["a"])).toBe("blocked")
  })

  test("unknown status string → fallback (forward-compat)", () => {
    expect(resolveStatus(nodeWithStatus("future-status"), undefined)).toBe("todo")
    expect(resolveStatus(nodeWithStatus("future-status"), ["a"])).toBe("blocked")
  })
})

// =============================================================================
// resolveType — needs a real Repo for link-row scanning
// =============================================================================

describe("resolveType — hashtag link rows scanned against BEAD_TYPE_KEYWORDS", () => {
  test("falls back to content hashtags when no repo is provided", () => {
    const node = { id: "n1", content: "title #bug" } as unknown as KNode
    expect(resolveType(node, undefined)).toBe("bug")
  })

  test("falls back to content hashtags when link rows are stale or absent", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, { type: "p", content: "Title #epic #P1" })
    const node = repo.getNode(id)!
    expect(resolveType(node, repo)).toBe("epic")
  })

  test("recognizes the canonical keyword `bug`", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, { type: "p", content: "Login failure" })
    seedTagLink(repo, id, "bug")
    const node = repo.getNode(id)!
    expect(resolveType(node, repo)).toBe("bug")
  })

  test("recognizes `feature`", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, { type: "p", content: "OAuth flow" })
    seedTagLink(repo, id, "feature")
    const node = repo.getNode(id)!
    expect(resolveType(node, repo)).toBe("feature")
  })

  test("recognizes `chore` (previously absent from queries.ts list — drift fix)", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, { type: "p", content: "Bump deps" })
    seedTagLink(repo, id, "chore")
    const node = repo.getNode(id)!
    expect(resolveType(node, repo)).toBe("chore")
  })

  test("recognizes `question` (previously absent from set-clear-plan.ts list — drift fix)", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, { type: "p", content: "How does X work" })
    seedTagLink(repo, id, "question")
    const node = repo.getNode(id)!
    expect(resolveType(node, repo)).toBe("question")
  })

  test("ignores non-canonical labels (`urgent` is a label, not a type)", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, { type: "p", content: "Some task" })
    seedTagLink(repo, id, "urgent")
    seedTagLink(repo, id, "frontend")
    const node = repo.getNode(id)!
    expect(resolveType(node, repo)).toBeUndefined()
  })

  test("first canonical tag wins when multiple type tags coexist", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, { type: "p", content: "Title" })
    // Tags read out of the link table — order isn't strictly load-bearing
    // (Set-deduped before scan), but at least one of {bug, feature} must win.
    seedTagLink(repo, id, "bug")
    seedTagLink(repo, id, "feature")
    const node = repo.getNode(id)!
    const got = resolveType(node, repo)
    expect(got === "bug" || got === "feature").toBe(true)
  })

  test("lowercases mixed-case input (BUG → bug)", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, { type: "p", content: "Title" })
    seedTagLink(repo, id, "BUG")
    const node = repo.getNode(id)!
    expect(resolveType(node, repo)).toBe("bug")
  })

  test("returns undefined when no recognized type tag is present", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, { type: "p", content: "untagged task" })
    const node = repo.getNode(id)!
    expect(resolveType(node, repo)).toBeUndefined()
  })
})

// =============================================================================
// resolveBeadShortId — the load-bearing id resolver
// =============================================================================

describe("resolveBeadShortId — id resolution chain", () => {
  test("data.id wins (canonical path-form)", () => {
    const node = {
      id: "n1",
      data: { id: "@km/scope/slug", short_id: "km-z9z9" },
      fstype: "mdfile",
      fs_path: "@km/scope/slug.md",
    } as unknown as KNode
    expect(resolveBeadShortId(node)).toBe("@km/scope/slug")
  })

  test("falls back to data.short_id when data.id is absent", () => {
    const node = {
      id: "n1",
      data: { short_id: "km-a1b2" },
      fstype: "mdfile",
      fs_path: "@km/scope/legacy.md",
    } as unknown as KNode
    expect(resolveBeadShortId(node)).toBe("km-a1b2")
  })

  test("falls back to fs-path-derived form when data is empty AND fstype === mdfile", () => {
    const node = {
      id: "n1",
      data: {},
      fstype: "mdfile",
      fs_path: "@km/scope/canonical.md",
    } as unknown as KNode
    // fsPathOf strips the trailing `.md` to produce the canonical path-form.
    expect(resolveBeadShortId(node)).toBe("@km/scope/canonical")
  })

  test("returns undefined for non-mdfile nodes (no synthesis from fs_path)", () => {
    const node = {
      id: "n1",
      data: undefined,
      fstype: "folder",
      fs_path: "@km/scope",
    } as unknown as KNode
    expect(resolveBeadShortId(node)).toBeUndefined()
  })

  test("returns undefined when data is absent and no fs_path (sub-checkbox)", () => {
    const node = { id: "n1", data: undefined } as unknown as KNode
    expect(resolveBeadShortId(node)).toBeUndefined()
  })

  test("does NOT synthesize a `km-XXXX` id from node.id (purge-fallback-id-l5 invariant)", () => {
    const node = {
      id: "01KQABCD",
      data: undefined,
      fstype: undefined,
    } as unknown as KNode
    expect(resolveBeadShortId(node)).toBeUndefined()
  })
})

// =============================================================================
// Smoke test — orchestrator wires resolvers correctly
// =============================================================================

describe("nodeToBead — orchestrator integrates resolvers correctly", () => {
  test("real bead: all resolver outputs flow through to the Bead value", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "wip" } },
      // `#P1` in content is read by getNodePriority (canonical hashtag form).
      content: "Auth bug #P1",
      fs_path: "@km/scope/auth.md",
      data: { id: "@km/scope/auth", short_id: "km-scope.auth" },
    })
    seedTagLink(repo, id, "bug")
    const node = repo.getNode(id)!
    const bead = nodeToBead(node, { repo })

    expect(bead.shortId).toBe("@km/scope/auth")
    expect(bead.status).toBe("wip")
    expect(bead.priority).toBe("P1")
    expect(bead.type).toBe("bug")
    expect(bead.path).toBe("@km/scope/auth.md")
    expect(bead.dependencyCount).toBe(0)
    expect(bead.blockedBy).toBeUndefined()
  })

  test("blocked bead: blockedBy props produce the `blocked` status fallback", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "Dependent task",
      fs_path: "@km/scope/dependent.md",
      data: {
        id: "@km/scope/dependent",
        props: {
          "blocked-by": {
            type: "list",
            values: [{ target: "@km/scope/blocker-a" }, { target: "@km/scope/blocker-b" }],
          },
        },
      },
    })
    const node = repo.getNode(id)!
    const bead = nodeToBead(node, { repo })

    expect(bead.status).toBe("blocked")
    expect(bead.blockedBy).toStrictEqual(["@km/scope/blocker-a", "@km/scope/blocker-b"])
    expect(bead.dependencyCount).toBe(2)
  })

  test("non-bead node: shortId is undefined, defaults applied", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "Sub-checkbox without id",
    })
    const node = repo.getNode(id)!
    const bead = nodeToBead(node, { repo })

    expect(bead.shortId).toBeUndefined()
    expect(bead.priority).toBe("P2") // default
    expect(bead.status).toBe("todo")
    expect(bead.type).toBeUndefined()
  })
})
