/**
 * Unit tests for `km tasks list --priority <value>`
 * (km-tasks.priority-filter).
 *
 * Mirrors the `km bd list --priority` flag: any of P0..P4 / p0..p4 / 0..4 is
 * accepted and canonicalized to `P${digit}` before being matched against the
 * task's `priority` column. Invalid input (anything not normalizable) matches
 * nothing — surfacing a typo as "no results" rather than silently passing
 * through every task.
 *
 * The shared canonicalizer (`normalizePriority` in @km/beads) is exercised
 * directly because both the create-side tag and the list-side filter depend
 * on it. The list-side filter helper is module-local in
 * `apps/km-cli/src/commands/tasks/list.ts`; we replicate its semantics here as
 * a pure function to lock in the contract — same pattern as
 * `tasks-blocked-filter.test.ts` / `filterByBlocked`.
 */

import { describe, test, expect } from "vitest"
import { type KNode, getNodePriority } from "@km/core"
import { normalizePriority } from "@km/beads"

function makeTask(id: string, priority?: string): KNode {
  // priority via data.tags (column dropped at SCHEMA_VERSION=11)
  return {
    id,
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: id,
    created_at: 0,
    updated_at: 0,
    ...(priority !== undefined ? { data: { tags: [priority] } } : {}),
  } as unknown as KNode
}

describe("normalizePriority", () => {
  test("accepts canonical P0..P4", () => {
    expect(normalizePriority("P0")).toBe("P0")
    expect(normalizePriority("P1")).toBe("P1")
    expect(normalizePriority("P2")).toBe("P2")
    expect(normalizePriority("P3")).toBe("P3")
    expect(normalizePriority("P4")).toBe("P4")
  })

  test("accepts lowercase p0..p4", () => {
    expect(normalizePriority("p0")).toBe("P0")
    expect(normalizePriority("p4")).toBe("P4")
  })

  test("accepts bare digits 0..4", () => {
    expect(normalizePriority("0")).toBe("P0")
    expect(normalizePriority("1")).toBe("P1")
    expect(normalizePriority("2")).toBe("P2")
    expect(normalizePriority("3")).toBe("P3")
    expect(normalizePriority("4")).toBe("P4")
  })

  test("rejects out-of-range digits", () => {
    expect(normalizePriority("5")).toBe(null)
    expect(normalizePriority("P5")).toBe(null)
    expect(normalizePriority("9")).toBe(null)
  })

  test("rejects non-numeric inputs", () => {
    expect(normalizePriority("high")).toBe(null)
    expect(normalizePriority("foo")).toBe(null)
    expect(normalizePriority("PP1")).toBe(null)
    expect(normalizePriority("P10")).toBe(null)
  })

  test("returns null for empty / undefined / null", () => {
    expect(normalizePriority(undefined)).toBe(null)
    expect(normalizePriority(null)).toBe(null)
    expect(normalizePriority("")).toBe(null)
  })
})

/**
 * Mirrors `filterTasksByPriority` in `apps/km-cli/src/commands/tasks/list.ts`:
 * - undefined → no filter (return verbatim)
 * - normalizable → keep only tasks with matching canonical priority
 * - unnormalizable (e.g. "high", "P5") → match nothing
 */
function filterByPriority<T extends KNode>(tasks: T[], priority: string | undefined): T[] {
  if (priority === undefined) return tasks
  const normalized = normalizePriority(priority)
  if (normalized === null) return []
  return tasks.filter((t) => getNodePriority(t) === normalized)
}

describe("filterByPriority (mirrors filterTasksByPriority in list.ts)", () => {
  const p0 = makeTask("p0", "P0")
  const p1 = makeTask("p1", "P1")
  const p2a = makeTask("p2a", "P2")
  const p2b = makeTask("p2b", "P2")
  const p3 = makeTask("p3", "P3")
  const p4 = makeTask("p4", "P4")
  const noPriority = makeTask("none")
  const tasks = [p0, p1, p2a, p2b, p3, p4, noPriority]

  test("undefined leaves the list untouched", () => {
    expect(filterByPriority(tasks, undefined)).toEqual(tasks)
  })

  test("--priority P0 keeps only P0 tasks", () => {
    expect(filterByPriority(tasks, "P0").map((t) => t.id)).toEqual(["p0"])
  })

  test("--priority P1 keeps only P1 tasks", () => {
    expect(filterByPriority(tasks, "P1").map((t) => t.id)).toEqual(["p1"])
  })

  test("--priority P2 keeps all P2 tasks", () => {
    expect(filterByPriority(tasks, "P2").map((t) => t.id)).toEqual(["p2a", "p2b"])
  })

  test("--priority P3 keeps only P3 tasks", () => {
    expect(filterByPriority(tasks, "P3").map((t) => t.id)).toEqual(["p3"])
  })

  test("--priority P4 keeps only P4 tasks", () => {
    expect(filterByPriority(tasks, "P4").map((t) => t.id)).toEqual(["p4"])
  })

  test("bare integer 0 is canonicalized to P0", () => {
    expect(filterByPriority(tasks, "0").map((t) => t.id)).toEqual(["p0"])
  })

  test("bare integer 2 is canonicalized to P2", () => {
    expect(filterByPriority(tasks, "2").map((t) => t.id)).toEqual(["p2a", "p2b"])
  })

  test("lowercase p1 matches P1 tasks (case-insensitive)", () => {
    expect(filterByPriority(tasks, "p1").map((t) => t.id)).toEqual(["p1"])
  })

  test("invalid priority returns no tasks (typo surfaces as empty result)", () => {
    expect(filterByPriority(tasks, "high")).toEqual([])
    expect(filterByPriority(tasks, "P5")).toEqual([])
    expect(filterByPriority(tasks, "9")).toEqual([])
  })

  test("tasks without priority never match a priority filter", () => {
    expect(filterByPriority([noPriority], "P2")).toEqual([])
  })
})
