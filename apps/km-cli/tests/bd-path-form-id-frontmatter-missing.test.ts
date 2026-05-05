/**
 * Regression: `km bd create --path @km/scope/leaf` produces a bead that
 * `bd close @km/scope/leaf` (and every other resolver-using subcommand)
 * can find.
 *
 * Tracks `@km/beads/path-form-id-frontmatter-missing` (P2 bug).
 *
 * The bug: per `@km/beads/data-id-stop-writing` (closed) the markdown
 * renderer no longer emits `id:` in frontmatter — the file's path-form
 * IS the canonical id. But `nodeToBead` still derived `shortId`
 * exclusively from `data.id` / `data.short_id`, so `Bead.from(node)`
 * returned `null` for any new bead created via `--path`. Every CLI
 * subcommand that uses `resolveIssue` (close, update, drop, claim,
 * comment, mention) failed with "Bead not found" — even though `bd show`
 * (which uses the never-null `nodeToBeadRaw` fallback) and the universal
 * `repo.resolveNode` found the file fine.
 *
 * The fix adds an `fs_path`-derived path-form fallback to the `shortId`
 * chain in `nodeToBead`, closing the loop opened by `data-id-stop-writing`:
 * the file's location IS the canonical id, including for `Bead.from`'s
 * nullness check.
 *
 * Three layers of coverage (cheapest first):
 *   1. Renderer contract — `renderBeadFile` does not emit `id:` (pin
 *      the existing decision so it can't regress).
 *   2. `Bead.from` — a node with only `fs_path` (no `data.id`,
 *      no `data.short_id`) is recognized as a bead.
 *   3. End-to-end — render+write file, load repo, run `resolveIssue`,
 *      simulate `bd close` mutation, verify status=done.
 */

import { afterAll, describe, expect, test } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parse as parseYaml } from "yaml"
import { Bead, renderBeadFile } from "@km/beads"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"
import { resolveIssue } from "../src/utils/resolve-task.ts"

const BASE = join("/tmp", `kmtest-bd-path-form-id-${process.pid}-${Date.now().toString(36)}`)
let counter = 0
mkdirSync(BASE, { recursive: true })

