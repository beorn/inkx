/**
 * Display-format tests for `km task set` / `km task clear`
 * (@km/cli/tasks-set-display-normalization).
 *
 * Two layers, mirroring the planner-vs-action split:
 *
 *   1. `planSetFields` populates `humanized: { due_at: "tomorrow", ... }`
 *      for every date field that flows through `parseDate` so the
 *      action handler can render `due: 2026-05-06 (tomorrow)` without
 *      re-parsing.
 *   2. `formatSetUpdates` / `formatClearKeys` (the pure display layer
 *      extracted from the action handler) turn that plan into the
 *      header + indented detail lines pinned by the bead's target
 *      output.
 *
 * Wave 7 commit ec8249bb1 added the planner-side parsing; this bead
 * wires the user-visible echo through. The acceptance bullet from the
 * bead pins all four trigger phrases (`tmrw`, weekday, `eod`,
 * `start:+2w`) plus a clear-side header check.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"
import { planSetFields } from "../src/commands/tasks/set-clear-plan.ts"
import { formatSetUpdates, formatClearKeys } from "../src/commands/tasks/set-clear-display.ts"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): { dir: string; repo: Repo } {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-tasks-display-"))
  scratch.push(dir)
  const repo = runGenerator(createRepo(dir, { loadFiles: false }))
  return { dir, repo }
}

function addTask(repo: Repo, content: string): string {
  return repo.addNode(null, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content,
  })
}

describe("planSetFields — humanized date labels", () => {
  test("due:tmrw → humanized.due_at = 'tomorrow'", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["due:tmrw"])
    expect(plan.errors).toEqual([])
    expect(plan.humanized.due_at).toBe("tomorrow")
    // ISO is also captured — both sides of the parse get persisted.
    expect(plan.updates.due_at).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  test("due:eod → humanized.due_at contains 'end of day'", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["due:eod"])
    expect(plan.errors).toEqual([])
    expect(plan.humanized.due_at).toContain("end of day")
  })

  test("due:friday → humanized echoes 'friday' (chrono pass-through)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["due:friday"])
    expect(plan.errors).toEqual([])
    expect(plan.humanized.due_at).toBe("friday")
  })

  test("start:+2w → humanized.start_at = 'in 2 weeks'", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["start:+2w"])
    expect(plan.errors).toEqual([])
    expect(plan.humanized.start_at).toBe("in 2 weeks")
  })

  test("priority:P1 leaves humanized empty (non-date scalar)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["priority:P1"])
    expect(plan.humanized).toEqual({})
  })

  test("ISO due:2026-05-10 → humanized echoes the ISO (no surprise translation)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["due:2026-05-10"])
    expect(plan.humanized.due_at).toBe("2026-05-10")
    expect(plan.updates.due_at).toBe("2026-05-10")
  })

  test("multi-field set populates humanized for every date column independently", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["due:tmrw", "start:+3d", "priority:P0"])
    expect(plan.errors).toEqual([])
    expect(plan.humanized.due_at).toBe("tomorrow")
    expect(plan.humanized.start_at).toBe("in 3 days")
    // priority does not flow through parseDate.
    expect(plan.humanized.priority).toBeUndefined()
  })
})

describe("formatSetUpdates — header + detail rendering", () => {
  test("due:tmrw renders `Updated due:` header + `due: <iso> (tomorrow)` detail", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["due:tmrw"])
    const fmt = formatSetUpdates(plan)
    expect(fmt.header).toBe("Updated due:")
    expect(fmt.details).toHaveLength(1)
    // Format must include both the ISO date AND the humanized label.
    expect(fmt.details[0]).toMatch(/^due: \d{4}-\d{2}-\d{2} \(tomorrow\)$/)
  })

  test("due:friday → `due: <iso> (friday)` (weekday name preserved)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["due:friday"])
    const fmt = formatSetUpdates(plan)
    expect(fmt.details[0]).toMatch(/^due: \d{4}-\d{2}-\d{2} \(friday\)$/)
  })

  test("due:eod → `(end of day ...)` label preserved", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["due:eod"])
    const fmt = formatSetUpdates(plan)
    expect(fmt.details[0]).toMatch(/^due: \d{4}-\d{2}-\d{2} \(end of day/)
  })

  test("start:+2w → `start: <iso> (in 2 weeks)`", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["start:+2w"])
    const fmt = formatSetUpdates(plan)
    expect(fmt.header).toBe("Updated start:")
    expect(fmt.details[0]).toMatch(/^start: \d{4}-\d{2}-\d{2} \(in 2 weeks\)$/)
  })

  test("ISO due:2026-05-10 — humanized matches value → no `(ISO)` suffix duplication", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["due:2026-05-10"])
    const fmt = formatSetUpdates(plan)
    // No parenthetical because humanized === iso. Avoids `due: 2026-05-10 (2026-05-10)`.
    expect(fmt.details[0]).toBe("due: 2026-05-10")
  })

  test("priority:P1 (non-date scalar) renders without parenthetical", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["priority:P1"])
    const fmt = formatSetUpdates(plan)
    expect(fmt.header).toBe("Updated priority:")
    expect(fmt.details).toEqual(["priority: P1"])
  })

  test("owner:beorn renders display key as `owner` (not `assigned_to`)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["owner:beorn"])
    const fmt = formatSetUpdates(plan)
    expect(fmt.header).toBe("Updated owner:")
    expect(fmt.details).toEqual(["owner: beorn"])
  })

  test("multi-field set lists all keys in header and details in input order", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["due:tmrw", "priority:P1"])
    const fmt = formatSetUpdates(plan)
    expect(fmt.header).toBe("Updated due, priority:")
    expect(fmt.details).toHaveLength(2)
    expect(fmt.details[0]).toMatch(/^due: /)
    expect(fmt.details[1]).toBe("priority: P1")
  })

  test("status:done expands the `item` column into a `status:` detail", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["status:done"])
    const fmt = formatSetUpdates(plan)
    expect(fmt.header).toBe("Updated status:")
    expect(fmt.details).toEqual(["status: done"])
  })

  test("type:bug expands the `data` column into a `tags:` detail", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["type:bug"])
    const fmt = formatSetUpdates(plan)
    expect(fmt.header).toBe("Updated tags:")
    expect(fmt.details).toEqual(["tags: bug"])
  })

  test("aliases:foo,bar expands `data` into `aliases:` detail", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["aliases:foo,bar"])
    const fmt = formatSetUpdates(plan)
    expect(fmt.header).toBe("Updated aliases:")
    expect(fmt.details).toEqual(["aliases: foo, bar"])
  })
})

describe("formatClearKeys — display labels for clear", () => {
  test("`due` → `due` (already the display name)", () => {
    expect(formatClearKeys(["due"])).toBe("due")
  })

  test("`assigned` → `owner` (display alias)", () => {
    expect(formatClearKeys(["assigned"])).toBe("owner")
  })

  test("multiple fields render comma-separated", () => {
    expect(formatClearKeys(["due", "priority"])).toBe("due, priority")
  })

  test("unknown field falls through verbatim (lower-cased)", () => {
    expect(formatClearKeys(["NoSuchField"])).toBe("nosuchfield")
  })
})
