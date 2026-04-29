/**
 * `km bd create` (no --parent, no --id) materializes a real .md file at
 * <roots[0]>/<default_scope>/<short-id>.md — `@km/beads/create-orphan-must-materialize`.
 *
 * The CLI command in `apps/km-cli/src/commands/bd.ts` is a thin wrapper
 * over `renderInboxCapture` (km-beads) plus `mkdirSync` + `writeFileSync`.
 * Test the wiring at the same layer the CLI does it: build the path from
 * config defaults, render the content, write the file, verify what's on
 * disk matches the bead's acceptance criteria.
 *
 * Why this test exists separately from `render-inbox-capture.test.ts`:
 * the renderer's contract is unit-tested there. Here we verify the
 * `<roots[0]>/<default_scope>/<short-id>.md` path resolution is correct
 * — the layer where Phase 2 (defaults) and Phase 3 (materialization)
 * meet. A regression in the path-join would land files in the wrong
 * directory and slip past the renderer-only unit tests.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse as parseYaml } from "yaml"
import { renderInboxCapture } from "@km/beads"
import { getBeadsConfig, clearConfigCache } from "@km/storage"

let scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch = []
  clearConfigCache()
})

function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bdcreate-"))
  scratch.push(dir)
  return dir
}

/**
 * Replicate the bd.ts `create` materialization path: resolve config
 * defaults, render, write. This is exactly what the CLI command does
 * after detecting (no --parent, no --id, no scope).
 */
function bareCreate(repoRoot: string, shortId: string, title: string, opts: { description?: string } = {}): string {
  const config = getBeadsConfig(repoRoot)
  const primaryRoot = config.roots[0]!
  const inboxScope = config.default_scope
  const inboxDir = join(repoRoot, primaryRoot, inboxScope)
  const { filename, content } = renderInboxCapture(shortId, title, {
    prefix: config.prefix,
    description: opts.description,
  })
  mkdirSync(inboxDir, { recursive: true })
  const filepath = join(inboxDir, filename)
  writeFileSync(filepath, content, "utf-8")
  return filepath
}

describe("km bd create — bare (no --parent, no --id) materializes file under defaults", () => {
  test("zero-config repo lands the file at <repo>/@km/inbox/<short-id>.md", () => {
    const repo = freshRepo()
    const path = bareCreate(repo, "abc12", "First capture")

    expect(path).toBe(join(repo, "@km", "inbox", "abc12.md"))
    expect(existsSync(path)).toBe(true)
  })

  test("file content has aliases [<short-id>, km-<short-id>] and NO `id:` line", () => {
    const repo = freshRepo()
    const path = bareCreate(repo, "abc12", "Title")

    const content = readFileSync(path, "utf-8")
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/)
    expect(fmMatch).toBeTruthy()
    const fm = parseYaml(fmMatch![1]!)

    expect(fm.aliases).toEqual(["abc12", "km-abc12"])
    expect(fm).not.toHaveProperty("id")
  })

  test("body contains the title as a `# heading`", () => {
    const repo = freshRepo()
    const path = bareCreate(repo, "abc12", "Pin elixir to 1.18")

    const content = readFileSync(path, "utf-8")
    expect(content).toContain("# Pin elixir to 1.18")
  })

  test("description (when provided) appears as a body section after the title", () => {
    const repo = freshRepo()
    const path = bareCreate(repo, "abc12", "Title", { description: "Some context here." })

    const content = readFileSync(path, "utf-8")
    expect(content).toContain("Some context here.")
    // Title comes before description in the body order.
    expect(content.indexOf("# Title")).toBeLessThan(content.indexOf("Some context here."))
  })

  test("user .km/config.yaml override re-routes the landing zone", () => {
    const repo = freshRepo()
    mkdirSync(join(repo, ".km"), { recursive: true })
    writeFileSync(
      join(repo, ".km/config.yaml"),
      `beads:
  prefix: pim
  roots: ["beads"]
  default_scope: "triage"
`,
    )

    const path = bareCreate(repo, "xyz9", "Custom-config capture")
    expect(path).toBe(join(repo, "beads", "triage", "xyz9.md"))
    expect(existsSync(path)).toBe(true)

    const fm = parseYaml(readFileSync(path, "utf-8").match(/^---\n([\s\S]*?)\n---\n/)![1]!)
    // Aliases use the configured prefix, not the hardcoded default.
    expect(fm.aliases).toEqual(["xyz9", "pim-xyz9"])
  })

  test("partial config (only default_scope set) keeps the other defaults", () => {
    const repo = freshRepo()
    mkdirSync(join(repo, ".km"), { recursive: true })
    writeFileSync(
      join(repo, ".km/config.yaml"),
      `beads:
  default_scope: "inflight"
`,
    )

    const path = bareCreate(repo, "abc12", "Title")
    expect(path).toBe(join(repo, "@km", "inflight", "abc12.md"))
  })
})
