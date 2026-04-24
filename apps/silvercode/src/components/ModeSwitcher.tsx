import React from "react"
import { Box, Small, Text } from "silvery"

const MODES = [
  { id: "plan", label: "Plan", color: "$info" as const },
  { id: "accept-edits", label: "Accept-Edits", color: "$warning" as const },
  { id: "auto", label: "Auto", color: "$success" as const },
  { id: "bypass", label: "Bypass", color: "$error" as const },
]

export function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: string
  onChange: (mode: string) => void
}): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      <Small>Mode:</Small>
      {MODES.map((m) => (
        <Text
          key={m.id}
          bold={m.id === mode}
          color={m.id === mode ? m.color : "$muted"}
          onClick={() => onChange(m.id)}
        >
          {m.id === mode ? `[${m.label}]` : m.label}
        </Text>
      ))}
    </Box>
  )
}
