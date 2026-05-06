/**
 * Unit tests for `km tasks --new` bead-frontmatter flags
 * (km-tasks.new-bead-flags).
 *
 * Exercises `planNewTask` — the pure planner that builds the
 * `Partial<KNode>` payload `tasks --new` hands to `repo.addNode`. Flags
 * cover `--type`, `--id`, `--aliases`, `--priority`, `--owner` so a task
 * can land with the same data-shape `bd create` produces, without
 * routing through bd.
 */

import { describe, expect, test } from "vitest"
import { planNewTask } from "../src/commands/tasks/mutations-plan.ts"

describe("planNewTask — defaults", () => {
  test("plain content produces a todo task with empty data when no flags", () => {
    const { node } = planNewTask("Fix the thing", {})
    expect(node.type).toBe("p")
    expect(node.item?.task?.status).toBe("todo")
    expect(node.item?.task?.marker).toBe("[ ]")
    expect(node.content).toBe("Fix the thing")
    expect(node.data).toEqual({})
    expect(node.assigned_to).toBeUndefined()
  })

  test("inline #P1 in content is preserved on data.tags via extractTags", () => {
    const { node } = planNewTask("Fix the thing #P1", {})
    const data = node.data as { tags?: string[] }
    expect(data.tags).toContain("P1")
  })
})

describe("planNewTask — --type", () => {
  test("type:bug appends #bug to data.tags", () => {
    const { node } = planNewTask("Fix the thing", { type: "bug" })
    const data = node.data as { tags: string[] }
    expect(data.tags).toContain("bug")
  })

  test("type:task is a no-op (task is the implicit default)", () => {
    const { node } = planNewTask("Fix the thing", { type: "task" })
    const data = node.data as { tags?: string[] }
    expect(data.tags ?? []).not.toContain("task")
  })

  test("type:Bug (case-insensitive) doesn't double-append over an existing #bug", () => {
    const { node } = planNewTask("Fix the thing #bug", { type: "Bug" })
    const data = node.data as { tags: string[] }
    expect(data.tags.filter((t) => t.toLowerCase() === "bug")).toHaveLength(1)
  })
})

describe("planNewTask — --id", () => {
  test("id @km/scope/foo lands on data.id with the sigil stripped", () => {
    const { node } = planNewTask("Foo", { id: "@km/scope/foo" })
    const data = node.data as { id: string }
    expect(data.id).toBe("scope/foo")
  })

  test("bare scope/foo lands verbatim", () => {
    const { node } = planNewTask("Foo", { id: "scope/foo" })
    const data = node.data as { id: string }
    expect(data.id).toBe("scope/foo")
  })

  test("foreign sigil @vault/scope/foo strips the sigil too", () => {
    const { node } = planNewTask("Foo", { id: "@vault/scope/foo" })
    const data = node.data as { id: string }
    expect(data.id).toBe("scope/foo")
  })
})

describe("planNewTask — --aliases", () => {
  test("aliases foo,bar,baz produces a 3-entry array", () => {
    const { node } = planNewTask("Foo", { aliases: "foo,bar,baz" })
    const data = node.data as { aliases: string[] }
    expect(data.aliases).toEqual(["foo", "bar", "baz"])
  })

  test("aliases trims whitespace and drops empty entries", () => {
    const { node } = planNewTask("Foo", { aliases: " foo , , bar " })
    const data = node.data as { aliases: string[] }
    expect(data.aliases).toEqual(["foo", "bar"])
  })
})

describe("planNewTask — --priority", () => {
  test("--priority P0 adds #P0 when no inline priority", () => {
    const { node } = planNewTask("Foo", { priority: "P0" })
    const data = node.data as { tags: string[] }
    expect(data.tags).toContain("P0")
  })

  test("--priority 1 normalizes to #P1", () => {
    const { node } = planNewTask("Foo", { priority: "1" })
    const data = node.data as { tags: string[] }
    expect(data.tags).toContain("P1")
  })

  test("--priority p2 normalizes to #P2 (case-insensitive)", () => {
    const { node } = planNewTask("Foo", { priority: "p2" })
    const data = node.data as { tags: string[] }
    expect(data.tags).toContain("P2")
  })

  test("inline priority survives even when --priority is omitted", () => {
    const { node } = planNewTask("Foo #P3", {})
    const data = node.data as { tags: string[] }
    expect(data.tags).toContain("P3")
  })
})

describe("planNewTask — --owner", () => {
  test("owner sets node.assigned_to", () => {
    const { node } = planNewTask("Foo", { owner: "alice" })
    expect(node.assigned_to).toBe("alice")
  })

  test("missing owner leaves assigned_to undefined", () => {
    const { node } = planNewTask("Foo", {})
    expect(node.assigned_to).toBeUndefined()
  })
})

describe("planNewTask — combined flags", () => {
  test("type + id + aliases + priority + owner all land together", () => {
    const { node } = planNewTask("Build something", {
      type: "feature",
      id: "@km/work/build",
      aliases: "alpha,beta",
      priority: "P0",
      owner: "alice",
    })
    const data = node.data as { tags: string[]; id: string; aliases: string[] }
    expect(data.tags).toContain("feature")
    expect(data.tags).toContain("P0")
    expect(data.id).toBe("work/build")
    expect(data.aliases).toEqual(["alpha", "beta"])
    expect(node.assigned_to).toBe("alice")
  })
})

describe("planNewTask — --due", () => {
  test("--due tmrw lands on node.due_at as tomorrow's ISO", () => {
    // Snapshot today's date so the assertion is stable regardless of when
    // the test runs. parseDate uses the system clock; we re-derive the
    // expected ISO here from `new Date()` for the same offset.
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const expected = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`

    const { node, errors } = planNewTask("Fix foo", { due: "tmrw" })
    expect(errors).toEqual([])
    expect(node.due_at).toBe(expected)
  })

  test("--due friday parses via chrono and lands on node.due_at", () => {
    const { node, errors } = planNewTask("Fix foo", { due: "friday" })
    expect(errors).toEqual([])
    expect(node.due_at).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  test("--due garbage returns an error, no due_at written", () => {
    const { node, errors } = planNewTask("Fix foo", { due: "garbage" })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/^--due:/)
    expect(node.due_at).toBeUndefined()
  })
})

describe("planNewTask — --start", () => {
  test("--start tmrw lands on node.start_at as tomorrow's ISO", () => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const expected = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`

    const { node, errors } = planNewTask("Foo", { start: "tmrw" })
    expect(errors).toEqual([])
    expect(node.start_at).toBe(expected)
  })

  test("--start friday parses via chrono and lands on node.start_at", () => {
    const { node, errors } = planNewTask("Foo", { start: "friday" })
    expect(errors).toEqual([])
    expect(node.start_at).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  test("--start garbage returns an error, no start_at written", () => {
    const { node, errors } = planNewTask("Foo", { start: "garbage" })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/^--start:/)
    expect(node.start_at).toBeUndefined()
  })
})
