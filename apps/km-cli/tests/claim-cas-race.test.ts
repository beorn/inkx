/**
 * Claim CAS — race-safe `task claim` lifecycle path.
 *
 * Pins the L4 invariant for `@km/agent/sigil-boards` Phase 1.3:
 * `bd update --claim` (and the new `task claim`) must use a DB-side
 * compare-and-swap so two parallel sessions can never both believe they
 * hold the same bead. The lifecycle planner + applier route claims through
 * `repo.tryClaim`; this test exercises that path.
 *
 * The sister test `packages/km-storage/tests/repo/try-claim.test.ts`
 * covers the storage primitive directly. This one drives the planner +
 * applier seam — the wiring between `planClaim` and `repo.tryClaim` —
 * because that's where the original race lived (read-then-write inside
 * `planClaim`).
 */
import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"
import { applyLifecyclePlan, planClaim, planClose, planReopen } from "../src/commands/tasks/lifecycle.ts"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-claim-cas-"))
  scratch.push(dir)
  return runGenerator(createRepo(dir, { loadFiles: false }))
}

function addBead(repo: Repo, slug: string): string {
  return repo.addNode(null, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: slug,
    name: slug,
    data: { id: slug },
  })
}

describe("claim CAS race-safety", () => {
  test("two concurrent claims: only one applies, the other reports the holder", async () => {
    const repo = freshRepo()
    const id = addBead(repo, "race-bead")

    // Two sessions both plan + apply against the same starting state.
    // The CAS in `applyLifecyclePlan` is what arbitrates — without it,
    // the second apply would silently overwrite the first.
    const claimAs = (actor: string) => {
      const node = repo.getNode(id)!
      const plan = planClaim(node, id, actor)
      // planClaim itself no longer does the read-then-write; the CAS
      // happens in applyLifecyclePlan via repo.tryClaim. So the planner
      // returns a "would-claim" intent and apply is the arbiter.
      if (plan.errors.length > 0) {
        return { ok: false as const, error: plan.errors.join("; ") }
      }
      try {
        const { owner } = applyLifecyclePlan(repo, node, plan)
        return { ok: true as const, owner }
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
      }
    }

    const [a, b] = await Promise.all([
      Promise.resolve().then(() => claimAs("alice")),
      Promise.resolve().then(() => claimAs("bob")),
    ])

    const wins = [a, b].filter((r) => r.ok).length
    const losses = [a, b].filter((r) => !r.ok).length
    expect(wins).toBe(1)
    expect(losses).toBe(1)

    // The bead's actual owner is whichever session won.
    const finalNode = repo.getNode(id)!
    const winner = a.ok ? "alice" : "bob"
    expect(finalNode.assigned_to).toBe(winner)

    // The loser surfaces a holder-aware error.
    const loser = a.ok ? b : a
    expect(loser.ok).toBe(false)
    if (loser.ok) return
    expect(loser.error).toContain(winner)
  })

  test("self-claim is idempotent (no error, no owner change)", () => {
    const repo = freshRepo()
    const id = addBead(repo, "self-reclaim")

    const node1 = repo.getNode(id)!
    const plan1 = planClaim(node1, id, "alice")
    expect(plan1.errors).toEqual([])
    applyLifecyclePlan(repo, node1, plan1)

    const node2 = repo.getNode(id)!
    const plan2 = planClaim(node2, id, "alice")
    expect(plan2.errors).toEqual([])
    expect(() => applyLifecyclePlan(repo, node2, plan2)).not.toThrow()

    expect(repo.getNode(id)!.assigned_to).toBe("alice")
    expect(repo.getNode(id)!.item?.task?.status).toBe("wip")
  })

  test("stale-claimed bead is reclaimable by another actor", () => {
    const repo = freshRepo()
    const id = addBead(repo, "stale-claim")

    // Alice claims, then we backdate updated_at to simulate a long-stale claim.
    const n1 = repo.getNode(id)!
    applyLifecyclePlan(repo, n1, planClaim(n1, id, "alice"))

    repo.database.run("UPDATE nodes SET updated_at = ? WHERE id = ?", [Date.now() - 30 * 60 * 60 * 1000, id])
    repo.touch()

    // 24h user-shaped lease — alice's claim is stale by 6h, so bob should
    // succeed even though alice is still recorded as the assignee.
    const n2 = repo.getNode(id)!
    const plan = planClaim(n2, id, "bob")
    expect(plan.errors).toEqual([])
    applyLifecyclePlan(repo, n2, plan)

    expect(repo.getNode(id)!.assigned_to).toBe("bob")
  })

  test("done bead errors before reaching CAS", () => {
    const repo = freshRepo()
    const id = addBead(repo, "done-bead")

    const n1 = repo.getNode(id)!
    applyLifecyclePlan(repo, n1, planClose(n1, id))

    const n2 = repo.getNode(id)!
    const plan = planClaim(n2, id, "alice")
    expect(plan.errors.length).toBeGreaterThan(0)
    expect(plan.errors[0]).toMatch(/done/)
  })

  test("dropped bead errors before reaching CAS", () => {
    const repo = freshRepo()
    const id = addBead(repo, "dropped-bead")

    // Mark dropped via direct status change.
    repo.updateNode(id, {
      item: { task: { marker: "[-]", status: "dropped" } },
    })

    const n2 = repo.getNode(id)!
    const plan = planClaim(n2, id, "alice")
    expect(plan.errors.length).toBeGreaterThan(0)
    expect(plan.errors[0]).toMatch(/dropped/)
  })

  test("reopen → reclaim flow works end-to-end", () => {
    const repo = freshRepo()
    const id = addBead(repo, "reopen-reclaim")

    // alice claims, closes, then reopens, then reclaims.
    let n = repo.getNode(id)!
    applyLifecyclePlan(repo, n, planClaim(n, id, "alice"))
    n = repo.getNode(id)!
    applyLifecyclePlan(repo, n, planClose(n, id))
    n = repo.getNode(id)!
    applyLifecyclePlan(repo, n, planReopen(n, id))

    // After reopen, assigned_to is cleared (lifecycle invariant: todo has no owner).
    n = repo.getNode(id)!
    expect(n.assigned_to ?? null).toBeNull()
    expect(n.item?.task?.status).toBe("todo")

    // Reclaim should succeed.
    const plan = planClaim(n, id, "alice")
    expect(plan.errors).toEqual([])
    applyLifecyclePlan(repo, n, plan)
    expect(repo.getNode(id)!.assigned_to).toBe("alice")
  })
})
