/**
 * Regression: `bd update <file-bead> --parent <file-epic>` must materialize
 * the child under the parent's sibling directory:
 *
 *   parent.md
 *   parent/child.md
 *
 * It must not invent a second YAML `parent_id:` relationship.
 */

import { afterEach, describe, expect, test } from "vitest"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const KM_CLI = join(__dirname, "..", "src", "index.ts")
let scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch = []
})

function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bd-update-parent-"))
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

describe("bd update --parent", () => {
  test("file-backed bead under file-backed epic moves into the parent's sibling directory", () => {
    const repo = freshRepo()
    expect(
      runKm(repo, ["bd", "create", "Epic", "--path", "@km/silvery/scroll-interaction-l4-l5", "--type", "epic"])
        .exitCode,
    ).toBe(0)
    expect(
      runKm(repo, ["bd", "create", "Child", "--path", "@km/silvery/scrollbar-controlled-view", "--type", "task"])
        .exitCode,
    ).toBe(0)

    const result = runKm(repo, [
      "bd",
      "update",
      "@km/silvery/scrollbar-controlled-view",
      "--parent",
      "@km/silvery/scroll-interaction-l4-l5",
    ])

    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain("Moved under: @km/silvery/scroll-interaction-l4-l5")

    const oldChildPath = join(repo, "@km", "silvery", "scrollbar-controlled-view.md")
    const childPath = join(repo, "@km", "silvery", "scroll-interaction-l4-l5", "scrollbar-controlled-view.md")
    expect(existsSync(oldChildPath)).toBe(false)
    expect(existsSync(childPath)).toBe(true)
    const child = readFileSync(childPath, "utf-8")
    expect(child).not.toContain("parent_id:")

    const children = runKm(repo, ["bd", "children", "@km/silvery/scroll-interaction-l4-l5"])
    expect(children.exitCode, children.stderr || children.stdout).toBe(0)
    expect(children.stdout).toContain("@km/silvery/scroll-interaction-l4-l5/scrollbar-controlled-view")
  })

  test("priority/type update hydrates a file-backed bead and preserves its canonical filename and body", () => {
    const repo = freshRepo()
    expect(runKm(repo, ["bd", "create", "Silvercode", "--path", "@km/silvercode", "--type", "epic"]).exitCode).toBe(0)
    expect(
      runKm(repo, [
        "bd",
        "create",
        "Silvercode transcript/tool output parity with Claude Code",
        "--path",
        "@km/silvercode/claude-code-transcript-parity",
        "--type",
        "epic",
        "--priority",
        "P2",
        "--description",
        "baseline desc",
      ]).exitCode,
    ).toBe(0)

    const childPath = join(repo, "@km", "silvercode", "claude-code-transcript-parity.md")
    writeFileSync(childPath, `${readFileSync(childPath, "utf-8")}\n## Details\n\nKeep this body.\n`, "utf-8")

    const result = runKm(repo, [
      "bd",
      "update",
      "@km/silvercode/claude-code-transcript-parity",
      "--priority",
      "P1",
      "--type",
      "epic",
      "--parent",
      "@km/silvercode",
    ])

    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(existsSync(join(repo, "@km", "silvercode", "#P1.md"))).toBe(false)
    expect(existsSync(childPath)).toBe(true)

    const child = readFileSync(childPath, "utf-8")
    expect(child).toContain("# Silvercode transcript/tool output parity with Claude Code #epic #P1")
    expect(child).toContain("## Details")
    expect(child).toContain("Keep this body.")
    expect(child).not.toContain("_stub: true")

    const show = runKm(repo, ["bd", "show", "@km/silvercode/claude-code-transcript-parity"])
    expect(show.exitCode, show.stderr || show.stdout).toBe(0)
    expect(show.stdout).toContain("Priority: P1")
    expect(show.stdout).toContain("Type: epic")
  })
})
