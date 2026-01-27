/**
 * Tests for date query resolution
 */
import { describe, test, expect } from "vitest"
import {
  resolveDateQuery,
  isDateShortcut,
  isDateField,
} from "../../src/query/date.ts"

describe("isDateShortcut", () => {
  test("recognizes 'today'", () => {
    expect(isDateShortcut("today")).toBe(true)
  })

  test("recognizes 'tomorrow'", () => {
    expect(isDateShortcut("tomorrow")).toBe(true)
  })

  test("recognizes 'yesterday'", () => {
    expect(isDateShortcut("yesterday")).toBe(true)
  })

  test("recognizes 'week'", () => {
    expect(isDateShortcut("week")).toBe(true)
  })

  test("recognizes 'past'", () => {
    expect(isDateShortcut("past")).toBe(true)
  })

  test("recognizes 'overdue'", () => {
    expect(isDateShortcut("overdue")).toBe(true)
  })

  test("is case-insensitive: 'TODAY'", () => {
    expect(isDateShortcut("TODAY")).toBe(true)
  })

  test("is case-insensitive: 'WeEk'", () => {
    expect(isDateShortcut("WeEk")).toBe(true)
  })

  test("recognizes date range format: '2026-01-21-2026-01-31'", () => {
    expect(isDateShortcut("2026-01-21-2026-01-31")).toBe(true)
  })

  test("rejects non-matching: 'foobar'", () => {
    expect(isDateShortcut("foobar")).toBe(false)
  })

  test("rejects partial dates: '2026-01'", () => {
    expect(isDateShortcut("2026-01")).toBe(false)
  })

  test("rejects empty string", () => {
    expect(isDateShortcut("")).toBe(false)
  })
})

describe("isDateField", () => {
  test("recognizes 'due_date'", () => {
    expect(isDateField("due_date")).toBe(true)
  })

  test("recognizes 'scheduled_date'", () => {
    expect(isDateField("scheduled_date")).toBe(true)
  })

  test("recognizes 'created_at'", () => {
    expect(isDateField("created_at")).toBe(true)
  })

  test("recognizes 'updated_at'", () => {
    expect(isDateField("updated_at")).toBe(true)
  })

  test("rejects non-date fields: 'name'", () => {
    expect(isDateField("name")).toBe(false)
  })

  test("rejects non-date fields: 'priority'", () => {
    expect(isDateField("priority")).toBe(false)
  })

  test("rejects custom fields: 'custom_date'", () => {
    expect(isDateField("custom_date")).toBe(false)
  })
})

describe("resolveDateQuery - shortcuts", () => {
  test("'today' returns today's date", () => {
    const result = resolveDateQuery("today")
    expect(result).not.toBeNull()
    // Check that start equals end (single day)
    expect(result?.start).toBe(result?.end)
    // Check format is YYYY-MM-DD
    expect(result?.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test("'tomorrow' returns tomorrow's date", () => {
    const result = resolveDateQuery("tomorrow")
    expect(result).not.toBeNull()
    expect(result?.start).toBe(result?.end)

    // Verify it's actually tomorrow
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const expected = tomorrow.toISOString().slice(0, 10)
    expect(result?.start).toBe(expected)
  })

  test("'yesterday' returns yesterday's date", () => {
    const result = resolveDateQuery("yesterday")
    expect(result).not.toBeNull()

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const expected = yesterday.toISOString().slice(0, 10)
    expect(result?.start).toBe(expected)
  })

  test("'week' returns 7-day range starting today", () => {
    const result = resolveDateQuery("week")
    expect(result).not.toBeNull()

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().slice(0, 10)
    expect(result?.start).toBe(todayStr)

    // End should be 6 days after today
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + 6)
    expect(result?.end).toBe(endDate.toISOString().slice(0, 10))
  })

  test("'past'/'overdue' returns dates before today", () => {
    const result = resolveDateQuery("past")
    expect(result).not.toBeNull()
    expect(result?.start).toBe("0000-01-01")

    // End should be yesterday
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    expect(result?.end).toBe(yesterday.toISOString().slice(0, 10))
  })

  test("'overdue' is alias for 'past'", () => {
    const past = resolveDateQuery("past")
    const overdue = resolveDateQuery("overdue")
    expect(past).toEqual(overdue)
  })

  test("shortcuts are case-insensitive", () => {
    const lower = resolveDateQuery("today")
    const upper = resolveDateQuery("TODAY")
    const mixed = resolveDateQuery("TodAY")
    expect(lower).toEqual(upper)
    expect(lower).toEqual(mixed)
  })
})

describe("resolveDateQuery - explicit dates", () => {
  test("parses single date: '2026-01-21'", () => {
    const result = resolveDateQuery("2026-01-21")
    expect(result).toEqual({
      start: "2026-01-21",
      end: "2026-01-21",
    })
  })

  test("parses date range: '2026-01-21-2026-01-31'", () => {
    const result = resolveDateQuery("2026-01-21-2026-01-31")
    expect(result).toEqual({
      start: "2026-01-21",
      end: "2026-01-31",
    })
  })

  test("rejects invalid format: '2026-1-21'", () => {
    const result = resolveDateQuery("2026-1-21")
    expect(result).toBeNull()
  })

  test("rejects incomplete dates: '2026-01'", () => {
    const result = resolveDateQuery("2026-01")
    expect(result).toBeNull()
  })

  test("invalid shortcut returns null", () => {
    const result = resolveDateQuery("foobar")
    expect(result).toBeNull()
  })

  test("empty string returns null", () => {
    const result = resolveDateQuery("")
    expect(result).toBeNull()
  })

  test("date range with same dates works", () => {
    const result = resolveDateQuery("2026-01-21-2026-01-21")
    expect(result).toEqual({
      start: "2026-01-21",
      end: "2026-01-21",
    })
  })
})
