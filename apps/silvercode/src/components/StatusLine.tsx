import React from "react"
import { Box, Muted, Small, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"

export function StatusLine({
  session,
  mode,
  sessionCount,
}: {
  session?: SessionHandle
  mode: string
  sessionCount: number
  onSwitchMode: (mode: string) => void
}): React.ReactElement {
  const state = session ? useStoreSignal(session.store) : null
  const tokens = state ? state.cost.inputTokens + state.cost.outputTokens : 0
  const costStr = state ? `$${state.cost.usd.toFixed(4)}` : "–"
  return (
    <Box
      backgroundColor="$inversebg"
      paddingX={1}
      flexDirection="row"
      gap={2}
      justifyContent="flex-start"
    >
      <Text color="$inverse" bold>
        silvercode
      </Text>
      <Muted>
        [{sessionCount} session{sessionCount === 1 ? "" : "s"}]
      </Muted>
      {session && (
        <>
          <Text color="$inverse">{session.name}</Text>
          <Muted>{state?.model || "–"}</Muted>
          <Muted>mode:{mode}</Muted>
          <Muted>tok:{tokens}</Muted>
          <Muted>{costStr}</Muted>
        </>
      )}
      <Box flexGrow={1} />
      <Small>Ctrl+M cycle mode · Ctrl+I inbox · Ctrl+T todos · Ctrl+H history</Small>
    </Box>
  )
}
