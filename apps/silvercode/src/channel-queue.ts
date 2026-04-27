/**
 * Channel queue — silvercode-owned event buffer for ambient/peer-channel
 * messages (tribe broadcasts, telegram, CI status, lore deltas, sub-agent
 * updates).
 *
 * This is the **mechanism** layer for the typed-injection pipeline that
 * replaces Claude Code's free-text `<channel source="..." ...>` tag injection.
 * Channel sources push events here; the prompt-assembly hook
 * (`prompt-assembly.ts`) decides whether to drain them as typed
 * `EmbeddedResource` blocks on the next user prompt.
 *
 * Design — see `hub/silvercode/future/ai-terminal/10-agent-router-landscape.md`
 * § "Replacing Claude Code's <channel> injection with ACP primitives". Default
 * disposition: UI-first / user-mediated. Notification badge (powered by
 * `pendingCount`) tells the user there's queued context; the user invokes
 * `/inject-tribe` (or similar) to drain it onto the next prompt as typed
 * resources. Auto-injection is opt-in — see `assembleAcpPrompt` in
 * `prompt-assembly.ts`.
 *
 * In-memory, ordered, no persistence. A controller-scoped queue per silvercode
 * process is sufficient — a daemon-restart drops queued context, which is the
 * correct behaviour (the events were already consumed via their primary
 * channel; this queue is just the priming buffer for the next prompt).
 */

import { signal } from "alien-signals"
import type { Scope } from "@silvery/scope"

/**
 * One ambient event awaiting (optional) injection on a future user prompt.
 * `source` is a free-form tag (`tribe`, `telegram`, `ci`, `lore`,
 * `subagent`, ...) — sources expand over time, so we don't lock the union.
 * `content` is rendered into the EmbeddedResource body verbatim (callers
 * are responsible for any pre-render formatting).
 */
export type ChannelEvent = {
  readonly id: string
  readonly source: string
  readonly timestamp: number
  readonly content: string
  readonly meta?: Readonly<Record<string, unknown>>
  /**
   * Hint about whether the event is actionable (e.g., a CI failure asking
   * for triage) versus purely informational (e.g., a tribe status update).
   * Today this only flows through `_meta.actionable` on the resulting
   * EmbeddedResource — future two-stage filtering may use it as a cue for
   * the actionable/ambient/ignorable classifier.
   */
  readonly actionable?: boolean
}

/**
 * Read/write surface for the channel queue. Producers call `enqueue`;
 * consumers call `drain` (whole-queue), `peek` (non-destructive), or
 * subscribe via `subscribe` for live updates. `pendingCount` is an
 * alien-signals signal so silvery components can `useSignal(queue.pendingCount)`
 * for the notification badge.
 */
export type ChannelQueue = {
  /** Append an event. Subscribers fire synchronously. */
  enqueue(event: ChannelEvent): void
  /** Remove and return all queued events (in order). */
  drain(): ChannelEvent[]
  /** Remove and return events whose `source` matches `predicate`. */
  drainWhere(predicate: (event: ChannelEvent) => boolean): ChannelEvent[]
  /** Snapshot current queue without removing anything. */
  peek(): readonly ChannelEvent[]
  /**
   * Subscribe to enqueue events. Handler runs synchronously after each
   * enqueue with the event that was added. Returns an unsubscribe fn.
   */
  subscribe(handler: (event: ChannelEvent) => void): () => void
  /** Drop everything without invoking subscribers. */
  clear(): void
  /**
   * Reactive count for badge UI. Calling with no argument returns the
   * current count; calling with a number sets it (alien-signals
   * read/write convention). Components should subscribe via `useSignal`
   * (or alien-signals `effect()`) for live updates.
   */
  readonly pendingCount: {
    (): number
    (value: number): void
  }
}

/**
 * Build a channel queue bound to `scope`. Disposing the scope clears
 * subscribers + the buffer; further calls to enqueue are no-ops.
 *
 * The queue itself owns no async resources — the scope binding is purely
 * for clean teardown of subscribers when the controller (or a child
 * container) goes away.
 */
export function createChannelQueue(scope: Scope): ChannelQueue {
  const events: ChannelEvent[] = []
  const subs = new Set<(event: ChannelEvent) => void>()
  const pendingCount = signal(0)
  let disposed = false

  scope.defer(() => {
    disposed = true
    subs.clear()
    events.length = 0
    pendingCount(0)
  })

  function notifyCount(): void {
    pendingCount(events.length)
  }

  return {
    enqueue(event: ChannelEvent): void {
      if (disposed) return
      events.push(event)
      notifyCount()
      for (const fn of subs) {
        try {
          fn(event)
        } catch {
          /* a misbehaving subscriber must not block the queue */
        }
      }
    },
    drain(): ChannelEvent[] {
      if (events.length === 0) return []
      const drained = events.splice(0, events.length)
      notifyCount()
      return drained
    },
    drainWhere(predicate: (event: ChannelEvent) => boolean): ChannelEvent[] {
      const kept: ChannelEvent[] = []
      const taken: ChannelEvent[] = []
      for (const e of events) {
        if (predicate(e)) taken.push(e)
        else kept.push(e)
      }
      if (taken.length === 0) return []
      events.length = 0
      events.push(...kept)
      notifyCount()
      return taken
    },
    peek(): readonly ChannelEvent[] {
      return events.slice()
    },
    subscribe(handler: (event: ChannelEvent) => void): () => void {
      if (disposed) return () => undefined
      subs.add(handler)
      return () => {
        subs.delete(handler)
      }
    },
    clear(): void {
      if (events.length === 0) return
      events.length = 0
      notifyCount()
    },
    pendingCount,
  }
}
