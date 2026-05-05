/**
 * Unit tests for the pure `dep-plan.ts` planner.
 *
 * The planner is the chain-immune slice — it doesn't transit
 * @silvery/ag-react / commander / load-repo, so we can call it directly
 * without spinning up the CLI. Pin the atomicity contract: bulk
 * `dep add A B C D` with C unresolvable produces an error list and
 * blocker list short of the full input — the action handler must abort.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { addGraphEdge, createRepo, type Repo } from "@km/storage"
import { planAddDeps, planListDeps, planRemoveDeps } from "../src/commands/tasks/dep-plan.ts"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-dep-plan-"))
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

describe("planAddDeps", () => {
  test("resolves target and one blocker", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    addBead(repo, "@km/foo/b")

    const plan = planAddDeps(repo, "@km/foo/b", ["@km/foo/a"])

    expect(plan.errors).toEqual([])
    expect(plan.targetShortId).toBe("@km/foo/b")
    expect(plan.blockers.length).toBe(1)
    expect(plan.blockers[0]?.blockerShortId).toBe("@km/foo/a")
  })

  test("bulk add — multiple blockers all resolved", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    addBead(repo, "@km/foo/b")
    addBead(repo, "@km/foo/c")
    addBead(repo, "@km/foo/d")

    const plan = planAddDeps(repo, "@km/foo/d", ["@km/foo/a", "@km/foo/b", "@km/foo/c"])

    expect(plan.errors).toEqual([])
    expect(plan.blockers.length).toBe(3)
    expect(plan.blockers.map((b) => b.blockerShortId).sort()).toEqual(["@km/foo/a", "@km/foo/b", "@km/foo/c"])
  })

  test("ATOMICITY — one bad blocker yields errors and partial blocker list", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    addBead(repo, "@km/foo/b")
    // c does NOT exist
    addBead(repo, "@km/foo/d")

    const plan = planAddDeps(repo, "@km/foo/d", ["@km/foo/a", "@km/foo/b", "@km/foo/c"])

    expect(plan.errors.length).toBeGreaterThan(0)
    expect(plan.errors.some((e) => e.includes("@km/foo/c"))).toBe(true)
    // The contract: action handler aborts on errors.length > 0; the
    // partial blockers list is irrelevant once the abort fires. We pin
    // this behaviour rather than the inverse (no partial blocker list)
    // so the planner stays simple — no need to "undo" partial parsing.
    expect(plan.blockers.length).toBe(2)
  })

  test("missing target produces a single error", () => {
    const repo = freshRepo()
    const plan = planAddDeps(repo, "@km/ghost", ["@km/foo/a"])
    expect(plan.errors).toEqual(["Task not found: @km/ghost"])
    expect(plan.blockers).toEqual([])
  })

  test("empty blockers list errors", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    const plan = planAddDeps(repo, "@km/foo/a", [])
    expect(plan.errors.length).toBe(1)
    expect(plan.errors[0]).toContain("No blockers specified")
  })

  test("self-blocking is a warning, not an error", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    const plan = planAddDeps(repo, "@km/foo/a", ["@km/foo/a"])
    expect(plan.errors).toEqual([])
    expect(plan.warnings.length).toBe(1)
    expect(plan.blockers.length).toBe(0)
  })
})

describe("planRemoveDeps", () => {
  test("returns blockers to remove for valid input", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    addBead(repo, "@km/foo/b")

    const plan = planRemoveDeps(repo, "@km/foo/b", ["@km/foo/a"])

    expect(plan.errors).toEqual([])
    expect(plan.blockers.length).toBe(1)
    expect(plan.blockers[0]?.blockerShortId).toBe("@km/foo/a")
  })

  test("missing blocker errors (atomic with add)", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/b")
    const plan = planRemoveDeps(repo, "@km/foo/b", ["@km/ghost"])
    expect(plan.errors.length).toBe(1)
    expect(plan.errors[0]).toContain("@km/ghost")
  })
})

describe("planListDeps", () => {
  test("empty when no edges", () => {
    const repo = freshRepo()
    addBead(repo, "@km/foo/a")
    const plan = planListDeps(repo, "@km/foo/a")
    expect(plan.errors).toEqual([])
    expect(plan.entries).toEqual([])
  })

  test("surfaces inbound edges (this is blocked by …)", () => {
    const repo = freshRepo()
    const aId = addBead(repo, "@km/foo/a")
    const bId = addBead(repo, "@km/foo/b")
    addGraphEdge(repo, { from: aId, to: bId, rel: "blocks" })

    const plan = planListDeps(repo, "@km/foo/b")
    expect(plan.errors).toEqual([])
    const inbound = plan.entries.filter((e) => e.direction === "in")
    expect(inbound.length).toBe(1)
    expect(inbound[0]?.otherShortId).toBe("@km/foo/a")
  })

  test("surfaces outbound edges (this blocks …)", () => {
    const repo = freshRepo()
    const aId = addBead(repo, "@km/foo/a")
    const bId = addBead(repo, "@km/foo/b")
    const cId = addBead(repo, "@km/foo/c")
    addGraphEdge(repo, { from: aId, to: bId, rel: "blocks" })
    addGraphEdge(repo, { from: aId, to: cId, rel: "blocks" })

    const plan = planListDeps(repo, "@km/foo/a")
    const outbound = plan.entries.filter((e) => e.direction === "out")
    expect(outbound.length).toBe(2)
    expect(outbound.map((e) => e.otherShortId).sort()).toEqual(["@km/foo/b", "@km/foo/c"])
  })

  test("both directions in one call", () => {
    const repo = freshRepo()
    const aId = addBead(repo, "@km/foo/a")
    const bId = addBead(repo, "@km/foo/b")
    const cId = addBead(repo, "@km/foo/c")
    // a blocks b; c blocks a → from a's POV: 1 in, 1 out.
    addGraphEdge(repo, { from: aId, to: bId, rel: "blocks" })
    addGraphEdge(repo, { from: cId, to: aId, rel: "blocks" })

    const plan = planListDeps(repo, "@km/foo/a")
    const inbound = plan.entries.filter((e) => e.direction === "in")
    const outbound = plan.entries.filter((e) => e.direction === "out")
    expect(inbound.length).toBe(1)
    expect(inbound[0]?.otherShortId).toBe("@km/foo/c")
    expect(outbound.length).toBe(1)
    expect(outbound[0]?.otherShortId).toBe("@km/foo/b")
  })

  test("missing target errors", () => {
    const repo = freshRepo()
    const plan = planListDeps(repo, "@km/ghost")
    expect(plan.errors.length).toBe(1)
    expect(plan.entries).toEqual([])
  })
})
