/**
 * Notification circuit breaker — token-bucket rate-limit for the notification
 * pipeline (Phase 6.b of the notification-context safety design — see
 * `apps/silvercode/docs/channels.md` § 4 Phase 6.b and
 * § 5 Safeguards).
 *
 * Why we need this. Layers 0–3 prevent the *category* of bug, but a
 * misbehaving source (a recall replay loop, a tribe daemon bug, an
 * adversarial CI hook) can still flood the notification channel with
 * thousands of events. Even if every payload is sanitized, the sheer
 * volume thrashes the agent's context budget and the user's inline UI.
 * Per-source + global rate-limits give us a deterministic ceiling and
 * make the failure mode visible (drop counters in
 * `notification-telemetry.ts`) rather than catastrophic.
 *
 * Policy:
 *
 *   - Per-source bucket: 10 events/min (configurable via
 *     `SILVERCODE_NOTIFICATION_PER_SOURCE_PER_MIN`).
 *   - Global bucket: 50 events/hour (configurable via
 *     `SILVERCODE_NOTIFICATION_GLOBAL_PER_HOUR`).
 *   - Order: per-source bucket is checked FIRST; if it rejects, the
 *     global bucket is NOT debited (a misbehaving source can't burn
 *     down the global budget for everyone else).
 *   - Tokens accrue continuously (fractional refill on each `admit`
 *     call) — the standard token-bucket convention. Refills clamp to
 *     bucket capacity (no carryover beyond the burst limit).
 *
 * The breaker is pure / deterministic given a `now()` clock. Tests
 * inject a fake clock to simulate elapsed time without sleeping.
 *
 * The breaker does NOT call telemetry directly — that would entangle
 * the modules. Callers that want telemetry (the controller's
 * channel-queue subscriber) wrap `admit` and call
 * `recordAdmitted` / `recordDropped` based on the result. This keeps
 * the breaker testable in isolation and lets pure-logic call-sites
 * (e.g. dry-run replay) skip the telemetry path entirely.
 */

import type { ChannelEvent } from "./channel-queue.ts"

/** Configurable knobs. All optional — environment variables fill in defaults. */
export type NotificationBreakerOpts = {
  /** Per-source token-bucket capacity. Default: env or 10 events/min. */
  readonly perSourcePerMin?: number
  /** Global token-bucket capacity. Default: env or 50 events/hour. */
  readonly globalPerHour?: number
  /** Time source — defaults to `Date.now`. Inject for tests. */
  readonly now?: () => number
}

/** Live counters exposed by `stats()` for diagnostics + tests. */
export type NotificationBreakerStats = {
  readonly perSourcePerMin: number
  readonly globalPerHour: number
  /** Approximate token balance per known source (rounded down). */
  readonly perSourceTokens: Readonly<Record<string, number>>
  /** Approximate global token balance (rounded down). */
  readonly globalTokens: number
  readonly admittedPerSource: Readonly<Record<string, number>>
  readonly droppedPerSource: Readonly<Record<string, number>>
  readonly droppedGlobal: number
}

/** Why the breaker rejected an admission attempt. */
export type AdmissionRejection = "per-source-rate-limit" | "global-rate-limit"

/**
 * Result of a single `admit` call. `ok: true` means the event passed
 * both buckets; `ok: false` means one of the buckets was empty and the
 * event was dropped — `reason` says which bucket was responsible.
 */
export type AdmissionResult = { readonly ok: true } | { readonly ok: false; readonly reason: AdmissionRejection }

/**
 * Public API of the breaker. `admit(event)` is the hot-path entry; it
 * runs the per-source and global checks and returns a structured
 * result so callers can wire telemetry / drop handling.
 */
export type NotificationBreaker = {
  admit(event: Pick<ChannelEvent, "source">): AdmissionResult
  stats(): NotificationBreakerStats
}

const MIN_MS = 60_000
const HOUR_MS = 60 * MIN_MS

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === null || raw === "") return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

