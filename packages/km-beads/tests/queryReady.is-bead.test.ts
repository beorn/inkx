/**
 * isBead predicate tests — km-beads.bead-sigil-elevation
 *
 * Default rule: a node is a bead iff it lives at depth-2 under one of
 * the configured boardRoots — i.e. the canonical
 * `<root>/<scope>/<slug>.md` layout.
 *
 * Escape hatch: any node whose `name` starts with `+` is a bead, at any
 * depth, regardless of structural position. This is the elevated-sub-
 * bead sigil — opt-in promotion of a sub-checkbox to first-class bead
 * status.
 *
 * Sub-checkboxes inside bead files (depth ≥ 3, no `+` sigil) are NOT
 * beads and are filtered out. This is the noise reduction that
 * km-beads.purge-fallback-id-l5 builds on.
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { queryReady, queryIssues } from "../src/queries.ts"

describe("isBead predicate via queryReady", () => {
  test("depth-2 bead file is a bead", () => {
    const repo = createTestRepo()
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "A bead",
      fs_path: "@km/scope/the-bead.md",
    })
    const issues = queryReady(undefined, undefined, undefined, { repo, boardRoots: ["@km"] })
    expect(issues.length).toBe(1)
    expect(issues[0]?.path).toBe("@km/scope/the-bead.md")
  })

  test("depth-3 sub-checkbox without + sigil is NOT a bead", () => {
    const repo = createTestRepo()
    // First the bead file at depth 2
    const beadId = repo.addNode(null, {
      type: "p",
      content: "Parent bead container",
      fs_path: "@km/scope/parent.md",
    })
    // Sub-checkbox inside (parent_id chains down — its fs_path is undefined,
    // and getNodePath walks to the parent for the path).
    repo.addNode(beadId, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "sub-checkbox noise",
    })
    const issues = queryReady(undefined, undefined, undefined, { repo, boardRoots: ["@km"] })
    // The bead file itself is not a status:todo task, so neither node returns.
    // Important: the sub-checkbox MUST NOT slip through.
    const subIssue = issues.find((i) => i.title === "sub-checkbox noise")
    expect(subIssue).toBeUndefined()
  })

  test("depth-3 sub-item WITH + sigil prefix on name IS a bead", () => {
    const repo = createTestRepo()
    const beadId = repo.addNode(null, {
      type: "p",
      content: "Parent bead container",
      fs_path: "@km/scope/parent.md",
    })
    // Elevated sub-bead — `+ [ ] foo` would make name === "+"
    repo.addNode(beadId, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "elevated sub-bead",
      name: "+",
    })
    const issues = queryReady(undefined, undefined, undefined, { repo, boardRoots: ["@km"] })
    const elevated = issues.find((i) => i.title === "elevated sub-bead")
    expect(elevated).toBeDefined()
  })

  test("depth-3 sub-item with + sigil + anchor (name='+abc') IS a bead", () => {
    const repo = createTestRepo()
    const beadId = repo.addNode(null, {
      type: "p",
      content: "Parent",
      fs_path: "@km/scope/parent.md",
    })
    repo.addNode(beadId, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "anchored elevated",
      name: "+abc1",
    })
    const issues = queryReady(undefined, undefined, undefined, { repo, boardRoots: ["@km"] })
    const elevated = issues.find((i) => i.title === "anchored elevated")
    expect(elevated).toBeDefined()
  })

  test("out-of-scope node (path not under root) is NOT a bead even with + sigil", () => {
    const repo = createTestRepo()
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "out of scope",
      name: "+",
      fs_path: "vault/notes/random.md",
    })
    const issues = queryReady(undefined, undefined, undefined, { repo, boardRoots: ["@km"] })
    expect(issues.find((i) => i.title === "out of scope")).toBeUndefined()
  })

  test("depth-1 file (root child) is NOT a bead", () => {
    const repo = createTestRepo()
    // E.g. `@km/foo.md` — at depth 1 under root @km, not a canonical bead.
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "depth-1 task",
      fs_path: "@km/foo.md",
    })
    const issues = queryReady(undefined, undefined, undefined, { repo, boardRoots: ["@km"] })
    // depth=1, no + sigil → not a bead
    expect(issues.find((i) => i.title === "depth-1 task")).toBeUndefined()
  })

  test("depth-3 file (nested deep) is NOT a bead without + sigil", () => {
    const repo = createTestRepo()
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "too deep",
      fs_path: "@km/scope/sub/nested.md",
    })
    const issues = queryReady(undefined, undefined, undefined, { repo, boardRoots: ["@km"] })
    expect(issues.find((i) => i.title === "too deep")).toBeUndefined()
  })

  test("multi-root: depth-2 under any root counts", () => {
    const repo = createTestRepo()
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "primary root bead",
      fs_path: "beads/scope/a.md",
    })
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "secondary root bead",
      fs_path: "imports/km-2026-04-28/scope/b.md",
    })
    // imports/km-2026-04-28 has 2 segments — boardRoots can be multi-segment.
    const issues = queryReady(undefined, undefined, undefined, {
      repo,
      boardRoots: ["beads", "imports/km-2026-04-28"],
    })
    expect(issues.find((i) => i.title === "primary root bead")).toBeDefined()
    expect(issues.find((i) => i.title === "secondary root bead")).toBeDefined()
  })

  test("anchored-only path (root === path) is NOT a bead — depth 0", () => {
    const repo = createTestRepo()
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "the root itself",
      fs_path: "@km",
    })
    const issues = queryReady(undefined, undefined, undefined, { repo, boardRoots: ["@km"] })
    expect(issues.find((i) => i.title === "the root itself")).toBeUndefined()
  })
})

describe("isBead predicate via queryIssues (status:open ≠ todo)", () => {
  test("queryIssues respects same predicate as queryReady", () => {
    const repo = createTestRepo()
    // depth-2 bead with status:wip (not in queryReady's status:todo filter,
    // but in queryIssues' broader status filter)
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[/]", status: "wip" } },
      content: "wip bead",
      fs_path: "@km/scope/wip.md",
    })
    // depth-3 sub-checkbox WITH + sigil
    const beadId = repo.addNode(null, {
      type: "p",
      content: "container",
      fs_path: "@km/scope/container.md",
    })
    repo.addNode(beadId, {
      type: "p",
      item: { list: "-", task: { marker: "[/]", status: "wip" } },
      content: "elevated wip sub-bead",
      name: "+",
    })
    // depth-3 sub-checkbox WITHOUT + sigil — must be filtered out
    repo.addNode(beadId, {
      type: "p",
      item: { list: "-", task: { marker: "[/]", status: "wip" } },
      content: "regular sub-checkbox noise",
    })

    const issues = queryIssues({ status: "wip" }, undefined, undefined, {
      repo,
      boardRoots: ["@km"],
    })
    const titles = issues.map((i) => i.title)
    expect(titles).toContain("wip bead")
    expect(titles).toContain("elevated wip sub-bead")
    expect(titles).not.toContain("regular sub-checkbox noise")
  })
})
