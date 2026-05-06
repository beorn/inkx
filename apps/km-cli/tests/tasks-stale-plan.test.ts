/**
 * Unit tests for `apps/km-cli/src/commands/tasks/stale-plan.ts` — the
 * pure planner extracted from `stale.ts` so the (allTasks, days, now) →
 * { rows, cutoff } pipeline can be exercised without booting the
 * program.ts → doctor.ts → @silvery/ag-react/ui chain.
 *
 * Tests import only the plan file (no commander, no createTerm, no
 * load-repo). The action handler in `stale.ts` glues the planner to
 * repo I/O and terminal output. These tests complement the existing
 * `tasks-stale.test.ts` which targets the underlying `filterStaleTasks`
 * + `formatStaleness` helpers; this file targets the new `planStale`
 * shape (rows + cutoff + default-days resolution).
 */

import { describe, expect, test } from "vitest"
import type { KNode, TaskStatus } from "@km/core"

import { DEFAULT_DAYS, planStale } from "../src/commands/tasks/stale-plan.ts"

const DAY_MS = 86_400_000
const NOW = 1_745_000_000_000 // arbitrary fixed "now" for determinism

function makeTask(opts: { id?: string; status?: TaskStatus; ageDays: number; content?: string }): KNode {
  const status = opts.status ?? "todo"
  const marker = status === "done" ? "[x]" : status === "wip" ? "[/]" : status === "blocked" ? "[!]" : "[ ]"
  const updated = NOW - opts.ageDays * DAY_MS
  return {
    id: opts.id ?? `task-${Math.random().toString(36).slice(2, 8)}`,
    type: "p",
    item: { list: "-", task: { marker, status } },
    content: opts.content ?? `task age=${opts.ageDays}d`,
    data: {},
    created_at: updated,
    updated_at: updated,
    version: "v1",
  } as unknown as KNode
}

describe("planStale — cutoff math", () => {
  test("days=14 produces cutoff = NOW - 14*DAY_MS", () => {
    const plan = planStale([], 14, NOW)
    expect(plan.cutoff).toBe(NOW - 14 * DAY_MS)
    expect(plan.days).toBe(14)
  })

  test("days=30 produces cutoff = NOW - 30*DAY_MS", () => {
    const plan = planStale([], 30, NOW)
    expect(plan.cutoff).toBe(NOW - 30 * DAY_MS)
    expect(plan.days).toBe(30)
  })

  test("days=undefined falls back to DEFAULT_DAYS (14)", () => {
    const plan = planStale([], undefined, NOW)
    expect(plan.days).toBe(DEFAULT_DAYS)
    expect(plan.days).toBe(14)
    expect(plan.cutoff).toBe(NOW - 14 * DAY_MS)
  })
})

describe("planStale — at/above/below threshold", () => {
  test("tasks newer than threshold are excluded", () => {
    const tasks = [
      makeTask({ ageDays: 0, content: "fresh" }),
      makeTask({ ageDays: 7, content: "1-week-old" }),
      makeTask({ ageDays: 13, content: "13d-old" }),
    ]
    const plan = planStale(tasks, 14, NOW)
    expect(plan.rows).toEqual([])
  })

  test("tasks at threshold (updated_at == cutoff) are excluded — strict <", () => {
    // ageDays:14 → updated_at == NOW - 14*DAY_MS == cutoff → not strictly less than → excluded
    const tasks = [makeTask({ ageDays: 14, content: "exactly-14d" })]
    const plan = planStale(tasks, 14, NOW)
    expect(plan.rows).toEqual([])
  })

  test("tasks older than threshold appear in rows with relative-time staleness", () => {
    const tasks = [makeTask({ ageDays: 15, content: "15d-old" }), makeTask({ ageDays: 30, content: "30d-old" })]
    const plan = planStale(tasks, 14, NOW)
    expect(plan.rows).toHaveLength(2)
    expect(plan.rows[0]?.task.content).toBe("15d-old")
    // 15 >= 14 → weeks branch: floor(15/7) = 2 → "2 weeks ago"
    expect(plan.rows[0]?.staleness).toBe("2 weeks ago")
    expect(plan.rows[1]?.task.content).toBe("30d-old")
    // floor(30/7) = 4 → "4 weeks ago"
    expect(plan.rows[1]?.staleness).toBe("4 weeks ago")
  })
})

describe("planStale — input order preserved (no sort)", () => {
  test("rows mirror the input task order", () => {
    // Order: 60d, 20d, 100d → preserved (NOT sorted by age)
    const tasks = [
      makeTask({ ageDays: 60, content: "sixty" }),
      makeTask({ ageDays: 20, content: "twenty" }),
      makeTask({ ageDays: 100, content: "hundred" }),
    ]
    const plan = planStale(tasks, 14, NOW)
    expect(plan.rows.map((r) => r.task.content)).toEqual(["sixty", "twenty", "hundred"])
  })
})

describe("planStale — status filter (open only)", () => {
  test("done/dropped tasks excluded regardless of age", () => {
    const tasks = [
      makeTask({ ageDays: 100, status: "done", content: "old-done" }),
      makeTask({ ageDays: 100, status: "dropped" as TaskStatus, content: "old-dropped" }),
      makeTask({ ageDays: 100, status: "todo", content: "old-todo" }),
      makeTask({ ageDays: 100, status: "wip", content: "old-wip" }),
      makeTask({ ageDays: 100, status: "blocked", content: "old-blocked" }),
    ]
    const plan = planStale(tasks, 14, NOW)
    expect(plan.rows.map((r) => r.task.content)).toEqual(["old-todo", "old-wip", "old-blocked"])
  })
})
