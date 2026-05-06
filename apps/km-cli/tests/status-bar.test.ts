/**
 * Unit tests for the `bun km task` status-bar header.
 *
 * The formatter is pure (no repo, no terminal, no clock magic) so
 * every variation can be pinned without booting program.ts. Tests
 * cover counts, format string, ISO-Monday week boundary, edge cases
 * (zero workspace, only-closed-this-week, mixed status), and the
 * legacy `closed_at: number` shape.
 */

import { describe, expect, test } from "vitest"
import type { KNode } from "@km/core"
import {
  buildStatusBar,
  computeStatusBarCounts,
  formatStatusBar,
  startOfWeekMonday,
} from "../src/commands/tasks/status-bar.ts"

/** Build a free-floating task KNode with the given status + optional closed_at. */
function makeTask(opts: {
  status?: "todo" | "wip" | "blocked" | "done" | "dropped"
  closedAt?: string | number | null | undefined
}): KNode {
  const status = opts.status ?? "todo"
  const marker =
    status === "done" ? "[x]" : status === "wip" ? "[/]" : status === "blocked" ? "[!]" : status === "dropped" ? "[-]" : "[ ]"
  const data: Record<string, unknown> = {}
  if (opts.closedAt !== undefined) data.closed_at = opts.closedAt
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    type: "p",
    item: { list: "-", task: { marker, status } },
    content: "task",
    data,
    version: "v1",
  } as unknown as KNode
}

describe("startOfWeekMonday", () => {
  test("Monday at noon → Monday at 00:00", () => {
    // 2026-05-04 is a Monday.
    const d = new Date(2026, 4, 4, 12, 0, 0)
    const m = startOfWeekMonday(d)
    expect(m.getDay()).toBe(1)
    expect(m.getHours()).toBe(0)
    expect(m.getMinutes()).toBe(0)
    expect(m.getDate()).toBe(4)
  })

  test("Wednesday → previous Monday", () => {
    const d = new Date(2026, 4, 6, 15, 30) // Wed 2026-05-06
    const m = startOfWeekMonday(d)
    expect(m.getDay()).toBe(1)
    expect(m.getDate()).toBe(4)
  })

  test("Sunday → previous Monday (ISO week, NOT US week)", () => {
    // Sun 2026-05-10 → previous Monday is 2026-05-04.
    const d = new Date(2026, 4, 10, 23, 59)
    const m = startOfWeekMonday(d)
    expect(m.getDay()).toBe(1)
    expect(m.getDate()).toBe(4)
  })

  test("crosses month boundary cleanly", () => {
    // Tue 2026-06-02 → Mon 2026-06-01.
    const d = new Date(2026, 5, 2, 9)
    const m = startOfWeekMonday(d)
    expect(m.getMonth()).toBe(5)
    expect(m.getDate()).toBe(1)
  })
})

describe("computeStatusBarCounts", () => {
  const wednesday = new Date(2026, 4, 6, 12) // Wed 2026-05-06
  const lastWeek = new Date(2026, 3, 28).toISOString() // Tue prior week
  const thisMonday = new Date(2026, 4, 4, 1).toISOString() // Mon 2026-05-04 01:00
  const yesterday = new Date(2026, 4, 5, 14).toISOString() // Tue 2026-05-05 14:00

  test("counts open tasks split by status", () => {
    const tasks = [
      makeTask({ status: "todo" }),
      makeTask({ status: "todo" }),
      makeTask({ status: "wip" }),
      makeTask({ status: "blocked" }),
    ]
    const counts = computeStatusBarCounts(tasks, wednesday)
    expect(counts).toEqual({
      open: 4,
      wip: 1,
      blocked: 1,
      todo: 2,
      closedThisWeek: 0,
    })
  })

  test("done + dropped tasks don't count as open", () => {
    const tasks = [
      makeTask({ status: "done", closedAt: yesterday }),
      makeTask({ status: "dropped", closedAt: yesterday }),
      makeTask({ status: "todo" }),
    ]
    const counts = computeStatusBarCounts(tasks, wednesday)
    expect(counts.open).toBe(1)
    expect(counts.todo).toBe(1)
    expect(counts.closedThisWeek).toBe(2)
  })

  test("closedThisWeek includes Monday 00:00 boundary", () => {
    const tasks = [
      makeTask({ status: "done", closedAt: thisMonday }),
      makeTask({ status: "done", closedAt: lastWeek }),
    ]
    const counts = computeStatusBarCounts(tasks, wednesday)
    expect(counts.closedThisWeek).toBe(1)
  })

  test("legacy closed_at: number (Date.now()) is honored", () => {
    const tasks = [makeTask({ status: "done", closedAt: new Date(2026, 4, 5).getTime() })]
    const counts = computeStatusBarCounts(tasks, wednesday)
    expect(counts.closedThisWeek).toBe(1)
  })

  test("missing / unparseable closed_at on done task → not counted", () => {
    const tasks = [
      makeTask({ status: "done", closedAt: undefined }),
      makeTask({ status: "done", closedAt: "not-a-date" }),
      makeTask({ status: "done", closedAt: null }),
    ]
    const counts = computeStatusBarCounts(tasks, wednesday)
    expect(counts.closedThisWeek).toBe(0)
  })

  test("empty workspace → all zeros", () => {
    const counts = computeStatusBarCounts([], wednesday)
    expect(counts).toEqual({ open: 0, wip: 0, blocked: 0, todo: 0, closedThisWeek: 0 })
  })
})

