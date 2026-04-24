import React from "react"
import { Box, Muted, Small, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"
import {
  contextUtilizationColor,
  contextUtilizationLevel,
  contextUtilizationPercent,
  contextWindowFor,
} from "../context-windows.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"
import { AgentsPanel } from "./AgentsPanel.tsx"
import { TodoPanel } from "./TodoPanel.tsx"

/**
 * Right-side panel — full height. Houses the session's todos, sub-agents,
 * and a bottom-pinned metadata block (cwd, silvercode logo+version, Claude
 * Code version/model, mode, account, token/context/cost). No border —
 * visual separation from the main cards area comes from the slightly
 * different background color on the container.
 */

const MODE_COLORS: Record<string, string> = {
  plan: "$info",
  "accept-edits": "$warning",
  auto: "$success",
  bypass: "$error",
}

const SILVERCODE_VERSION = "0.1.0" // bump when apps/silvercode/package.json changes

export function SidePanel({
  handle,
  mode,
  sessionCount,
  onCycleMode,
}: {
  handle: SessionHandle
  mode: string
  sessionCount: number
  onCycleMode: () => void
}): React.ReactElement {
  const state = useStoreSignal(handle.store)
  const modeColor = MODE_COLORS[mode] ?? "$muted"
  const totalTokens = state.cost.inputTokens + state.cost.outputTokens
  const window = contextWindowFor(state.model)
  const pct = contextUtilizationPercent(totalTokens, window)
  const ctxColor = contextUtilizationColor(contextUtilizationLevel(pct))
  const ctxLabel = `${Math.round(totalTokens / 1000)}K / ${Math.round(window / 1000)}K (${pct}%)`

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1} gap={1}>
      {/* Upper scrollable region — todos + agents */}
      <Box flexDirection="column" flexGrow={1} gap={1} overflow="hidden">
        <TodoPanel handle={handle} />
        <AgentsPanel handle={handle} />
      </Box>

      {/* Bottom-pinned metadata block. Pushed to the bottom via flexGrow on
          the upper region; this stays at intrinsic height. */}
      <Box flexDirection="column" flexShrink={0} gap={0}>
        <MetaRow label="cwd" value={state.cwd || "…"} />
        <Box flexDirection="row" gap={1}>
          <Text color="$accent">◈</Text>
          <Small>silvercode v{SILVERCODE_VERSION}</Small>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color="$accent">✻</Text>
          <Small>Claude Code v{state.claudeCodeVersion || "…"}</Small>
        </Box>
        <MetaRow label="model" value={state.model || "…"} />
        <Box flexDirection="row" gap={1}>
          <Muted>mode</Muted>
          <Text color={modeColor} bold onClick={onCycleMode}>
            ⚡ {mode}
          </Text>
        </Box>
        {handle.account && <MetaRow label="account" value={handle.account} />}
        <MetaRow label="ctx" valueColor={ctxColor} value={ctxLabel} />
        <MetaRow label="cost" value={`$${state.cost.usd.toFixed(4)}`} />
        <MetaRow label="sessions" value={String(sessionCount)} />
        <MetaRow label="tools" value={String(state.tools.length)} />
        <MetaRow label="skills" value={String(state.skills.length)} />
        {state.mcpServers.length > 0 && <MetaRow label="mcp" value={state.mcpServers.join(",")} />}
      </Box>
    </Box>
  )
}

function MetaRow({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1}>
      <Muted>{label}</Muted>
      <Text color={valueColor}>{value}</Text>
    </Box>
  )
}
