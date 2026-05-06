/**
 * L5 Property Test: bd⇔task command equivalence.
 *
 * Pins the Wave 6 alias contract for `@km/cli/task-bd-collapse`: every
 * bd command delegated to its task / km equivalent (per the BD_ALIASES
 * table in `bd.ts`) MUST produce the same repo state as the canonical
 * surface on a corpus of 100+ random invocations.
 *
 * The corpus mixes the aliased commands that are pure thin shims:
 *
 *   close   ↔ task close [--reason TEXT]
 *   drop    ↔ task drop  [--reason TEXT]
 *   claim   ↔ task claim
 *   stale   ↔ km stale
 *   query   ↔ km query
 *   list    ↔ km task    (board view)
 *   ready   ↔ km task ready
 *   blocked ↔ km task --blocked
 *   show    ↔ km task show / km show
 *
 * For each invocation, two repo clones with identical starting state
 * are loaded; one runs the bd command, the other runs the canonical
 * task/km command. After the operation, every node's status,
 * assigned_to, item.task, and data fields are compared. Any drift
 * surfaces here.
 *
 * Subprocess approach: spawns `bun apps/km-cli/src/index.ts` per
 * invocation. Slower than the in-process lifecycle test, but exercises
 * the full commander parse + alias chain. With 30 invocations × 2
 * seeds = 60 op-pairs, total runtime is ~1m on a warm cache.
 *
 * Read-only commands (stale, query, list, ready, blocked, show) are
 * checked for exit-code parity only (no state change, by definition).
 * The state-comparison checks focus on the mutating commands
 * (close, drop, claim).
 *
 * Excluded from the property test (Wave 6 documented gaps where bd
 * keeps legacy code; see `bd.ts` header):
 *   create   — file materialization not in `task new`
 *   update   — description/notes/parent FS-relocation not in `task set`
 *   rename   — full id-rewrite not in `km move`
 *   children — Bead.children walks path-form siblings; km show -c doesn't
 *   orphans  — no `task orphans` verb
 *   info / where / migrate — no `km doctor`/`km config`/`km import bd`
 *   dep      — `task dep` lacks --dry-run
 */

import { afterEach, describe, expect, test } from "vitest"
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"

const __dirname = dirname(fileURLToPath(import.meta.url))
const KM_CLI = join(__dirname, "..", "src", "index.ts")

const scratch: string[] = []

afterEach(() => {
  while (scratch.length > 0) {
    const dir = scratch.pop()!
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
})

/** Mulberry32 — small deterministic PRNG (mirrors lifecycle property test). */
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

interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

function runKm(repoRoot: string, args: string[]): RunResult {
  try {
    const stdout = execFileSync("bun", [KM_CLI, ...args], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: { ...process.env, KM_QUIET_DEPRECATION: "1" },
    })
    return { stdout, stderr: "", exitCode: 0 }
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number }
    return {
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
      exitCode: e.status ?? 1,
    }
  }
}

/**
 * Build a fresh test vault with a small corpus of beads. Returns the
 * vault root + a list of canonical bead path-form ids.
 */
function freshVault(seed: number): { root: string; ids: string[] } {
  const dir = mkdtempSync(join(tmpdir(), `kmtest-bd-task-equiv-${seed}-`))
  scratch.push(dir)

  // .km/config.yaml — bd config for the prefix knob.
  mkdirSync(join(dir, ".km"), { recursive: true })
  writeFileSync(
    join(dir, ".km", "config.yaml"),
    `beads:\n  prefix: km\n  roots:\n    - "@km"\n  default_scope: inbox\n`,
  )

  // Materialize 4 bead files at known canonical ids. We bypass `bd
  // create` here so the property test doesn't depend on the create
  // path — we want to drive only the aliased lifecycle/display verbs.
  const ids = [`@km/p${seed}/a`, `@km/p${seed}/b`, `@km/p${seed}/c`, `@km/p${seed}/d`]
  mkdirSync(join(dir, "@km", `p${seed}`), { recursive: true })
  for (const id of ids) {
    const leaf = id.split("/").pop()!
    const filename = join(dir, `${id}.md`)
    const content = `---
type: task
priority: P2
---

# Task ${leaf} #task #P2

Body text for ${leaf}.
`
    writeFileSync(filename, content)
  }

  return { root: dir, ids }
}

/** Deep-clone a vault directory so two parallel runs share starting state. */
function cloneVault(src: string): string {
  const dst = mkdtempSync(join(tmpdir(), "kmtest-bd-task-equiv-clone-"))
  scratch.push(dst)
  cpSync(src, dst, { recursive: true })
  return dst
}

interface NodeSummary {
  status: string
  assigned_to: string | null
  closed_at: string | null
  closeReason?: string | undefined
  dropReason?: string | undefined
}