describe("formatStatusBar", () => {
  test("canonical example — full breakdown", () => {
    const line = formatStatusBar(
      { open: 12, wip: 3, blocked: 2, todo: 7, closedThisWeek: 4 },
      "@km",
    )
    expect(line).toBe("@km — 12 open (3 wip · 2 blocked · 7 todo) — 4 closed this week")
  })

  test("only one bucket present — drops the empties from the breakdown", () => {
    const line = formatStatusBar({ open: 5, wip: 0, blocked: 0, todo: 5, closedThisWeek: 0 }, "@km")
    expect(line).toBe("@km — 5 open (5 todo) — 0 closed this week")
  })

  test("zero open, some closed-this-week — drops the breakdown entirely", () => {
    const line = formatStatusBar({ open: 0, wip: 0, blocked: 0, todo: 0, closedThisWeek: 4 }, "@km")
    expect(line).toBe("@km — 0 open — 4 closed this week")
  })

  test("totally empty workspace → empty string (header is suppressed)", () => {
    const line = formatStatusBar({ open: 0, wip: 0, blocked: 0, todo: 0, closedThisWeek: 0 }, "@km")
    expect(line).toBe("")
  })

  test("respects the scope label — @decker, @pim, etc.", () => {
    const counts = { open: 3, wip: 0, blocked: 0, todo: 3, closedThisWeek: 0 }
    expect(formatStatusBar(counts, "@decker")).toBe("@decker — 3 open (3 todo) — 0 closed this week")
    expect(formatStatusBar(counts, "@pim")).toBe("@pim — 3 open (3 todo) — 0 closed this week")
  })

  test("breakdown order is wip → blocked → todo (engineer's priority)", () => {
    const line = formatStatusBar({ open: 6, wip: 1, blocked: 2, todo: 3, closedThisWeek: 0 }, "@km")
    expect(line).toBe("@km — 6 open (1 wip · 2 blocked · 3 todo) — 0 closed this week")
    // Order check: wip before blocked, blocked before todo.
    const wipIdx = line.indexOf("wip")
    const blockedIdx = line.indexOf("blocked")
    const todoIdx = line.indexOf("todo")
    expect(wipIdx).toBeLessThan(blockedIdx)
    expect(blockedIdx).toBeLessThan(todoIdx)
  })
})

describe("buildStatusBar — end-to-end shape", () => {
  test("matches the canonical bead example", () => {
    const wednesday = new Date(2026, 4, 6, 12)
    const yesterday = new Date(2026, 4, 5, 14).toISOString()
    const tasks: KNode[] = [
      ...Array.from({ length: 3 }, () => makeTask({ status: "wip" })),
      ...Array.from({ length: 2 }, () => makeTask({ status: "blocked" })),
      ...Array.from({ length: 7 }, () => makeTask({ status: "todo" })),
      ...Array.from({ length: 4 }, () => makeTask({ status: "done", closedAt: yesterday })),
    ]
    expect(buildStatusBar(tasks, wednesday, "@km")).toBe(
      "@km — 12 open (3 wip · 2 blocked · 7 todo) — 4 closed this week",
    )
  })
})
