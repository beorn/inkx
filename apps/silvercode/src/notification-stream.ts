/**
 * Notification stream — per-session in-memory journal of notification observations
 * delivered to the agent. Mirrors the prompt-assembly flow: when an
 * notification `ChannelEvent` is wrapped as an `EmbeddedResource` and shipped
 * to the agent, the same event is recorded here so the chat scrollback
 * can render it inline at the correct timestamp.
 *
 * This is UI-only state. The stream does NOT influence what the agent
 * receives — `assembleAcpPrompt` and the channel queue handle that. Mute
 * filters consult this stream's records, never `channelQueue`.
 *
 * Design: apps/silvercode/docs/channels.md.
 * Bead: km-silvercode.notification-inline-display.
 */

import { signal } from "alien-signals"
import type { Scope } from "@silvery/scope"
import { type NotificationBreaker, type NotificationBreakerOpts, createNotificationBreaker } from "./notification-circuit-breaker.ts"
import { sanitizeNotificationWithReport, containsRolePrefix } from "./notification-sanitize.ts"
import {
  recordAdmitted,
  recordDropped,
  recordRolePrefixHit,
  recordSanitizeAction,
  type SanitizeAction,
} from "./notification-telemetry.ts"
import type { ChannelEvent } from "./channel-queue.ts"

/**
 * One notification observation in the chat journal. Narrows `ChannelEvent`
 * to the fields the inline UI needs — the full event still flows through
 * `channelQueue` / `assembleAcpPrompt`; this is the visible echo.
 */
export type NotificationStreamEntry = {
  readonly kind: "notification"
  readonly id: string
  readonly source: string
  readonly ts: number
  readonly timestamp?: number
  readonly content: string
  readonly meta?: Readonly<Record<string, unknown>>
  readonly actionable?: boolean
}

/**
 * Per-session journal handle. `entries(sessionId)` is a snapshot accessor;
 * `subscribe` fires after each `record(...)` so React hooks can re-render.
 *
 * Bounded ring buffer: at most `MAX_PER_SESSION` entries are retained per
 * session. Older entries fall off the head. The bound is large enough
 * that a normal session never sees eviction in practice but firewalls
 * unbounded memory growth in pathological cases (e.g. a misbehaving
 * subscriber flooding events).
 */
export type NotificationStream = {
  /**
   * Append an event to the named session's journal. Returns `true` if
   * the event was admitted by the circuit breaker and recorded, `false`
   * if it was dropped (rate-limit). Drops are observable via the
   * Layer 4 telemetry counters in `notification-telemetry.ts`.
   */
  record(sessionId: string, event: ChannelEvent): boolean
  /** Snapshot of one session's journal in chronological order. */
  entries(sessionId: string): readonly NotificationStreamEntry[]
  /** Subscribe to record events. Handler receives `(sessionId, entry)`. */
  subscribe(handler: (sessionId: string, entry: NotificationStreamEntry) => void): () => void
  /**
   * Reactive signal for global change-counter — components that read
   * `entries(sessionId)` can `useSignal(stream.version)` to re-render on
   * any record. Cheaper than per-session signals while we're early; we
   * can split later if it shows up in profiling.
   */
  readonly version: {
    (): number
    (value: number): void
  }
  /** Drop everything for one session (used on session close). */
  clearSession(sessionId: string): void
  /** Underlying circuit breaker — exposed for `silvercode doctor notification`. */
  readonly breaker: NotificationBreaker
}

const MAX_PER_SESSION = 500

function toEntry(event: ChannelEvent): NotificationStreamEntry {
  return {
    kind: "notification",
    id: event.id,
    source: event.source,
    ts: event.timestamp,
    timestamp: event.timestamp,
    content: event.content,
    meta: event.meta,
    actionable: event.actionable === true ? true : undefined,
  }
}

/**
 * Options for `createNotificationStream`. `breaker` lets callers inject a
 * custom circuit breaker (test-friendly: fake clock + tighter caps);
 * default is a fresh breaker built from the documented env vars.
 */
export type CreateNotificationStreamOpts = {
  readonly breaker?: NotificationBreaker
  readonly breakerOpts?: NotificationBreakerOpts
}

