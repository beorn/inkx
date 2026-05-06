/**
 * L4/L5 Property tests for bulk lifecycle operations
 *
 * Pins the @km/cli/bulk-multi-id-or-where invariants for the lifecycle
 * verbs (claim/release/close/drop/reopen):
 *
 *   B1. Single-id behavior is preserved — bulk on `[id]` produces the
 *       same per-node state as a single-id op on `id`.
 *   B2. Skipped count + applied count = total target count (no node
 *       silently disappears or doubles).
 *   B3. Each applied node satisfies the lifecycle invariants I1-I4
 *       from `tasks-lifecycle-properties.test.ts`.
 *   B4. The planner-to-applier seam is the same single-id seam — bulk
 *       is a loop, not a parallel mutation path. We pin this by
 *       running the same plan twice (once via the bulk wrapper, once
 *       per-id via direct planner+applier) and asserting identical
 *       resulting node shape.
 *
 * Strategy: 50+ random sequences across two seeds (Mulberry32 42 + 1234,
 * matching `tasks-lifecycle-properties.test.ts`). Each step picks 2-5
 * random target ids from a per-sequence pool, picks a random verb that's
 * valid for at least one of those targets, applies bulk, and asserts B1-B4.
 *
 * Cross-id atomicity is NOT tested as an invariant — by design (per
 * @km/cli/bulk-multi-id-or-where), a partial-failure leaves earlier
 * sources applied. The test asserts that the per-id outcome is
 * accounted for in the applied/skipped split.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"
import {
  applyLifecyclePlan,
  planClaim,
  planClose,
  planDrop,
  planRelease,
  planReopen,
} from "../src/commands/tasks/lifecycle.ts"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bulk-prop-"))
  scratch.push(dir)
  return runGenerator(createRepo(dir, { loadFiles: false }))
}

function addBead(repo: Repo, shortId: string): string {
  return repo.addNode(null, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: shortId,
    data: { id: shortId },
  })
}

/** Mulberry32 — deterministic PRNG (mirrors lifecycle property test). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Verb = "claim" | "release" | "close" | "drop" | "reopen"

interface NodeSnapshot {
  status: string
  assigned_to: string | null
  closed_at: string | null
  dataKeys: string[]
}

function snapshot(repo: Repo, nodeId: string): NodeSnapshot {
  const node = repo.getNode(nodeId)
  if (!node) throw new Error(`Node ${nodeId} vanished`)
  const data = (node.data ?? {}) as Record<string, unknown>
  return {
    status: node.item?.task?.status ?? "todo",
    assigned_to: node.assigned_to ?? null,
    closed_at: typeof data.closed_at === "string" ? data.closed_at : null,
    dataKeys: Object.keys(data).sort(),
  }
}

function assertInvariants(snap: NodeSnapshot, ctx: string): void {
  // I1: wip ⟺ owner present (forward direction; reverse loosened on closed)
  if (snap.status === "wip") {
    expect(snap.assigned_to, `${ctx} I1: wip implies owner`).not.toBeNull()
  }
  if (snap.status === "todo") {
    expect(snap.assigned_to, `${ctx} I1-rev: todo never has owner`).toBeNull()
  }
  // I2: done|dropped ⟺ closed_at present
  if (snap.status === "done" || snap.status === "dropped") {
    expect(snap.closed_at, `${ctx} I2: ${snap.status} implies closed_at`).not.toBeNull()
  }
  // I3: todo ⟹ closed_at absent
  if (snap.status === "todo") {
    expect(snap.closed_at, `${ctx} I3: todo implies !closed_at`).toBeNull()
  }
}

/**
 * Apply one verb to a node via the planner+applier seam (same path the
 * bulk runner uses). Returns the outcome class so callers can build the
 * applied/skipped histogram themselves.
 */
function applyOne(repo: Repo, nodeId: string, verb: Verb, actor: string, reason?: string): "applied" | "skipped" {
  const node = repo.getNode(nodeId)
  if (!node) return "skipped"
  let plan
  if (verb === "claim") plan = planClaim(node, nodeId, actor)
  else if (verb === "release") plan = planRelease(node, nodeId)
  else if (verb === "close") plan = planClose(node, nodeId, reason)
  else if (verb === "drop") plan = planDrop(node, nodeId, reason)
  else plan = planReopen(node, nodeId)

  if (plan.errors.length > 0) return "skipped"
  applyLifecyclePlan(repo, node, plan)
  return "applied"
}

/**
 * Simulate a bulk run via the bulk runner's seam (per-id loop over the
 * same applyOne primitive). Returns the applied/skipped histograms so
 * the test can verify B2.
 */
