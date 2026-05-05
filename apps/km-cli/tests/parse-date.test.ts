/**
 * Tests for the natural-language date parser.
 *
 * Pinned reference date is 2026-05-05 (Tuesday) — that fixes
 * "tomorrow" / "friday" / "+2w" assertions to deterministic values
 * regardless of when the test runs.
 */

import { describe, test, expect } from "vitest"
import { parseDate } from "../src/utils/parse-date.ts"

// Tuesday, 5 May 2026 (matches today's pinned date in this session).
const REF = new Date(2026, 4, 5, 12, 0, 0)

function ok(r: ReturnType<typeof parseDate>): asserts r is { iso: string; humanized: string } {
  if ("error" in r) throw new Error(`expected success, got error: ${r.error}`)
}

describe("parseDate", () => {
  test("tmrw → tomorrow", () => {
    const r = parseDate("tmrw", REF)
    ok(r)
    expect(r.iso).toBe("2026-05-06")
    expect(r.humanized).toBe("tomorrow")
  })

  test("tomorrow → tomorrow (chrono)", () => {
    const r = parseDate("tomorrow", REF)
    ok(r)
    expect(r.iso).toBe("2026-05-06")
  })

  test("friday → upcoming friday", () => {
    // Tuesday → Friday is +3 days = 2026-05-08.
    const r = parseDate("friday", REF)
    ok(r)
    expect(r.iso).toBe("2026-05-08")
  })

  test("next mon → next monday", () => {
    // Tuesday → next Monday is +6 days = 2026-05-11.
    const r = parseDate("next mon", REF)
    ok(r)
    // Chrono may return either upcoming Monday or "next" Monday;
    // we accept either next Monday in May.
    expect(r.iso).toMatch(/^2026-05-(11|18)$/)
  })

  test("mon → upcoming monday", () => {
    const r = parseDate("mon", REF)
    ok(r)
    expect(r.iso).toMatch(/^2026-05-(04|11)$/)
  })

  test("+2w → +14 days", () => {
    const r = parseDate("+2w", REF)
    ok(r)
    expect(r.iso).toBe("2026-05-19")
    expect(r.humanized).toBe("in 2 weeks")
  })

  test("+3d → +3 days", () => {
    const r = parseDate("+3d", REF)
    ok(r)
    expect(r.iso).toBe("2026-05-08")
    expect(r.humanized).toBe("in 3 days")
  })

  test("+1m → +1 month", () => {
    const r = parseDate("+1m", REF)
    ok(r)
    expect(r.iso).toBe("2026-06-05")
    expect(r.humanized).toBe("in 1 month")
  })

  test("ISO 2025-07-14 pass-through", () => {
    const r = parseDate("2025-07-14", REF)
    ok(r)
    expect(r.iso).toBe("2025-07-14")
    expect(r.humanized).toBe("2025-07-14")
  })

  test("eod → today", () => {
    const r = parseDate("eod", REF)
    ok(r)
    expect(r.iso).toBe("2026-05-05")
    expect(r.humanized).toContain("end of day")
  })

  test("eow → upcoming sunday", () => {
    // Tuesday → next Sunday (May 10).
    const r = parseDate("eow", REF)
    ok(r)
    expect(r.iso).toBe("2026-05-10")
  })

  test("eom → end of month", () => {
    const r = parseDate("eom", REF)
    ok(r)
    expect(r.iso).toBe("2026-05-31")
  })

  test("eoq → end of Q2 (June 30)", () => {
    const r = parseDate("eoq", REF)
    ok(r)
    expect(r.iso).toBe("2026-06-30")
  })

  test("eoq for Q3 input → Sep 30", () => {
    const aug = new Date(2026, 7, 15)
    const r = parseDate("eoq", aug)
    ok(r)
    expect(r.iso).toBe("2026-09-30")
  })

  test("garbage → error", () => {
    const r = parseDate("xyzzy not a date", REF)
    expect(r).toHaveProperty("error")
  })

  test("empty string → error", () => {
    const r = parseDate("", REF)
    expect(r).toHaveProperty("error")
    if ("error" in r) expect(r.error).toBe("empty date")
  })

  test("whitespace-only → error", () => {
    const r = parseDate("   ", REF)
    expect(r).toHaveProperty("error")
  })

  test("case-insensitive shortcuts", () => {
    const r = parseDate("EOM", REF)
    ok(r)
    expect(r.iso).toBe("2026-05-31")
  })
})
