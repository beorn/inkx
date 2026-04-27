/**
 * React hooks for the ambient stream + mute state.
 *
 * `useAmbientStream(controller, sessionId)` returns the (filtered) list of
 * ambient observations for a session, re-rendering when either new events
 * land or the mute set changes.
 *
 * `useAmbientMuteState(controller)` exposes the mute set for the side
 * panel toggles.
 *
 * Mute filtering happens in this hook (UI layer) — the stream itself
 * stores every event the controller recorded, regardless of mute state,
 * so toggling a source ON re-reveals already-arrived rows without
 * losing data.
 *
 * Bead: km-silvercode.ambient-inline-display.
 */

import { useEffect, useState } from "react"
import type { Controller } from "../controller.ts"
import type { AmbientStreamEntry } from "../components/AmbientEventRow.tsx"

function snapshot(controller: Controller, sessionId: string): readonly AmbientStreamEntry[] {
  const all = controller.ambientStream.entries(sessionId)
  const muted = controller.ambientMuteState.muted()
  if (muted.size === 0) return all
  return all.filter((e) => !muted.has(e.source))
}

/**
 * Returns the (mute-filtered) ambient observations for `sessionId`.
 * Passing `controller: null` is supported and yields an empty array —
 * lets callers compose this hook unconditionally even when they don't
 * have a controller yet (rules-of-hooks-friendly).
 */
export function useAmbientStream(controller: Controller | null, sessionId: string): readonly AmbientStreamEntry[] {
  const [entries, setEntries] = useState<readonly AmbientStreamEntry[]>(() =>
    controller && sessionId ? snapshot(controller, sessionId) : [],
  )

  useEffect(() => {
    if (!controller || !sessionId) {
      setEntries([])
      return undefined
    }
    const refresh = (): void => setEntries(snapshot(controller, sessionId))
    const unsubStream = controller.ambientStream.subscribe((sid) => {
      if (sid === sessionId) refresh()
    })
    const unsubMute = controller.ambientMuteState.subscribe(() => refresh())
    refresh()
    return () => {
      unsubStream()
      unsubMute()
    }
  }, [controller, sessionId])

  return entries
}

/**
 * Subscribe to the mute state for the side-panel toggles. Returns the
 * current `Set<string>` of muted sources; re-renders on every toggle.
 */
export function useAmbientMuteState(controller: Controller): ReadonlySet<string> {
  const [muted, setMuted] = useState<ReadonlySet<string>>(() => controller.ambientMuteState.muted())
  useEffect(() => {
    const unsub = controller.ambientMuteState.subscribe((m) => setMuted(m))
    setMuted(controller.ambientMuteState.muted())
    return unsub
  }, [controller])
  return muted
}
