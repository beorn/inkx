/**
 * Tests for the smart-hint surface — field-typo suggestion + single-
 * result tip session counter.
 *
 * Field-typo hint integrates with `set-plan.ts`, `clear-plan.ts`, and
 * the legacy `tasks/set-clear-plan.ts`. Tests pin the suggestion shape
 * for several typo→canonical pairs.
 *
 * Single-result tip suppression is verified via the counter file in a
 * temp dir (avoids touching `~/.local/state/km/`).
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"
import { planSet } from "../src/commands/set-plan.ts"
import { planClear } from "../src/commands/clear-plan.ts"
import { planSetFields, planClearFields } from "../src/commands/tasks/set-clear-plan.ts"
import { suggestField, levenshtein } from "../src/utils/levenshtein.ts"
import {
  shouldShowSingleResultTip,
  readSingleResultTipCount,
  resetSingleResultTipCount,
  SINGLE_RESULT_TIP_THRESHOLD,
} from "../src/utils/single-result-tip.ts"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): { dir: string; repo: Repo } {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-smart-hints-"))
  scratch.push(dir)
  const repo = runGenerator(createRepo(dir, { loadFiles: false }))
  return { dir, repo }
}

function addTask(repo: Repo, content: string): string {
  return repo.addNode(null, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content,
  })
}

// ---------------------------------------------------------------------------
// Levenshtein primitive
// ---------------------------------------------------------------------------

describe("levenshtein", () => {
  test("identical strings have distance 0", () => {
    expect(levenshtein("priority", "priority")).toBe(0)
  })

  test("case-insensitive — `Priority` matches `priority`", () => {
    expect(levenshtein("Priority", "priority")).toBe(0)
  })

  test("single-char swap = distance 2", () => {
    // `prioirty` ↔ `priority`: swap of `o` and `i` requires substitution
    // at positions 4 and 5 → distance 2 (not 1, because Levenshtein
    // doesn't have a "transposition" primitive — that's
    // Damerau-Levenshtein).
    expect(levenshtein("prioirty", "priority")).toBe(2)
  })

  test("single-char deletion = distance 1", () => {
    expect(levenshtein("priorty", "priority")).toBe(1)
  })

  test("empty input vs non-empty = length of non-empty", () => {
    expect(levenshtein("", "due")).toBe(3)
    expect(levenshtein("due", "")).toBe(3)
  })
})

describe("suggestField", () => {
  const ALL = ["priority", "due", "start", "owner", "status", "type", "parent", "aliases"] as const

  test("`prioirty` (transposition) suggests `priority` at distance 2", () => {
    expect(suggestField("prioirty", ALL)).toBe("priority")
  })

  test("`priorty` (deletion) suggests `priority`", () => {
    expect(suggestField("priorty", ALL)).toBe("priority")
  })

  test("`statu` (deletion) suggests `status` (closer than `start`)", () => {
    // `statu` ↔ `status`: 1 insertion. `statu` ↔ `start`: substitution
    // at 2 chars. Distance 1 < 2, so `status` wins unambiguously.
    expect(suggestField("statu", ALL)).toBe("status")
  })

  test("completely unrelated input returns null", () => {
    expect(suggestField("xyzzyfoobar", ALL)).toBe(null)
  })

  test("max-distance gate prevents weak matches", () => {
    // distance 3 — not close enough at default maxDistance=2
    expect(suggestField("xyzpriority", ALL)).toBe(null)
  })

  test("empty input returns null (no suggestion makes sense)", () => {
    expect(suggestField("", ALL)).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// Field-typo hint integration with set-plan.ts (top-level km set)
// ---------------------------------------------------------------------------

describe("planSet warnings include typo suggestions", () => {
  test("`prioirty:P0` warning includes `did you mean \\`priority\\``", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSet(repo, id, ["prioirty:P0"])
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]).toContain("Unknown field: prioirty")
    expect(plan.warnings[0]).toContain("did you mean `priority`")
  })

  test("`statu:done` warning suggests `status` (deletion typo)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSet(repo, id, ["statu:done"])
    expect(plan.warnings[0]).toContain("did you mean `status`")
  })

  test("known field `priority` produces no warning", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSet(repo, id, ["priority:P0"])
    expect(plan.warnings).toEqual([])
  })

  test("totally unknown field has no suggestion (just the bare unknown warning)", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSet(repo, id, ["xyzzyzz:foo"])
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]).toBe("Unknown field: xyzzyzz")
  })
})

// ---------------------------------------------------------------------------
// Field-typo hint integration with clear-plan.ts (top-level km clear)
// ---------------------------------------------------------------------------

describe("planClear warnings include typo suggestions", () => {
  test("`prioirty` typo suggests `priority`", () => {
    const plan = planClear(["prioirty"])
    expect(plan.warnings[0]).toContain("did you mean `priority`")
  })

  test("known field `due` produces no warning", () => {
    const plan = planClear(["due"])
    expect(plan.warnings).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Field-typo hint integration with legacy tasks/set-clear-plan.ts
// ---------------------------------------------------------------------------

describe("planSetFields warnings include typo suggestions", () => {
  test("`prioirty:P0` warning suggests `priority`", () => {
    const { repo } = freshRepo()
    const id = addTask(repo, "task")
    const plan = planSetFields(repo, id, ["prioirty:P0"])
    expect(plan.warnings[0]).toContain("did you mean `priority`")
  })
})

describe("planClearFields warnings include typo suggestions", () => {
  test("`prioirty` typo suggests `priority`", () => {
    const plan = planClearFields(["prioirty"])
    expect(plan.warnings[0]).toContain("did you mean `priority`")
  })
})

// ---------------------------------------------------------------------------
// Single-result tip session counter
// ---------------------------------------------------------------------------

describe("shouldShowSingleResultTip — session counter", () => {
  function freshCounter(): string {
    const dir = mkdtempSync(join(tmpdir(), "kmtest-tip-counter-"))
    scratch.push(dir)
    return join(dir, "single-result-tip-count")
  }

  test("first call returns true and writes count=1", () => {
    const path = freshCounter()
    expect(shouldShowSingleResultTip(path)).toBe(true)
    expect(readSingleResultTipCount(path)).toBe(1)
  })

  test(`shows tip up to ${SINGLE_RESULT_TIP_THRESHOLD} times, suppresses after`, () => {
    const path = freshCounter()
    for (let i = 0; i < SINGLE_RESULT_TIP_THRESHOLD; i++) {
      expect(shouldShowSingleResultTip(path)).toBe(true)
    }
    // Threshold reached — suppressed thereafter
    expect(shouldShowSingleResultTip(path)).toBe(false)
    expect(shouldShowSingleResultTip(path)).toBe(false)
  })

  test("resetSingleResultTipCount restores the tip", () => {
    const path = freshCounter()
    for (let i = 0; i < SINGLE_RESULT_TIP_THRESHOLD; i++) shouldShowSingleResultTip(path)
    expect(shouldShowSingleResultTip(path)).toBe(false)
    resetSingleResultTipCount(path)
    expect(shouldShowSingleResultTip(path)).toBe(true)
  })

  test("missing counter file = count is 0 (tip shows)", () => {
    const dir = mkdtempSync(join(tmpdir(), "kmtest-tip-missing-"))
    scratch.push(dir)
    // path that doesn't exist yet
    const path = join(dir, "non-existent")
    expect(readSingleResultTipCount(path)).toBe(0)
    expect(shouldShowSingleResultTip(path)).toBe(true)
  })
})
