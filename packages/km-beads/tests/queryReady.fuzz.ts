/**
 * Property-based fuzz test for the queryReady root-membership predicate.
 *
 * Predicate-A added the `boardRoots` filter to queryReady so that a vault
 * crawl returns only issues whose `fs_path` lives under one of the
 * configured beads roots (resolveBeadsRoots(config, cliOverride)).
 *
 * Hand-written tests cover specific shapes; this fuzz harness covers the
 * full predicate contract: for any random tree of mixed task / non-task
 * nodes scattered across multiple roots, queryReady's output is exactly
 * the set of `status:todo` task nodes whose `fs_path` is `root` or starts
 * with `root + "/"` for some configured root.
 *
 * Trailing-slash anchoring is the bug-prone bit — `beads-archive/` must
 * NOT match `beads`. The fuzzer plants both shapes deliberately.
 *
 * Implementation notes:
 *   - We seed an in-memory `createTestRepo()` with random nodes whose
 *     `fs_path` is drawn from a deterministic pool.
 *   - Only nodes with `task.status === "todo"` and no `blocked-by` props
 *     should appear in queryReady output (matches predicate semantics
 *     beyond just root-membership).
 *   - We do NOT exercise the dependent-count map, scopePath, or
 *     boardTag — those are orthogonal to the root-membership predicate
 *     under test.
 */

import { test, describe, expect, gen, take, type SeededRandom } from "vimonkey"
import { createTestRepo } from "@km/storage"
import { queryReady } from "../src/queries.ts"

// ---------------------------------------------------------------------------
// Path generators
// ---------------------------------------------------------------------------

/**
 * Pool of root candidates the fuzzer chooses from. Deliberately includes
 * adversarial shapes:
 *   - "beads" + "beads-archive" — prefix without slash anchor would conflate
 *   - "imports/km-2026-04-28" — multi-segment root
 *   - "a" — single-char root, magnifies off-by-one anchor bugs
 */
const ROOT_POOL = ["beads", "beads-archive", "imports/km-2026-04-28", "a", "a-extra", "vault/notes"]

/** Path segments for synthesized fs_paths. */
const SEGMENTS = ["alpha", "beta", "gamma", "delta", "@km", "@decker", "_orphan", "sub", "deep"]

/**
 * Synthesize a random fs_path. May or may not live under any pool root —
 * unrelated paths exercise the "filtered out" branch.
 */
function randomPath(rng: SeededRandom): string {
  // ~70% land somewhere under a pool root, ~30% land elsewhere.
  if (rng.float() < 0.7) {
    const root = rng.pick(ROOT_POOL)
    const depth = rng.int(0, 3)
    if (depth === 0) {
      // The root itself as a file (e.g., `beads.md` or just `beads`).
      // queryReady's predicate matches `path === root` literally — keep
      // both bare-root and child shapes in the input distribution.
      return rng.float() < 0.3 ? root : `${root}/${rng.pick(SEGMENTS)}.md`
    }
    const parts = [root]
    for (let i = 0; i < depth; i++) parts.push(rng.pick(SEGMENTS))
    return `${parts.join("/")}.md`
  }
  // Unrelated path — never matches any configured root.
  const parts: string[] = []
  const depth = rng.int(1, 4)
  for (let i = 0; i < depth; i++) parts.push(rng.pick(SEGMENTS))
  return `${parts.join("/")}.md`
}

/**
 * Pick a random non-empty subset of ROOT_POOL as the configured roots.
 */
function randomRoots(rng: SeededRandom): string[] {
  // 1..ROOT_POOL.length entries, deduped, deterministic via shuffle-and-take.
  const shuffled = [...ROOT_POOL].sort(() => rng.float() - 0.5)
  const count = rng.int(1, ROOT_POOL.length)
  return shuffled.slice(0, count)
}

// ---------------------------------------------------------------------------
// Tree fixture
// ---------------------------------------------------------------------------

interface PlantedNode {
  fs_path: string
  /** True if status:todo task — eligible for queryReady. */
  isReadyTask: boolean
}

interface Fixture {
  /** Configured beads roots (what queryReady's `boardRoots` will receive). */
  roots: string[]
  /** Repo seeded with the planted nodes. */
  repo: ReturnType<typeof createTestRepo>
  /** Nodes we planted, paired with their predicate-eligibility. */
  planted: PlantedNode[]
}

/**
 * Build a fixture: a fresh in-memory repo seeded with `nodeCount` nodes
 * of mixed shapes (task vs non-task, status vs no-status, varied paths).
 */
function buildFixture(rng: SeededRandom, nodeCount: number): Fixture {
  const roots = randomRoots(rng)
  const repo = createTestRepo()
  const planted: PlantedNode[] = []

  for (let i = 0; i < nodeCount; i++) {
    const fs_path = randomPath(rng)
    const shape = rng.float()

    if (shape < 0.5) {
      // status:todo task — the only nodes queryReady can return.
      repo.addNode(null, {
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: `Task ${i}`,
        fs_path,
      })
      planted.push({ fs_path, isReadyTask: true })
    } else if (shape < 0.7) {
      // status:done task — must be filtered out by the status:todo filter.
      repo.addNode(null, {
        type: "p",
        item: { list: "-", task: { marker: "[x]", status: "done" } },
        content: `Done ${i}`,
        fs_path,
      })
      planted.push({ fs_path, isReadyTask: false })
    } else if (shape < 0.85) {
      // status:wip task — also filtered (queryReady is status:todo-only).
      repo.addNode(null, {
        type: "p",
        item: { list: "-", task: { marker: "[/]", status: "wip" } },
        content: `WIP ${i}`,
        fs_path,
      })
      planted.push({ fs_path, isReadyTask: false })
    } else {
      // Plain non-task node — no task_status, must never appear.
      repo.addNode(null, {
        type: "p",
        content: `Note ${i}`,
        fs_path,
      })
      planted.push({ fs_path, isReadyTask: false })
    }
  }

  return { roots, repo, planted }
}