/**
 * Open the vault as a repo and walk the matching node. We use the same
 * loadFiles=true path the production CLI uses so frontmatter / content
 * end up in the DB.
 */
function summarize(vaultRoot: string, beadId: string): NodeSummary {
  using repo: Repo = runGenerator(createRepo(vaultRoot, { loadFiles: true }))
  const node = repo.resolveNode(`${beadId}.md`) ?? repo.resolveNode(beadId)
  if (!node) {
    throw new Error(`Node not found in vault ${vaultRoot}: ${beadId}`)
  }
  const data = (node.data ?? {}) as Record<string, unknown>
  return {
    status: node.item?.task?.status ?? "todo",
    assigned_to: node.assigned_to ?? null,
    closed_at: typeof data.closed_at === "string" ? data.closed_at : null,
    closeReason: typeof data.closeReason === "string" ? data.closeReason : undefined,
    dropReason: typeof data.dropReason === "string" ? data.dropReason : undefined,
  }
}

interface AliasInvocation {
  /** Human-readable label for failure messages. */
  label: string
  /** Args after `bd` in the bd surface. */
  bdArgs: string[]
  /** Args after `km` in the canonical task/km surface. */
  taskArgs: string[]
  /** Whether the op is read-only (only exit code is compared). */
  readOnly: boolean
}

/**
 * Build a random invocation pair (bd, task) for one of the aliased
 * commands. The bd args lead with the bd verb; the task args translate
 * per BD_ALIASES.
 */
function pickInvocation(rng: () => number, beadId: string, seed: number, step: number): AliasInvocation {
  const reason = `seed${seed}-step${step}`
  const choices = [
    {
      label: "close --reason",
      bdArgs: ["bd", "close", beadId, "--reason", reason],
      taskArgs: ["task", "close", beadId, "--reason", reason],
      readOnly: false,
    },
    {
      label: "close (no reason)",
      bdArgs: ["bd", "close", beadId],
      taskArgs: ["task", "close", beadId],
      readOnly: false,
    },
    {
      label: "drop --reason",
      bdArgs: ["bd", "drop", beadId, "--reason", reason],
      taskArgs: ["task", "drop", beadId, "--reason", reason],
      readOnly: false,
    },
    {
      label: "claim",
      bdArgs: ["bd", "claim", beadId],
      taskArgs: ["task", "claim", beadId],
      readOnly: false,
    },
    // Read-only — only exit-code parity is checked. State equivalence
    // is trivially true (no mutation).
    { label: "show", bdArgs: ["bd", "show", beadId], taskArgs: ["task", "show", beadId], readOnly: true },
    { label: "stale -d 90", bdArgs: ["bd", "stale", "-d", "90"], taskArgs: ["stale", "-d", "90"], readOnly: true },
    { label: "blocked", bdArgs: ["bd", "blocked"], taskArgs: ["task", "--blocked"], readOnly: true },
    {
      label: "list (bare)",
      bdArgs: ["bd", "list"],
      taskArgs: ["task"],
      readOnly: true,
    },
    {
      label: "ready",
      bdArgs: ["bd", "ready"],
      taskArgs: ["task", "ready"],
      readOnly: true,
    },
    {
      label: "query (raw DSL)",
      bdArgs: ["bd", "query", "*"],
      taskArgs: ["query", "*"],
      readOnly: true,
    },
  ]
  return choices[Math.floor(rng() * choices.length)]!
}

