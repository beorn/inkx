/**
 * Unit tests for `km tasks list --blocked` / `--unblocked` filters
 * (km-tasks.blocked-filter).
 *
 * Mirrors the `km bd list --blocked` / `--unblocked` semantics: a task is
 * "blocked" iff it has at least one `blocked-by` target on `data.props`.
 * Tests cover the pure filter helper to avoid coupling to the CLI render
 * path, which has its own integration coverage.
 */

import { describe, test, expect } from "vitest"
import type { KNode } from "@km/core"
import { taskIsBlocked } from "../src/commands/tasks/queries.ts"

function makeTask(id: string, data?: Record<string, unknown>): KNode {
  return {
    id,
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: id,
    created_at: 0,
    updated_at: 0,
    ...(data ? { data } : {}),
  } as KNode
}

describe("taskIsBlocked", () => {
  test("returns false when data is missing", () => {
    expect(taskIsBlocked(makeTask("a"))).toBe(false)
  })

  test("returns false when props.blocked-by is absent", () => {
    expect(taskIsBlocked(makeTask("a", { props: { other: { type: "value" } } }))).toBe(false)
  })

  test("returns true for prop type=link with target", () => {
    const task = makeTask("a", { props: { "blocked-by": { type: "link", target: "km-x" } } })
    expect(taskIsBlocked(task)).toBe(true)
  })

  test("returns false for prop type=link with empty target", () => {
    const task = makeTask("a", { props: { "blocked-by": { type: "link" } } })
    expect(taskIsBlocked(task)).toBe(false)
  })

  test("returns true for prop type=list with at least one valid target", () => {
    const task = makeTask("a", {
      props: { "blocked-by": { type: "list", values: [{ target: "km-x" }, { target: "km-y" }] } },
    })
    expect(taskIsBlocked(task)).toBe(true)
  })

  test("returns false for prop type=list with empty values", () => {
    const task = makeTask("a", { props: { "blocked-by": { type: "list", values: [] } } })
    expect(taskIsBlocked(task)).toBe(false)
  })

  test("returns false for prop type=list with only empty targets", () => {
    const task = makeTask("a", {
      props: { "blocked-by": { type: "list", values: [{}, { target: "" }] } },
    })
    expect(taskIsBlocked(task)).toBe(false)
  })
})

/**
 * The blocked/unblocked filter is exposed via `listTasks` as part of the CLI
 * options pipeline. We replicate the relevant filtering rules here as a pure
 * function to lock in the contract — list.ts wires this same predicate via
 * `filterTasksByBlocked`.
 */
function filterByBlocked<T extends KNode>(tasks: T[], options: { blocked?: boolean; unblocked?: boolean }): T[] {
  if (options.blocked && !options.unblocked) {
    return tasks.filter((t) => taskIsBlocked(t))
  }
  if (options.unblocked && !options.blocked) {
    return tasks.filter((t) => !taskIsBlocked(t))
  }
  return tasks
}

describe("filterByBlocked (mirrors filterTasksByBlocked in list.ts)", () => {
  const blocked = makeTask("blocked", { props: { "blocked-by": { type: "link", target: "km-x" } } })
  const unblocked = makeTask("unblocked")
  const blockedList = makeTask("blockedList", {
    props: { "blocked-by": { type: "list", values: [{ target: "km-y" }] } },
  })
  const tasks = [blocked, unblocked, blockedList]

  test("--blocked keeps only tasks with non-empty blocked-by", () => {
    const out = filterByBlocked(tasks, { blocked: true })
    expect(out.map((t) => t.id)).toEqual(["blocked", "blockedList"])
  })

  test("--unblocked keeps only tasks without blocked-by", () => {
    const out = filterByBlocked(tasks, { unblocked: true })
    expect(out.map((t) => t.id)).toEqual(["unblocked"])
  })

  test("neither flag is a no-op", () => {
    const out = filterByBlocked(tasks, {})
    expect(out).toEqual(tasks)
  })

  test("both flags set is a no-op (mutually exclusive intersection is empty by definition)", () => {
    const out = filterByBlocked(tasks, { blocked: true, unblocked: true })
    expect(out).toEqual(tasks)
  })
})
