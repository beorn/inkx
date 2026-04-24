import React from "react"
import { createSessionStore } from "@km/agent-harness"
import { Box, Muted, Text } from "silvery"
import {
  contextUtilizationColor,
  contextUtilizationLevel,
  contextUtilizationPercent,
  contextWindowFor,
  formatContextUtilization,
} from "../context-windows.ts"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"

// Stable empty store for the "no session" branch so the hook below can be
// called unconditionally — the branch `session ? useHook(session.store) :
// null` is a React rules-of-hooks violation that manifests as "Should have
// a queue" when the session prop transitions null <-> defined between
// renders.
const EMPTY_STORE = createSessionStore()

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
  const state = useStoreSignal(session?.store ?? EMPTY_STORE)
  const hasSession = session != null
  const totalTokens = hasSession ? state.cost.inputTokens + state.cost.outputTokens : 0
  const contextWindow = contextWindowFor(hasSession ? state.model : undefined)
  const contextPercent = contextUtilizationPercent(totalTokens, contextWindow)
  const contextLabel = formatContextUtilization(totalTokens, contextWindow)
  const contextColor = contextUtilizationColor(contextUtilizationLevel(contextPercent))
  const costStr = hasSession ? `$${state.cost.usd.toFixed(4)}` : "–"
  const modeColor = MODE_COLORS[mode] ?? "$muted"

  return (
    <Box backgroundColor="$inversebg" paddingX={1} flexDirection="row" gap={2} justifyContent="flex-start">
      <Text color="$inverse" bold>
        ◈ silvercode
      </Text>
      <Muted>
        [{sessionCount} session{sessionCount === 1 ? "" : "s"}]
      </Muted>
      {session && (
        <>
          <Text color="$inverse">{session.name}</Text>
          {session.account && <Muted>@{session.account}</Muted>}
          <Muted>{state.model || "–"}</Muted>
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
          <Text color={contextColor}>{contextLabel}</Text>
          <Muted>{costStr}</Muted>
        </>
      )}
      <Box flexGrow={1} />
    </Box>
  )
}
