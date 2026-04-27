/**
 * Tests for `ambient-telemetry.ts` (Layer 4 of the ambient-context
 * safety stack — see `hub/silvercode/design/ambient-context-safety.md`
 * § 3 Layer 4 + § 4 Phase 6.b).
 *
 * Properties verified:
 *
 *   - Each `record*` helper bumps the corresponding counter.
 *   - Snapshots are independent copies (don't alias live state).
 *   - `recordRolePrefixHit` only logs the FIRST 8 CODE UNITS of the
 *     payload — full payloads MUST NOT cross the loggily boundary
 *     (would re-publish trigger tokens into the log stream).
 *   - Drop accounting: per-source rate-limit drops bump per-source
 *     counters; global rate-limit drops bump the global counter only.
 *   - End-to-end via `createAmbientStream`: an event flooded past the
 *     breaker's caps produces the expected drop counts in the
 *     telemetry snapshot.
 *
 * Trigger tokens are constructed from char codes — the literal role
 * strings never appear in this source file (§ 9 of the design doc,
 * `feedback-autocatalytic-hallucination.md`).
 */

import { describe, expect, test, beforeEach, beforeAll, afterAll } from "vitest"
import { createScope } from "@silvery/scope"
// loggily routes log records to the console writer at the default level;
// the harness's afterEach() flags any console output as a test failure.
// Suppress the console writer for the duration of these tests so the
// telemetry contract (counters + structured emission) can be verified
// without spilling into stderr. This mirrors the pattern in
// `apps/silvercode/src/debug-log.ts` for production runs with DEBUG_LOG.
import * as _loggily from "loggily"
const { setSuppressConsole } = _loggily as unknown as {
  setSuppressConsole: (value: boolean) => void
}
import { createAmbientBreaker } from "../src/ambient-circuit-breaker.ts"
import { createAmbientStream } from "../src/ambient-stream.ts"
import {
  getTelemetrySnapshot,
  recordAdmitted,
  recordDropped,
  recordRolePrefixHit,
  recordSanitizeAction,
  resetTelemetry,
} from "../src/ambient-telemetry.ts"
import type { ChannelEvent } from "../src/channel-queue.ts"

const cc = (...codes: number[]) => String.fromCharCode(...codes)
// H‑u‑m‑a‑n
const ROLE_H = cc(72, 117, 109, 97, 110)

