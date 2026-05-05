/**
 * Regression: `bd create --parent <epic> --id <leaf>` materializes a
 * sibling FILE at the parent's scope, NOT an inline checkbox child of
 * the parent epic's markdown body.
 *
 * Tracks `@km/beads/parent-id-leaf-materializes-inline` (P2 bug).
 *
 * The pre-fix path lowered every `--parent <scope> --id <leaf>` call to
 * `repo.addNode(parentId, node)`, which appended `node` as an inline
 * checkbox child of `<scope>.md` rather than creating a new file under
 * `<scope>/`. `bd show` then reported `Path: @<prefix>/<scope>.md` (the
 * parent file), and the leaf id never reached the frontmatter.
 *
 * The fix in `apps/km-cli/src/commands/bd.ts` (commit `b5cd1c6cc`)
 * builds the canonical path-form id from parent + leaf and writes a new
 * file at `<repoRoot>/<canonical-id>.md`. Per the closed
 * `@km/all/path-name-id-redesign` epic, both forms are equivalent —
 * `--parent X --id <leaf>` and `--id @<prefix>/X/<leaf>` produce the
 * same on-disk shape.
 *
 * Three layers of coverage:
 *   1. Split form `--parent km-beads --id foo` → file at `@km/beads/foo.md`
 *   2. Equivalent path-form `--path @km/beads/foo` → same file shape
 *   3. Path-form via `--id` (bd-compat alias for --path) → same shape
 */

import { afterEach, describe, expect, test } from "vitest"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse as parseYaml } from "yaml"

const KM_CLI = join(__dirname, "..", "src", "index.ts")
let scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch = []
})

function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bdcreate-parent-id-"))
  scratch.push(dir)
  mkdirSync(join(dir, ".km"), { recursive: true })
  writeFileSync(
    join(dir, ".km", "config.yaml"),
    `beads:\n  prefix: km\n  roots:\n    - "@km"\n  default_scope: inbox\n`,
  )
  return dir
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

describe("bd create --parent <epic> --id <leaf> materializes a sibling file (regression: parent-id-leaf-materializes-inline)", () => {
  test("split form: --parent km-beads --id foo → file at @km/beads/foo.md (NOT inline in @km/beads.md)", () => {
    const repo = freshRepo()

    // Seed the parent epic file at @km/beads.md.
    const seedParent = runKm(repo, ["bd", "create", "Beads epic", "--path", "@km/beads", "--type", "epic"])
    expect(seedParent.exitCode, seedParent.stderr || seedParent.stdout).toBe(0)
    expect(existsSync(join(repo, "@km", "beads.md"))).toBe(true)

    // The repro: `--parent km-beads --id foo`.
    const result = runKm(repo, ["bd", "create", "T", "--parent", "km-beads", "--id", "foo", "--type", "task"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    // Acceptance: the leaf is a sibling FILE under the @km/beads/ scope.
    const leafPath = join(repo, "@km", "beads", "foo.md")
    expect(existsSync(leafPath), `expected sibling file at ${leafPath}`).toBe(true)

    // The pre-fix bug: the leaf got appended as an inline checkbox into
    // @km/beads.md instead of creating a new file. Confirm this DIDN'T
    // happen — the parent epic file's body must NOT contain the leaf
    // title as a checkbox.
    const parentBody = readFileSync(join(repo, "@km", "beads.md"), "utf-8")
    expect(parentBody).not.toMatch(/\[ \]\s+T\b/)

    // Acceptance: the leaf file's frontmatter aliases include the legacy
    // bd-form (`km-beads.foo`) so prose-text references keep working.
    const leafContent = readFileSync(leafPath, "utf-8")
    const fmMatch = leafContent.match(/^---\n([\s\S]*?)\n---\n/)
    expect(fmMatch).toBeTruthy()
    const fm = parseYaml(fmMatch![1]!) as Record<string, unknown>
    const aliases = fm.aliases as string[] | undefined
    expect(aliases, "aliases must be set on the leaf file").toBeDefined()
    expect(aliases).toContain("km-beads.foo")

    // Per the closed `@km/beads/data-id-stop-writing` decision: no `id:`
    // YAML field — the file path IS the canonical id.
    expect(fm).not.toHaveProperty("id")
  })

  test("equivalent path-form: --path @km/beads/foo produces the same shape", () => {
    const repo = freshRepo()

    runKm(repo, ["bd", "create", "Beads epic", "--path", "@km/beads", "--type", "epic"])
    const result = runKm(repo, ["bd", "create", "T", "--path", "@km/beads/foo", "--type", "task"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const leafPath = join(repo, "@km", "beads", "foo.md")
    expect(existsSync(leafPath)).toBe(true)

    // Same equivalence: split form and path-form land at the same file.
    const leafContent = readFileSync(leafPath, "utf-8")
    expect(leafContent).toContain("# T")
  })

  test("path-form via --id (bd-compat alias for --path): --id @km/beads/foo produces the same shape", () => {
    const repo = freshRepo()

    runKm(repo, ["bd", "create", "Beads epic", "--path", "@km/beads", "--type", "epic"])
    const result = runKm(repo, ["bd", "create", "T", "--id", "@km/beads/foo", "--type", "task"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const leafPath = join(repo, "@km", "beads", "foo.md")
    expect(existsSync(leafPath)).toBe(true)
  })

  test("end-to-end: created leaf is resolvable via path-form (bd close round-trip)", () => {
    const repo = freshRepo()

    runKm(repo, ["bd", "create", "Beads epic", "--path", "@km/beads", "--type", "epic"])
    const create = runKm(repo, ["bd", "create", "T", "--parent", "km-beads", "--id", "leaf"])
    expect(create.exitCode, create.stderr || create.stdout).toBe(0)
    expect(create.stdout, "create output prints canonical path-form").toContain("@km/beads/leaf")

    const close = runKm(repo, ["bd", "close", "@km/beads/leaf", "--reason", "regression test"])
    expect(close.exitCode, close.stderr || close.stdout).toBe(0)
    expect(close.stdout).toContain("Closed @km/beads/leaf")
  })
})
