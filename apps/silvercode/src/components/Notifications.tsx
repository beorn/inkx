import React, { useEffect, useState } from "react"
import { Box, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"

type Toast = { id: number; text: string; kind: "info" | "warn" | "error" }

let seq = 1

export function Notifications({ sessions }: { sessions: SessionHandle[] }): React.ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    // Track setTimeout handles so unmount clears pending dismissals —
    // otherwise a toast's setState fires on an unmounted component.
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const scheduleDismiss = (id: number, ms: number): void => {
      const h = setTimeout(() => {
        timers.delete(h)
        setToasts((t) => t.filter((x) => x.id !== id))
      }, ms)
      timers.add(h)
    }
    const unsubs = sessions.map((s) =>
      s.session.subscribe((e) => {
        if (e.kind === "permission-request") {
          const id = seq++
          setToasts((t) => [...t, { id, text: `${s.name}: permission requested (${e.tool})`, kind: "warn" }])
          scheduleDismiss(id, 4000)
        } else if (e.kind === "error") {
          const id = seq++
          setToasts((t) => [...t, { id, text: `${s.name}: ${e.message}`, kind: "error" }])
          scheduleDismiss(id, 5000)
        }
      }),
    )
    return () => {
      for (const u of unsubs) u()
      for (const h of timers) clearTimeout(h)
    }
  }, [sessions])

  if (toasts.length === 0) return <Box />
  return (
    <Box flexDirection="column" paddingX={1}>
      {toasts.map((t) => (
        <Text key={t.id} color={t.kind === "error" ? "$error" : t.kind === "warn" ? "$warning" : "$info"}>
          🔔 {t.text}
        </Text>
      ))}
    </Box>
  )
}
