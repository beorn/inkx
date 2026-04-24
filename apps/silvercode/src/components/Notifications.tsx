import React, { useEffect, useState } from "react"
import { Box, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"

type Toast = { id: number; text: string; kind: "info" | "warn" | "error" }

let seq = 1

export function Notifications({ sessions }: { sessions: SessionHandle[] }): React.ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const unsubs = sessions.map((s) =>
      s.session.subscribe((e) => {
        if (e.kind === "permission-request") {
          const id = seq++
          setToasts((t) => [...t, { id, text: `${s.name}: permission requested (${e.tool})`, kind: "warn" }])
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
        } else if (e.kind === "error") {
          const id = seq++
          setToasts((t) => [...t, { id, text: `${s.name}: ${e.message}`, kind: "error" }])
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
        }
      }),
    )
    return () => {
      for (const u of unsubs) u()
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