// ---------------------------------------------------------------------------
// Predicate oracle
// ---------------------------------------------------------------------------

/**
 * Pure reference predicate: a path lives under one of the configured
 * roots iff it equals a root or starts with `root + "/"`.
 *
 * This mirrors queries.ts:
 *   boardRoots.some((root) => p === root || p.startsWith(`${root}/`))
 *
 * If this oracle ever drifts from the implementation, the fuzz test
 * fails — that's the point. Don't import the predicate from the source;
 * we want the oracle to be an independent specification.
 */
function isUnderConfiguredRoot(path: string, roots: string[]): boolean {
  for (const root of roots) {
    if (path === root) return true
    if (path.startsWith(`${root}/`)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Fuzz tests
// ---------------------------------------------------------------------------

describe("queryReady root-membership predicate fuzz", () => {
  test.fuzz("queryReady output equals expected (status:todo ∧ under-root)", async () => {
    const fixtures = gen(({ random }) => buildFixture(random, random.int(5, 30)))

    let runs = 0
    for await (const fixture of take(fixtures, 200)) {
      runs++
      const { repo, roots, planted } = fixture

      const expectedPaths = new Set(
        planted.filter((n) => n.isReadyTask && isUnderConfiguredRoot(n.fs_path, roots)).map((n) => n.fs_path),
      )

      const actual = queryReady(undefined, undefined, undefined, { repo, boardRoots: roots })
      const actualPaths = new Set(actual.map((i) => i.path).filter((p): p is string => typeof p === "string"))

      // Set equality — order is irrelevant, queryReady sorts by priority.
      expect(actualPaths, `roots=${JSON.stringify(roots)} planted=${planted.length}`).toEqual(expectedPaths)

      // Every returned issue must satisfy both halves of the predicate.
      // (Catches cases where the oracle and impl agree on the set but
      // queryReady silently includes something that's not a todo task.)
      for (const issue of actual) {
        expect(issue.status, `issue ${issue.id} should be todo`).toBe("todo")
        expect(issue.path, `issue ${issue.id} should have a path`).toBeDefined()
        expect(
          isUnderConfiguredRoot(issue.path!, roots),
          `issue path ${issue.path} not under any of ${JSON.stringify(roots)}`,
        ).toBe(true)
      }

      repo.close()
    }
    expect(runs).toBeGreaterThanOrEqual(200)
  })

  test.fuzz("empty boardRoots passes everything (todo-task) through", async () => {
    // Sanity: with boardRoots undefined / empty, the predicate is a no-op
    // and queryReady returns every status:todo task regardless of path.
    const fixtures = gen(({ random }) => buildFixture(random, random.int(5, 20)))

    for await (const fixture of take(fixtures, 50)) {
      const { repo, planted } = fixture

      const expectedTodoCount = planted.filter((n) => n.isReadyTask).length

      // boardRoots: undefined — predicate not applied.
      const actualUndef = queryReady(undefined, undefined, undefined, { repo })
      expect(actualUndef.length).toBe(expectedTodoCount)

      // boardRoots: [] — `boardRoots && boardRoots.length > 0` short-circuits, so
      // the empty-array case is also a no-op. This is the documented contract.
      const actualEmpty = queryReady(undefined, undefined, undefined, { repo, boardRoots: [] })
      expect(actualEmpty.length).toBe(expectedTodoCount)

      repo.close()
    }
  })

  test.fuzz("trailing-slash anchor: 'beads' root never matches 'beads-archive/...'", async () => {
    // Targeted regression — the trailing-slash anchor is the bug-prone
    // bit of the predicate. Plant nodes specifically at `beads-archive/...`
    // and verify they're excluded when only `beads` is configured.
    const fixtures = gen(({ random }) => {
      const repo = createTestRepo()
      // Plant some todo tasks under beads-archive — these MUST be excluded
      // when roots=['beads'].
      const archiveCount = random.int(1, 5)
      for (let i = 0; i < archiveCount; i++) {
        repo.addNode(null, {
          type: "p",
          item: { list: "-", task: { marker: "[ ]", status: "todo" } },
          content: `Archive ${i}`,
          fs_path: `beads-archive/${random.pick(SEGMENTS)}.md`,
        })
      }
      // And some legitimate tasks under beads.
      const validCount = random.int(1, 5)
      const validPaths: string[] = []
      for (let i = 0; i < validCount; i++) {
        const fs_path = `beads/${random.pick(SEGMENTS)}.md`
        validPaths.push(fs_path)
        repo.addNode(null, {
          type: "p",
          item: { list: "-", task: { marker: "[ ]", status: "todo" } },
          content: `Valid ${i}`,
          fs_path,
        })
      }
      return { repo, validPaths }
    })

    for await (const { repo, validPaths } of take(fixtures, 50)) {
      const actual = queryReady(undefined, undefined, undefined, { repo, boardRoots: ["beads"] })
      const actualPaths = new Set(actual.map((i) => i.path))

      // Every returned path is under `beads/` exactly.
      for (const p of actualPaths) {
        expect(p, "trailing-slash anchor must reject beads-archive/").toMatch(/^beads(\/|$)/)
        expect(p?.startsWith("beads-archive")).toBe(false)
      }
      // All planted valid paths are present.
      for (const vp of validPaths) {
        expect(actualPaths.has(vp), `expected ${vp} in output`).toBe(true)
      }

      repo.close()
    }
  })
})
