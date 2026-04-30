/**
 * Indexed deps lookups for km-beads queries.
 *
 * Verifies that `buildDependentCountMap` and `countDependents` (via the
 * exported `nodeToBead.dependentCount`) read from the v7 deps table
 * populated by SQLite triggers — not from a JSON scan.
 *
 * Wires real Repo objects so the schema's INSERT/UPDATE triggers actually
 * fire. Each test seeds nodes carrying `data.props["blocked-by"]` in the
 * single-link or list shape and then asserts the indexed lookups return
 * the expected counts.
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { buildDependentCountMap, nodeToBead } from "../src/queries.ts"

function blockedByLink(target: string): Record<string, unknown> {
  return { props: { "blocked-by": { type: "link", target } } }
}

function blockedByList(targets: string[]): Record<string, unknown> {
  return {
    props: {
      "blocked-by": {
        type: "list",
        values: targets.map((t) => ({ type: "link", target: t })),
      },
    },
  }
}

describe("buildDependentCountMap (deps-table)", () => {
  test("returns empty map when no nodes have blocked-by", () => {
    using repo = createTestRepo()
    repo.addNode(null, { type: "p", content: "no blockers" })
    expect(buildDependentCountMap(repo).size).toBe(0)
  })

  test("counts a single link blocker", () => {
    using repo = createTestRepo()
    repo.addNode(null, {
      type: "p",
      content: "A blocked by km-target",
      data: blockedByLink("km-target"),
    })
    const map = buildDependentCountMap(repo)
    expect(map.get("km-target")).toBe(1)
    expect(map.size).toBe(1)
  })

  test("counts a list of blockers", () => {
    using repo = createTestRepo()
    repo.addNode(null, {
      type: "p",
      content: "A blocked by km-x and km-y",
      data: blockedByList(["km-x", "km-y"]),
    })
    const map = buildDependentCountMap(repo)
    expect(map.get("km-x")).toBe(1)
    expect(map.get("km-y")).toBe(1)
    expect(map.size).toBe(2)
  })

  test("aggregates across multiple hosts", () => {
    using repo = createTestRepo()
    repo.addNode(null, { type: "p", content: "A", data: blockedByLink("km-shared") })
    repo.addNode(null, { type: "p", content: "B", data: blockedByLink("km-shared") })
    repo.addNode(null, { type: "p", content: "C", data: blockedByList(["km-shared", "km-other"]) })

    const map = buildDependentCountMap(repo)
    expect(map.get("km-shared")).toBe(3)
    expect(map.get("km-other")).toBe(1)
  })
})

describe("nodeToBead.dependentCount (deps-table)", () => {
  test("dependentCount reflects deps rows for the issue's shortId", () => {
    using repo = createTestRepo()

    // Bead at depth-2 under @km/scope/ — gets a path-form short_id.
    const beadId = repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "Target bead",
      fs_path: "@km/scope/target.md",
      data: { short_id: "@km/scope/target" },
    })

    // Two other beads naming the target as a blocker.
    repo.addNode(null, {
      type: "p",
      content: "blocker-1",
      fs_path: "@km/scope/b1.md",
      data: blockedByLink("@km/scope/target"),
    })
    repo.addNode(null, {
      type: "p",
      content: "blocker-2",
      fs_path: "@km/scope/b2.md",
      data: blockedByLink("@km/scope/target"),
    })

    const node = repo.getNode(beadId)
    if (!node) throw new Error("bead node missing")
    const issue = nodeToBead(node, { repo })
    expect(issue.dependentCount).toBe(2)
  })

  test("update reconciles the deps row — old target loses the count", () => {
    using repo = createTestRepo()

    repo.addNode(null, {
      type: "p",
      content: "T1",
      fs_path: "@km/scope/t1.md",
      data: { short_id: "@km/scope/t1" },
    })
    repo.addNode(null, {
      type: "p",
      content: "T2",
      fs_path: "@km/scope/t2.md",
      data: { short_id: "@km/scope/t2" },
    })
    const blockerId = repo.addNode(null, {
      type: "p",
      content: "blocker",
      fs_path: "@km/scope/blocker.md",
      data: blockedByLink("@km/scope/t1"),
    })

    let map = buildDependentCountMap(repo)
    expect(map.get("@km/scope/t1")).toBe(1)
    expect(map.get("@km/scope/t2")).toBeUndefined()

    // Re-point the blocker at T2 — the trigger reconciles deps.
    repo.updateNode(blockerId, { data: blockedByLink("@km/scope/t2") })

    map = buildDependentCountMap(repo)
    expect(map.get("@km/scope/t1")).toBeUndefined()
    expect(map.get("@km/scope/t2")).toBe(1)
  })

  test("delete removes the deps rows so the count drops", () => {
    using repo = createTestRepo()

    repo.addNode(null, {
      type: "p",
      content: "T",
      fs_path: "@km/scope/t.md",
      data: { short_id: "@km/scope/t" },
    })
    const blockerId = repo.addNode(null, {
      type: "p",
      content: "blocker",
      fs_path: "@km/scope/b.md",
      data: blockedByLink("@km/scope/t"),
    })

    expect(buildDependentCountMap(repo).get("@km/scope/t")).toBe(1)

    repo.deleteNode(blockerId)
    expect(buildDependentCountMap(repo).get("@km/scope/t")).toBeUndefined()
  })
})
