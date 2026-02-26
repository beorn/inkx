/**
 * Recurrence Utilities Tests
 *
 * Tests for recurrence.ts functions.
 */

import { describe, test, expect } from "vitest"
import { getNextOccurrence, naturalToRRule, parseRRule } from "../src/recurrence.ts"

describe("recurrence.ts", () => {
  describe("getNextOccurrence", () => {
    test("calculates next daily occurrence", () => {
      const next = getNextOccurrence("FREQ=DAILY", "2024-01-15")
      expect(next).toBe("2024-01-16")
    })

    test("calculates next daily with interval", () => {
      const next = getNextOccurrence("FREQ=DAILY;INTERVAL=3", "2024-01-15")
      expect(next).toBe("2024-01-18")
    })

    test("calculates next weekly occurrence", () => {
      const next = getNextOccurrence("FREQ=WEEKLY", "2024-01-15")
      expect(next).toBe("2024-01-22")
    })

    test("calculates next weekly with interval", () => {
      const next = getNextOccurrence("FREQ=WEEKLY;INTERVAL=2", "2024-01-15")
      expect(next).toBe("2024-01-29")
    })

    test("calculates next monthly occurrence", () => {
      const next = getNextOccurrence("FREQ=MONTHLY", "2024-01-15")
      expect(next).toBe("2024-02-15")
    })

    test("calculates next yearly occurrence", () => {
      const next = getNextOccurrence("FREQ=YEARLY", "2024-01-15")
      expect(next).toBe("2025-01-15")
    })

    test("handles BYDAY for weekly", () => {
      // Monday 2024-01-15, BYDAY=WE should go to Wednesday
      const next = getNextOccurrence("FREQ=WEEKLY;BYDAY=WE", "2024-01-15")
      expect(next).toBe("2024-01-17")
    })

    test("handles BYMONTHDAY for monthly", () => {
      // On the 15th with BYMONTHDAY=1,20, should go to 20th
      const next = getNextOccurrence("FREQ=MONTHLY;BYMONTHDAY=1,20", "2024-01-15")
      expect(next).toBe("2024-01-20")
    })

    test("returns null for invalid date", () => {
      const next = getNextOccurrence("FREQ=DAILY", "not-a-date")
      expect(next).toBeNull()
    })

    test("returns null for unknown frequency", () => {
      const next = getNextOccurrence("FREQ=UNKNOWN", "2024-01-15")
      expect(next).toBeNull()
    })

    test("strips FROM=COMPLETED before calculating", () => {
      const next = getNextOccurrence("FREQ=DAILY;FROM=COMPLETED", "2024-01-15")
      expect(next).toBe("2024-01-16")
    })

    test("strips FROM=DUE before calculating", () => {
      const next = getNextOccurrence("FREQ=WEEKLY;INTERVAL=2;FROM=DUE", "2024-01-15")
      expect(next).toBe("2024-01-29")
    })

    test("strips leading-semicolon FROM variant", () => {
      // FROM at start: "FROM=DUE;FREQ=DAILY" — semicolon stripped cleanly
      const next = getNextOccurrence("FREQ=MONTHLY;FROM=COMPLETED", "2024-01-15")
      expect(next).toBe("2024-02-15")
    })
  })

  describe("parseRRule", () => {
    test("returns 'completed' when FROM is absent", () => {
      expect(parseRRule("FREQ=DAILY")).toEqual({ rule: "FREQ=DAILY", from: "completed" })
    })

    test("returns 'completed' for FROM=COMPLETED", () => {
      expect(parseRRule("FREQ=DAILY;FROM=COMPLETED")).toEqual({ rule: "FREQ=DAILY", from: "completed" })
    })

    test("returns 'due' for FROM=DUE", () => {
      expect(parseRRule("FREQ=WEEKLY;INTERVAL=2;FROM=DUE")).toEqual({
        rule: "FREQ=WEEKLY;INTERVAL=2",
        from: "due",
      })
    })

    test("is case-insensitive for FROM value", () => {
      expect(parseRRule("FREQ=DAILY;FROM=due")).toEqual({ rule: "FREQ=DAILY", from: "due" })
      expect(parseRRule("FREQ=DAILY;FROM=completed")).toEqual({ rule: "FREQ=DAILY", from: "completed" })
    })

    test("strips FROM when it appears mid-rule", () => {
      const { rule, from } = parseRRule("FREQ=WEEKLY;FROM=DUE;BYDAY=MO")
      expect(from).toBe("due")
      expect(rule).toBe("FREQ=WEEKLY;BYDAY=MO")
    })

    test("strips leading semicolon when FROM is at end", () => {
      const { rule } = parseRRule("FREQ=DAILY;FROM=DUE")
      expect(rule).toBe("FREQ=DAILY")
    })
  })

  describe("naturalToRRule", () => {
    test("converts 'daily' to RRULE", () => {
      expect(naturalToRRule("daily")).toBe("FREQ=DAILY")
      expect(naturalToRRule("every day")).toBe("FREQ=DAILY")
    })

    test("converts 'every N days' to RRULE", () => {
      expect(naturalToRRule("every 3 days")).toBe("FREQ=DAILY;INTERVAL=3")
      expect(naturalToRRule("every 1 day")).toBe("FREQ=DAILY;INTERVAL=1")
    })

    test("converts 'weekly' to RRULE", () => {
      expect(naturalToRRule("weekly")).toBe("FREQ=WEEKLY")
      expect(naturalToRRule("every week")).toBe("FREQ=WEEKLY")
    })

    test("converts 'every N weeks' to RRULE", () => {
      expect(naturalToRRule("every 2 weeks")).toBe("FREQ=WEEKLY;INTERVAL=2")
    })

    test("converts 'weekdays' to RRULE", () => {
      expect(naturalToRRule("weekdays")).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")
      expect(naturalToRRule("every weekday")).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")
    })

    test("converts day names to RRULE", () => {
      expect(naturalToRRule("every monday")).toBe("FREQ=WEEKLY;BYDAY=MO")
      expect(naturalToRRule("every mon")).toBe("FREQ=WEEKLY;BYDAY=MO")
      expect(naturalToRRule("every friday")).toBe("FREQ=WEEKLY;BYDAY=FR")
      expect(naturalToRRule("every sunday")).toBe("FREQ=WEEKLY;BYDAY=SU")
    })

    test("converts 'monthly' to RRULE", () => {
      expect(naturalToRRule("monthly")).toBe("FREQ=MONTHLY")
      expect(naturalToRRule("every month")).toBe("FREQ=MONTHLY")
    })

    test("converts 'every N months' to RRULE", () => {
      expect(naturalToRRule("every 3 months")).toBe("FREQ=MONTHLY;INTERVAL=3")
    })

    test("converts 'yearly' to RRULE", () => {
      expect(naturalToRRule("yearly")).toBe("FREQ=YEARLY")
      expect(naturalToRRule("annually")).toBe("FREQ=YEARLY")
      expect(naturalToRRule("every year")).toBe("FREQ=YEARLY")
    })

    test("passes through existing RRULE", () => {
      expect(naturalToRRule("FREQ=DAILY;INTERVAL=5")).toBe("FREQ=DAILY;INTERVAL=5")
    })

    test("returns null for unrecognized patterns", () => {
      expect(naturalToRRule("something random")).toBeNull()
      expect(naturalToRRule("")).toBeNull()
    })

    test("handles case insensitivity", () => {
      expect(naturalToRRule("DAILY")).toBe("FREQ=DAILY")
      expect(naturalToRRule("Every Monday")).toBe("FREQ=WEEKLY;BYDAY=MO")
    })

    test("'on schedule' suffix appends FROM=DUE", () => {
      expect(naturalToRRule("daily on schedule")).toBe("FREQ=DAILY;FROM=DUE")
      expect(naturalToRRule("every 2 weeks on schedule")).toBe("FREQ=WEEKLY;INTERVAL=2;FROM=DUE")
      expect(naturalToRRule("weekly on schedule")).toBe("FREQ=WEEKLY;FROM=DUE")
    })

    test("'on due' suffix appends FROM=DUE", () => {
      expect(naturalToRRule("daily on due")).toBe("FREQ=DAILY;FROM=DUE")
      expect(naturalToRRule("every monday on due")).toBe("FREQ=WEEKLY;BYDAY=MO;FROM=DUE")
      expect(naturalToRRule("monthly on due")).toBe("FREQ=MONTHLY;FROM=DUE")
    })

    test("no suffix produces no FROM parameter", () => {
      expect(naturalToRRule("daily")).toBe("FREQ=DAILY")
      expect(naturalToRRule("every 2 weeks")).toBe("FREQ=WEEKLY;INTERVAL=2")
    })

    test("'on schedule' suffix is case-insensitive", () => {
      expect(naturalToRRule("Daily on Schedule")).toBe("FREQ=DAILY;FROM=DUE")
      expect(naturalToRRule("Every Monday on Due")).toBe("FREQ=WEEKLY;BYDAY=MO;FROM=DUE")
    })
  })
})
