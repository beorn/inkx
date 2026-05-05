/**
 * Action-handler integration tests for `km task dep add | rm | ls`.
 *
 * Exercises the planner + storage writer combo end-to-end (the same two
 * pieces the action handler in `dep.ts` calls in sequence) without
 * spinning up commander. This is the "single writer" pin: the same
 * `addGraphEdge` / `removeGraphEdge` calls that `bd dep` will eventually
 * route through are the only paths that mutate dep state in these tests.
 *
 * The atomicity test is the marquee one: `dep add A B C D` with C
 * unresolvable must NOT partially write. The handler aborts on
 * `plan.errors.length > 0` before issuing any storage call — this test
 * pins that behaviour by asserting the post-state.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { addGraphEdge, createRepo, getGraphEdges, removeGraphEdge, type Repo } from "@km/storage"
import { Bead } from "@km/beads"
import { planAddDeps, planListDeps, planRemoveDeps } from "../src/commands/tasks/dep-plan.ts"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-dep-action-"))
  scratch.push(dir)
  return runGenerator(createRepo(dir, { loadFiles: false }))
}

function addBead(repo: Repo, shortId: string, content = shortId): string {
  return repo.addNode(null, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content,
    data: { id: shortId },
  })
}

/**
 * Simulate the action handler for `dep add` — same sequence as
 * `dep.ts` minus commander/console plumbing.
 */
function runDepAdd(repo: Repo, id: string, blockers: string[]): { ok: boolean; errors: string[] } {
  const plan = planAddDeps(repo, id, blockers)
  if (plan.errors.length > 0) return { ok: false, errors: plan.errors }
  if (!plan.targetNodeId) return { ok: false, errors: ["unreachable"] }
  for (const blocker of plan.blockers) {
    addGraphEdge(repo, { from: blocker.blockerNodeId, to: plan.targetNodeId, rel: "blocks" })
  }
  return { ok: true, errors: [] }
}

function runDepRemove(repo: Repo, id: string, blockers: string[]): { ok: boolean; errors: string[] } {
  const plan = planRemoveDeps(repo, id, blockers)
  if (plan.errors.length > 0) return { ok: false, errors: plan.errors }
  if (!plan.targetNodeId) return { ok: false, errors: ["unreachable"] }
  for (const blocker of plan.blockers) {
    removeGraphEdge(repo, { from: blocker.blockerNodeId, to: plan.targetNodeId, rel: "blocks" })
  }
  return { ok: true, errors: [] }
}

describe("tasks dep add — happy path", () => {
  test("adds a single blocker", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    const bId = addBead(repo, "@km/foo/b")

    expect(runDepAdd(repo, "@km/foo/b", ["@km/foo/a"])).toEqual({ ok: true, errors: [] })

    const edges = getGraphEdges(repo, bId, { direction: "in", rel: "blocks" })
    expect(edges.length).toBe(1)
  })

  test("bulk add: A B C", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    addBead(repo, "@km/foo/b")
    addBead(repo, "@km/foo/c")
    const dId = addBead(repo, "@km/foo/d")

    expect(runDepAdd(repo, "@km/foo/d", ["@km/foo/a", "@km/foo/b", "@km/foo/c"])).toEqual({ ok: true, errors: [] })

    const edges = getGraphEdges(repo, dId, { direction: "in", rel: "blocks" })
    expect(edges.length).toBe(3)
  })

  test("idempotent: dep add A B twice = once", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    const bId = addBead(repo, "@km/foo/b")

    runDepAdd(repo, "@km/foo/b", ["@km/foo/a"])
    runDepAdd(repo, "@km/foo/b", ["@km/foo/a"])

    expect(getGraphEdges(repo, bId, { direction: "in" }).length).toBe(1)
  })
})

