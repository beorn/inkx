/**
 * Smoke tests for `km children` — alias of `km show <id> -c`.
 *
 * The command itself is thin: resolve repo, find node, list children.
 * We validate the underlying primitive (`repo.getChildren`) here so
 * the test stays chain-immune. The Command wiring is exercised by
 * `cli.slow.test.ts` via end-to-end.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): { dir: string; repo: Repo } {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-children-"))
  scratch.push(dir)
  const repo = runGenerator(createRepo(dir, { loadFiles: false }))
  return { dir, repo }
}

function addNode(repo: Repo, parentId: string | null, content: string): string {
  return repo.addNode(parentId, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content,
  })
}

describe("km children — primitive", () => {
  test("getChildren returns direct children of a node", () => {
    const { repo } = freshRepo()
    const parent = addNode(repo, null, "parent")
    const c1 = addNode(repo, parent, "c1")
    const c2 = addNode(repo, parent, "c2")
    const children = repo.getChildren(parent)
    const ids = children.map((c) => c.id)
    expect(ids).toContain(c1)
    expect(ids).toContain(c2)
    expect(ids).toHaveLength(2)
  })

  test("getChildren returns [] for a leaf", () => {
    const { repo } = freshRepo()
    const leaf = addNode(repo, null, "leaf")
    expect(repo.getChildren(leaf)).toEqual([])
  })

  test("getChildren returns children of root for a top-level node", () => {
    const { repo } = freshRepo()
    addNode(repo, null, "top1")
    addNode(repo, null, "top2")
    const children = repo.getChildren(null)
    expect(children.length).toBeGreaterThanOrEqual(2)
  })

  test("children command source declares the expected surface", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs")
    const src = readFileSync(join(__dirname, "..", "src", "commands", "children.ts"), "utf8")
    expect(src).toContain('new Command("children")')
    expect(src).toMatch(/repo\.getChildren\(/)
    expect(src).toContain("--json")
  })
})