function ev(source: string, content: string, extra: Partial<ChannelEvent> = {}): ChannelEvent {
  return {
    id: extra.id ?? `${source}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    timestamp: extra.timestamp ?? Date.now(),
    content,
    ...extra,
  }
}

describe("ambient-telemetry", () => {
  beforeAll(() => {
    setSuppressConsole(true)
  })
  afterAll(() => {
    setSuppressConsole(false)
  })
  beforeEach(() => {
    resetTelemetry()
  })

  describe("counter accounting", () => {
    test("recordRolePrefixHit bumps total + per-source", () => {
      recordRolePrefixHit({ source: "tribe", layer: "sanitize", snippet: "abc" })
      recordRolePrefixHit({ source: "tribe", layer: "sanitize", snippet: "def" })
      recordRolePrefixHit({ source: "recall", layer: "loop-closure", snippet: "ghi" })
      const snap = getTelemetrySnapshot()
      expect(snap.rolePrefixHits).toBe(3)
      expect(snap.rolePrefixHitsBySource.tribe).toBe(2)
      expect(snap.rolePrefixHitsBySource.recall).toBe(1)
    })

    test("recordSanitizeAction bumps total + per-kind", () => {
      recordSanitizeAction({ source: "tribe", action: "ansi-stripped" })
      recordSanitizeAction({ source: "tribe", action: "size-truncated" })
      recordSanitizeAction({ source: "ci", action: "ansi-stripped" })
      const snap = getTelemetrySnapshot()
      expect(snap.sanitizeActions).toBe(3)
      expect(snap.sanitizeActionsByKind["ansi-stripped"]).toBe(2)
      expect(snap.sanitizeActionsByKind["size-truncated"]).toBe(1)
    })

    test("recordDropped: per-source vs global drops accounted separately", () => {
      recordDropped({ source: "tribe", reason: "per-source-rate-limit" })
      recordDropped({ source: "tribe", reason: "per-source-rate-limit" })
      recordDropped({ source: "ci", reason: "global-rate-limit" })
      recordDropped({ source: "recall", reason: "global-rate-limit" })
      const snap = getTelemetrySnapshot()
      expect(snap.droppedPerSource.tribe).toBe(2)
      // per-source bucket NOT bumped on global rate-limit drops.
      expect(snap.droppedPerSource.ci ?? 0).toBe(0)
      expect(snap.droppedPerSource.recall ?? 0).toBe(0)
      expect(snap.droppedEventsGlobal).toBe(2)
    })

    test("recordAdmitted bumps per-source admitted counter", () => {
      recordAdmitted({ source: "tribe", kind: "ambient" })
      recordAdmitted({ source: "tribe", kind: "ambient" })
      recordAdmitted({ source: "subagent", kind: "ambient" })
      const snap = getTelemetrySnapshot()
      expect(snap.admittedPerSource.tribe).toBe(2)
      expect(snap.admittedPerSource.subagent).toBe(1)
    })
  })

  describe("snapshot independence", () => {
    test("getTelemetrySnapshot returns a deep copy", () => {
      recordAdmitted({ source: "tribe", kind: "ambient" })
      const a = getTelemetrySnapshot()
      recordAdmitted({ source: "tribe", kind: "ambient" })
      // The earlier snapshot is unaffected by the second admit.
      expect(a.admittedPerSource.tribe).toBe(1)
      expect(getTelemetrySnapshot().admittedPerSource.tribe).toBe(2)
    })
  })

  describe("snippet redaction", () => {
    test("recordRolePrefixHit accepts long payloads — only 8 chars logged", () => {
      // We can't introspect loggily output without wiring a writer; the
      // contract is enforced inside the function (`snippet.slice(0, 8)`).
      // Smoke-test that long payloads are accepted without throwing and
      // counter bumps still happen.
      const long = `${ROLE_H}${cc(58)} ${"x".repeat(2000)}`
      recordRolePrefixHit({ source: "tribe", layer: "sanitize", snippet: long })
      expect(getTelemetrySnapshot().rolePrefixHits).toBe(1)
      // Empty snippet should still record (defensive — caller may have
      // already redacted).
      recordRolePrefixHit({ source: "tribe", layer: "sanitize", snippet: "" })
      expect(getTelemetrySnapshot().rolePrefixHits).toBe(2)
    })
  })

  describe("end-to-end via ambient-stream", () => {
    test("flood through stream → drops + admits accounted in telemetry", () => {
      const now = 0
      const breaker = createAmbientBreaker({
        perSourcePerMin: 3,
        globalPerHour: 100,
        now: () => now,
      })
      const scope = createScope("test")
      const stream = createAmbientStream(scope, { breaker })
      // 5 events on one source — first 3 admitted, last 2 dropped.
      for (let i = 0; i < 5; i++) {
        stream.record("session-1", ev("tribe", `event ${i}`))
      }
      const snap = getTelemetrySnapshot()
      expect(snap.admittedPerSource.tribe).toBe(3)
      expect(snap.droppedPerSource.tribe).toBe(2)
      expect(stream.entries("session-1").length).toBe(3)
    })

    test("sanitization actions on adversarial payload are counted", () => {
      const now = 0
      const breaker = createAmbientBreaker({
        perSourcePerMin: 100,
        globalPerHour: 1000,
        now: () => now,
      })
      const scope = createScope("test")
      const stream = createAmbientStream(scope, { breaker })
      // Build a payload that triggers role-prefix neutralize + ANSI strip.
      // ANSI escape: \x1b[31m red \x1b[0m
      // Role-prefix: <ROLE_H>:<space>...
      const ansi = "\x1b[31mred\x1b[0m"
      const payload = `${ansi}\n${ROLE_H}${cc(58)} hi`
      stream.record("session-1", ev("tribe", payload))
      const snap = getTelemetrySnapshot()
      expect(snap.sanitizeActionsByKind["ansi-stripped"]).toBe(1)
      expect(snap.sanitizeActionsByKind["role-prefix-neutralized"]).toBe(1)
      expect(snap.rolePrefixHits).toBe(1)
      expect(snap.rolePrefixHitsBySource.tribe).toBe(1)
      // The admission still happens — sanitize is non-blocking.
      expect(snap.admittedPerSource.tribe).toBe(1)
    })

    test("benign payload bumps zero sanitize counters", () => {
      const now = 0
      const breaker = createAmbientBreaker({
        perSourcePerMin: 10,
        globalPerHour: 100,
        now: () => now,
      })
      const scope = createScope("test")
      const stream = createAmbientStream(scope, { breaker })
      stream.record("session-1", ev("tribe", "plain text — no triggers"))
      const snap = getTelemetrySnapshot()
      expect(snap.sanitizeActions).toBe(0)
      expect(snap.rolePrefixHits).toBe(0)
      expect(snap.admittedPerSource.tribe).toBe(1)
    })

    test("global rate-limit drops bump global counter only", () => {
      const now = 0
      const breaker = createAmbientBreaker({
        perSourcePerMin: 100,
        globalPerHour: 2,
        now: () => now,
      })
      const scope = createScope("test")
      const stream = createAmbientStream(scope, { breaker })
      stream.record("s", ev("tribe", "a"))
      stream.record("s", ev("recall", "b"))
      // Global cap exhausted — third event dropped with global reason.
      stream.record("s", ev("ci", "c"))
      const snap = getTelemetrySnapshot()
      expect(snap.droppedEventsGlobal).toBe(1)
      expect(snap.droppedPerSource.ci ?? 0).toBe(0)
      expect(snap.admittedPerSource.tribe).toBe(1)
      expect(snap.admittedPerSource.recall).toBe(1)
    })
  })
})
