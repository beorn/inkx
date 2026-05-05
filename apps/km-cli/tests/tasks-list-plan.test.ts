/**
 * Unit tests for `apps/km-cli/src/commands/tasks/list-plan.ts` — the pure
 * planner extracted from `list.ts` so the filter / resolve matrix can be
 * exercised without booting the program.ts → doctor.ts →
 * @silvery/ag-react/ui/progress chain at module-load time.
 *
 * These tests import only the plan file (no commander, no createTerm, no
 * load-repo). The action handler in `list.ts` glues the planner to repo
 * I/O and terminal rendering.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator, type KNode } from "@km/core"
import { createRepo, type Repo } from "@km/storage"
import {
  filterTasksByAssignee,
  filterTasksByBlocked,
  filterTasksByPriority,
  filterTasksByStatus,
  planList,
} from "../src/commands/tasks/list-plan.ts"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): { dir: string; repo: Repo } {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-tasks-list-plan-"))
  scratch.push(dir)
  const repo = runGenerator(createRepo(dir, { loadFiles: false }))
  return { dir, repo }
}

function addTask(
  repo: Repo,
  parentId: string | null,
  content: string,
  opts: {
    status?: "todo" | "wip" | "done" | "blocked" | "dropped"
    assigned?: string
    priority?: string
  } = {},
): string {
  const status = opts.status ?? "todo"
  const marker = status === "done" ? "[x]" : status === "wip" ? "[/]" : status === "blocked" ? "[!]" : "[ ]"
  const data: Record<string, unknown> = {}
  if (opts.priority) data.tags = [opts.priority]
  return repo.addNode(parentId, {
    type: "p",
    item: { list: "-", task: { marker, status } },
    content,
    data,
    ...(opts.assigned ? { assigned_to: opts.assigned } : {}),
  })
}

/** Helper: synthesize a free-floating KNode for filter-only tests. */
function makeTask(
  opts: {
    status?: "todo" | "wip" | "done" | "blocked" | "dropped"
    assigned?: string
    priority?: string
    blockedBy?: string[]
  } = {},
): KNode {
  const status = opts.status ?? "todo"
  const marker = status === "done" ? "[x]" : status === "wip" ? "[/]" : status === "blocked" ? "[!]" : "[ ]"
  const data: Record<string, unknown> = {}
  if (opts.priority) data.tags = [opts.priority]
  if (opts.blockedBy && opts.blockedBy.length > 0) {
    // Mirror Task.isBlocked's expected shape: { type: "list", values: [{ target }] }.
    data.props = {
      "blocked-by": {
        type: "list",
        values: opts.blockedBy.map((target) => ({ target })),
      },
    }
  }
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    type: "p",
    item: { list: "-", task: { marker, status } },
    content: "task",
    data,
    assigned_to: opts.assigned,
    version: "v1",
  } as unknown as KNode
}

describe("filterTasksByStatus", () => {
  test("excludes done by default (excludeDone mode)", () => {
    const tasks = [
      makeTask({ status: "todo" }),
      makeTask({ status: "wip" }),
      makeTask({ status: "done" }),
      makeTask({ status: "blocked" }),
    ]
    const result = filterTasksByStatus(tasks, {})
    expect(result.map((t) => t.item?.task?.status)).toEqual(["todo", "wip", "blocked"])
  })

  test("status:<x> filter keeps only that status", () => {
    const tasks = [makeTask({ status: "todo" }), makeTask({ status: "wip" }), makeTask({ status: "done" })]
    const result = filterTasksByStatus(tasks, { status: "wip" })
    expect(result).toHaveLength(1)
    expect(result[0]?.item?.task?.status).toBe("wip")
  })

  test("--all keeps every status", () => {
    const tasks = [makeTask({ status: "todo" }), makeTask({ status: "done" }), makeTask({ status: "dropped" })]
    expect(filterTasksByStatus(tasks, { all: true })).toHaveLength(3)
  })

  test("active mode keeps only todo+wip", () => {
    const tasks = [
      makeTask({ status: "todo" }),
      makeTask({ status: "wip" }),
      makeTask({ status: "blocked" }),
      makeTask({ status: "done" }),
    ]
    const result = filterTasksByStatus(tasks, {}, "active")
    expect(result.map((t) => t.item?.task?.status)).toEqual(["todo", "wip"])
  })
})

describe("filterTasksByPriority", () => {
  test("undefined priority → list passes through", () => {
    const tasks = [makeTask({ priority: "P1" }), makeTask({ priority: "P2" })]
    expect(filterTasksByPriority(tasks, undefined)).toBe(tasks)
  })

  test("normalizes 'p1' / 'P1' / '1' to P1", () => {
    const tasks = [makeTask({ priority: "P1" }), makeTask({ priority: "P2" })]
    expect(filterTasksByPriority(tasks, "p1")).toHaveLength(1)
    expect(filterTasksByPriority(tasks, "P1")).toHaveLength(1)
    expect(filterTasksByPriority(tasks, "1")).toHaveLength(1)
  })

  test("invalid priority matches nothing (typo surfaces as no results)", () => {
    const tasks = [makeTask({ priority: "P1" }), makeTask({ priority: "P2" })]
    expect(filterTasksByPriority(tasks, "P9")).toEqual([])
  })
})

