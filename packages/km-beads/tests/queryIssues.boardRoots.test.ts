/**
 * queryIssues honors boardRoots like queryReady — info-stats-mismatch fix.
 *
 * Before the fix, `bd info` called `queryIssues({}, scopePath, undefined, { repo })`
 * with no boardRoots and counted ALL nodes (vault-wide checkbox noise),
 * while `bd list --status X` (via the new query path) correctly scoped to
 * actual beads. The numbers diverged dramatically.
 *
 * The contract: queryIssues with boardRoots filters to canonical
 * `<root>/<scope>/<slug>.md` beads, matching queryReady's predicate.
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { queryIssues } from "../src/queries.ts"

describe("queryIssues boardRoots filtering (info-stats-mismatch)", () => {
  test("with boardRoots, only depth-2 beads are counted", () => {
    const repo = createTestRepo()
    // canonical bead at depth 2 under @km
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "real bead",
      fs_path: "@km/scope/the-bead.md",
    })
    // vault-wide checkbox noise outside @km root
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "noise outside root",
      fs_path: "docs/notes.md",
    })
    // depth-1 file in @km root, no + sigil — not a bead
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "depth-1 noise",
      fs_path: "@km/foo.md",
    })

    const scoped = queryIssues({}, undefined, undefined, { repo, boardRoots: ["@km"] })
    const titles = scoped.map((i) => i.title)
    expect(titles).toContain("real bead")
    expect(titles).not.toContain("noise outside root")
    expect(titles).not.toContain("depth-1 noise")
  })

  test("without boardRoots, counts everything (legacy behaviour)", () => {
    const repo = createTestRepo()
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "real bead",
      fs_path: "@km/scope/the-bead.md",
    })
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "noise outside root",
      fs_path: "docs/notes.md",
    })

    const all = queryIssues({}, undefined, undefined, { repo })
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  test("info-stats-mismatch: queryIssues({}, ...) and queryIssues({status:'todo'},...) yield consistent counts under boardRoots", () => {
    const repo = createTestRepo()
    // 3 todo beads + 2 wip beads, all at depth 2
    for (let i = 0; i < 3; i++) {
      repo.addNode(null, {
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: `todo-${i}`,
        fs_path: `@km/scope/todo-${i}.md`,
      })
    }
    for (let i = 0; i < 2; i++) {
      repo.addNode(null, {
        type: "p",
        item: { list: "-", task: { marker: "[/]", status: "wip" } },
        content: `wip-${i}`,
        fs_path: `@km/scope/wip-${i}.md`,
      })
    }
    // noise
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "noise",
      fs_path: "docs/random.md",
    })

    const opts = { repo, boardRoots: ["@km"] }
    const all = queryIssues({}, undefined, undefined, opts)
    const todo = queryIssues({ status: "todo" }, undefined, undefined, opts)
    const wip = queryIssues({ status: "wip" }, undefined, undefined, opts)

    // Total beads = 5; per-status counts must sum to total.
    expect(all.length).toBe(5)
    expect(todo.length).toBe(3)
    expect(wip.length).toBe(2)
    expect(todo.length + wip.length).toBe(all.length)
  })
})
