/**
 * Ambient stream — per-session in-memory journal of ambient observations
 * delivered to the agent. Mirrors the prompt-assembly flow: when an
 * ambient `ChannelEvent` is wrapped as an `EmbeddedResource` and shipped
 * to the agent, the same event is recorded here so the chat scrollback
 * can render it inline at the correct timestamp.
 *
 * This is UI-only state. The stream does NOT influence what the agent
 * receives — `assembleAcpPrompt` and the channel queue handle that. Mute
 * filters consult this stream's records, never `channelQueue`.
 *
 * Design: hub/silvercode/design/ambient-inline-display.md.
 * Bead: km-silvercode.ambient-inline-display.
 */

import { signal } from "alien-signals"
import type { Scope } from "@silvery/scope"
import type { ChannelEvent } from "./channel-queue.ts"

/**
 * One ambient observation in the chat journal. Narrows `ChannelEvent`
 * to the fields the inline UI needs — the full event still flows through
 * `channelQueue` / `assembleAcpPrompt`; this is the visible echo.
 */
export type AmbientStreamEntry = {
  readonly kind: "ambient"
  readonly id: string
  readonly source: string
  readonly timestamp: number
  readonly content: string
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
export type AmbientStream = {
  /** Append an event to the named session's journal. */
  record(sessionId: string, event: ChannelEvent): void
  /** Snapshot of one session's journal in chronological order. */
  entries(sessionId: string): readonly AmbientStreamEntry[]
  /** Subscribe to record events. Handler receives `(sessionId, entry)`. */
  subscribe(handler: (sessionId: string, entry: AmbientStreamEntry) => void): () => void
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
}

const MAX_PER_SESSION = 500

function toEntry(event: ChannelEvent): AmbientStreamEntry {
  return {
    kind: "ambient",
    id: event.id,
    source: event.source,
    timestamp: event.timestamp,
    content: event.content,
    actionable: event.actionable === true ? true : undefined,
  }
}

/**
 * Build an ambient stream bound to `scope`. Disposing the scope clears
 * the buffer + drops subscribers. Further `record(...)` calls become
 * no-ops — matching the channel-queue convention.
 */
export function createAmbientStream(scope: Scope): AmbientStream {
  const buffers = new Map<string, AmbientStreamEntry[]>()
  const subs = new Set<(sessionId: string, entry: AmbientStreamEntry) => void>()
  const version = signal(0)
  let disposed = false

  scope.defer(() => {
    disposed = true
    buffers.clear()
    subs.clear()
    version(0)
  })

  return {
    record(sessionId: string, event: ChannelEvent): void {
      if (disposed) return
      const entry = toEntry(event)
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
    },
    entries(sessionId: string): readonly AmbientStreamEntry[] {
      return buffers.get(sessionId) ?? []
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
  }
}