describe("filterTasksByBlocked", () => {
  test("--blocked keeps only blocked tasks", () => {
    const tasks = [makeTask({ blockedBy: ["x"] }), makeTask()]
    const result = filterTasksByBlocked(tasks, { blocked: true })
    expect(result).toHaveLength(1)
  })

  test("--unblocked keeps only un-blocked tasks", () => {
    const tasks = [makeTask({ blockedBy: ["x"] }), makeTask()]
    const result = filterTasksByBlocked(tasks, { unblocked: true })
    expect(result).toHaveLength(1)
  })

  test("both flags → no filter (empty intersection ergonomic short-circuit)", () => {
    const tasks = [makeTask({ blockedBy: ["x"] }), makeTask()]
    const result = filterTasksByBlocked(tasks, { blocked: true, unblocked: true })
    expect(result).toHaveLength(2)
  })
})

describe("filterTasksByAssignee", () => {
  test("undefined assignee → list passes through", () => {
    const tasks = [makeTask({ assigned: "alice" })]
    expect(filterTasksByAssignee(tasks, undefined)).toBe(tasks)
  })

  test("case-insensitive exact match", () => {
    const tasks = [makeTask({ assigned: "Alice" }), makeTask({ assigned: "BOB" })]
    expect(filterTasksByAssignee(tasks, "alice")).toHaveLength(1)
    expect(filterTasksByAssignee(tasks, "BOB")).toHaveLength(1)
  })

  test("no match → empty list", () => {
    const tasks = [makeTask({ assigned: "alice" })]
    expect(filterTasksByAssignee(tasks, "nobody")).toEqual([])
  })
})

describe("planList — global mode (no positional, no query)", () => {
  test("returns all active tasks by default (excludes done)", () => {
    const { repo } = freshRepo()
    addTask(repo, null, "todo-task", { status: "todo" })
    addTask(repo, null, "wip-task", { status: "wip" })
    addTask(repo, null, "done-task", { status: "done" })

    const plan = planList(repo, {})
    expect(plan.kind).toBe("list")
    if (plan.kind !== "list") return
    expect(plan.tasks.map((t) => t.content)).toEqual(["todo-task", "wip-task"])
    expect(plan.rootNode).toBeNull()
    expect(plan.pathFilter).toBeNull()
  })

  test("--all includes done", () => {
    const { repo } = freshRepo()
    addTask(repo, null, "todo-task", { status: "todo" })
    addTask(repo, null, "done-task", { status: "done" })

    const plan = planList(repo, { all: true })
    if (plan.kind !== "list") throw new Error("expected list plan")
    expect(plan.tasks).toHaveLength(2)
  })

  test("--status filter pins one status", () => {
    const { repo } = freshRepo()
    addTask(repo, null, "todo-task", { status: "todo" })
    addTask(repo, null, "wip-task", { status: "wip" })

    const plan = planList(repo, { status: "wip" })
    if (plan.kind !== "list") throw new Error("expected list plan")
    expect(plan.tasks.map((t) => t.content)).toEqual(["wip-task"])
  })

  test("--priority + --status compose", () => {
    const { repo } = freshRepo()
    addTask(repo, null, "p1-todo", { status: "todo", priority: "P1" })
    addTask(repo, null, "p2-todo", { status: "todo", priority: "P2" })
    addTask(repo, null, "p1-wip", { status: "wip", priority: "P1" })

    const plan = planList(repo, { priority: "P1", status: "todo" })
    if (plan.kind !== "list") throw new Error("expected list plan")
    expect(plan.tasks.map((t) => t.content)).toEqual(["p1-todo"])
  })

  test("--assignee + --status compose", () => {
    const { repo } = freshRepo()
    addTask(repo, null, "alice-todo", { status: "todo", assigned: "alice" })
    addTask(repo, null, "bob-todo", { status: "todo", assigned: "bob" })
    addTask(repo, null, "alice-done", { status: "done", assigned: "alice" })

    const plan = planList(repo, { assignee: "alice" })
    if (plan.kind !== "list") throw new Error("expected list plan")
    // default excludes done → only alice-todo
    expect(plan.tasks.map((t) => t.content)).toEqual(["alice-todo"])
  })
})

describe("planList — query mode", () => {
  test("--query treats arg as repo.query()", () => {
    const { repo } = freshRepo()
    addTask(repo, null, "alpha", { status: "todo" })
    addTask(repo, null, "beta", { status: "wip" })

    const plan = planList(repo, { query: "alpha" })
    if (plan.kind !== "list") throw new Error("expected list plan")
    expect(plan.rootNode).toBeNull()
    expect(plan.pathFilter).toBeNull()
    // The query results depend on full-text indexing, so we don't pin the
    // count — but we DO pin that the plan kind is `list` and metadata is right.
    expect(Array.isArray(plan.tasks)).toBe(true)
  })

  test("query-like positional (starts with '@') routes through query path", () => {
    const { repo } = freshRepo()
    addTask(repo, null, "alpha", { status: "todo" })

    const plan = planList(repo, { pathOrId: "@nonexistent" })
    expect(plan.kind).toBe("list")
    if (plan.kind !== "list") return
    expect(plan.rootNode).toBeNull()
    // pathFilter is null because the query branch wins for query-like inputs.
    expect(plan.pathFilter).toBeNull()
  })
})

describe("planList — path-or-id mode", () => {
  test("non-existent positional becomes a path filter", () => {
    const { repo } = freshRepo()
    addTask(repo, null, "alpha")

    const plan = planList(repo, { pathOrId: "nonexistent-path" })
    if (plan.kind !== "list") throw new Error("expected list plan")
    expect(plan.pathFilter).toBe("nonexistent-path")
    expect(plan.rootNode).toBeNull()
  })
})
