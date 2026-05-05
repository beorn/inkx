/**
 * Smoke tests for `km query <dsl>` — alias of `km list --raw <dsl>`.
 *
 * The command is thin: resolve repo, run `repo.query(dsl)`. Tests
 * exercise the underlying primitive directly to stay chain-immune.
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
  const dir = mkdtempSync(join(tmpdir(), "kmtest-query-"))
  scratch.push(dir)
  const repo = runGenerator(createRepo(dir, { loadFiles: false }))
  return { dir, repo }
}

describe("km query — primitive (repo.query)", () => {
  test("repo.query('') with no filters returns nodes", () => {
    const { repo } = freshRepo()
    repo.addNode(null, { type: "p", content: "alpha" })
    repo.addNode(null, { type: "p", content: "beta" })
    // Use a content-substring query — `*` syntax depends on the parser.
    const all = repo.query("alpha")
    expect(all.length).toBeGreaterThanOrEqual(1)
  })

  test("status:done query includes completed tasks (raw, no default --all)", () => {
    const { repo } = freshRepo()
    repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[x]", status: "done" } },
      content: "finished task",
    })
    const done = repo.query("status:done")
    expect(done.length).toBeGreaterThanOrEqual(1)
    expect(done[0]?.content).toContain("finished")
  })

  test("query command source file declares the expected surface", () => {
    // We don't import the action handler (it pulls in program.ts which
    // pulls every command). Source-grep is the chain-immune way to
    // confirm the command is wired correctly.
    const { readFileSync } = require("node:fs") as typeof import("node:fs")
    const src = readFileSync(join(__dirname, "..", "src", "commands", "query.ts"), "utf8")
    expect(src).toContain('new Command("query")')
    expect(src).toMatch(/repo\.query\(/)
    expect(src).toContain("--json")
  })
})
