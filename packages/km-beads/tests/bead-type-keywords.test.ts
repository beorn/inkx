/**
 * BEAD_TYPE_KEYWORDS — pin the canonical list shape.
 *
 * Single source of truth for the bead type keyword whitelist. Pinned by
 * this test so future drift between the runtime list, its TypeScript
 * union, and the `BEAD_TYPE_KEYWORD_SET` lookup is impossible to
 * introduce silently.
 *
 * Bead: `@km/beads/bead-type-keywords-shared-constant` (L4).
 *
 * Drift incident: prior to consolidation
 *   - `set-clear-plan.ts` accepted `bug feature epic task docs chore`
 *   - `queries.ts` accepted     `bug feature epic task docs question`
 * The two lists silently disagreed; the constant + this test pin it.
 *
 * If a new keyword is needed:
 *   1. add it to `BEAD_TYPE_KEYWORDS` in `src/types.ts`
 *   2. update `docs/future/beads.md` "Issue Type Tags"
 *   3. update the canonical list and counts in this test
 */

import { describe, expect, test } from "vitest"
import { BEAD_TYPE_KEYWORDS, BEAD_TYPE_KEYWORD_SET, isBeadTypeKeyword } from "../src/types.ts"

describe("BEAD_TYPE_KEYWORDS — canonical shape", () => {
  // Spell out the expected value so a careless reorder fails loudly.
  const CANONICAL = ["bug", "feature", "epic", "task", "docs", "chore", "question"] as const

  test("contains the canonical keywords in the canonical order", () => {
    expect([...BEAD_TYPE_KEYWORDS]).toStrictEqual([...CANONICAL])
  })

  test("length matches CANONICAL exactly (no silent additions or removals)", () => {
    expect(BEAD_TYPE_KEYWORDS.length).toBe(CANONICAL.length)
  })

  test("every keyword is lowercased ASCII (no whitespace, no sigils)", () => {
    for (const k of BEAD_TYPE_KEYWORDS) {
      expect(k).toMatch(/^[a-z]+$/)
    }
  })

  test("contains both `chore` and `question` (the previously-drifting pair)", () => {
    expect(BEAD_TYPE_KEYWORDS).toContain("chore")
    expect(BEAD_TYPE_KEYWORDS).toContain("question")
  })

  test("BEAD_TYPE_KEYWORD_SET membership matches the array", () => {
    for (const k of BEAD_TYPE_KEYWORDS) {
      expect(BEAD_TYPE_KEYWORD_SET.has(k)).toBe(true)
    }
    expect(BEAD_TYPE_KEYWORD_SET.size).toBe(BEAD_TYPE_KEYWORDS.length)
  })

  test("no duplicates (Set size == array length)", () => {
    expect(new Set(BEAD_TYPE_KEYWORDS).size).toBe(BEAD_TYPE_KEYWORDS.length)
  })
})

describe("isBeadTypeKeyword — type guard", () => {
  test("accepts every canonical keyword (lowercased)", () => {
    for (const k of BEAD_TYPE_KEYWORDS) {
      expect(isBeadTypeKeyword(k)).toBe(true)
    }
  })

  test("accepts canonical keywords case-insensitively", () => {
    expect(isBeadTypeKeyword("BUG")).toBe(true)
    expect(isBeadTypeKeyword("Feature")).toBe(true)
    expect(isBeadTypeKeyword("EpiC")).toBe(true)
  })

  test("rejects unknown labels", () => {
    expect(isBeadTypeKeyword("urgent")).toBe(false)
    expect(isBeadTypeKeyword("frontend")).toBe(false)
    expect(isBeadTypeKeyword("P0")).toBe(false)
    expect(isBeadTypeKeyword("")).toBe(false)
  })

  test("rejects sigil-prefixed forms (caller must strip `#` first)", () => {
    expect(isBeadTypeKeyword("#bug")).toBe(false)
    expect(isBeadTypeKeyword("#feature")).toBe(false)
  })
})
