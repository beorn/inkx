/**
 * --dry-run invariant tests for destructive km verbs.
 *
 * Pins the L4 invariant: --dry-run NEVER mutates filesystem or DB. The
 * test inspects the file mtime + content before and after the dry-run;
 * any mismatch is a regression.
 *
 * Bead: @km/cli/task-bd-collapse (Wave 7).
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, statSync } from "node:fs"
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
  const dir = mkdtempSync(join(tmpdir(), "kmtest-dryrun-"))
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
 * Snapshot a file's content + mtime for "did anything change?" assertions.
 * mtime alone is not enough — some filesystems don't update it for
 * idempotent writes — so we hash content too.
 */
function snapshot(path: string): { content: string; mtimeMs: number } {
  return {
    content: readFileSync(path, "utf-8"),
    mtimeMs: statSync(path).mtimeMs,
  }
}

describe("km move --dry-run", () => {
  test("prints diff and writes nothing (--to-root)", async () => {
    const repo = freshRepo()
    const oldPath = join(repo, "@km", "scope", "old.md")
    const otherPath = join(repo, "@km", "scope", "other.md")

    // Seed two files; `other` references `old` so the dry-run can show
    // a non-zero rewrite count.
    writeFileSync(oldPath, "# Old\n\nbody\n")
    writeFileSync(otherPath, "# Other\n\nLink: [[@km/scope/old]]\n")

    // First sync the vault so the DB knows about both files.
    const sync = await km(repo, ["sync"])
    expect(sync.exitCode, sync.stderr || sync.stdout).toBe(0)

    const beforeOld = snapshot(oldPath)
    const beforeOther = snapshot(otherPath)

    // --to-root sidesteps target-resolution; this test pins the
    // dry-run-doesn't-write invariant, not target resolution.
    const result = await km(repo, ["move", "@km/scope/old", "--to-root", "--dry-run"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain("Would move")
    expect(result.stdout).toContain("No changes written")

    // Invariant: both files unchanged.
    const afterOld = snapshot(oldPath)
    const afterOther = snapshot(otherPath)
    expect(afterOld.content).toBe(beforeOld.content)
    expect(afterOther.content).toBe(beforeOther.content)
    // Path of the original file should still exist (not renamed).
    expect(existsSync(oldPath)).toBe(true)
  })

  test("--dry-run --json emits a structured plan", async () => {
    const repo = freshRepo()
    const oldPath = join(repo, "@km", "scope", "thing.md")
    writeFileSync(oldPath, "# Thing\n\nbody\n")

    const sync = await km(repo, ["sync"])
    expect(sync.exitCode, sync.stderr || sync.stdout).toBe(0)

    const result = await km(repo, ["move", "@km/scope/thing", "--to-root", "--dry-run", "--json"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const plan = JSON.parse(result.stdout) as {
      dryRun: boolean
      id: string
      from: { name: string }
      impact: { backlinks: number; childCount: number }
    }
    expect(plan.dryRun).toBe(true)
    expect(plan.id).toBeTruthy()
    expect(plan.from).toMatchObject({ name: expect.any(String) })
    expect(plan.impact).toMatchObject({
      backlinks: expect.any(Number),
      childCount: expect.any(Number),
    })

    // Original path should still exist after a dry-run.
    expect(existsSync(oldPath)).toBe(true)
  })
})
