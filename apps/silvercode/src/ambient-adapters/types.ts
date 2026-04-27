/**
 * Ambient adapter types — Phase 6.b of the ambient-context-excellence epic.
 *
 * An adapter is a small, scope-bound subscriber that:
 *
 *   1. Watches one ambient signal source (tribe broadcast, fs change, CI
 *      verdict, recall hit, sub-agent completion, …).
 *   2. Sanitizes every payload through `sanitizeAmbient` (Layer 2 of the
 *      ambient-context safety stack — see
 *      `hub/silvercode/design/ambient-context-safety.md`).
 *   3. Tags the resulting `ChannelEvent` with a fixed `source` string so
 *      the per-source mute toggles in the side panel can filter on it.
 *   4. Pushes the event onto the controller's `ChannelQueue`. The
 *      controller-scoped subscription mirrors it into the
 *      per-session `AmbientStream` for inline UI display.
 *   5. Self-throttles: at most one event every `MIN_INTER_EVENT_MS` per
 *      adapter. The global breaker (parallel work — Agent B) layers on top
 *      and applies a system-wide cap.
 *
 * Each adapter file exports a `register…AmbientAdapter(opts)` factory
 * returning a synchronous disposer. The `index.ts` barrel calls them all.
 */

import type { Scope } from "@silvery/scope"
import type { ChannelEvent, ChannelQueue } from "../channel-queue.ts"
import { sanitizeAmbient } from "../ambient-sanitize.ts"

/**
 * Per-adapter minimum interval between successive emits. The breaker
 * layered on top (Agent B's work) applies a global cap; this is the
 * adapter-local floor. 500ms matches the spec.
 */
export const MIN_INTER_EVENT_MS = 500

/**
 * Stable adapter identifiers. These match the keys used by
 * `AmbientEventRow` (`SOURCE_PRESENTATION`) and the per-source mute
 * toggles in `SidePanel`. Anything outside this list will render with the
 * fallback presentation, which is fine but loses iconography — keep new
 * sources in sync with `AmbientEventRow.tsx`.
 */
export type AmbientSource = "tribe" | "recall" | "subagent" | "ci" | "filewatch" | "telegram"

/**
 * Common options every adapter accepts. Adapters may extend this with
 * source-specific knobs (e.g. tribe bus path, ci poll interval).
 *
 * `now()` and `enqueue()` are wired by `registerAllAmbientAdapters`. They
 * are exposed so individual adapter tests can drive them deterministically
 * without standing up a real `ChannelQueue` — the queue's enqueue contract
 * (single-arg, fire-and-forget) is straightforward to fake.
 */
export type AmbientAdapterCtx = {
  readonly scope: Scope
  readonly queue: ChannelQueue
  /** Monotonic clock used for the per-adapter debounce. Defaults to `Date.now`. */
  readonly now?: () => number
}

/**
 * One enqueue call from an adapter. Goes through:
 *
 *   1. Per-adapter debounce (`MIN_INTER_EVENT_MS`).
 *   2. `sanitizeAmbient` on `content`.
 *   3. `queue.enqueue(...)` if not dropped.
 *
 * Returns `true` if the event was enqueued, `false` if debounced. The
 * boolean is observable in tests; adapters in production code don't act
 * on it.
 */
export type AdapterEmit = (event: Omit<ChannelEvent, "content"> & { content: string }) => boolean

/**
 * Build a debounced emit fn for a single adapter. Each adapter holds its
 * own throttle state — sources don't share quota with each other (the
 * global breaker handles cross-source caps).
 */
export function createDebouncedEmit(ctx: AmbientAdapterCtx): AdapterEmit {
  const now = ctx.now ?? (() => Date.now())
  let lastEmit = 0
  return (raw): boolean => {
    const t = now()
    if (t - lastEmit < MIN_INTER_EVENT_MS) return false
    lastEmit = t
    const sanitized = sanitizeAmbient(raw.content)
    if (sanitized.length === 0) return false
    ctx.queue.enqueue({ ...raw, content: sanitized })
    return true
  }
}

let nextId = 1
/** Stable, source-tagged event id. Suitable for both production + tests. */
export function makeAmbientEventId(source: AmbientSource | string): string {
  return `${source}-${Date.now()}-${nextId++}`
}
