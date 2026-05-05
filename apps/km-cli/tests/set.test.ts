/**
 * Unit tests for `apps/km-cli/src/commands/set-plan.ts` — the pure
 * planner for `km set <id...> field:value...`.
 *
 * Tests import only the plan file (no commander, no createTerm, no
 * load-repo). The action handler in `set.ts` glues the planner to repo
 * I/O and terminal rendering. Plan-only tests are chain-immune by
 * design — see `@km/cli/task-bd-collapse` Wave 4 acceptance criteria.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"
import { planSet } from "../src/commands/set-plan.ts"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): { dir: string; repo: Repo } {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-set-plan-"))
  scratch.push(dir)
  const repo = runGenerator(createRepo(dir, { loadFiles: false }))
  return { dir, repo }
}

function addNode(repo: Repo, parentId: string | null, content: string, data: Record<string, unknown> = {}): string {
  return repo.addNode(parentId, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content,
    data,
  })
}

describe("planSet — priority validation (P0..P4)", () => {
  test("priority:P0 is accepted and normalized to P0", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["priority:P0"])
    expect(plan.errors).toEqual([])
    expect(plan.updates.priority).toBe("P0")
  })

  test("priority:3 (no P prefix) is normalized to P3", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["priority:3"])
    expect(plan.errors).toEqual([])
    expect(plan.updates.priority).toBe("P3")
  })

  test("priority:P5 is rejected (out of P0..P4 range)", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["priority:P5"])
    expect(plan.errors.length).toBeGreaterThan(0)
    expect(plan.errors[0]).toContain("Invalid priority")
  })

  test("priority:high (non-numeric) is rejected", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["priority:high"])
    expect(plan.errors.length).toBeGreaterThan(0)
  })
})

describe("planSet — status validation", () => {
  test("status:done is accepted with marker emission", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["status:done"])
    expect(plan.errors).toEqual([])
    const item = plan.updates.item as { task: { status: string; marker: string } }
    expect(item.task.status).toBe("done")
    expect(item.task.marker).toBe("[x]")
  })

  test("status:bogus is rejected with descriptive error", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["status:bogus"])
    expect(plan.errors.length).toBeGreaterThan(0)
    expect(plan.errors[0]).toContain("Invalid status")
  })

  test("all five canonical statuses pass", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    for (const status of ["todo", "wip", "blocked", "done", "dropped"]) {
      const plan = planSet(repo, id, [`status:${status}`])
      expect(plan.errors).toEqual([])
    }
  })
})

describe("planSet — type validation against BEAD_TYPE_KEYWORDS", () => {
  test("type:bug is a known keyword (no warning)", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["type:bug"])
    expect(plan.errors).toEqual([])
    expect(plan.warnings).toEqual([])
    const data = plan.updates.data as { tags: string[] }
    expect(data.tags).toContain("bug")
  })

  test("type:nonsense triggers a warning (not an error)", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["type:nonsense"])
    // Warning, not error — types are extensible per `@km/cli/task-bd-collapse`
    expect(plan.errors).toEqual([])
    expect(plan.warnings.length).toBeGreaterThan(0)
    expect(plan.warnings[0]).toContain("Unknown type")
  })

  test("all canonical bead types are accepted", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    for (const t of ["bug", "feature", "epic", "task", "docs", "chore", "question"]) {
      const plan = planSet(repo, id, [`type:${t}`])
      expect(plan.warnings).toEqual([])
    }
  })
})

describe("planSet — parent: resolution", () => {
  test("parent:<existing-id> resolves to that id", () => {
    const { repo } = freshRepo()
    const parent = addNode(repo, null, "parent")
    const child = addNode(repo, null, "child")
    const plan = planSet(repo, child, [`parent:${parent}`])
    expect(plan.errors).toEqual([])
    expect(plan.newParentId).toBe(parent)
  })

  test("parent:<unknown> errors", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["parent:does-not-exist"])
    expect(plan.errors.length).toBeGreaterThan(0)
    expect(plan.errors[0]).toContain("Parent not found")
    expect(plan.newParentId).toBeUndefined()
  })
})

describe("planSet — aliases:", () => {
  test("aliases:foo,bar produces a 2-entry array", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["aliases:foo,bar"])
    const data = plan.updates.data as { aliases: string[] }
    expect(data.aliases).toEqual(["foo", "bar"])
  })

  test("aliases preserves sibling data keys (tags)", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task", { tags: ["bug", "P1"] })
    const plan = planSet(repo, id, ["aliases:x,y"])
    const data = plan.updates.data as Record<string, unknown>
    expect(data.aliases).toEqual(["x", "y"])
    expect(data.tags).toEqual(["bug", "P1"])
  })
})

describe("planSet — multi-field merging in one call", () => {
  test("type:bug + aliases:x,y + priority:P1 in one call merge correctly", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["type:bug", "aliases:x,y", "priority:P1"])
    expect(plan.errors).toEqual([])
    const data = plan.updates.data as Record<string, unknown>
    expect(data.tags).toEqual(["bug"])
    expect(data.aliases).toEqual(["x", "y"])
    expect(plan.updates.priority).toBe("P1")
  })

  test("scalar columns are populated from owner: alias", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["owner:beorn"])
    expect(plan.updates.assigned_to).toBe("beorn")
  })

  test("due: stores the value (ISO pass-through; chrono deferred to W7)", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["due:2026-05-10"])
    expect(plan.updates.due_at).toBe("2026-05-10")
  })
})

describe("planSet — invalid input", () => {
  test("missing colon → error", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["badformat"])
    expect(plan.errors.length).toBeGreaterThan(0)
    expect(plan.errors[0]).toContain("Invalid field format")
  })

  test("unknown field key → warning, not error", () => {
    const { repo } = freshRepo()
    const id = addNode(repo, null, "task")
    const plan = planSet(repo, id, ["nosuchfield:value"])
    expect(plan.errors).toEqual([])
    expect(plan.warnings[0]).toContain("Unknown field: nosuchfield")
  })
})
