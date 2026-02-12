/**
 * Recurrence Utilities Tests
 *
 * Tests for recurrence.ts functions.
 */

import { describe, test, expect } from "vitest"
import { parseRRule, getNextOccurrence, naturalToRRule } from "../src/recurrence.ts"

describe("recurrence.ts", () => {
  describe("parseRRule", () => {
    test("parses simple daily rule", () => {
      const result = parseRRule("FREQ=DAILY")
      expect(result.freq).toBe("DAILY")
      expect(result.interval).toBe(1)
    })

    test("parses weekly rule with interval", () => {
      const result = parseRRule("FREQ=WEEKLY;INTERVAL=2")
      expect(result.freq).toBe("WEEKLY")
      expect(result.interval).toBe(2)
    })

    test("parses weekly rule with BYDAY", () => {
      const result = parseRRule("FREQ=WEEKLY;BYDAY=MO,WE,FR")
      expect(result.freq).toBe("WEEKLY")
      expect(result.byDay).toEqual(["MO", "WE", "FR"])
    })

    test("parses monthly rule with BYMONTHDAY", () => {
      const result = parseRRule("FREQ=MONTHLY;BYMONTHDAY=1,15")
      expect(result.freq).toBe("MONTHLY")
      expect(result.byMonthDay).toEqual([1, 15])
    })

    test("handles case insensitivity", () => {
      const result = parseRRule("freq=weekly;interval=3")
      expect(result.freq).toBe("WEEKLY")
      expect(result.interval).toBe(3)
    })

    test("defaults to DAILY with interval 1", () => {
      const result = parseRRule("")
      expect(result.freq).toBe("DAILY")
      expect(result.interval).toBe(1)
    })
  })

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
  })
})
