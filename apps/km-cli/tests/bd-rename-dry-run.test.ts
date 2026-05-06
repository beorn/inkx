/**
 * `km bd rename --dry-run` invariant tests.
 *
 * Pins the L4 invariant for the bd-rename family: --dry-run NEVER mutates
 * the filesystem or the DB. Mirrors `dry-run.test.ts` for `km move` —
 * snapshot file content + mtime before, run --dry-run, assert nothing
 * changed.
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
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bdrename-dryrun-"))
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

describe("km bd rename --dry-run", () => {
  test("prints rename + ref-rewrite preview and writes nothing", async () => {
    const repo = freshRepo()

    // Seed a parent bead and a child that references it. The reference
    // makes `getRenameImpact` report a non-zero backlink count, so the
    // dry-run preview shows a meaningful "would rewrite" line.
    const createOld = await km(repo, ["bd", "create", "Old issue", "--path", "@km/scope/old", "--type", "bug"])
    expect(createOld.exitCode, createOld.stderr || createOld.stdout).toBe(0)
    const createChild = await km(repo, [
      "bd",
      "create",
      "Child issue",
      "--path",
      "@km/scope/refs-old",
      "--type",
      "bug",
      "--description",
      "References [[@km/scope/old]] for context.",
    ])
    expect(createChild.exitCode, createChild.stderr || createChild.stdout).toBe(0)

    const oldPath = join(repo, "@km", "scope", "old.md")
    const childPath = join(repo, "@km", "scope", "refs-old.md")
    expect(existsSync(oldPath)).toBe(true)
    expect(existsSync(childPath)).toBe(true)

    const beforeOld = snapshot(oldPath)
    const beforeChild = snapshot(childPath)

    // Run the dry-run rename to a new path-form id.
    const result = await km(repo, ["bd", "rename", "@km/scope/old", "@km/scope/new", "--dry-run"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain("Would rename @km/scope/old → @km/scope/new")
    expect(result.stdout).toContain("No changes written")

    // L4 invariant: NO file on disk was touched.
    const afterOld = snapshot(oldPath)
    const afterChild = snapshot(childPath)
    expect(afterOld.content).toBe(beforeOld.content)
    expect(afterChild.content).toBe(beforeChild.content)
    // Old file at original path still exists; new path was NOT created.
    expect(existsSync(oldPath)).toBe(true)
    expect(existsSync(join(repo, "@km", "scope", "new.md"))).toBe(false)
  })

  test("--no-rewrite + --dry-run reports the dangling-ref count without writing", async () => {
    const repo = freshRepo()

    const createOld = await km(repo, ["bd", "create", "Old issue", "--path", "@km/scope/old2", "--type", "bug"])
    expect(createOld.exitCode, createOld.stderr || createOld.stdout).toBe(0)

    const oldPath = join(repo, "@km", "scope", "old2.md")
    const before = snapshot(oldPath)

    const result = await km(repo, ["bd", "rename", "@km/scope/old2", "@km/scope/new2", "--no-rewrite", "--dry-run"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain("Would rename @km/scope/old2 → @km/scope/new2")
    expect(result.stdout).toContain("No changes written")

    const after = snapshot(oldPath)
    expect(after.content).toBe(before.content)
    expect(existsSync(oldPath)).toBe(true)
    expect(existsSync(join(repo, "@km", "scope", "new2.md"))).toBe(false)
  })

  test("source contains the --dry-run option (regression pin)", () => {
    // After Wave 6 final, bd-rename is a thin alias shim over `km move`;
    // the dry-run guard lives in move.ts. The pin moves with it.
    const src = readFileSync(join(__dirname, "..", "src", "commands", "move.ts"), "utf-8")
    expect(src).toContain('.option("--dry-run"')
    expect(src).toContain("options.dryRun")
    // Dry-run must short-circuit BEFORE moveNodeWithRefs.
    const dryRunIdx = src.indexOf("if (options.dryRun)")
    const moveIdx = src.indexOf("repo.moveNodeWithRefs(node.id, spec, {")
    expect(dryRunIdx).toBeGreaterThan(0)
    expect(moveIdx).toBeGreaterThan(dryRunIdx)
  })
})
