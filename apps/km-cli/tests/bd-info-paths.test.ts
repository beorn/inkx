/**
 * `km bd info` / `km bd info --paths` tests.
 *
 * Verifies the merged surface (`@km/cli/bd-where-merge-into-info`):
 *
 *   - `bd info` (no flag) shows config + statistics + paths block
 *     (full inspection output).
 *   - `bd info --paths` shows ONLY the resolved paths block
 *     (suppresses config + statistics — same content the legacy
 *     `bd where` produced).
 *   - `bd where` no longer exists (commander rejects unknown command).
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
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
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bdinfo-paths-"))
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

describe("km bd info / --paths", () => {
  test("`bd info` (no flag) shows config + statistics + storage block", async () => {
    const repo = freshRepo()

    const result = await km(repo, ["bd", "info"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    // Config block
    expect(result.stdout).toContain("Beads Configuration")
    expect(result.stdout).toContain("Prefix: km")
    expect(result.stdout).toContain("Roots:")
    expect(result.stdout).toContain("Default scope: scope")

    // Storage / paths block (the parts also shown in --paths mode)
    expect(result.stdout).toContain("Storage")
    expect(result.stdout).toContain("Database:")
    expect(result.stdout).toContain("Repo:")

    // Statistics block
    expect(result.stdout).toContain("Statistics")
    // No issues yet — empty default-board hint shows up instead.
    // Either "Total: 0 issues" or the empty hint qualifies; full info
    // mode definitely emits the Statistics header.
  })

  test("`bd info --paths` shows ONLY the resolved paths block", async () => {
    const repo = freshRepo()

    const result = await km(repo, ["bd", "info", "--paths"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    // Paths block content is present.
    expect(result.stdout).toContain(join(repo, ".km"))
    expect(result.stdout).toContain("prefix: km")
    expect(result.stdout).toContain("roots:")
    expect(result.stdout).toContain("default_scope: scope")
    expect(result.stdout).toContain("database:")
    expect(result.stdout).toContain("repo:")

    // Full-info-only sections are absent — these are the headers that
    // only appear in non-paths mode.
    expect(result.stdout).not.toContain("Beads Configuration")
    expect(result.stdout).not.toContain("How tasks are tracked:")
    expect(result.stdout).not.toContain("Statistics")
  })

  test("`bd info --help` advertises the --paths flag", async () => {
    const repo = freshRepo()

    const result = await km(repo, ["bd", "info", "--help"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain("--paths")
  })

  test("`bd where` no longer exists (rejected as unknown command)", async () => {
    const repo = freshRepo()

    const result = await km(repo, ["bd", "where"])
    // commander rejects unknown subcommands with a non-zero exit code.
    // Either stderr or stdout will mention "unknown command" / "where".
    expect(result.exitCode).not.toBe(0)
    const combined = `${result.stdout}\n${result.stderr}`.toLowerCase()
    expect(combined).toContain("where")
  })
})
