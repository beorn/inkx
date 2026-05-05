/**
 * Unit tests for `apps/km-cli/src/commands/clear-plan.ts` — pure
 * planner for `km clear <id...> field...`. Same chain-immune
 * discipline as `set.test.ts` (no commander, no createTerm).
 */

import { describe, expect, test } from "vitest"
import { planClear } from "../src/commands/clear-plan.ts"

describe("planClear — single-field nulls", () => {
  test("`due` clears due_at", () => {
    const plan = planClear(["due"])
    expect(plan.warnings).toEqual([])
    expect(plan.updates.due_at).toBeNull()
  })

  test("`priority` clears priority", () => {
    const plan = planClear(["priority"])
    expect(plan.updates.priority).toBeNull()
  })

  test("`owner` aliases to assigned_to", () => {
    const plan = planClear(["owner"])
    expect(plan.updates.assigned_to).toBeNull()
  })

  test("unknown field → warning, no update", () => {
    const plan = planClear(["nosuchfield"])
    expect(plan.warnings.length).toBeGreaterThan(0)
    expect(Object.keys(plan.updates)).toEqual([])
  })
})

describe("planClear — bulk fields in one call", () => {
  test("multiple fields all clear", () => {
    const plan = planClear(["due", "priority", "owner"])
    expect(plan.updates.due_at).toBeNull()
    expect(plan.updates.priority).toBeNull()
    expect(plan.updates.assigned_to).toBeNull()
  })
})