/**
 * Build a notification stream bound to `scope`. Disposing the scope clears
 * the buffer + drops subscribers. Further `record(...)` calls become
 * no-ops — matching the channel-queue convention.
 *
 * Pipeline (Phase 6.b — `apps/silvercode/docs/channels.md`):
 *
 *   1. Layer 2 sanitize the payload (`sanitizeNotificationWithReport`).
 *   2. Layer 4 telemetry: every sanitization action that fired bumps a
 *      counter; a role-prefix detection emits `rolePrefixDetected`.
 *   3. Circuit breaker (`admit`) — token-bucket rate-limit per source +
 *      global. Drops are counted in telemetry and short-circuit the
 *      append (the entry never reaches the buffer or subscribers).
 *   4. Append to the per-session ring buffer + notify subscribers.
 */
export function createNotificationStream(scope: Scope, opts: CreateNotificationStreamOpts = {}): NotificationStream {
  const buffers = new Map<string, NotificationStreamEntry[]>()
  const subs = new Set<(sessionId: string, entry: NotificationStreamEntry) => void>()
  const version = signal(0)
  let disposed = false
  const breaker = opts.breaker ?? createNotificationBreaker(opts.breakerOpts)

  scope.defer(() => {
    disposed = true
    buffers.clear()
    subs.clear()
    version(0)
  })

  function instrumentSanitize(event: ChannelEvent, sessionId: string): ChannelEvent {
    const report = sanitizeNotificationWithReport(event.content)
    const actions: SanitizeAction[] = []
    if (report.ansiStripped) actions.push("ansi-stripped")
    if (report.nfcNormalized) actions.push("nfc-normalized")
    if (report.rolePrefixNeutralized) actions.push("role-prefix-neutralized")
    if (report.sizeTruncated) actions.push("size-truncated")
    for (const action of actions) {
      recordSanitizeAction({ source: event.source, action, sessionId })
    }
    if (report.rolePrefixNeutralized) {
      recordRolePrefixHit({
        source: event.source,
        layer: "sanitize",
        snippet: report.rolePrefixSnippet ?? "",
        sessionId,
      })
    } else if (containsRolePrefix(event.content)) {
      // Defensive: containsRolePrefix should match exactly when the
      // neutralizer fires; if it ever diverges we still want telemetry.
      recordRolePrefixHit({
        source: event.source,
        layer: "sanitize",
        snippet: event.content.slice(0, 8),
        sessionId,
      })
    }
    if (report.output === event.content) return event
    return { ...event, content: report.output }
  }

  return {
    record(sessionId: string, event: ChannelEvent): boolean {
      if (disposed) return false
      const sanitized = instrumentSanitize(event, sessionId)
      const decision = breaker.admit(sanitized)
      if (!decision.ok) {
        recordDropped({ source: event.source, reason: decision.reason, sessionId })
        return false
      }
      recordAdmitted({ source: event.source, kind: "notification", sessionId })
      const entry = toEntry(sanitized)
      const buf = buffers.get(sessionId) ?? []
      buf.push(entry)
      if (buf.length > MAX_PER_SESSION) {
        // Trim oldest entries — bounded ring buffer semantics.
        buf.splice(0, buf.length - MAX_PER_SESSION)
      }
      buffers.set(sessionId, buf)
      version(version() + 1)
      for (const fn of subs) {
        try {
          fn(sessionId, entry)
        } catch {
          /* a misbehaving subscriber must not block the stream */
        }
      }
      return true
    },
    entries(sessionId: string): readonly NotificationStreamEntry[] {
      // Defensive copy: the per-session buffer is mutated in-place by
      // `record()`, so returning the live reference defeats React's
      // referential-equality check — the hook's `setEntries(snapshot)` would
      // see the same array each time and skip the re-render. Symptom: notification
      // events arrive in the buffer but don't appear in the chat scrollback
      // until some OTHER state change forces a parent re-render (e.g. user
      // sends a prompt → input clears → re-render → mutated array now visible).
      // Bead: km-silvercode.claude-acp-wire-bugs.
      const buf = buffers.get(sessionId)
      return buf ? buf.slice() : []
    },
    subscribe(handler): () => void {
      if (disposed) return () => undefined
      subs.add(handler)
      return () => {
        subs.delete(handler)
      }
    },
    version,
    clearSession(sessionId: string): void {
      if (!buffers.has(sessionId)) return
      buffers.delete(sessionId)
      version(version() + 1)
    },
    breaker,
  }
}