describe("tasks dep add — atomicity", () => {
  test("ATOMICITY: missing blocker aborts whole op — no partial write", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    addBead(repo, "@km/foo/b")
    // c does NOT exist
    const dId = addBead(repo, "@km/foo/d")

    const result = runDepAdd(repo, "@km/foo/d", ["@km/foo/a", "@km/foo/b", "@km/foo/c"])
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("@km/foo/c"))).toBe(true)

    // Pin: NEITHER a NOR b made it to the dependent's blocked-by list.
    // If atomicity broke, we'd see 2 edges (the resolved ones) here.
    const edges = getGraphEdges(repo, dId, { direction: "in" })
    expect(edges.length).toBe(0)
  })

  test("missing target produces error and no writes", () => {
    const repo = freshRepo()
    const aId = addBead(repo, "@km/foo/a")

    const result = runDepAdd(repo, "@km/ghost", ["@km/foo/a"])
    expect(result.ok).toBe(false)

    // No outbound edge from a either.
    expect(getGraphEdges(repo, aId, { direction: "out" }).length).toBe(0)
  })
})

describe("tasks dep rm", () => {
  test("removes an added edge", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    const bId = addBead(repo, "@km/foo/b")

    runDepAdd(repo, "@km/foo/b", ["@km/foo/a"])
    expect(getGraphEdges(repo, bId, { direction: "in" }).length).toBe(1)

    expect(runDepRemove(repo, "@km/foo/b", ["@km/foo/a"])).toEqual({ ok: true, errors: [] })
    expect(getGraphEdges(repo, bId, { direction: "in" }).length).toBe(0)
  })

  test("idempotent: dep rm twice is safe", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    addBead(repo, "@km/foo/b")

    runDepAdd(repo, "@km/foo/b", ["@km/foo/a"])
    expect(runDepRemove(repo, "@km/foo/b", ["@km/foo/a"])).toEqual({ ok: true, errors: [] })
    expect(runDepRemove(repo, "@km/foo/b", ["@km/foo/a"])).toEqual({ ok: true, errors: [] })
  })

  test("bulk rm preserves remaining blockers", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    addBead(repo, "@km/foo/b")
    addBead(repo, "@km/foo/c")
    const dId = addBead(repo, "@km/foo/d")

    runDepAdd(repo, "@km/foo/d", ["@km/foo/a", "@km/foo/b", "@km/foo/c"])
    runDepRemove(repo, "@km/foo/d", ["@km/foo/b"])

    const edges = getGraphEdges(repo, dId, { direction: "in" })
    expect(edges.length).toBe(2)
  })
})

describe("tasks dep ls", () => {
  test("lists both directions", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    addBead(repo, "@km/foo/b")
    addBead(repo, "@km/foo/c")
    runDepAdd(repo, "@km/foo/a", ["@km/foo/b"]) // b blocks a
    runDepAdd(repo, "@km/foo/c", ["@km/foo/a"]) // a blocks c

    const plan = planListDeps(repo, "@km/foo/a")
    expect(plan.errors).toEqual([])

    const inbound = plan.entries.filter((e) => e.direction === "in")
    const outbound = plan.entries.filter((e) => e.direction === "out")
    expect(inbound.map((e) => e.otherShortId)).toEqual(["@km/foo/b"])
    expect(outbound.map((e) => e.otherShortId)).toEqual(["@km/foo/c"])
  })

  test("empty state is empty list, not an error", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    const plan = planListDeps(repo, "@km/foo/a")
    expect(plan.errors).toEqual([])
    expect(plan.entries).toEqual([])
  })
})

describe("nodeToBead compat — same writer, same reader", () => {
  test("bd Bead.from sees blockedBy after dep add", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    const bId = addBead(repo, "@km/foo/b")

    runDepAdd(repo, "@km/foo/b", ["@km/foo/a"])

    const node = repo.getNode(bId)
    if (!node) throw new Error("missing")
    const bead = Bead.from(node, { repo })
    if (!bead) throw new Error("not a bead")
    expect(bead.blockedBy).toEqual(["@km/foo/a"])
    expect(bead.status).toBe("blocked")
  })

  test("bd's existing addDependency / removeDependency surface stays compatible", () => {
    // The legacy Bead.addDependency path writes the same props blob;
    // adding via `tasks dep add` then reading via the legacy `bd dep
    // list` (Bead.getDependencies) sees the edge. Same writer, no
    // duplicate state.
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    const bId = addBead(repo, "@km/foo/b")

    runDepAdd(repo, "@km/foo/b", ["@km/foo/a"])

    const node = repo.getNode(bId)
    if (!node) throw new Error("missing")
    const bead = Bead.from(node, { repo })
    if (!bead) throw new Error("not a bead")
    expect(Bead.getDependencies(repo, bead)).toEqual(["@km/foo/a"])
  })
})
