/**
 * Tests for resolveRelativeDate()
 */

import { describe, test, expect } from "vitest"
import { resolveRelativeDate, formatDate } from "../src/query/date.ts"

// Use a fixed reference date for deterministic tests
const REF = new Date(2026, 1, 12, 10, 0, 0) // 2026-02-12 10:00

describe("resolveRelativeDate", () => {
  test("today", () => {
    const result = resolveRelativeDate("today", REF)
    expect(result).toEqual({ date: "2026-02-12" })
  })

  test("tomorrow", () => {
    const result = resolveRelativeDate("tomorrow", REF)
    expect(result).toEqual({ date: "2026-02-13" })
  })

  test("friday (from Thursday 2026-02-12)", () => {
    const result = resolveRelativeDate("friday", REF)
    expect(result).toBeDefined()
    expect(result!.date).toBe("2026-02-13")
    expect(result!.time).toBeUndefined()
  })

  test("next tuesday", () => {
    const result = resolveRelativeDate("next tuesday", REF)
    expect(result).toBeDefined()
    expect(result!.date).toBe("2026-02-17")
    expect(result!.time).toBeUndefined()
  })

  test("+3 days", () => {
    const result = resolveRelativeDate("+3 days", REF)
    expect(result).toEqual({ date: "2026-02-15" })
  })

  test("+1 week", () => {
    const result = resolveRelativeDate("+1 week", REF)
    expect(result).toEqual({ date: "2026-02-19" })
  })

  test("+2 months", () => {
    const result = resolveRelativeDate("+2 months", REF)
    expect(result).toEqual({ date: "2026-04-12" })
  })

  test("jan 15 (resolves to 2026-01-15)", () => {
    const result = resolveRelativeDate("jan 15", REF)
    expect(result).toBeDefined()
    expect(result!.date).toBe("2026-01-15")
    expect(result!.time).toBeUndefined()
  })

  test("jan 15 3pm — includes time", () => {
    const result = resolveRelativeDate("jan 15 3pm", REF)
    expect(result).toBeDefined()
    expect(result!.date).toBe("2026-01-15")
    expect(result!.time).toBe("15:00")
  })

  test("march 20 (future date in same year)", () => {
    const result = resolveRelativeDate("march 20", REF)
    expect(result).toBeDefined()
    expect(result!.date).toBe("2026-03-20")
    expect(result!.time).toBeUndefined()
  })

  test("2026-02-20 (ISO date)", () => {
    const result = resolveRelativeDate("2026-02-20", REF)
    expect(result).toEqual({ date: "2026-02-20" })
  })

  test("2026-02-20T14:30 (ISO datetime)", () => {
    const result = resolveRelativeDate("2026-02-20T14:30", REF)
    expect(result).toEqual({ date: "2026-02-20", time: "14:30" })
  })

  test("empty string returns null", () => {
    expect(resolveRelativeDate("", REF)).toBeNull()
    expect(resolveRelativeDate("  ", REF)).toBeNull()
  })

  test("gibberish returns null", () => {
    expect(resolveRelativeDate("asdfghjkl", REF)).toBeNull()
  })

  test("formatDate works correctly", () => {
    const d = new Date(2026, 0, 5)
    expect(formatDate(d)).toBe("2026-01-05")
  })
})
