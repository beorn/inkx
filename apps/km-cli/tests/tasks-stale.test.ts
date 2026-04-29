/**
 * Unit tests for `km tasks stale` filter logic and relative-time formatting.
 *
 * The CLI handler (`listStaleTasks`) does I/O; the testable core is `filterStaleTasks`
 * which takes an injected `now` so we can pin time deterministically.
 */

import { describe, test, expect } from "vitest"
import type { KNode, TaskStatus } from "@km/core"

import { filterStaleTasks, formatStaleness } from "../src/commands/tasks/stale.ts"

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

describe("filterStaleTasks", () => {
  test("excludes tasks newer than threshold (default 14 days)", () => {
    const tasks = [
      makeTask({ ageDays: 0, content: "fresh" }),
      makeTask({ ageDays: 7, content: "1-week-old" }),
      makeTask({ ageDays: 13, content: "just-under-14d" }),
    ]
    const result = filterStaleTasks(tasks, 14, NOW)
    expect(result).toEqual([])
  })

  test("includes tasks older than threshold", () => {
    const tasks = [
      makeTask({ ageDays: 15, content: "15d-old" }),
      makeTask({ ageDays: 30, content: "30d-old" }),
      makeTask({ ageDays: 90, content: "90d-old" }),
    ]
    const result = filterStaleTasks(tasks, 14, NOW)
    expect(result.map((t) => t.content)).toEqual(["15d-old", "30d-old", "90d-old"])
  })

  test("days=0 includes only tasks updated before today (everything but fresh-now)", () => {
    // Threshold = NOW - 0 = NOW. Anything with updated_at < NOW is stale.
    const tasks = [
      makeTask({ ageDays: 0, content: "right-now" }), // updated_at == NOW → not strictly less than → excluded
      makeTask({ ageDays: 1, content: "1d-old" }),
      makeTask({ ageDays: 5, content: "5d-old" }),
    ]
    const result = filterStaleTasks(tasks, 0, NOW)
    expect(result.map((t) => t.content)).toEqual(["1d-old", "5d-old"])
  })

  test("excludes done and dropped tasks regardless of age", () => {
    const tasks = [
      makeTask({ ageDays: 100, status: "done", content: "old-done" }),
      makeTask({ ageDays: 100, status: "dropped" as TaskStatus, content: "old-dropped" }),
      makeTask({ ageDays: 100, status: "todo", content: "old-todo" }),
    ]
    const result = filterStaleTasks(tasks, 14, NOW)
    expect(result.map((t) => t.content)).toEqual(["old-todo"])
  })

  test("includes blocked and wip tasks", () => {
    const tasks = [
      makeTask({ ageDays: 30, status: "blocked", content: "blocked-task" }),
      makeTask({ ageDays: 30, status: "wip", content: "wip-task" }),
      makeTask({ ageDays: 30, status: "todo", content: "todo-task" }),
    ]
    const result = filterStaleTasks(tasks, 14, NOW)
    expect(result.map((t) => t.content)).toEqual(["blocked-task", "wip-task", "todo-task"])
  })

  test("default 14d threshold separates 13d (excluded) from 15d (included)", () => {
    // Verifies the documented default.
    const tasks = [
      makeTask({ ageDays: 13, content: "thirteen" }),
      makeTask({ ageDays: 14, content: "fourteen" }),
      makeTask({ ageDays: 15, content: "fifteen" }),
    ]
    const result = filterStaleTasks(tasks, 14, NOW)
    // 14d-old has updated_at == NOW - 14d == threshold → not strictly less than → excluded
    expect(result.map((t) => t.content)).toEqual(["fifteen"])
  })

  test("custom days=30 threshold", () => {
    const tasks = [makeTask({ ageDays: 20, content: "twenty" }), makeTask({ ageDays: 35, content: "thirty-five" })]
    const result = filterStaleTasks(tasks, 30, NOW)
    expect(result.map((t) => t.content)).toEqual(["thirty-five"])
  })

  test("missing updated_at treated as 0 (always stale)", () => {
    const t = {
      id: "no-ts",
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "no timestamp",
      data: {},
      created_at: NOW,
      version: "v1",
    } as unknown as KNode
    const result = filterStaleTasks([t], 14, NOW)
    expect(result).toHaveLength(1)
  })
})

describe("formatStaleness", () => {
  test("today for ages under 1 day", () => {
    expect(formatStaleness(NOW, NOW)).toBe("today")
    expect(formatStaleness(NOW - DAY_MS / 2, NOW)).toBe("today")
  })

  test("singular and plural days", () => {
    expect(formatStaleness(NOW - 1 * DAY_MS, NOW)).toBe("1 day ago")
    expect(formatStaleness(NOW - 5 * DAY_MS, NOW)).toBe("5 days ago")
    expect(formatStaleness(NOW - 13 * DAY_MS, NOW)).toBe("13 days ago")
  })

  test("weeks for 14-59 day ages", () => {
    expect(formatStaleness(NOW - 14 * DAY_MS, NOW)).toBe("2 weeks ago")
    expect(formatStaleness(NOW - 21 * DAY_MS, NOW)).toBe("3 weeks ago")
  })

  test("months for 60-729 day ages", () => {
    expect(formatStaleness(NOW - 60 * DAY_MS, NOW)).toBe("2 months ago")
    expect(formatStaleness(NOW - 365 * DAY_MS, NOW)).toBe("12 months ago")
  })

  test("years for 730+ day ages", () => {
    expect(formatStaleness(NOW - 730 * DAY_MS, NOW)).toBe("2 years ago")
  })
})
