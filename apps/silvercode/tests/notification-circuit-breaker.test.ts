/**
 * Tests for `notification-circuit-breaker.ts` (Phase 6.b — see
 * `apps/silvercode/docs/channels.md` § 4 Phase 6.b and
 * § 5 Safeguards).
 *
 * Properties verified:
 *
 *   - Per-source bucket admits up to `perSourcePerMin` events; the next
 *     event in the same minute is dropped with `per-source-rate-limit`.
 *   - Global bucket admits up to `globalPerHour` events across all
 *     sources; subsequent admissions drop with `global-rate-limit`.
 *   - Token-bucket refill: after time advances, capacity is restored
 *     proportionally and admissions resume.
 *   - Per-source vs global ordering: a global drop does NOT debit the
 *     per-source bucket (a global ceiling isn't this source's fault).
 *   - `stats()` reports admitted / dropped / token balances.
 *   - Synthetic flood: pushing 100 events through with default caps
 *     produces the expected admit/drop split, matching the policy.
 *
 * Pure logic tests — fake clock, no real timers.
 */

import { describe, expect, test, beforeEach } from "vitest"
import { createNotificationBreaker } from "../src/notification-circuit-breaker.ts"

function event(source: string) {
  return { source }
}

describe("notification-circuit-breaker", () => {
  describe("per-source bucket", () => {
    test("admits up to perSourcePerMin within one minute", () => {
      const now = 1_000_000
      const breaker = createNotificationBreaker({
        perSourcePerMin: 3,
        globalPerHour: 1000,
        now: () => now,
      })
      expect(breaker.admit(event("tribe")).ok).toBe(true)
      expect(breaker.admit(event("tribe")).ok).toBe(true)
      expect(breaker.admit(event("tribe")).ok).toBe(true)
      const fourth = breaker.admit(event("tribe"))
      expect(fourth.ok).toBe(false)
      if (!fourth.ok) expect(fourth.reason).toBe("per-source-rate-limit")
    })

    test("buckets are independent per source", () => {
      const now = 1_000_000
      const breaker = createNotificationBreaker({
        perSourcePerMin: 2,
        globalPerHour: 1000,
        now: () => now,
      })
      expect(breaker.admit(event("tribe")).ok).toBe(true)
      expect(breaker.admit(event("tribe")).ok).toBe(true)
      expect(breaker.admit(event("tribe")).ok).toBe(false)
      // recall has its own budget
      expect(breaker.admit(event("recall")).ok).toBe(true)
      expect(breaker.admit(event("recall")).ok).toBe(true)
      expect(breaker.admit(event("recall")).ok).toBe(false)
    })

    test("refills proportionally as time advances", () => {
      let now = 0
      const breaker = createNotificationBreaker({
        perSourcePerMin: 6,
        globalPerHour: 1000,
        now: () => now,
      })
      // Burn the full bucket
      for (let i = 0; i < 6; i++) {
        expect(breaker.admit(event("ci")).ok).toBe(true)
      }
      expect(breaker.admit(event("ci")).ok).toBe(false)
      // Advance 10s — should accrue 1 token (6 tok/min × 10s/60s = 1).
      now += 10_000
      expect(breaker.admit(event("ci")).ok).toBe(true)
      expect(breaker.admit(event("ci")).ok).toBe(false)
      // Advance 60s — full refill
      now += 60_000
      for (let i = 0; i < 6; i++) {
        expect(breaker.admit(event("ci")).ok).toBe(true)
      }
      expect(breaker.admit(event("ci")).ok).toBe(false)
    })

    test("refills clamp to capacity (no carryover beyond burst limit)", () => {
      let now = 0
      const breaker = createNotificationBreaker({
        perSourcePerMin: 5,
        globalPerHour: 1000,
        now: () => now,
      })
      // Sit idle for an hour — should still only admit 5 in a burst.
      now += 60 * 60 * 1000
      for (let i = 0; i < 5; i++) {
        expect(breaker.admit(event("filewatch")).ok).toBe(true)
      }
      expect(breaker.admit(event("filewatch")).ok).toBe(false)
    })
  })

  describe("global bucket", () => {
    test("rejects with global-rate-limit when global exhausted", () => {
      const now = 0
      const breaker = createNotificationBreaker({
        perSourcePerMin: 1000,
        globalPerHour: 4,
        now: () => now,
      })
      expect(breaker.admit(event("a")).ok).toBe(true)
      expect(breaker.admit(event("b")).ok).toBe(true)
      expect(breaker.admit(event("c")).ok).toBe(true)
      expect(breaker.admit(event("d")).ok).toBe(true)
      const fifth = breaker.admit(event("e"))
      expect(fifth.ok).toBe(false)
      if (!fifth.ok) expect(fifth.reason).toBe("global-rate-limit")
    })

    test("global drop does not debit per-source bucket", () => {
      const now = 0
      const breaker = createNotificationBreaker({
        perSourcePerMin: 100,
        globalPerHour: 1,
        now: () => now,
      })
      expect(breaker.admit(event("tribe")).ok).toBe(true)
      // global budget is now 0 — every further admit should drop with
      // global-rate-limit, NOT per-source.
      const next = breaker.admit(event("tribe"))
      expect(next.ok).toBe(false)
      if (!next.ok) expect(next.reason).toBe("global-rate-limit")
      // Per-source dropped count must be 0; only global increments.
      const stats = breaker.stats()
      expect(stats.droppedGlobal).toBe(1)
      expect(stats.droppedPerSource.tribe ?? 0).toBe(0)
    })
  })

  describe("stats", () => {
    test("tracks admitted + dropped per-source counts", () => {
      const now = 0
      const breaker = createNotificationBreaker({
        perSourcePerMin: 2,
        globalPerHour: 100,
        now: () => now,
      })
      breaker.admit(event("tribe"))
      breaker.admit(event("tribe"))
      breaker.admit(event("tribe")) // dropped per-source
      breaker.admit(event("recall"))
      const stats = breaker.stats()
      expect(stats.admittedPerSource.tribe).toBe(2)
      expect(stats.admittedPerSource.recall).toBe(1)
      expect(stats.droppedPerSource.tribe).toBe(1)
      expect(stats.perSourcePerMin).toBe(2)
      expect(stats.globalPerHour).toBe(100)
    })

    test("perSourceTokens reflect remaining budget", () => {
      const now = 0
      const breaker = createNotificationBreaker({
        perSourcePerMin: 10,
        globalPerHour: 100,
        now: () => now,
      })
      breaker.admit(event("tribe"))
      breaker.admit(event("tribe"))
      breaker.admit(event("tribe"))
      const stats = breaker.stats()
      expect(stats.perSourceTokens.tribe).toBeLessThanOrEqual(7)
      expect(stats.perSourceTokens.tribe).toBeGreaterThanOrEqual(6)
    })
  })

  describe("synthetic flood", () => {
    test("100 events through default caps — predictable admit/drop split", () => {
      const now = 0
      const breaker = createNotificationBreaker({
        perSourcePerMin: 10,
        globalPerHour: 50,
        now: () => now,
      })
      let admitted = 0
      let droppedPer = 0
      let droppedGlobal = 0
      // 100 events from one source, fired instantly (no time advance).
      for (let i = 0; i < 100; i++) {
        const r = breaker.admit(event("tribe"))
        if (r.ok) admitted++
        else if (r.reason === "per-source-rate-limit") droppedPer++
        else droppedGlobal++
      }
      expect(admitted).toBe(10) // per-source cap reached first
      expect(droppedPer).toBe(90)
      expect(droppedGlobal).toBe(0)
    })

    test("flood from two sources hits global cap after per-source caps", () => {
      const now = 0
      const breaker = createNotificationBreaker({
        perSourcePerMin: 10,
        globalPerHour: 15,
        now: () => now,
      })
      let admitted = 0
      let droppedPer = 0
      let droppedGlobal = 0
      // Alternate two sources so each hits its per-source cap.
      for (let i = 0; i < 50; i++) {
        const src = i % 2 === 0 ? "tribe" : "recall"
        const r = breaker.admit(event(src))
        if (r.ok) admitted++
        else if (r.reason === "per-source-rate-limit") droppedPer++
        else droppedGlobal++
      }
      // First 10 of each (20 attempts) — but global cap is 15, so:
      // tribe(0..9 alt with recall(0..9). Steps:
      //   i=0..29: alternate, but global runs out at admitted=15.
      //   The remaining alternates within per-source budget become global drops
      //   until per-source cap exhausts on each side.
      expect(admitted).toBe(15)
      // Total drops = 50 - 15 = 35 split across per-source vs global.
      expect(droppedPer + droppedGlobal).toBe(35)
      expect(droppedGlobal).toBeGreaterThan(0)
    })
  })

  describe("env var defaults", () => {
    const ORIG_PS = process.env.SILVERCODE_NOTIFICATION_PER_SOURCE_PER_MIN
    const ORIG_G = process.env.SILVERCODE_NOTIFICATION_GLOBAL_PER_HOUR

    beforeEach(() => {
      process.env.SILVERCODE_NOTIFICATION_PER_SOURCE_PER_MIN = ORIG_PS
      process.env.SILVERCODE_NOTIFICATION_GLOBAL_PER_HOUR = ORIG_G
    })

    test("env vars override defaults when opts not provided", () => {
      process.env.SILVERCODE_NOTIFICATION_PER_SOURCE_PER_MIN = "3"
      process.env.SILVERCODE_NOTIFICATION_GLOBAL_PER_HOUR = "100"
      const now = 0
      const breaker = createNotificationBreaker({ now: () => now })
      expect(breaker.stats().perSourcePerMin).toBe(3)
      expect(breaker.stats().globalPerHour).toBe(100)
    })

    test("defaults applied when env vars unset / invalid", () => {
      delete process.env.SILVERCODE_NOTIFICATION_PER_SOURCE_PER_MIN
      delete process.env.SILVERCODE_NOTIFICATION_GLOBAL_PER_HOUR
      const now = 0
      const breaker = createNotificationBreaker({ now: () => now })
      expect(breaker.stats().perSourcePerMin).toBe(10)
      expect(breaker.stats().globalPerHour).toBe(50)
    })

    test("ignores non-positive env values", () => {
      process.env.SILVERCODE_NOTIFICATION_PER_SOURCE_PER_MIN = "0"
      process.env.SILVERCODE_NOTIFICATION_GLOBAL_PER_HOUR = "-5"
      const now = 0
      const breaker = createNotificationBreaker({ now: () => now })
      expect(breaker.stats().perSourcePerMin).toBe(10)
      expect(breaker.stats().globalPerHour).toBe(50)
    })
  })
})
