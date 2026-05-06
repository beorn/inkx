/**
 * Unit tests for `apps/km-cli/src/commands/stale-plan.ts` — generic
 * stale-node planner. Like `tasks/stale-plan.ts` but accepts any node
 * type and respects container exclusion.
 */

import { describe, expect, test } from "vitest"
import type { KNode, TaskStatus } from "@km/core"
import { DEFAULT_DAYS, planStale, filterStaleNodes } from "../src/commands/stale-plan.ts"

const DAY_MS = 86_400_000
const NOW = 1_745_000_000_000

function makeNode(opts: { id?: string; type?: string; status?: TaskStatus; ageDays: number; content?: string }): KNode {
  const updated = NOW - opts.ageDays * DAY_MS
  const item =
    opts.status !== undefined
      ? {
          list: "-",
          task: {
            marker:
              opts.status === "done"
                ? "[x]"
                : opts.status === "wip"
                  ? "[/]"
                  : opts.status === "blocked"
                    ? "[!]"
                    : opts.status === "dropped"
                      ? "[-]"
                      : "[ ]",
            status: opts.status,
          },
        }
      : undefined
  return {
    id: opts.id ?? `n-${Math.random().toString(36).slice(2, 8)}`,
    type: opts.type ?? "p",
    item,
    content: opts.content ?? `node age=${opts.ageDays}d`,
    data: {},
    created_at: updated,
    updated_at: updated,
    version: "v1",
  } as unknown as KNode
}

describe("planStale (generic km) — threshold semantics", () => {
  test("days=undefined falls back to DEFAULT_DAYS (14)", () => {
    const plan = planStale([], undefined, NOW)
    expect(plan.days).toBe(DEFAULT_DAYS)
    expect(plan.cutoff).toBe(NOW - 14 * DAY_MS)
  })

  test("strict less-than: nodes at exactly threshold are NOT stale", () => {
    const nodes = [makeNode({ ageDays: 14, content: "exactly-14d" })]
    const plan = planStale(nodes, 14, NOW)
    expect(plan.rows).toEqual([])
  })

  test("nodes older than threshold appear with relative-time staleness", () => {
    const nodes = [makeNode({ ageDays: 15, content: "15d" }), makeNode({ ageDays: 60, content: "60d" })]
    const plan = planStale(nodes, 14, NOW)
    expect(plan.rows).toHaveLength(2)
    expect(plan.rows[0]?.staleness).toBe("2 weeks ago")
    expect(plan.rows[1]?.staleness).toBe("2 months ago")
  })
})

describe("planStale (generic km) — non-task nodes included", () => {
  test("non-task nodes (notes, sections) ARE included", () => {
    const nodes = [
      makeNode({ ageDays: 30, type: "p", content: "old-note" }),
      makeNode({ ageDays: 30, type: "section", content: "old-section" }),
    ]
    const plan = planStale(nodes, 14, NOW)
    expect(plan.rows.map((r) => r.node.content)).toEqual(["old-note", "old-section"])
  })

  test("done/dropped tasks are still excluded (finished, not stale)", () => {
    const nodes = [
      makeNode({ ageDays: 100, status: "done" as TaskStatus, content: "done-old" }),
      makeNode({ ageDays: 100, status: "dropped" as TaskStatus, content: "dropped-old" }),
      makeNode({ ageDays: 100, status: "todo" as TaskStatus, content: "todo-old" }),
      makeNode({ ageDays: 100, type: "p", content: "note-old" }),
    ]
    const plan = planStale(nodes, 14, NOW)
    expect(plan.rows.map((r) => r.node.content)).toEqual(["todo-old", "note-old"])
  })
})

describe("planStale (generic km) — container filter", () => {
  test("folder/file containers are excluded by default", () => {
    const nodes = [
      makeNode({ ageDays: 30, type: "folder", content: "old-folder" }),
      makeNode({ ageDays: 30, type: "file", content: "old-file" }),
      makeNode({ ageDays: 30, type: "p", content: "old-note" }),
    ]
    const plan = planStale(nodes, 14, NOW)
    expect(plan.rows.map((r) => r.node.content)).toEqual(["old-note"])
  })

  test("includeContainers=true brings folders + files back in", () => {
    const nodes = [
      makeNode({ ageDays: 30, type: "folder", content: "old-folder" }),
      makeNode({ ageDays: 30, type: "p", content: "old-note" }),
    ]
    const plan = planStale(nodes, 14, NOW, { includeContainers: true })
    expect(plan.rows.map((r) => r.node.content)).toEqual(["old-folder", "old-note"])
  })
})

describe("filterStaleNodes — direct contract", () => {
  test("returns only nodes with updated_at < cutoff", () => {
    const nodes = [makeNode({ ageDays: 5, content: "fresh" }), makeNode({ ageDays: 30, content: "stale" })]
    const result = filterStaleNodes(nodes, 14, NOW)
    expect(result.map((n) => n.content)).toEqual(["stale"])
  })
})
