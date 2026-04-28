import React, { useEffect, useState } from "react"
import { Box, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"

/**
 * One on-screen toast.
 *
 * `errorKey` is set on `kind === "error"` toasts and is what the dedup
 * logic matches on — `<sessionName>::<errorMessage>`. When a duplicate
 * error fires while the toast is still on screen, we increment `count`
 * on the existing toast (and refresh its dismissal timer) instead of
 * stacking a new one. Bead km-silvercode.error-dedup mirrors the same
 * dedup contract in `session-reducer.ts` for the underlying
 * `state.lastError` projection.
 */
type Toast = {
  id: number
  text: string
  kind: "info" | "warn" | "error"
  errorKey?: string
  count: number
}

let seq = 1

export function Notifications({ sessions }: { sessions: SessionHandle[] }): React.ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    // Track setTimeout handles per-toast so we can refresh the timer
    // on a dedup hit (re-arm the dismissal) and so unmount clears
    // pending dismissals — otherwise a toast's setState fires on an
    // unmounted component.
    const timers = new Map<number, ReturnType<typeof setTimeout>>()
    const scheduleDismiss = (id: number, ms: number): void => {
      const existing = timers.get(id)
      if (existing) clearTimeout(existing)
      const h = setTimeout(() => {
        timers.delete(id)
        setToasts((t) => t.filter((x) => x.id !== id))
      }, ms)
      timers.set(id, h)
    }
    const unsubs = sessions.map((s) =>
      s.session.subscribe((e) => {
        if (e.kind === "permission-request") {
          const id = seq++
          setToasts((t) => [
            ...t,
            { id, text: `${s.name}: permission requested (${e.tool})`, kind: "warn", count: 1 },
          ])
          scheduleDismiss(id, 4000)
        } else if (e.kind === "error") {
          const errorKey = `${s.name}::${e.message}`
          let dedupedId: number | null = null
          setToasts((t) => {
            // Walk from the most recent toast backwards. Only consecutive
            // identical error toasts collapse — a different error in
            // between starts a fresh entry. Mirrors the
            // session-reducer's `lastError` dedup contract so toast
            // and `state.lastError` agree on what is "the same incident."
            for (let i = t.length - 1; i >= 0; i--) {
              const x = t[i]!
              if (x.kind !== "error") continue
              if (x.errorKey === errorKey) {
                dedupedId = x.id
                const updated = t.slice()
                updated[i] = { ...x, count: x.count + 1 }
                return updated
              }
              break
            }
            const id = seq++
            dedupedId = id
            return [...t, { id, text: `${s.name}: ${e.message}`, kind: "error", errorKey, count: 1 }]
          })
          if (dedupedId !== null) scheduleDismiss(dedupedId, 5000)
        }
      }),
    )
    return () => {
      for (const u of unsubs) u()
      for (const h of timers.values()) clearTimeout(h)
    }
  }, [sessions])

  if (toasts.length === 0) return <Box />
  return (
    <Box flexDirection="column" paddingX={1}>
      {toasts.map((t) => (
        <Text key={t.id} color={t.kind === "error" ? "$error" : t.kind === "warn" ? "$warning" : "$info"}>
          🔔 {t.text}
          {t.count > 1 ? ` (×${t.count})` : ""}
        </Text>
      ))}
    </Box>
  )
}
