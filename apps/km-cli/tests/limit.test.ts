/**
 * Unit tests for the shared `--limit` flag helpers.
 *
 * Covers parseLimitFlag (string, number, edge cases) and applyLimit
 * (truncation, no-op, identity-preserve when not limiting).
 */

import { describe, test, expect } from "vitest"

import { parseLimitFlag, applyLimit } from "../src/utils/limit.ts"

describe("parseLimitFlag", () => {
  test("returns positive int for valid string input", () => {
    expect(parseLimitFlag("5")).toBe(5)
    expect(parseLimitFlag("100")).toBe(100)
  })

  test("returns positive int for valid number input", () => {
    expect(parseLimitFlag(5)).toBe(5)
    expect(parseLimitFlag(100)).toBe(100)
  })

  test("returns 0 for missing/undefined input", () => {
    expect(parseLimitFlag(undefined)).toBe(0)
    expect(parseLimitFlag(null)).toBe(0)
  })

  test("returns 0 for zero", () => {
    expect(parseLimitFlag("0")).toBe(0)
    expect(parseLimitFlag(0)).toBe(0)
  })

  test("returns 0 for negative values", () => {
    expect(parseLimitFlag("-1")).toBe(0)
    expect(parseLimitFlag("-100")).toBe(0)
    expect(parseLimitFlag(-1)).toBe(0)
  })

  test("returns 0 for non-numeric string", () => {
    expect(parseLimitFlag("foo")).toBe(0)
    expect(parseLimitFlag("")).toBe(0)
    expect(parseLimitFlag("abc")).toBe(0)
  })

  test("returns 0 for non-string non-number input", () => {
    expect(parseLimitFlag({})).toBe(0)
    expect(parseLimitFlag([])).toBe(0)
    expect(parseLimitFlag(true)).toBe(0)
  })

  test("floors fractional values", () => {
    expect(parseLimitFlag("3.7")).toBe(3)
    expect(parseLimitFlag(3.7)).toBe(3)
  })

  test("returns 0 for NaN / Infinity", () => {
    expect(parseLimitFlag(Number.NaN)).toBe(0)
    expect(parseLimitFlag(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe("applyLimit", () => {
  const items = [1, 2, 3, 4, 5]

  test("truncates when limit < length and reports 'X of Y'", () => {
    expect(applyLimit(items, 3)).toEqual({ items: [1, 2, 3], totalMsg: "3 of 5" })
  })

  test("returns full list when limit === length, plain count", () => {
    expect(applyLimit(items, 5)).toEqual({ items: [1, 2, 3, 4, 5], totalMsg: "5" })
  })

  test("returns full list when limit > length, plain count", () => {
    expect(applyLimit(items, 100)).toEqual({ items: [1, 2, 3, 4, 5], totalMsg: "5" })
  })

  test("returns original array reference when limit === 0 (no copy)", () => {
    const result = applyLimit(items, 0)
    expect(result.items).toBe(items)
    expect(result.totalMsg).toBe("5")
  })

  test("returns original array reference when limit < 0 (no copy)", () => {
    const result = applyLimit(items, -1)
    expect(result.items).toBe(items)
    expect(result.totalMsg).toBe("5")
  })

  test("returns a new array (not original) when truncating", () => {
    const result = applyLimit(items, 3)
    expect(result.items).not.toBe(items)
    result.items.push(99)
    expect(items).toEqual([1, 2, 3, 4, 5])
  })

  test("empty input passes through", () => {
    const empty: number[] = []
    expect(applyLimit(empty, 5)).toEqual({ items: [], totalMsg: "0" })
    const zero = applyLimit(empty, 0)
    expect(zero.items).toBe(empty)
    expect(zero.totalMsg).toBe("0")
  })
})

describe("parseLimitFlag + applyLimit composition (mirrors CLI usage)", () => {
  const items = ["a", "b", "c", "d", "e"]

  test("--limit 3 truncates and reports 'X of Y'", () => {
    const limit = parseLimitFlag("3")
    expect(applyLimit(items, limit)).toEqual({ items: ["a", "b", "c"], totalMsg: "3 of 5" })
  })

  test("--limit 0 = no limit", () => {
    const limit = parseLimitFlag("0")
    const result = applyLimit(items, limit)
    expect(result.items).toBe(items)
    expect(result.totalMsg).toBe("5")
  })

  test("--limit -1 = no limit", () => {
    const limit = parseLimitFlag("-1")
    const result = applyLimit(items, limit)
    expect(result.items).toBe(items)
    expect(result.totalMsg).toBe("5")
  })

  test("--limit foo = no limit", () => {
    const limit = parseLimitFlag("foo")
    const result = applyLimit(items, limit)
    expect(result.items).toBe(items)
    expect(result.totalMsg).toBe("5")
  })

  test("no flag = no limit", () => {
    const limit = parseLimitFlag(undefined)
    const result = applyLimit(items, limit)
    expect(result.items).toBe(items)
    expect(result.totalMsg).toBe("5")
  })

  test("totalMsg is just 'X' when limit > length (no truncation)", () => {
    const limit = parseLimitFlag("100")
    expect(applyLimit(items, limit).totalMsg).toBe("5")
  })
})
