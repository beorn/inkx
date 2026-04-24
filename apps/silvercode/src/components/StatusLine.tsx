import React from "react"
import { Box, Muted, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"

const MODE_COLORS: Record<string, string> = {
  plan: "$info",
  "accept-edits": "$warning",
  auto: "$success",
  bypass: "$error",
}

export function StatusLine({
  session,
  mode,
  sessionCount,
  onSwitchMode,
}: {
  session?: SessionHandle
  mode: string
  sessionCount: number
  onSwitchMode: (mode: string) => void
}): React.ReactElement {
  const state = session ? useStoreSignal(session.store) : null
  const tokens = state ? state.cost.inputTokens + state.cost.outputTokens : 0
  const costStr = state ? `$${state.cost.usd.toFixed(4)}` : "–"
  const modeColor = MODE_COLORS[mode] ?? "$muted"

  return (
    <Box
      backgroundColor="$inversebg"
      paddingX={1}
      flexDirection="row"
      gap={2}
      justifyContent="flex-start"
    >
      <Text color="$inverse" bold>
        ◈ silvercode
      </Text>
      <Muted>
        [{sessionCount} session{sessionCount === 1 ? "" : "s"}]
      </Muted>
      {session && (
        <>
          <Text color="$inverse">{session.name}</Text>
          <Muted>{state?.model || "–"}</Muted>
          <Text
            color={modeColor}
            bold
            onClick={() => {
              const modes = ["plan", "accept-edits", "auto", "bypass"]
              const idx = modes.indexOf(mode)
              onSwitchMode(modes[(idx + 1) % modes.length]!)
            }}
          >
            ⚡ {mode}
          </Text>
          <Muted>tok:{tokens}</Muted>
          <Muted>{costStr}</Muted>
        </>
      )}
      <Box flexGrow={1} />
    </Box>
  )
}
