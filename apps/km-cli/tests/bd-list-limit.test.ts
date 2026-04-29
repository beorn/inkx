/**
 * Unit tests for `km bd list --limit N` flag handling.
 *
 * Targets the pure helpers `parseLimitFlag` and `applyLimit` extracted from
 * `bd.ts`. The CLI action layer is a thin wrapper that calls these directly,
 * so covering them covers the CLI behavior:
 *   - `--limit 3` on a 5-issue list → 3 items + "3 of 5" header
 *   - `--limit 100` on a 5-issue list → 5 items + "5" header (no truncation)
 *   - missing / 0 / negative / non-numeric → no limit
 */

import { describe, expect, test } from "vitest"
import { applyLimit, parseLimitFlag } from "../src/commands/bd.ts"

describe("parseLimitFlag", () => {
  test("returns 0 for undefined / null / empty string", () => {
    expect(parseLimitFlag(undefined)).toBe(0)
    expect(parseLimitFlag(null)).toBe(0)
    expect(parseLimitFlag("")).toBe(0)
  })

  test("parses positive integer strings", () => {
    expect(parseLimitFlag("3")).toBe(3)
    expect(parseLimitFlag("100")).toBe(100)
  })

  test("accepts numeric values directly", () => {
    expect(parseLimitFlag(5)).toBe(5)
  })

  test("returns 0 for zero / negative / non-numeric (treat as no limit)", () => {
    expect(parseLimitFlag("0")).toBe(0)
    expect(parseLimitFlag("-1")).toBe(0)
    expect(parseLimitFlag("abc")).toBe(0)
  })
})

describe("applyLimit", () => {
  const five = ["a", "b", "c", "d", "e"]

  test("limit < length truncates and reports 'X of Y'", () => {
    const { items, totalMsg } = applyLimit(five, 3)
    expect(items).toEqual(["a", "b", "c"])
    expect(totalMsg).toBe("3 of 5")
  })

  test("limit > length is a no-op and reports just the count", () => {
    const { items, totalMsg } = applyLimit(five, 100)
    expect(items).toEqual(five)
    expect(totalMsg).toBe("5")
  })

  test("limit === length is a no-op (no truncation message)", () => {
    const { items, totalMsg } = applyLimit(five, 5)
    expect(items).toEqual(five)
    expect(totalMsg).toBe("5")
  })

  test("limit === 0 means 'no limit' (matches parseLimitFlag's empty / invalid output)", () => {
    const { items, totalMsg } = applyLimit(five, 0)
    expect(items).toEqual(five)
    expect(totalMsg).toBe("5")
  })

  test("empty list reports '0' regardless of limit", () => {
    expect(applyLimit([], 3).totalMsg).toBe("0")
    expect(applyLimit([], 0).totalMsg).toBe("0")
  })
})
