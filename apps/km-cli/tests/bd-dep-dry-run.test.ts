/**
 * `km bd dep add|remove --dry-run` invariant tests.
 *
 * Pins the L4 invariant for the bd-dep family: --dry-run NEVER mutates
 * the filesystem or the DB. Both `add` and `remove` must preview the
 * would-edit edge without calling `repo.updateNode`.
 *
 * Bead: @km/cli/bd-rename-dep-dry-run.
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
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bddep-dryrun-"))
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

function snapshot(path: string): { content: string; mtimeMs: number } {
  return {
    content: readFileSync(path, "utf-8"),
    mtimeMs: statSync(path).mtimeMs,
  }
}

describe("km bd dep add --dry-run", () => {
  test("prints would-add edge and writes nothing", async () => {
    const repo = freshRepo()
    const createA = await km(repo, ["bd", "create", "Issue A", "--path", "@km/scope/a", "--type", "bug"])
    expect(createA.exitCode, createA.stderr || createA.stdout).toBe(0)
    const createB = await km(repo, ["bd", "create", "Issue B", "--path", "@km/scope/b", "--type", "bug"])
    expect(createB.exitCode, createB.stderr || createB.stdout).toBe(0)

    const aPath = join(repo, "@km", "scope", "a.md")
    const beforeA = snapshot(aPath)
    expect(beforeA.content).not.toContain("blocked-by")

    const result = await km(repo, ["bd", "dep", "add", "@km/scope/a", "@km/scope/b", "--dry-run"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain("Would add dependency")
    expect(result.stdout).toContain("blocked-by @km/scope/b")
    expect(result.stdout).toContain("No changes written")

    // L4 invariant: A's file is byte-for-byte unchanged. No `blocked-by`
    // got serialized to disk; the DB likewise stays clean.
    const afterA = snapshot(aPath)
    expect(afterA.content).toBe(beforeA.content)
    expect(afterA.content).not.toContain("blocked-by")
  })

  test("reports a no-op for an already-existing dependency", async () => {
    const repo = freshRepo()
    const createA = await km(repo, ["bd", "create", "Issue A", "--path", "@km/scope/a2", "--type", "bug"])
    expect(createA.exitCode, createA.stderr || createA.stdout).toBe(0)
    const createB = await km(repo, ["bd", "create", "Issue B", "--path", "@km/scope/b2", "--type", "bug"])
    expect(createB.exitCode, createB.stderr || createB.stdout).toBe(0)

    // Add a real dependency first.
    const realAdd = await km(repo, ["bd", "dep", "add", "@km/scope/a2", "@km/scope/b2"])
    expect(realAdd.exitCode, realAdd.stderr || realAdd.stdout).toBe(0)

    const aPath = join(repo, "@km", "scope", "a2.md")
    const before = snapshot(aPath)

    const result = await km(repo, ["bd", "dep", "add", "@km/scope/a2", "@km/scope/b2", "--dry-run"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain("already blocked-by")
    expect(result.stdout).toContain("No changes written")

    // L4 invariant: dry-run on a no-op also writes nothing.
    const after = snapshot(aPath)
    expect(after.content).toBe(before.content)
  })
})

describe("km bd dep remove --dry-run", () => {
  test("prints would-remove edge and writes nothing", async () => {
    const repo = freshRepo()
    const createA = await km(repo, ["bd", "create", "Issue A", "--path", "@km/scope/r-a", "--type", "bug"])
    expect(createA.exitCode, createA.stderr || createA.stdout).toBe(0)
    const createB = await km(repo, ["bd", "create", "Issue B", "--path", "@km/scope/r-b", "--type", "bug"])
    expect(createB.exitCode, createB.stderr || createB.stdout).toBe(0)

    // Establish a real dependency, then dry-run its removal.
    const realAdd = await km(repo, ["bd", "dep", "add", "@km/scope/r-a", "@km/scope/r-b"])
    expect(realAdd.exitCode, realAdd.stderr || realAdd.stdout).toBe(0)

    const aPath = join(repo, "@km", "scope", "r-a.md")
    const before = snapshot(aPath)
    expect(before.content).toContain("blocked-by")

    const result = await km(repo, ["bd", "dep", "remove", "@km/scope/r-a", "@km/scope/r-b", "--dry-run"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain("Would remove dependency")
    expect(result.stdout).toContain("no longer blocked-by @km/scope/r-b")
    expect(result.stdout).toContain("No changes written")

    // L4 invariant: A's file is byte-for-byte unchanged; the dependency
    // is still on disk because dry-run NEVER writes.
    const after = snapshot(aPath)
    expect(after.content).toBe(before.content)
    expect(after.content).toContain("blocked-by")
  })

  test("reports a no-op when the dependency does not exist", async () => {
    const repo = freshRepo()
    const createA = await km(repo, ["bd", "create", "Issue A", "--path", "@km/scope/n-a", "--type", "bug"])
    expect(createA.exitCode, createA.stderr || createA.stdout).toBe(0)
    const createB = await km(repo, ["bd", "create", "Issue B", "--path", "@km/scope/n-b", "--type", "bug"])
    expect(createB.exitCode, createB.stderr || createB.stdout).toBe(0)

    const aPath = join(repo, "@km", "scope", "n-a.md")
    const before = snapshot(aPath)

    const result = await km(repo, ["bd", "dep", "remove", "@km/scope/n-a", "@km/scope/n-b", "--dry-run"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain("does not depend on")
    expect(result.stdout).toContain("No changes written")

    const after = snapshot(aPath)
    expect(after.content).toBe(before.content)
  })

  test("source contains the --dry-run option for both add and remove (regression pin)", () => {
    // After Wave 6 final, the dep dry-run logic lives in tasks/dep.ts;
    // bd-dep is a thin re-export shim. The regression pin moves with it.
    const src = readFileSync(join(__dirname, "..", "src", "commands", "tasks", "dep.ts"), "utf-8")
    // Three subcommands: add, rm, ls. Only add and rm need --dry-run;
    // ls is read-only.
    const dryRunOpts = src.match(/\.option\("--dry-run"/g) ?? []
    expect(dryRunOpts.length).toBe(2)
    // Must short-circuit BEFORE addGraphEdge / removeGraphEdge in both
    // code paths.
    const dryRunGuards = src.match(/if \(options\.dryRun\)/g) ?? []
    expect(dryRunGuards.length).toBe(2)
  })
})