function freshDir(label: string): string {
  counter += 1
  const dir = join(BASE, `${label}-${counter}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(dir, ".km"), { recursive: true })
  writeFileSync(
    join(dir, ".km", "config.yaml"),
    `beads:\n  prefix: km\n  roots:\n    - "@km"\n  default_scope: inbox\n`,
  )
  return dir
}

function openRepo(dir: string): Repo {
  return runGenerator(createRepo(dir, { loadFiles: true }))
}

afterAll(() => {
  if (existsSync(BASE)) rmSync(BASE, { recursive: true, force: true })
})

// ============================================================================
// Layer 1: renderer contract — `renderBeadFile` emits no `id:` field.
// Pins the closed `@km/beads/data-id-stop-writing` decision.
// ============================================================================

describe("renderBeadFile — frontmatter omits `id:` (closed: data-id-stop-writing)", () => {
  test("no `id:` YAML key in the rendered file", () => {
    const { content } = renderBeadFile("@km/test/foo", "test bead", {
      prefix: "km",
      type: "task",
    })
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/)
    expect(fmMatch).toBeTruthy()
    const fm = parseYaml(fmMatch![1]!) as Record<string, unknown>
    expect(fm).not.toHaveProperty("id")
    expect(fm.aliases).toEqual(["km-test.foo", "km-test-foo"])
  })
})

// ============================================================================
// Layer 2: `Bead.from` accepts a file-materialized node with only fs_path.
// This is the unit-level repro of the bug.
// ============================================================================

describe("Bead.from — fs_path-only file is recognized as a bead", () => {
  test("a depth-2 file under @km/ with no data.id and no data.short_id IS a bead", () => {
    const dir = freshDir("from-fspath")
    const beadDir = join(dir, "@km", "test")
    mkdirSync(beadDir, { recursive: true })
    const { filename, content } = renderBeadFile("@km/test/foo", "test bead", {
      prefix: "km",
      type: "task",
    })
    writeFileSync(join(dir, filename), content, "utf-8")

    using repo = openRepo(dir)
    const node = repo.resolveNode("@km/test/foo")
    expect(node, "file should be loaded").toBeTruthy()
    // The file carries no `data.id` / `data.short_id` — only aliases.
    const data = node!.data as Record<string, unknown> | undefined
    expect(data?.id).toBeUndefined()
    expect(data?.short_id).toBeUndefined()

    // Pre-fix: Bead.from returned null (no shortId) → resolveIssue failed.
    // Post-fix: shortId is derived from fs_path (`@km/test/foo`).
    const bead = Bead.from(node!, { repo })
    expect(bead, "Bead.from must accept fs_path-only file as a bead").not.toBeNull()
    expect(bead!.shortId).toBe("@km/test/foo")
  })
})

// ============================================================================
// Layer 3: end-to-end — create via renderBeadFile + close via resolveIssue.
// This is the full repro of the user-facing failure.
// ============================================================================

describe("bd create --path → bd close round-trip (regression: path-form-id-frontmatter-missing)", () => {
  test("create file via renderBeadFile, close via resolveIssue → status=done", () => {
    const dir = freshDir("create-close")
    const beadDir = join(dir, "@km", "test")
    mkdirSync(beadDir, { recursive: true })
    const { filename, content } = renderBeadFile("@km/test/foo", "round-trip bead", {
      prefix: "km",
      type: "task",
    })
    const filepath = join(dir, filename)
    writeFileSync(filepath, content, "utf-8")

    // The on-disk frontmatter has matching aliases (no `id:` field).
    const onDisk = content.match(/^---\n([\s\S]*?)\n---\n/)![1]!
    const fm = parseYaml(onDisk) as Record<string, unknown>
    expect(fm).not.toHaveProperty("id")
    expect(fm.aliases).toContain("km-test.foo")

    using repo = openRepo(dir)

    // resolveIssue is the function every bd subcommand (close, update, drop,
    // claim, comment, mention) goes through. Pre-fix it returned null.
    const issue = resolveIssue(repo, "@km/test/foo")
    expect(issue, "resolveIssue('@km/test/foo') must resolve a fresh --path bead").not.toBeNull()
    expect(issue!.shortId).toBe("@km/test/foo")

    // Replicate the exact sequence in the bd close handler:
    //   resolveIssueArg → Bead.close → repo.updateNode
    const node = repo.getNode(issue!.id)
    const currentData = node?.data as Record<string, unknown> | undefined
    const updates = Bead.close(repo, issue!, "regression test", currentData)
    repo.updateNode(issue!.id, updates)

    const after = repo.getNode(issue!.id)
    expect(after?.item?.task?.status, "close path must mark status=done").toBe("done")
  })

  test("path-form resolves to the same shortId every subcommand expects", () => {
    // Pin: every CLI subcommand that uses resolveIssue (close, update, drop,
    // claim, comment, mention) reads `bead.shortId` to print "Closed <id>",
    // "Updated <id>", etc. Pre-fix: shortId was undefined → "Bead not found"
    // because Bead.from filtered the node out. Post-fix: shortId is the
    // path-form derived from fs_path.
    const dir = freshDir("shortid-path-form")
    const beadDir = join(dir, "@km", "scope")
    mkdirSync(beadDir, { recursive: true })
    const { filename, content } = renderBeadFile("@km/scope/leaf", "leaf bead", {
      prefix: "km",
      type: "bug",
    })
    writeFileSync(join(dir, filename), content, "utf-8")

    using repo = openRepo(dir)
    const issue = resolveIssue(repo, "@km/scope/leaf")
    expect(issue, "resolveIssue must resolve fresh --path bead").not.toBeNull()
    expect(issue!.shortId, "shortId is the canonical path-form").toBe("@km/scope/leaf")
  })
})
