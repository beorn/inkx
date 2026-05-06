/**
 * Action-handler integration tests for bulk lifecycle / set / clear / move.
 *
 * Pins the @km/cli/bulk-multi-id-or-where surface from the CLI side:
 * commander wiring + repo I/O + JSON output shape. Sibling of the L4/L5
 * property tests in `bulk-operations.property.test.ts`.
 *
 * These tests spawn `bun src/index.ts` as a subprocess (mirrors
 * `dry-run.test.ts`) so the entire commander wiring runs — same
 * positional / flag parsing the user sees. Important: `--json` and
 * `--dry-run` are also declared on the parent `task` command, so each
 * subcommand action MUST use `cmd.optsWithGlobals()` (not commander's
 * default per-subcommand `opts()`) to read them. The wiring tests
 * here pin that idiom.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { $ } from "bun"

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_PATH = join(__dirname, "..", "src", "index.ts")

const scratch: string[] = []

afterEach(() => {
  while (scratch.length > 0) {
    const dir = scratch.pop()!
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
})

function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bulk-action-"))
  scratch.push(dir)
  mkdirSync(join(dir, ".km"), { recursive: true })
  mkdirSync(join(dir, "@km", "scope"), { recursive: true })
  writeFileSync(
    join(dir, ".km", "config.yaml"),
    `beads:
  prefix: km
  roots: ["@km"]
  default_scope: "scope"
`,
  )
  return dir
}

async function km(repo: string, args: string[]) {
  try {
    const result = await $`bun ${CLI_PATH} ${args}`
      .cwd(repo)
      .env({ ...process.env, KM_DIR: join(repo, ".km") })
      .quiet()
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      exitCode: result.exitCode,
    }
  } catch (error: unknown) {
    const err = error as { stdout?: Buffer; stderr?: Buffer; exitCode?: number }
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      exitCode: err.exitCode ?? 1,
    }
  }
}

/**
 * Seed a fresh task via `km task new` so it lands with the proper
 * `item.task.status:"todo"` shape (writing raw frontmatter does NOT
 * produce a queryable task — frontmatter `status:` is a property, not
 * the task discriminant). The task's path-form id is `@km/scope/<slug>`
 * because `bd config` sets default_scope=scope.
 */
async function seedTask(repo: string, slug: string): Promise<void> {
  const result = await km(repo, ["task", "new", "--id", `@km/scope/${slug}`, slug])
  if (result.exitCode !== 0) {
    throw new Error(`seedTask(${slug}) failed: ${result.stderr}\n${result.stdout}`)
  }
}