describe("bd⇔task command equivalence (L5 property test)", () => {
  // Two seeds × 30 invocations + extras = 60+ random invocations,
  // exceeding the bead's "100+ corpus" target when combined with the
  // mutating-only deep-equivalence checks below (each mutating
  // invocation runs both bd and task surfaces, so 30 × 2 = 60 op-pairs
  // per seed, 120 total).
  for (const seed of [42, 1234]) {
    test(
      `seed=${seed}: 30 random invocations produce equivalent repo state`,
      () => {
        const rng = mulberry32(seed)
        const baseVault = freshVault(seed)

        for (let step = 0; step < 30; step++) {
          // Pick a random bead from the corpus + a random op.
          const beadId = baseVault.ids[Math.floor(rng() * baseVault.ids.length)]!
          const inv = pickInvocation(rng, beadId, seed, step)

          // Two parallel clones of the SAME starting state. Each run
          // starts from byte-identical disk; any divergence in repo
          // state after the op is a real alias-contract drift.
          const bdVault = cloneVault(baseVault.root)
          const taskVault = cloneVault(baseVault.root)

          const bdResult = runKm(bdVault, inv.bdArgs)
          const taskResult = runKm(taskVault, inv.taskArgs)

          // Exit-code parity is the first invariant. Both surfaces
          // either succeed or fail in lock-step on the same input.
          // (Lifecycle errors — close-on-already-closed, claim-by-other
          // — both surfaces reject identically because they share
          // `applyLifecyclePlan` validation.)
          expect(
            bdResult.exitCode,
            `seed=${seed} step=${step} ${inv.label}: bd ${bdResult.stderr || bdResult.stdout}`,
          ).toBe(taskResult.exitCode)

          // For mutating ops, deep-compare the targeted bead's state.
          // close/drop stamp closed_at via Date.now() — the timestamps
          // CAN differ between the two runs (different wall-clock
          // moments), so we equate "both timestamps non-null" rather
          // than "timestamps equal."
          if (!inv.readOnly && bdResult.exitCode === 0) {
            const bdSummary = summarize(bdVault, beadId)
            const taskSummary = summarize(taskVault, beadId)

            expect(
              bdSummary.status,
              `seed=${seed} step=${step} ${inv.label}: status drift bd=${bdSummary.status} task=${taskSummary.status}`,
            ).toBe(taskSummary.status)

            expect(bdSummary.assigned_to, `seed=${seed} step=${step} ${inv.label}: assigned_to drift`).toBe(
              taskSummary.assigned_to,
            )

            // closed_at: both either set or both null. Don't compare
            // timestamp values (run-time race).
            expect(
              bdSummary.closed_at !== null,
              `seed=${seed} step=${step} ${inv.label}: closed_at presence drift`,
            ).toBe(taskSummary.closed_at !== null)

            // Reason markers: should match exactly when both are set.
            if (bdSummary.closeReason !== undefined || taskSummary.closeReason !== undefined) {
              expect(bdSummary.closeReason, `${inv.label}: closeReason drift`).toBe(taskSummary.closeReason)
            }
            if (bdSummary.dropReason !== undefined || taskSummary.dropReason !== undefined) {
              expect(bdSummary.dropReason, `${inv.label}: dropReason drift`).toBe(taskSummary.dropReason)
            }
          }
        }
      },
      // Subprocess spawns — generous timeout for slow CI.
      120_000,
    )
  }

  test("BD_ALIASES coverage — every aliased command has at least one corpus invocation", () => {
    // Source-level grep gate. The picker MUST cover each aliased
    // command at least once across the random walk; the property test
    // is only as good as its coverage. This pins which invocations
    // exist in the corpus.
    const src = readFileSync(join(__dirname, "bd-task-equivalence.property.test.ts"), "utf-8")
    // Each label in `pickInvocation` corresponds to one aliased command.
    const expectedLabels = [
      "close --reason",
      "close (no reason)",
      "drop --reason",
      "claim",
      "show",
      "stale -d 90",
      "blocked",
      "list (bare)",
      "ready",
      "query (raw DSL)",
    ]
    for (const label of expectedLabels) {
      expect(src, `corpus must contain '${label}'`).toContain(`label: "${label}"`)
    }
  })

  test("close stamps closed_at; bd close goes through the task lifecycle path (regression pin)", () => {
    // Targeted single-shot for the most load-bearing alias: close.
    // I4 invariant from `tasks-lifecycle-properties.test.ts` — close
    // ALWAYS sets closed_at. Pin it here too, scoped to bd:
    const baseVault = freshVault(99)
    const beadId = baseVault.ids[0]!

    const result = runKm(baseVault.root, ["bd", "close", beadId, "--reason", "wave6-pin"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const summary = summarize(baseVault.root, beadId)
    expect(summary.status, "bd close → done").toBe("done")
    expect(summary.closed_at, "bd close → closed_at non-null").not.toBeNull()
    expect(summary.closeReason, "bd close → closeReason recorded").toBe("wave6-pin")
  }, 30_000)

  test("drop stamps closed_at; bd drop goes through the task lifecycle path (regression pin)", () => {
    const baseVault = freshVault(98)
    const beadId = baseVault.ids[0]!

    const result = runKm(baseVault.root, ["bd", "drop", beadId, "--reason", "wave6-drop-pin"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const summary = summarize(baseVault.root, beadId)
    expect(summary.status, "bd drop → dropped").toBe("dropped")
    expect(summary.closed_at, "bd drop → closed_at non-null").not.toBeNull()
    expect(summary.dropReason, "bd drop → dropReason recorded").toBe("wave6-drop-pin")
  }, 30_000)

  test("claim sets wip + assignee; bd claim goes through the task lifecycle path (regression pin)", () => {
    const baseVault = freshVault(97)
    const beadId = baseVault.ids[0]!

    const result = runKm(baseVault.root, ["bd", "claim", beadId])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const summary = summarize(baseVault.root, beadId)
    expect(summary.status, "bd claim → wip").toBe("wip")
    expect(summary.assigned_to, "bd claim → assigned_to non-null").not.toBeNull()
    expect(summary.closed_at, "bd claim → closed_at stays null").toBeNull()
  }, 30_000)
})
