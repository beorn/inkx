import React, { useEffect, useState } from "react"
import { Box, Text } from "silvery"
import { createScope } from "@silvery/scope"
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

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

export function summarizeErrorMessage(message: string): string {
  const applyPatch = message.match(
    /^codex_core::tools::router:\s+error=apply_patch verification failed:\s+Failed to find expected lines in ([^:]+):/s,
  )
  if (applyPatch) return `apply_patch failed: expected lines not found in ${applyPatch[1]}`
  return oneLine(message)
}

export function Notifications({ sessions }: { sessions: SessionHandle[] }): React.ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    // Track dismiss cancelers per-toast so we can refresh the timer on a
    // dedup hit and unmount clears pending dismissals.
    const scope = createScope("notifications")
    const timers = new Map<number, () => void>()
    const scheduleDismiss = (id: number, ms: number): void => {
      const existing = timers.get(id)
      existing?.()
      const cancel = scope.timeout(() => {
        timers.delete(id)
        setToasts((t) => t.filter((x) => x.id !== id))
      }, ms)
      timers.set(id, cancel)
    }
    const unsubs = sessions.map((s) =>
      s.session.subscribe((e) => {
        if (e.kind === "permission-request") {
          const id = seq++
          setToasts((t) => [...t, { id, text: `${s.name}: permission requested (${e.tool})`, kind: "warn", count: 1 }])
          scheduleDismiss(id, 4000)
        } else if (e.kind === "error") {
          const errorKey = `${s.name}::${e.message}`
          const text = `${s.name}: ${summarizeErrorMessage(e.message)}`
          let dedupedId: number | null = null
          setToasts((t) => {
            // Walk from the most recent toast backwards. Only consecutive
            // identical error toasts collapse — a different error in
            // between starts a fresh entry. Mirrors the
            // session-reducer's `lastError` dedup contract so toast
            // and `state.lastError` agree on what is "the same incident."
            for (let i = t.length - 1; i >= 0; i--) {
              const x = t[i]
              if (x === undefined) continue
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
            return [...t, { id, text, kind: "error", errorKey, count: 1 }]
          })
          if (dedupedId !== null) scheduleDismiss(dedupedId, 5000)
        }
      }),
    )
    return () => {
      for (const u of unsubs) u()
      void scope[Symbol.asyncDispose]()
    }
  }, [sessions])

  if (toasts.length === 0) return <Box />
  return (
    <Box flexDirection="column">
      {toasts.map((t) => (
        <Text key={t.id} color={t.kind === "error" ? "$error" : t.kind === "warn" ? "$warning" : "$info"}>
          🔔 {t.text}
          {t.count > 1 ? ` (×${t.count})` : ""}
        </Text>
      ))}
    </Box>
  )
}
