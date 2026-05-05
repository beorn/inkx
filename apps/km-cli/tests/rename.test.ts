/**
 * Smoke tests for `km rename` — alias of `km move`.
 *
 * The command is a thin wrapper around `repo.moveNodeWithRefs` — the
 * SAME engine `km move` calls. The rename-vs-reparent polymorphism
 * pivot is tested in `move-polymorphism.test.ts`; here we verify the
 * command module loads cleanly and the underlying engine call shape.
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
  const dir = mkdtempSync(join(tmpdir(), "kmtest-rename-"))
  scratch.push(dir)
  const repo = runGenerator(createRepo(dir, { loadFiles: false }))
  return { dir, repo }
}

describe("km rename — primitive (moveNodeWithRefs reparent path)", () => {
  test("moveNodeWithRefs reparents and updates parent_id", () => {
    const { repo } = freshRepo()
    const oldParent = repo.addNode(null, { type: "p", content: "old-parent" })
    const newParent = repo.addNode(null, { type: "p", content: "new-parent" })
    const child = repo.addNode(oldParent, { type: "p", content: "child" })

    repo.moveNodeWithRefs(child, { newParentId: newParent }, { noRewrite: true })

    const moved = repo.getNode(child)
    expect(moved?.parent_id).toBe(newParent)
  })

  test("rename command source delegates to repo.moveNodeWithRefs (no second engine)", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs")
    const src = readFileSync(join(__dirname, "..", "src", "commands", "rename.ts"), "utf8")
    expect(src).toContain('new Command("rename")')
    expect(src).toContain("moveNodeWithRefs")
    // Must NOT have its own custom engine — this is the L4 invariant.
    expect(src).not.toMatch(/repo\.moveNode\(/) // only moveNodeWithRefs allowed
  })
})