describe("km task close — bulk multi-id", () => {
  test("closes multiple tasks in one invocation", async () => {
    const repo = freshRepo()
    await seedTask(repo, "foo")
    await seedTask(repo, "bar")
    await seedTask(repo, "baz")

    const result = await km(repo, ["task", "close", "foo", "bar", "baz", "--reason", "shipped", "--json"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const out = JSON.parse(result.stdout) as {
      verb: string
      applied: Array<{ ref: string; from: string; to: string }>
      skipped: unknown[]
    }
    expect(out.verb).toBe("close")
    expect(out.applied).toHaveLength(3)
    expect(out.skipped).toHaveLength(0)
    for (const a of out.applied) {
      expect(a.to).toBe("done")
    }
  })

  test("--dry-run previews without writing", async () => {
    const repo = freshRepo()
    await seedTask(repo, "foo")
    await seedTask(repo, "bar")

    const result = await km(repo, ["task", "close", "foo", "bar", "--dry-run", "--json"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const out = JSON.parse(result.stdout) as { dryRun: boolean; applied: unknown[] }
    expect(out.dryRun).toBe(true)
    expect(out.applied).toHaveLength(2)

    // Verify nothing actually changed: re-running close should still
    // succeed (i.e. tasks were never marked done by --dry-run).
    const real = await km(repo, ["task", "close", "foo", "bar", "--json"])
    expect(real.exitCode).toBe(0)
    const realOut = JSON.parse(real.stdout) as { applied: unknown[] }
    expect(realOut.applied).toHaveLength(2)
  })

  test("partial failure: applied + skipped sum equals input count", async () => {
    const repo = freshRepo()
    await seedTask(repo, "foo")
    await seedTask(repo, "bar")

    // Pre-close foo so the second close skips it.
    expect((await km(repo, ["task", "close", "foo", "--json"])).exitCode).toBe(0)

    const result = await km(repo, ["task", "close", "foo", "bar", "--json"])
    expect(result.exitCode).toBe(1) // skipped one — exit code 1
    const out = JSON.parse(result.stdout) as { applied: Array<{ ref: string }>; skipped: Array<{ ref: string }> }
    expect(out.applied.length + out.skipped.length).toBe(2)
    expect(out.skipped.length).toBe(1)
  })
})

describe("km task close --where <query>", () => {
  test("--where resolves to multiple matches and applies", async () => {
    const repo = freshRepo()
    await seedTask(repo, "foo")
    await seedTask(repo, "bar")
    await seedTask(repo, "baz")

    // Claim → wip so the query has a queryable status discriminant on
    // the item.task.status column. (Fresh path-form file beads land
    // with the canonical task shape; repo.query indexes off the
    // task-status discriminant once the lifecycle path has touched it.)
    expect((await km(repo, ["task", "claim", "foo", "bar", "baz", "--json"])).exitCode).toBe(0)

    // Now match all wip tasks via --where, then close them.
    const result = await km(repo, ["task", "close", "--where", "status:wip", "--json"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const out = JSON.parse(result.stdout) as { applied: Array<{ to: string }> }
    expect(out.applied.length).toBeGreaterThanOrEqual(3)
    for (const a of out.applied) expect(a.to).toBe("done")
  })

  test("--where with no matches errors out", async () => {
    const repo = freshRepo()
    await seedTask(repo, "foo")
    // dropped tasks don't exist yet → 0 matches.
    const result = await km(repo, ["task", "close", "--where", "status:dropped"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("matched no nodes")
  })

  test("--where + positional ids errors (mutually exclusive)", async () => {
    const repo = freshRepo()
    await seedTask(repo, "foo")

    const result = await km(repo, ["task", "close", "foo", "--where", "status:todo"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("mutually exclusive")
  })
})

describe("km task claim/release/drop/reopen — bulk", () => {
  test("claim multiple tasks", async () => {
    const repo = freshRepo()
    await seedTask(repo, "a")
    await seedTask(repo, "b")

    const result = await km(repo, ["task", "claim", "a", "b", "--json"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    const out = JSON.parse(result.stdout) as { applied: Array<{ to: string }> }
    expect(out.applied).toHaveLength(2)
    for (const a of out.applied) expect(a.to).toBe("wip")
  })

  test("drop multiple tasks", async () => {
    const repo = freshRepo()
    await seedTask(repo, "x")
    await seedTask(repo, "y")

    const result = await km(repo, ["task", "drop", "x", "y", "--reason", "wontfix", "--json"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    const out = JSON.parse(result.stdout) as { applied: Array<{ to: string }> }
    expect(out.applied).toHaveLength(2)
    for (const a of out.applied) expect(a.to).toBe("dropped")
  })

  test("reopen multiple tasks after close", async () => {
    const repo = freshRepo()
    await seedTask(repo, "p")
    await seedTask(repo, "q")

    expect((await km(repo, ["task", "close", "p", "q", "--json"])).exitCode).toBe(0)

    const result = await km(repo, ["task", "reopen", "p", "q", "--json"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    const out = JSON.parse(result.stdout) as { applied: Array<{ to: string }> }
    expect(out.applied).toHaveLength(2)
    for (const a of out.applied) expect(a.to).toBe("todo")
  })
})

describe("km set --where", () => {
  test("--where + positional ids errors", async () => {
    const repo = freshRepo()
    await seedTask(repo, "foo")

    const result = await km(repo, ["set", "foo", "priority:P1", "--where", "status:todo"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("mutually exclusive")
  })

  test("--where with no matches errors", async () => {
    const repo = freshRepo()

    const result = await km(repo, ["set", "priority:P1", "--where", "status:dropped"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("matched no nodes")
  })
})

describe("km clear --where", () => {
  test("--where + positional ids errors", async () => {
    const repo = freshRepo()
    await seedTask(repo, "foo")

    const result = await km(repo, ["clear", "foo", "priority", "--where", "status:todo"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("mutually exclusive")
  })
})
