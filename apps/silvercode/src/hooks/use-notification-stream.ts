/**
 * React hooks for the notification stream + mute state.
 *
 * `useNotificationStream(controller, sessionId)` returns the (filtered) list of
 * channel notifications for a session, re-rendering when either new events
 * land or the mute set changes.
 *
 * `useNotificationMuteState(controller)` exposes the mute set for the side
 * panel toggles.
 *
 * Mute filtering happens in this hook (UI layer) — the stream itself
 * stores every event the controller recorded, regardless of mute state,
 * so toggling a source ON re-reveals already-arrived rows without
 * losing data.
 *
 * Bead: km-silvercode.notification-inline-display.
 */

import { useEffect, useState } from "react"
import type { Controller } from "../controller.ts"
import type { ChannelNotification } from "../notification-stream.ts"

export type UseNotificationStreamOptions = {
  readonly respectMute?: boolean
}

function snapshot(
  controller: Controller,
  sessionId: string,
  options: UseNotificationStreamOptions = {},
): readonly ChannelNotification[] {
  const all = controller.notificationStream.entries(sessionId)
  if (options.respectMute === false) return all
  const muted = controller.notificationMuteState.muted()
  if (muted.size === 0) return all
  return all.filter((e) => !muted.has(e.source))
}

/**
 * Returns the (mute-filtered) channel notifications for `sessionId`.
 * Passing `controller: null` is supported and yields an empty array —
 * lets callers compose this hook unconditionally even when they don't
 * have a controller yet (rules-of-hooks-friendly).
 */
export function useNotificationStream(
  controller: Controller | null,
  sessionId: string,
  options: UseNotificationStreamOptions = {},
): readonly ChannelNotification[] {
  const [entries, setEntries] = useState<readonly ChannelNotification[]>(() =>
    controller && sessionId ? snapshot(controller, sessionId, options) : [],
  )
  const respectMute = options.respectMute !== false

  useEffect(() => {
    if (!controller || !sessionId) {
      setEntries([])
      return undefined
    }
    const refresh = (): void => setEntries(snapshot(controller, sessionId, { respectMute }))
    const unsubStream = controller.notificationStream.subscribe((sid) => {
      if (sid === sessionId) refresh()
    })
    const unsubMute = controller.notificationMuteState.subscribe(() => refresh())
    refresh()
    return () => {
      unsubStream()
      unsubMute()
    }
  }, [controller, respectMute, sessionId])

  return entries
}

/**
 * Subscribe to the mute state for the side-panel toggles. Returns the
 * current `Set<string>` of muted sources; re-renders on every toggle.
 */
export function useNotificationMuteState(controller: Controller): ReadonlySet<string> {
  const [muted, setMuted] = useState<ReadonlySet<string>>(() => controller.notificationMuteState.muted())
  useEffect(() => {
    const unsub = controller.notificationMuteState.subscribe((m) => setMuted(m))
    setMuted(controller.notificationMuteState.muted())
    return unsub
  }, [controller])
  return muted
}