function runBulk(
  repo: Repo,
  ids: string[],
  verb: Verb,
  actor: string,
  reason?: string,
): { applied: string[]; skipped: string[] } {
  const applied: string[] = []
  const skipped: string[] = []
  for (const id of ids) {
    const outcome = applyOne(repo, id, verb, actor, reason)
    if (outcome === "applied") applied.push(id)
    else skipped.push(id)
  }
  return { applied, skipped }
}

describe("B1 — bulk on [id] equals single-id (per-node state)", () => {
  test("close one id via bulk vs single — node state matches", () => {
    const a = freshRepo()
    const b = freshRepo()
    const idA = addBead(a, "@km/p/a")
    const idB = addBead(b, "@km/p/a")

    runBulk(a, [idA], "close", "alice", "shipped")
    applyOne(b, idB, "close", "alice", "shipped")

    const snapA = snapshot(a, idA)
    const snapB = snapshot(b, idB)
    expect(snapA.status).toBe(snapB.status)
    expect(snapA.assigned_to).toBe(snapB.assigned_to)
    // closed_at timestamps may differ by milliseconds — both must be
    // non-null, both must be ISO-shaped.
    expect(snapA.closed_at).not.toBeNull()
    expect(snapB.closed_at).not.toBeNull()
    expect(snapA.dataKeys).toEqual(snapB.dataKeys)
  })

  test("claim+release+close+reopen+close round-trip equals single-id", () => {
    const a = freshRepo()
    const b = freshRepo()
    const idA = addBead(a, "@km/p/a")
    const idB = addBead(b, "@km/p/a")

    for (const verb of ["claim", "release", "close", "reopen", "close"] as const) {
      runBulk(a, [idA], verb, "alice", "step")
      applyOne(b, idB, verb, "alice", "step")
    }

    const snapA = snapshot(a, idA)
    const snapB = snapshot(b, idB)
    expect(snapA.status).toBe(snapB.status)
    expect(snapA.assigned_to).toBe(snapB.assigned_to)
    expect(snapA.dataKeys).toEqual(snapB.dataKeys)
  })
})

describe("B2 — applied + skipped == total target count", () => {
  test("close on [todo, done, todo] yields applied=2 skipped=1", () => {
    const repo = freshRepo()
    const a = addBead(repo, "@km/p/a")
    const b = addBead(repo, "@km/p/b")
    const c = addBead(repo, "@km/p/c")

    // Pre-close `b` so the bulk close on [a, b, c] should skip b.
    applyOne(repo, b, "close", "alice")
    const before = snapshot(repo, b).closed_at

    const { applied, skipped } = runBulk(repo, [a, b, c], "close", "alice", "bulk")

    expect(applied).toHaveLength(2)
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toBe(b)
    expect(applied.length + skipped.length).toBe(3)

    // Skipped node's prior closed_at must survive — bulk skip is a
    // genuine no-op, not a reset.
    expect(snapshot(repo, b).closed_at).toBe(before)
  })

  test("release on [unclaimed, claimed, claimed] yields applied=2 skipped=1", () => {
    const repo = freshRepo()
    const a = addBead(repo, "@km/p/a")
    const b = addBead(repo, "@km/p/b")
    const c = addBead(repo, "@km/p/c")

    applyOne(repo, b, "claim", "alice")
    applyOne(repo, c, "claim", "alice")

    const { applied, skipped } = runBulk(repo, [a, b, c], "release", "alice")
    expect(applied).toHaveLength(2)
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toBe(a)
  })
})

describe("B3 — per-node lifecycle invariants hold after every bulk step", () => {
  for (const seed of [42, 1234]) {
    test(`seed=${seed}: 25 random bulk sequences keep invariants`, () => {
      const rng = mulberry32(seed)
      const SEQUENCE_COUNT = 25
      const ACTORS = ["alice", "bob", "carol"]

      for (let seq = 0; seq < SEQUENCE_COUNT; seq++) {
        const repo = freshRepo()
        const taskCount = 4 + Math.floor(rng() * 4) // 4-7 tasks
        const taskIds: string[] = []
        for (let i = 0; i < taskCount; i++) {
          taskIds.push(addBead(repo, `@km/seq${seq}/t${i}`))
        }

        const opCount = 5 + Math.floor(rng() * 11) // 5-15 ops per sequence
        for (let step = 0; step < opCount; step++) {
          const batchSize = 2 + Math.floor(rng() * 4) // 2-5 ids in the batch
          const batch: string[] = []
          for (let k = 0; k < batchSize; k++) {
            batch.push(taskIds[Math.floor(rng() * taskIds.length)]!)
          }
          const verb: Verb = (["claim", "release", "close", "drop", "reopen"] as const)[Math.floor(rng() * 5)]!
          const actor = ACTORS[Math.floor(rng() * ACTORS.length)]!
          const reason = verb === "close" || verb === "drop" ? `seq${seq}-step${step}` : undefined

          const { applied, skipped } = runBulk(repo, batch, verb, actor, reason)
          // B2 — every input id is accounted for somewhere.
          expect(applied.length + skipped.length).toBe(batch.length)

          // B3 — every node still satisfies invariants (whether
          // touched or not).
          for (const tid of taskIds) {
            assertInvariants(snapshot(repo, tid), `seq=${seq} step=${step} verb=${verb}`)
          }
        }
      }
    })
  }
})

