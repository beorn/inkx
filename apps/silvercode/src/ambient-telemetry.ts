/**
 * Ambient Layer 4 telemetry — observability surface for the
 * ambient-context safety stack (`hub/silvercode/design/ambient-context-safety.md`
 * § 3 Layer 4, § 4 Phase 6.b).
 *
 * With Layer 3 (loop-closure) shipped, Layer 4 is pure telemetry — the
 * loop is already closed, so any role-prefix marker that slips through
 * Layers 0–3 is information, not damage. This module is the place where
 * those signals are counted, namespaced, and surfaced via loggily.
 *
 * Counters (process-global, monotonically increasing):
 *
 *   - `role_prefix_hits` — Layer 2 / Layer 3 detected a role-prefix
 *     marker in an ambient payload or assistant turn.
 *   - `sanitize_actions` — Layer 2 sanitization applied a transformation
 *     (ANSI strip, role-prefix neutralize, size-bound, etc.).
 *   - `dropped_events_per_source` — circuit breaker rejected an event
 *     because the per-source bucket was empty.
 *   - `dropped_events_global` — circuit breaker rejected an event because
 *     the global bucket was empty.
 *   - `events_admitted_per_source` — circuit breaker admitted an event.
 *
 * Loggily namespace: `silvercode:ambient`. Each `record*` helper emits a
 * structured loggily event in addition to bumping the counter, so a
 * downstream JSONL writer (e.g. `DEBUG_LOG`) gets the per-event trail
 * while the snapshot accessor gives an O(1) summary for `silvercode
 * doctor ambient` and tests.
 *
 * Snippet redaction: `recordRolePrefixHit` accepts a payload string but
 * only ever logs the FIRST 8 CODE UNITS of it (`snippet_first_8_chars`).
 * Full payloads NEVER cross the loggily boundary — that would re-publish
 * trigger tokens into the log stream, which itself becomes recall-bait.
 *
 * Pure, process-global counters. No I/O outside loggily. Reset via
 * `resetTelemetry()` (test-only — production code never calls it).
 */

import { createLogger } from "loggily"

const log = createLogger("silvercode:ambient")

/** One observability counter row. */
type CounterMap = Record<string, number>

type Telemetry = {
  rolePrefixHits: number
  sanitizeActions: number
  droppedEventsGlobal: number
  droppedPerSource: CounterMap
  admittedPerSource: CounterMap
  sanitizeActionsByKind: CounterMap
  rolePrefixHitsBySource: CounterMap
}

const state: Telemetry = {
  rolePrefixHits: 0,
  sanitizeActions: 0,
  droppedEventsGlobal: 0,
  droppedPerSource: Object.create(null) as CounterMap,
  admittedPerSource: Object.create(null) as CounterMap,
  sanitizeActionsByKind: Object.create(null) as CounterMap,
  rolePrefixHitsBySource: Object.create(null) as CounterMap,
}

function bump(map: CounterMap, key: string): void {
  map[key] = (map[key] ?? 0) + 1
}

/**
 * One ambient telemetry counter snapshot. Returned by `getTelemetrySnapshot`.
 * All maps are returned by-value (cloned) so callers can compare snapshots
 * across time without aliasing the live counters.
 */
export type TelemetrySnapshot = {
  readonly rolePrefixHits: number
  readonly sanitizeActions: number
  readonly droppedEventsGlobal: number
  readonly droppedPerSource: Readonly<Record<string, number>>
  readonly admittedPerSource: Readonly<Record<string, number>>
  readonly sanitizeActionsByKind: Readonly<Record<string, number>>
  readonly rolePrefixHitsBySource: Readonly<Record<string, number>>
}

/**
 * Snapshot every counter. Returns a deep copy so the caller can hold
 * onto values across mutations.
 */
export function getTelemetrySnapshot(): TelemetrySnapshot {
  return {
    rolePrefixHits: state.rolePrefixHits,
    sanitizeActions: state.sanitizeActions,
    droppedEventsGlobal: state.droppedEventsGlobal,
    droppedPerSource: { ...state.droppedPerSource },
    admittedPerSource: { ...state.admittedPerSource },
    sanitizeActionsByKind: { ...state.sanitizeActionsByKind },
    rolePrefixHitsBySource: { ...state.rolePrefixHitsBySource },
  }
}