/** Internal per-source token bucket. */
type SourceBucket = {
  tokens: number
  lastRefillMs: number
}

/**
 * Build a fresh breaker. Each call returns an independent state object
 * — multiple breakers can coexist (e.g., one per controller scope).
 */
export function createNotificationBreaker(opts: NotificationBreakerOpts = {}): NotificationBreaker {
  const perSourceCap = opts.perSourcePerMin ?? readPositiveIntEnv("SILVERCODE_NOTIFICATION_PER_SOURCE_PER_MIN", 10)
  const globalCap = opts.globalPerHour ?? readPositiveIntEnv("SILVERCODE_NOTIFICATION_GLOBAL_PER_HOUR", 50)
  const now = opts.now ?? Date.now

  const perSourceRefillRatePerMs = perSourceCap / MIN_MS
  const globalRefillRatePerMs = globalCap / HOUR_MS

  const perSourceBuckets = new Map<string, SourceBucket>()
  let globalTokens = globalCap
  let globalLastRefillMs = now()

  // Telemetry counters — internal, separate from `notification-telemetry.ts`'s
  // process-global counters. Exposed via `stats()` for diagnostics.
  const admittedPerSource: Record<string, number> = Object.create(null) as Record<string, number>
  const droppedPerSource: Record<string, number> = Object.create(null) as Record<string, number>
  let droppedGlobal = 0

  function refillSource(bucket: SourceBucket, currentMs: number): void {
    const elapsed = currentMs - bucket.lastRefillMs
    if (elapsed <= 0) return
    bucket.tokens = Math.min(perSourceCap, bucket.tokens + elapsed * perSourceRefillRatePerMs)
    bucket.lastRefillMs = currentMs
  }

  function refillGlobal(currentMs: number): void {
    const elapsed = currentMs - globalLastRefillMs
    if (elapsed <= 0) return
    globalTokens = Math.min(globalCap, globalTokens + elapsed * globalRefillRatePerMs)
    globalLastRefillMs = currentMs
  }

  function bucketFor(source: string, currentMs: number): SourceBucket {
    const existing = perSourceBuckets.get(source)
    if (existing !== undefined) {
      refillSource(existing, currentMs)
      return existing
    }
    const fresh: SourceBucket = { tokens: perSourceCap, lastRefillMs: currentMs }
    perSourceBuckets.set(source, fresh)
    return fresh
  }

  function bump(map: Record<string, number>, key: string): void {
    map[key] = (map[key] ?? 0) + 1
  }

  return {
    admit(event): AdmissionResult {
      const currentMs = now()
      const bucket = bucketFor(event.source, currentMs)
      // Per-source first — a flooding source must not burn the global
      // budget for the well-behaved sources.
      if (bucket.tokens < 1) {
        bump(droppedPerSource, event.source)
        return { ok: false, reason: "per-source-rate-limit" }
      }
      refillGlobal(currentMs)
      if (globalTokens < 1) {
        // Don't debit the per-source bucket — a global drop isn't this
        // source's fault.
        droppedGlobal += 1
        return { ok: false, reason: "global-rate-limit" }
      }
      bucket.tokens -= 1
      globalTokens -= 1
      bump(admittedPerSource, event.source)
      return { ok: true }
    },
    stats(): NotificationBreakerStats {
      const currentMs = now()
      refillGlobal(currentMs)
      const perSourceTokens: Record<string, number> = Object.create(null) as Record<string, number>
      for (const [source, bucket] of perSourceBuckets) {
        refillSource(bucket, currentMs)
        perSourceTokens[source] = Math.floor(bucket.tokens)
      }
      return {
        perSourcePerMin: perSourceCap,
        globalPerHour: globalCap,
        perSourceTokens,
        globalTokens: Math.floor(globalTokens),
        admittedPerSource: { ...admittedPerSource },
        droppedPerSource: { ...droppedPerSource },
        droppedGlobal,
      }
    },
  }
}
