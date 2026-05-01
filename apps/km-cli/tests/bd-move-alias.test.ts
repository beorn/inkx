import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
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
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bdmove-"))
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

describe("km bd move", () => {
  test("aliases rename and preserves backlinks through the canonical rewrite path", async () => {
    const repo = freshRepo()
    const oldPath = join(repo, "@km", "scope", "old.md")
    const childPath = join(repo, "@km", "scope", "child.md")

    const createOld = await km(repo, ["bd", "create", "Old issue", "--path", "@km/scope/old", "--type", "bug"])
    expect(createOld.exitCode, createOld.stderr || createOld.stdout).toBe(0)
    const createChild = await km(repo, [
      "bd",
      "create",
      "Child issue",
      "--parent",
      "@km/scope/old",
      "--id",
      "child",
      "--description",
      "See @km/scope/old and km-scope.old for context.",
    ])
    expect(createChild.exitCode, createChild.stderr || createChild.stdout).toBe(0)

    const result = await km(repo, ["bd", "move", "@km/scope/old", "@km/scope/new", "--include-prose"])

    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(existsSync(join(repo, "@km", "scope", "new.md"))).toBe(true)
    expect(existsSync(oldPath)).toBe(false)

    const child = readFileSync(childPath, "utf-8")
    expect(child).toContain("parent_id: @km/scope/new")
    expect(child).toContain("See @km/scope/new and @km/scope/new for context.")
    expect(child).not.toContain("@km/scope/old")
    expect(child).not.toContain("km-scope.old")
  })
})