/** Reset every counter. Test-only — production must not call. */
export function resetTelemetry(): void {
  state.rolePrefixHits = 0
  state.sanitizeActions = 0
  state.droppedEventsGlobal = 0
  for (const k of Object.keys(state.droppedPerSource)) delete state.droppedPerSource[k]
  for (const k of Object.keys(state.admittedPerSource)) delete state.admittedPerSource[k]
  for (const k of Object.keys(state.sanitizeActionsByKind)) delete state.sanitizeActionsByKind[k]
  for (const k of Object.keys(state.rolePrefixHitsBySource)) delete state.rolePrefixHitsBySource[k]
}

/**
 * Where in the safety stack did detection fire?
 *
 *   - `sanitize` — Layer 2 (ambient payload, before resource construction).
 *   - `loop-closure` — Layer 3 (assistant text re-ingestion guard).
 */
export type RolePrefixLayer = "sanitize" | "loop-closure"

/**
 * Record a role-prefix detection. `snippet` is truncated to 8 code units
 * before reaching loggily — full payloads NEVER leave this function.
 *
 * `source` is the ambient source tag (`tribe`, `recall`, …) for Layer 2
 * detection, or `loop-closure` for Layer 3 (where the source is the
 * assistant model itself, which is irrelevant for telemetry partitioning).
 */
export function recordRolePrefixHit(args: {
  source: string
  layer: RolePrefixLayer
  snippet: string
  sessionId?: string
}): void {
  state.rolePrefixHits += 1
  bump(state.rolePrefixHitsBySource, args.source)
  log.warn?.("rolePrefixDetected", {
    source: args.source,
    snippet_first_8_chars: args.snippet.slice(0, 8),
    layer: args.layer,
    sessionId: args.sessionId,
  })
}

/** Kind of Layer 2 transformation that sanitizeAmbient applied. */
export type SanitizeAction = "ansi-stripped" | "role-prefix-neutralized" | "size-truncated" | "nfc-normalized"

/**
 * Record one Layer 2 sanitization action. Multiple actions can fire on
 * one payload (ANSI strip + size truncate + role-prefix neutralize); each
 * gets its own counter bump.
 */
export function recordSanitizeAction(args: { source: string; action: SanitizeAction; sessionId?: string }): void {
  state.sanitizeActions += 1
  bump(state.sanitizeActionsByKind, args.action)
  log.info?.("ambientSanitized", {
    source: args.source,
    action: args.action,
    sessionId: args.sessionId,
  })
}

/** Why a circuit breaker dropped an event. */
export type DropReason = "per-source-rate-limit" | "global-rate-limit"

/**
 * Record one circuit-breaker drop. Both per-source and global counters
 * track drops independently — a per-source rate-limit drop bumps
 * `droppedPerSource[source]`; a global rate-limit drop bumps
 * `droppedEventsGlobal` (per-source counters do NOT bump in that case
 * because the source itself was within budget).
 */
export function recordDropped(args: { source: string; reason: DropReason; sessionId?: string }): void {
  if (args.reason === "global-rate-limit") {
    state.droppedEventsGlobal += 1
  } else {
    bump(state.droppedPerSource, args.source)
  }
  log.warn?.("ambientEventDropped", {
    source: args.source,
    reason: args.reason,
    sessionId: args.sessionId,
  })
}

/**
 * Record one circuit-breaker admission. `kind` is a free-form classifier
 * (`ambient`, `actionable`, …) — today this is always `"ambient"`, but
 * future two-stage filtering can supply a richer label.
 */
export function recordAdmitted(args: { source: string; kind: string; sessionId?: string }): void {
  bump(state.admittedPerSource, args.source)
  log.info?.("ambientEventAdmitted", {
    source: args.source,
    kind: args.kind,
    sessionId: args.sessionId,
  })
}
