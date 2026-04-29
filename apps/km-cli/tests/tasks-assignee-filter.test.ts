/**
 * Unit tests for `km tasks list --assignee <name>` filter helpers.
 *
 * Targets the pure helpers `filterTasksByAssignee` and `resolveAssigneeFilter`
 * exported from `apps/km-cli/src/commands/tasks/list.ts`. Mirrors the bd
 * `--assignee` semantics: case-insensitive exact match against `task.assigned_to`,
 * with the special value `me` resolving to `resolveAssignee()` (git user.name).
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest"
import type { KNode } from "@km/core"

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}))

import { execSync } from "node:child_process"
import { filterTasksByAssignee, resolveAssigneeFilter } from "../src/commands/tasks/list.ts"

const mockedExecSync = execSync as unknown as ReturnType<typeof vi.fn>

function task(assigned_to: string | undefined, content = "task"): KNode {
  return { id: content, content, assigned_to } as unknown as KNode
}

describe("filterTasksByAssignee", () => {
  const tasks: KNode[] = [task("alice", "a"), task("BJRN-stabell", "b"), task(undefined, "c"), task("bob", "d")]

  test("undefined filter returns input unchanged", () => {
    expect(filterTasksByAssignee(tasks, undefined)).toBe(tasks)
  })

  test("exact case-sensitive match", () => {
    const out = filterTasksByAssignee(tasks, "alice")
    expect(out.map((t) => t.content)).toEqual(["a"])
  })

  test("case-insensitive match", () => {
    const out = filterTasksByAssignee(tasks, "bjrn-stabell")
    expect(out.map((t) => t.content)).toEqual(["b"])
  })

  test("filter is case-insensitive on the input value too", () => {
    const out = filterTasksByAssignee(tasks, "ALICE")
    expect(out.map((t) => t.content)).toEqual(["a"])
  })

  test("no match returns empty array", () => {
    expect(filterTasksByAssignee(tasks, "nobody")).toEqual([])
  })

  test("tasks with no assigned_to never match", () => {
    expect(filterTasksByAssignee(tasks, "")).toBe(tasks) // empty string treated as no filter
    const out = filterTasksByAssignee(tasks, "alice")
    expect(out.every((t) => (t.assigned_to ?? "").toLowerCase() === "alice")).toBe(true)
  })

  test("partial match does NOT match (semantics are exact)", () => {
    const out = filterTasksByAssignee(tasks, "ali")
    expect(out).toEqual([])
  })
})

describe("resolveAssigneeFilter", () => {
  const originalUser = process.env.USER

  beforeEach(() => {
    mockedExecSync.mockReset()
  })

  afterEach(() => {
    if (originalUser === undefined) {
      delete process.env.USER
    } else {
      process.env.USER = originalUser
    }
  })

  test("undefined passes through as undefined", () => {
    expect(resolveAssigneeFilter(undefined)).toBeUndefined()
  })

  test("empty string passes through as undefined (treated as no filter)", () => {
    expect(resolveAssigneeFilter("")).toBeUndefined()
  })

  test("plain name passes through verbatim", () => {
    expect(resolveAssigneeFilter("alice")).toBe("alice")
    expect(resolveAssigneeFilter("BJRN-stabell")).toBe("BJRN-stabell")
  })

  test("'me' resolves to current git user (kebab-cased)", () => {
    mockedExecSync.mockReturnValue("Bjørn Stabell\n")
    expect(resolveAssigneeFilter("me")).toBe("bjrn-stabell")
  })

  test("'ME' (any case) resolves to current user", () => {
    mockedExecSync.mockReturnValue("Alice\n")
    expect(resolveAssigneeFilter("ME")).toBe("alice")
    mockedExecSync.mockReturnValue("Alice\n")
    expect(resolveAssigneeFilter("Me")).toBe("alice")
  })

  test("'me' falls back to env.USER when git unavailable", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("git not found")
    })
    process.env.USER = "beorn"
    expect(resolveAssigneeFilter("me")).toBe("beorn")
  })

  test("a literal name 'me-something' is NOT treated as the special value", () => {
    expect(resolveAssigneeFilter("me-bot")).toBe("me-bot")
  })
})
