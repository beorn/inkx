/**
 * Unit tests for `km tasks set <id> field:value`'s extended bead-frontmatter
 * fields (km-tasks.set-bead-fields).
 *
 * Mirrors `bd update --type / --parent / --aliases` semantics on the lower-
 * level `tasks set` surface so users can edit any task without falling back
 * to bd. Tests exercise the planning function directly (`planSetFields`) so
 * we don't have to spin up commander; the function carries all the side-
 * effect routing the action handler executes.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"
import { planSetFields } from "../src/commands/tasks/set-clear-plan.ts"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): { dir: string; repo: Repo } {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-tasks-set-"))
  scratch.push(dir)
  const repo = runGenerator(createRepo(dir, { loadFiles: false }))
  return { dir, repo }
}

function addTask(repo: Repo, parentId: string | null, content: string, data: Record<string, unknown> = {}): string {
  return repo.addNode(parentId, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content,
    data,
  })
}

describe("planSetFields — type:<value>", () => {
  test("type:bug appends #bug to data.tags (clean state)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task")
    const plan = planSetFields(repo, id, ["type:bug"])
    expect(plan.errors).toEqual([])
    const data = plan.updates.data as { tags: string[] }
    expect(data.tags).toContain("bug")
  })

  test("type:bug strips an existing #feature tag (no accumulation)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task", { tags: ["feature", "P1"] })
    const plan = planSetFields(repo, id, ["type:bug"])
    const tags = (plan.updates.data as { tags: string[] }).tags
    expect(tags).toContain("bug")
    expect(tags).not.toContain("feature")
    // Priority tag survives.
    expect(tags).toContain("P1")
  })

  test("type:task is a no-op for the tag (task is the implicit default)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task", { tags: ["bug", "P0"] })
    const plan = planSetFields(repo, id, ["type:task"])
    const tags = (plan.updates.data as { tags: string[] }).tags
    expect(tags).not.toContain("task")
    expect(tags).not.toContain("bug")
    expect(tags).toContain("P0")
  })

  test("empty type: clears all type tags", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task", { tags: ["bug", "P2"] })
    const plan = planSetFields(repo, id, ["type:"])
    const tags = (plan.updates.data as { tags: string[] }).tags
    expect(tags).toEqual(["P2"])
  })

  test("type:<value> preserves sibling data keys (aliases, props)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task", { aliases: ["foo"], props: { x: 1 } })
    const plan = planSetFields(repo, id, ["type:bug"])
    const data = plan.updates.data as Record<string, unknown>
    expect(data.aliases).toEqual(["foo"])
    expect(data.props).toEqual({ x: 1 })
  })
})

describe("planSetFields — parent:<ref>", () => {
  test("parent:<existing-id> resolves the new parent id", () => {
    const { repo } = freshRepo()
    const parent = addTask(repo, null, "parent")
    const child = addTask(repo, null, "child")
    const plan = planSetFields(repo, child, [`parent:${parent}`])
    expect(plan.errors).toEqual([])
    expect(plan.newParentId).toBe(parent)
  })

  test("parent:<unknown> errors", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task")
    const plan = planSetFields(repo, id, ["parent:does-not-exist"])
    expect(plan.errors.length).toBeGreaterThan(0)
    expect(plan.errors[0]).toContain("Parent not found")
    expect(plan.newParentId).toBeUndefined()
  })

  test("parent: (empty) errors", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task")
    const plan = planSetFields(repo, id, ["parent:"])
    expect(plan.errors.length).toBeGreaterThan(0)
  })
})

describe("planSetFields — aliases:<list>", () => {
  test("aliases:foo,bar produces a 2-entry array", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task")
    const plan = planSetFields(repo, id, ["aliases:foo,bar"])
    expect(plan.errors).toEqual([])
    expect((plan.updates.data as { aliases: string[] }).aliases).toEqual(["foo", "bar"])
  })

  test("aliases trims whitespace and drops empty entries", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task")
    const plan = planSetFields(repo, id, ["aliases: foo , , bar "])
    expect((plan.updates.data as { aliases: string[] }).aliases).toEqual(["foo", "bar"])
  })

  test("aliases preserves sibling data keys (tags)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task", { tags: ["bug", "P1"] })
    const plan = planSetFields(repo, id, ["aliases:foo,bar"])
    const data = plan.updates.data as Record<string, unknown>
    expect(data.aliases).toEqual(["foo", "bar"])
    expect(data.tags).toEqual(["bug", "P1"])
  })

  test("type:bug + aliases:x,y in one call merge into a single data update", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task")
    const plan = planSetFields(repo, id, ["type:bug", "aliases:x,y"])
    const data = plan.updates.data as Record<string, unknown>
    expect(data.tags).toEqual(["bug"])
    expect(data.aliases).toEqual(["x", "y"])
  })
})

describe("planSetFields — invalid input", () => {
  test("missing colon → error, not warning", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task")
    const plan = planSetFields(repo, id, ["badformat"])
    expect(plan.errors.length).toBeGreaterThan(0)
    expect(plan.errors[0]).toContain("Invalid field format")
  })

  test("unknown key → warning, not error", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, null, "task")
    const plan = planSetFields(repo, id, ["nosuchfield:value"])
    expect(plan.errors).toEqual([])
    expect(plan.warnings[0]).toContain("Unknown field: nosuchfield")
  })
})
