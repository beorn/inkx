/**
 * Mute state — visual filter for the inline notification scrollback.
 *
 * Tracks which notification channels/sources the user has muted in the side panel. Mute
 * is UI-only: it hides matching rows from the chat scrollback but does NOT
 * stop notification events from reaching the agent. Mute is enforced
 * structurally — nothing in `prompt-assembly.ts`, `channel-queue.ts`, or
 * `channel-sources.ts` imports this module.
 *
 * Persistence: in-memory only for Phase 6.a. A future bead can promote
 * this to `~/.config/silvercode/mute-state.json` (per the design doc) so
 * toggles survive restarts.
 *
 * Design: apps/silvercode/docs/channels.md.
 * Bead: km-silvercode.notification-inline-display.
 */

import { signal } from "alien-signals"
import type { Scope } from "@silvery/scope"

/**
 * Visual mute filter for notification channels/sources. Read with `isMuted(key)`;
 * toggle with `toggle(key)`. Components subscribe to `version` (or
 * `useSignal(state.version)`) for live updates.
 */
export type MuteState = {
  isMuted(source: string): boolean
  /** Snapshot of the currently muted source set. */
  muted(): ReadonlySet<string>
  /** Add or remove a source from the muted set. */
  toggle(source: string): void
  /** Set the muted state explicitly — used by tests + bulk operations. */
  set(source: string, muted: boolean): void
  /**
   * Subscribe to mute-state changes. Handler fires after every toggle/set
   * with the current snapshot. Returns an unsubscribe fn.
   */
  subscribe(handler: (muted: ReadonlySet<string>) => void): () => void
  /** Reactive change-counter; bump on every toggle. */
  readonly version: {
    (): number
    (value: number): void
  }
}

export function createMuteState(scope: Scope): MuteState {
  const muted = new Set<string>(["filewatch", "debug"])
  const subs = new Set<(muted: ReadonlySet<string>) => void>()
  const version = signal(0)
  let disposed = false

  scope.defer(() => {
    disposed = true
    muted.clear()
    subs.clear()
    version(0)
  })

  function bump(): void {
    version(version() + 1)
    const snap = new Set(muted)
    for (const fn of subs) {
      try {
        fn(snap)
      } catch {
        /* a misbehaving subscriber must not block the state */
      }
    }
  }

  return {
    isMuted(source: string): boolean {
      return muted.has(source)
    },
    muted(): ReadonlySet<string> {
      return new Set(muted)
    },
    toggle(source: string): void {
      if (disposed) return
      if (muted.has(source)) muted.delete(source)
      else muted.add(source)
      bump()
    },
    set(source: string, isMuted: boolean): void {
      if (disposed) return
      const had = muted.has(source)
      if (isMuted && !had) {
        muted.add(source)
        bump()
      } else if (!isMuted && had) {
        muted.delete(source)
        bump()
      }
    },
    subscribe(handler): () => void {
      if (disposed) return () => undefined
      subs.add(handler)
      return () => {
        subs.delete(handler)
      }
    },
    version,
  }
}
