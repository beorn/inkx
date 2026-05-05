/**
 * Unit tests for `apps/km-cli/src/commands/tasks/status-plan.ts` — the pure
 * planner extracted from `status.ts` so the (id, newStatus) → action
 * decision matrix can be exercised without booting the program.ts →
 * doctor.ts → @silvery/ag-react/ui chain.
 *
 * Tests import only the plan file (no commander, no createTerm, no
 * load-repo). The action handler in `status.ts` glues the planner to
 * repo I/O and terminal output.
 */

import { describe, expect, test } from "vitest"
import type { KNode, TaskStatus } from "@km/core"

import { planStatus, VALID_STATUSES } from "../src/commands/tasks/status-plan.ts"

function makeTask(opts: { id?: string; status?: TaskStatus; content?: string } = {}): KNode {
  const status = opts.status ?? "todo"
  const marker = status === "done" ? "[x]" : status === "wip" ? "[/]" : status === "blocked" ? "[!]" : "[ ]"
  return {
    id: opts.id ?? "task-1",
    type: "p",
    item: { list: "-", task: { marker, status } },
    content: opts.content ?? "task content",
    data: {},
    version: "v1",
  } as unknown as KNode
}

describe("planStatus — task not found", () => {
  test("null task → kind:not-found with the requested id", () => {
    const plan = planStatus(null, "missing-id", "todo")
    expect(plan.kind).toBe("not-found")
    if (plan.kind !== "not-found") return
    expect(plan.id).toBe("missing-id")
  })

  test("null task with no newStatus is also not-found (ID error wins)", () => {
    const plan = planStatus(null, "missing-id", undefined)
    expect(plan.kind).toBe("not-found")
  })
})

describe("planStatus — view mode (no newStatus)", () => {
  test("returns current status + marker + content", () => {
    const task = makeTask({ id: "abc", status: "wip", content: "in progress" })
    const plan = planStatus(task, "abc", undefined)
    expect(plan.kind).toBe("view")
    if (plan.kind !== "view") return
    expect(plan.status).toBe("wip")
    expect(plan.marker).toBe("[/]")
    expect(plan.content).toBe("in progress")
    expect(plan.id).toBe("abc")
  })

  test("missing task.item defaults to status=todo, marker='[ ]'", () => {
    const task = { id: "x", type: "p", content: "no item", data: {}, version: "v1" } as unknown as KNode
    const plan = planStatus(task, "x", undefined)
    expect(plan.kind).toBe("view")
    if (plan.kind !== "view") return
    expect(plan.status).toBe("todo")
    expect(plan.marker).toBe("[ ]")
  })

  test("missing content falls back to '(no content)'", () => {
    const task = makeTask({ content: undefined as unknown as string })
    // Force content to undefined
    const t = { ...task, content: undefined } as unknown as KNode
    const plan = planStatus(t, "abc", undefined)
    if (plan.kind !== "view") throw new Error("expected view")
    expect(plan.content).toBe("(no content)")
  })
})

describe("planStatus — set mode (valid newStatus)", () => {
  test("status:done returns the [x] marker", () => {
    const task = makeTask({ id: "abc", status: "todo" })
    const plan = planStatus(task, "abc", "done")
    expect(plan.kind).toBe("set")
    if (plan.kind !== "set") return
    expect(plan.status).toBe("done")
    expect(plan.marker).toBe("[x]")
    expect(plan.id).toBe("abc")
  })

  test("status:wip returns the [/] marker", () => {
    const task = makeTask({ status: "todo" })
    const plan = planStatus(task, task.id, "wip")
    if (plan.kind !== "set") throw new Error("expected set")
    expect(plan.marker).toBe("[/]")
  })

  test("status:blocked returns the [!] marker", () => {
    const task = makeTask({ status: "todo" })
    const plan = planStatus(task, task.id, "blocked")
    if (plan.kind !== "set") throw new Error("expected set")
    expect(plan.marker).toBe("[!]")
  })

  test("status:todo returns the [ ] marker", () => {
    const task = makeTask({ status: "wip" })
    const plan = planStatus(task, task.id, "todo")
    if (plan.kind !== "set") throw new Error("expected set")
    expect(plan.marker).toBe("[ ]")
  })

  test("status:dropped is accepted as a valid status", () => {
    const task = makeTask({ status: "todo" })
    const plan = planStatus(task, task.id, "dropped")
    expect(plan.kind).toBe("set")
  })
})

describe("planStatus — invalid newStatus", () => {
  test("nonsense status → kind:invalid-status with hint", () => {
    const task = makeTask()
    const plan = planStatus(task, task.id, "nonsense")
    expect(plan.kind).toBe("invalid-status")
    if (plan.kind !== "invalid-status") return
    expect(plan.given).toBe("nonsense")
    expect(plan.valid).toEqual(VALID_STATUSES)
  })

  test("typo'd status (e.g. 'WIP' uppercase) is rejected — case-sensitive", () => {
    const task = makeTask()
    const plan = planStatus(task, task.id, "WIP")
    expect(plan.kind).toBe("invalid-status")
  })
})

describe("planStatus — VALID_STATUSES surface", () => {
  test("VALID_STATUSES is the canonical set", () => {
    expect(VALID_STATUSES).toEqual(["todo", "wip", "blocked", "done", "dropped"])
  })
})
