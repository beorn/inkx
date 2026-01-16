/**
 * Date Query Resolution Tests
 *
 * Tests for resolveDateQuery(), isDateShortcut(), and isDateField() functions.
 */

import { describe, it, expect } from "bun:test";
import { resolveDateQuery, isDateShortcut, isDateField } from "../src/date.ts";

describe("isDateShortcut", () => {
  it("recognizes today", () => {
    expect(isDateShortcut("today")).toBe(true);
  });

  it("recognizes tomorrow", () => {
    expect(isDateShortcut("tomorrow")).toBe(true);
  });

  it("recognizes yesterday", () => {
    expect(isDateShortcut("yesterday")).toBe(true);
  });

  it("recognizes week", () => {
    expect(isDateShortcut("week")).toBe(true);
  });

  it("recognizes past/overdue", () => {
    expect(isDateShortcut("past")).toBe(true);
    expect(isDateShortcut("overdue")).toBe(true);
  });

  it("recognizes date range pattern", () => {
    expect(isDateShortcut("2026-01-01-2026-01-31")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isDateShortcut("TODAY")).toBe(true);
    expect(isDateShortcut("Tomorrow")).toBe(true);
  });

  it("rejects non-shortcuts", () => {
    expect(isDateShortcut("random")).toBe(false);
    expect(isDateShortcut("2026-01-01")).toBe(false); // Single date is not a shortcut
  });
});

describe("isDateField", () => {
  it("recognizes due_date", () => {
    expect(isDateField("due_date")).toBe(true);
  });

  it("recognizes scheduled_date", () => {
    expect(isDateField("scheduled_date")).toBe(true);
  });

  it("recognizes created_at", () => {
    expect(isDateField("created_at")).toBe(true);
  });

  it("recognizes updated_at", () => {
    expect(isDateField("updated_at")).toBe(true);
  });

  it("rejects non-date fields", () => {
    expect(isDateField("priority")).toBe(false);
    expect(isDateField("status")).toBe(false);
    expect(isDateField("content")).toBe(false);
  });
});

describe("resolveDateQuery", () => {
  describe("shortcuts", () => {
    it("resolves today to current date", () => {
      const result = resolveDateQuery("today");
      expect(result).not.toBeNull();
      expect(result?.start).toBe(result?.end); // Same day
      // Verify format is YYYY-MM-DD
      expect(result?.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("resolves tomorrow to next day", () => {
      const result = resolveDateQuery("tomorrow");
      expect(result).not.toBeNull();
      expect(result?.start).toBe(result?.end);

      // Tomorrow should be 1 day after today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const expected = tomorrow.toISOString().slice(0, 10);
      expect(result?.start).toBe(expected);
    });

    it("resolves yesterday to previous day", () => {
      const result = resolveDateQuery("yesterday");
      expect(result).not.toBeNull();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const expected = yesterday.toISOString().slice(0, 10);
      expect(result?.start).toBe(expected);
    });

    it("resolves week to 7-day range", () => {
      const result = resolveDateQuery("week");
      expect(result).not.toBeNull();

      // Week should span 7 days (today + 6)
      const startDate = new Date(result!.start);
      const endDate = new Date(result!.end);
      const diffDays = Math.round(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(6);
    });

    it("resolves past/overdue to dates before today", () => {
      const result = resolveDateQuery("past");
      expect(result).not.toBeNull();
      expect(result?.start).toBe("0000-01-01");

      // End should be yesterday
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const expected = yesterday.toISOString().slice(0, 10);
      expect(result?.end).toBe(expected);
    });

    it("is case-insensitive", () => {
      const result1 = resolveDateQuery("TODAY");
      const result2 = resolveDateQuery("today");
      expect(result1?.start).toBe(result2?.start);
    });
  });

  describe("explicit dates", () => {
    it("resolves single date", () => {
      const result = resolveDateQuery("2026-01-15");
      expect(result).not.toBeNull();
      expect(result?.start).toBe("2026-01-15");
      expect(result?.end).toBe("2026-01-15");
    });

    it("resolves date range", () => {
      const result = resolveDateQuery("2026-01-01-2026-01-31");
      expect(result).not.toBeNull();
      expect(result?.start).toBe("2026-01-01");
      expect(result?.end).toBe("2026-01-31");
    });
  });

  describe("invalid values", () => {
    it("returns null for invalid input", () => {
      expect(resolveDateQuery("invalid")).toBeNull();
      expect(resolveDateQuery("")).toBeNull();
      expect(resolveDateQuery("2026")).toBeNull();
      expect(resolveDateQuery("01-15-2026")).toBeNull(); // Wrong format
    });
  });
});