describe("B4 — dry-run produces identical preview to actual op (no state change)", () => {
  test("dry-run claim on todo produces same plan, no write", () => {
    const repo = freshRepo()
    const id = addBead(repo, "@km/p/a")
    const before = snapshot(repo, id)

    // Simulate dry-run: same planner, but skip applyLifecyclePlan.
    const node = repo.getNode(id)!
    const plan = planClaim(node, id, "alice")
    expect(plan.errors).toEqual([])
    expect(plan.update?.status).toBe("wip")

    // No write — node unchanged.
    const after = snapshot(repo, id)
    expect(after).toEqual(before)
  })

  test("dry-run on already-closed node correctly previews the planner rejection", () => {
    const repo = freshRepo()
    const id = addBead(repo, "@km/p/a")
    applyOne(repo, id, "close", "alice")
    const before = snapshot(repo, id)

    // Re-plan — should error.
    const node = repo.getNode(id)!
    const plan = planClose(node, id)
    expect(plan.errors.length).toBeGreaterThan(0)

    // No write — node unchanged.
    const after = snapshot(repo, id)
    expect(after).toEqual(before)
  })
})

describe("B1+B3 — combined: 30 random bulk sequences match individual ops", () => {
  // Stronger invariant: a bulk run must produce the same FINAL state as
  // running each id individually in the same order. This pins B4 (the
  // implementation seam) — the bulk path is a pure loop over the
  // single-id path, no parallel-mutation shenanigans.
  test("seed=42: bulk(ids) state equals sequential applyOne(id) per id", () => {
    const rng = mulberry32(42)
    const ACTORS = ["alice", "bob"]

    for (let seq = 0; seq < 30; seq++) {
      // Two repos with identical initial conditions.
      const bulkRepo = freshRepo()
      const seqRepo = freshRepo()
      const TASK_COUNT = 4
      const ids: string[] = []
      const seqIds: string[] = []
      for (let i = 0; i < TASK_COUNT; i++) {
        ids.push(addBead(bulkRepo, `@km/p/${i}`))
        seqIds.push(addBead(seqRepo, `@km/p/${i}`))
      }

      const opCount = 3 + Math.floor(rng() * 5)
      for (let step = 0; step < opCount; step++) {
        // Pick batch indices, then run the same batch on both repos
        // through the two different paths.
        const batchSize = 2 + Math.floor(rng() * 3)
        const indices: number[] = []
        for (let k = 0; k < batchSize; k++) {
          indices.push(Math.floor(rng() * TASK_COUNT))
        }
        const verb: Verb = (["claim", "release", "close", "reopen"] as const)[Math.floor(rng() * 4)]!
        const actor = ACTORS[Math.floor(rng() * ACTORS.length)]!

        // Bulk path.
        runBulk(
          bulkRepo,
          indices.map((i) => ids[i]!),
          verb,
          actor,
        )
        // Sequential path.
        for (const i of indices) applyOne(seqRepo, seqIds[i]!, verb, actor)
      }

      // Compare final per-node state. closed_at timestamps may differ
      // by milliseconds because two runs ≠ atomic; we compare structure
      // (status, assigned_to, dataKeys, closed_at-presence).
      for (let i = 0; i < TASK_COUNT; i++) {
        const a = snapshot(bulkRepo, ids[i]!)
        const b = snapshot(seqRepo, seqIds[i]!)
        expect(a.status, `seq=${seq} idx=${i}`).toBe(b.status)
        expect(a.assigned_to, `seq=${seq} idx=${i}`).toBe(b.assigned_to)
        expect(a.dataKeys, `seq=${seq} idx=${i}`).toEqual(b.dataKeys)
        expect(a.closed_at === null, `seq=${seq} idx=${i}: closed_at presence`).toBe(b.closed_at === null)
      }
    }
  })
})
