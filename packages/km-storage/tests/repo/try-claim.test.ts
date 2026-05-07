/**
 * `repo.tryClaim` — atomic compare-and-swap claim.
 *
 * Pins the L4 invariant for `@km/agent/sigil-boards` Phase 1.3:
 * `bd update --claim` must be race-safe across concurrent sessions, so
 * two parallel agents can never both believe they hold the same slot.
 *
 * Contract surface:
 *
 *   tryClaim(id, actor, leaseMs)
 *     - succeeds when assignee is null, equal to `actor` (self-reclaim,
 *       idempotent), or stale (updated_at < now - leaseMs)
 *     - fails when held by someone else within the lease window, or when
 *       the task is done/dropped
 *     - on success returns { ok: true, node } with the post-update node
 *     - on failure returns { ok: false, currentOwner, expiresAt, reason }
 *
 * This file uses `createTestRepo()` (in-memory SQLite via `createMemDataStore`),
 * which is enough to drive the SQL CAS path. The race scenario is reproduced
 * by `Promise.all`-ing two `tryClaim` calls; SQLite's per-statement atomicity
 * is the real guarantee being tested — even with JS scheduling, the two
 * UPDATEs are serialized by the connection, so exactly one sees the
 * pre-image with `assigned_to IS NULL`.
 */

import { describe, test, expect } from "vitest"
import { createTestRepo, type Repo } from "../../src/index.ts"

function addBead(repo: Repo, slug: string): string {
  return repo.addNode(null, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: slug,
    name: slug,
    data: { id: slug },
  })
}

const ONE_HOUR = 60 * 60 * 1000

describe("repo.tryClaim — atomic CAS", () => {
  test("claims an unassigned bead", () => {
    const repo = createTestRepo()
    const id = addBead(repo, "test-1")

    const result = repo.tryClaim(id, "alice", ONE_HOUR)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.node.assigned_to).toBe("alice")
    expect(result.node.item?.task?.status).toBe("wip")
  })

  test("self-reclaim is idempotent (no error, status unchanged)", () => {
    const repo = createTestRepo()
    const id = addBead(repo, "test-2")

    const first = repo.tryClaim(id, "alice", ONE_HOUR)
    expect(first.ok).toBe(true)

    const second = repo.tryClaim(id, "alice", ONE_HOUR)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.node.assigned_to).toBe("alice")
    expect(second.node.item?.task?.status).toBe("wip")
  })

  test("contention: second claim by different actor fails with current holder", () => {
    const repo = createTestRepo()
    const id = addBead(repo, "test-3")

    const first = repo.tryClaim(id, "alice", ONE_HOUR)
    expect(first.ok).toBe(true)

    const second = repo.tryClaim(id, "bob", ONE_HOUR)
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.currentOwner).toBe("alice")
    expect(second.reason).toBe("held")
    expect(second.expiresAt).toBeGreaterThan(Date.now())
  })

  test("stale claim is reclaimable: lease-expired bead succeeds for new actor", () => {
    const repo = createTestRepo()
    const id = addBead(repo, "test-4")

    // Manually backdate the bead so its updated_at falls outside any
    // reasonable lease window. The CAS WHERE clause permits reclaim when
    // updated_at < (now - leaseMs).
    repo.database.run("UPDATE nodes SET assigned_to = ?, task_status = 'wip', updated_at = ? WHERE id = ?", [
      "alice",
      Date.now() - 10 * ONE_HOUR, // 10 hours ago
      id,
    ])
    repo.touch()

    // 1-hour lease — alice's claim is stale by 9h, so bob can take it.
    const result = repo.tryClaim(id, "bob", ONE_HOUR)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.node.assigned_to).toBe("bob")
  })

  test("done bead refuses claim with reason='closed'", () => {
    const repo = createTestRepo()
    const id = addBead(repo, "test-5")
    // Mark done.
    repo.updateNode(id, {
      item: { task: { marker: "[x]", status: "done" } },
    })

    const result = repo.tryClaim(id, "alice", ONE_HOUR)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("closed")
  })

  test("dropped bead refuses claim with reason='closed'", () => {
    const repo = createTestRepo()
    const id = addBead(repo, "test-6")
    repo.updateNode(id, {
      item: { task: { marker: "[-]", status: "dropped" } },
    })

    const result = repo.tryClaim(id, "alice", ONE_HOUR)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("closed")
  })

  test("bead with NULL task_status (untransitioned) is claimable", () => {
    // Regression: file-backed nodes start life with task_status NULL until
    // the first transition writes it. Naive `NOT IN ('done','dropped')`
    // excludes the row (SQL three-valued logic — `NULL NOT IN (…)` = NULL,
    // not TRUE). The CAS must explicitly accept NULL.
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "h",
      item: {}, // bead-shaped but no task block yet
      content: "fresh-bead",
      name: "fresh-bead",
      data: { id: "fresh-bead" },
    })
    // Sanity: no task_status on this row.
    const row = repo.database.prepare("SELECT task_status FROM nodes WHERE id = ?").get(id) as {
      task_status: string | null
    } | null
    expect(row?.task_status ?? null).toBeNull()

    const result = repo.tryClaim(id, "alice", ONE_HOUR)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.node.assigned_to).toBe("alice")
  })

  test("missing bead returns reason='not-found'", () => {
    const repo = createTestRepo()
    const result = repo.tryClaim("does-not-exist", "alice", ONE_HOUR)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("not-found")
    expect(result.currentOwner).toBeNull()
  })

  test("concurrent claims: only one succeeds (race-safe across two callers)", async () => {
    const repo = createTestRepo()
    const id = addBead(repo, "test-race")

    // Promise.all serializes only at the JS scheduler level, but SQLite
    // statements on a single connection serialize at the SQLite level. The
    // CAS WHERE clause is the actual race guard — exactly one UPDATE sees
    // assigned_to IS NULL.
    const [a, b] = await Promise.all([
      Promise.resolve().then(() => repo.tryClaim(id, "alice", ONE_HOUR)),
      Promise.resolve().then(() => repo.tryClaim(id, "bob", ONE_HOUR)),
    ])

    const wins = [a, b].filter((r) => r.ok).length
    const losses = [a, b].filter((r) => !r.ok).length
    expect(wins).toBe(1)
    expect(losses).toBe(1)

    // Whichever lost should report the winner as currentOwner.
    const winner = a.ok ? "alice" : "bob"
    const loser = a.ok ? b : a
    if (loser.ok) throw new Error("loser is ok?")
    expect(loser.currentOwner).toBe(winner)
    expect(loser.reason).toBe("held")
  })
})
