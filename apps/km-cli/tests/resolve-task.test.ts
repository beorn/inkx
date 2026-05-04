/**
 * Unified resolver tests — `resolveTaskNode` / `resolveIssue`.
 *
 * Covers every resolution path that `bd list` / `tasks list` may print:
 *   1. `data.id` prop               (canonical path-form)
 *   2. Sigil-prefixed path-form     (`@<prefix>/<scope>/<slug>`)
 *   3. Legacy bd-form `data.short_id` (`km-<scope>.<slug>`)
 *   4. `data.aliases` entry          (historical names)
 *   5. Filesystem path / relative   (delegated to repo.resolveNode)
 *
 * Historical: a ULID-tail fallback (`km-<4chars>` matching the trailing
 * 4 chars of node.id) used to be arm 5, kept alive while `nodeToBead`
 * synthesized `km-XXXX` display ids for non-beads. Both have been
 * retired (km-beads.purge-fallback-id-l5 + .retire-short-id-l4): non-
 * beads now display the full ULID, and a bare `km-XXXX` only matches
 * when it's a real `data.short_id`.
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
  test("path 1: data.id prop (canonical path-form)", () => {
    const dir = freshDir("data-id")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "task with id prop",
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

  test("retired ULID-tail: bare km-XXXX no longer fabricates a hit on a non-bead", () => {
    const dir = freshDir("ulid-tail-retired")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    // A node with NO data.id and NO data.short_id is not a bead. Pre-
    // km-beads.retire-short-id-l4 the resolver matched `km-<tail>` against
    // the node's ULID tail; that arm is gone. There is no longer any code
    // path that prints `km-XXXX` for a node like this (Bead.shortId is
    // undefined, Bead.displayId(bead) returns the full ULID), so a user
    // cannot type a `km-XXXX` form that points at it.
    const nodeId = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "non-bead descendant",
      data: {},
    })

    const tail = nodeId.slice(-4).toLowerCase()
    const fabricated = `km-${tail}`

    expect(
      resolveTaskNode(repo, fabricated),
      `${fabricated} should NOT resolve to a non-bead via ULID-tail synthesis`,
    ).toBeNull()
  })

  test("real km-<scope>.<slug> still resolves via data.short_id (arm 2, not via ULID tail)", () => {
    const dir = freshDir("real-bd-form")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "real legacy bead",
      data: { short_id: "km-abc1" },
    })

    expect(resolveTaskNode(repo, "km-abc1")?.id).toBe(id)
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
  test("wraps resolveTaskNode + nodeToBead", () => {
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
