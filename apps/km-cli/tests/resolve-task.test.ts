/**
 * Unified resolver tests — `resolveTaskNode` / `resolveIssue`.
 *
 * Covers every resolution path that `bd list` / `tasks list` may print:
 *   1. Frontmatter `data.id`        (canonical path-form)
 *   2. Sigil-prefixed path-form     (`@<prefix>/<scope>/<slug>`)
 *   3. Legacy bd-form `data.short_id` (`km-<scope>.<slug>`)
 *   4. `data.aliases` entry          (historical names)
 *   5. ULID-tail fallback `km-XXXX`  (no data.id, no data.short_id —
 *      regression for km-beads.resolve-issue-arg-bug)
 *   6. Filesystem path / relative   (delegated to repo.resolveNode)
 */

import { afterAll, describe, expect, test } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { runGenerator } from "@km/core"
import { createRepo } from "@km/storage"
import type { Repo } from "@km/storage"
import { resolveIssue, resolveTaskNode } from "../src/utils/resolve-task.ts"

const BASE = join("/tmp", `kmtest-resolve-task-${process.pid}-${Date.now().toString(36)}`)
let counter = 0
mkdirSync(BASE, { recursive: true })

function freshDir(label: string): string {
  counter += 1
  const dir = join(BASE, `${label}-${counter}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(dir, ".km"), { recursive: true })
  writeFileSync(join(dir, ".km", "config.yaml"), `beads:\n  prefix: km\n  board: ""\n  parent: ""\n`)
  writeFileSync(join(dir, "inbox.md"), `# Inbox\n\n`)
  return dir
}

function openRepo(dir: string): Repo {
  return runGenerator(createRepo(dir, { loadFiles: true }))
}

afterAll(() => {
  if (existsSync(BASE)) rmSync(BASE, { recursive: true, force: true })
})

describe("resolveTaskNode", () => {
  test("path 1: frontmatter data.id (canonical path-form)", () => {
    const dir = freshDir("data-id")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "task with frontmatter id",
      data: { id: "scope/slug" },
    })

    const node = resolveTaskNode(repo, "scope/slug")
    expect(node?.id).toBe(id)
  })

  test("path 2: sigil-prefixed path-form (@km/scope/slug)", () => {
    const dir = freshDir("sigil")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "task with sigil",
      data: { id: "scope/slug" },
    })

    // resolveShortId strips `@<prefix>/` → matches data.id
    const node = resolveTaskNode(repo, "@km/scope/slug")
    expect(node?.id).toBe(id)
  })

  test("path 3: legacy data.short_id (km-scope.slug)", () => {
    const dir = freshDir("short-id")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "legacy bd-form",
      data: { short_id: "km-beads.legacy" },
    })

    const node = resolveTaskNode(repo, "km-beads.legacy")
    expect(node?.id).toBe(id)
  })

  test("path 4: data.aliases entry resolves on legacy id", () => {
    const dir = freshDir("aliases")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "renamed bead",
      data: { id: "scope/new-slug", aliases: ["legacy-id-1", "legacy-id-2"] },
    })

    expect(resolveTaskNode(repo, "legacy-id-1")?.id).toBe(id)
    expect(resolveTaskNode(repo, "legacy-id-2")?.id).toBe(id)
  })

  test("path 5: bare km-XXXX ULID-tail (regression for resolve-issue-arg-bug)", () => {
    const dir = freshDir("ulid-tail")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    // Bead with NO data.id and NO data.short_id — display id derives
    // purely from ULID tail (the case nodeToIssue/queries.ts:228 falls
    // through to). Prior to the unified resolver, `bd update km-XXXX`
    // could fail on these even though `bd list` printed them.
    const nodeId = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "derived-id bead",
      data: {},
    })

    const tail = nodeId.slice(-4).toLowerCase()
    const displayId = `km-${tail}`

    const node = resolveTaskNode(repo, displayId)
    expect(node, `bare display id ${displayId} should resolve`).toBeTruthy()
    expect(node?.id).toBe(nodeId)

    // Case-insensitive: same id with mixed case still hits.
    const upper = `KM-${tail.toUpperCase()}`
    expect(resolveTaskNode(repo, upper)?.id).toBe(nodeId)
  })

  test("path 6a: full filesystem path resolves", () => {
    const dir = freshDir("fs-path")
    using repo = openRepo(dir)

    // inbox.md is the seeded file — resolve it via its name.
    const node = resolveTaskNode(repo, "inbox")
    expect(node).toBeTruthy()
    expect(node?.fs_path).toContain("inbox.md")
  })

  test("returns null for unknown ids", () => {
    const dir = freshDir("unknown")
    using repo = openRepo(dir)
    expect(resolveTaskNode(repo, "km-zzzz")).toBeNull()
    expect(resolveTaskNode(repo, "totally/bogus/path")).toBeNull()
  })

  test("returns null for empty / whitespace input", () => {
    const dir = freshDir("empty")
    using repo = openRepo(dir)
    expect(resolveTaskNode(repo, "")).toBeNull()
    expect(resolveTaskNode(repo, "   ")).toBeNull()
  })
})

describe("resolveIssue", () => {
  test("wraps resolveTaskNode + nodeToIssue", () => {
    const dir = freshDir("issue-wrap")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "issue test",
      data: { short_id: "km-test.wrap" },
    })

    const issue = resolveIssue(repo, "km-test.wrap")
    expect(issue?.id).toBe(id)
    expect(issue?.shortId).toBe("km-test.wrap")
  })

  test("returns null when no node matches", () => {
    const dir = freshDir("issue-null")
    using repo = openRepo(dir)
    expect(resolveIssue(repo, "km-zzzz")).toBeNull()
  })
})
