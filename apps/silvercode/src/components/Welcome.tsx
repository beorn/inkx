import React from "react"
import { Box, H1, H2, Muted, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"

/**
 * Per-agent display label for the welcome heading. Mirrors the
 * `AGENT_DISPLAY` map in `SidePanel.tsx` so the welcome card and the
 * side-panel branding row stay in sync. When the active agent is unknown
 * (custom / free-form id), the heading drops the "for X" suffix instead
 * of showing the raw id — bare "Silver Code" is the safe fallback.
 *
 * Bead: km-silvercode.welcome-claude-hardcoded.
 */
const AGENT_LABELS: Readonly<Record<string, string>> = {
  "claude-code": "Claude Code",
  "claude-code-spawn": "Claude Code",
  "claude-code-sdk": "Claude Code",
  codex: "Codex",
  "codex-spawn": "Codex",
  gemini: "Gemini",
  "github-copilot-cli": "GitHub Copilot",
}

/**
 * Empty-state card shown when a session has no messages yet. Contains only
 * the help surface users reach for BEFORE they've sent a first message:
 * product title, getting-started hint, command + keybind reference.
 * Modes live in the side panel (hover over "Mode: …") — duplicating them
 * here was noise; the user lives in the mode indicator once they're past
 * the intro screen.
 */
export function Welcome(props: {
  handle: SessionHandle
  /** Canonical agent id from BUILTIN_AGENTS — drives the "for X" suffix
   *  on the H1. Undefined / unknown id falls back to bare "Silver Code". */
  agent?: string
}): React.ReactElement {
  const agentLabel = props.agent ? AGENT_LABELS[props.agent] : undefined
  return (
    <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
      <Box flexDirection="row" gap={1}>
        <Text bold color="$accent">
          ◈
        </Text>
        <H1>{agentLabel ? `Silver Code for ${agentLabel}` : "Silver Code"}</H1>
      </Box>

      <Box flexDirection="column">
        <H2>Commands</H2>
        <IntroRow name="/inbox" desc="cross-session permission triage" />
        <IntroRow name="/panel" desc="toggle the todos + agents side panel" />
        <IntroRow name="/history" desc="replay + search past sessions" />
        <IntroRow name="/mode [name]" desc="cycle plan / accept-edits / auto / bypass" />
        <IntroRow name="/handoff <prompt>" desc="move task + context to another session" />
        <IntroRow name="/fork" desc="spawn a seeded sibling session" />
        <IntroRow name="/spawn [name]" desc="open another session in the grid" />
      </Box>

      <Box flexDirection="column">
        <H2>Keybindings</H2>
        <IntroRow name="ctrl-o" desc="toggle the side panel (todos + agents)" />
        <IntroRow name="ctrl-e" desc="permission inbox" />
        <IntroRow name="ctrl-r" desc="history view" />
        <IntroRow name="ctrl-n" desc="next session (multi-session)" />
        <IntroRow name="ctrl-g v / s / x / z" desc="pane chord: vsplit / hsplit / close / zoom" />
        <IntroRow name="ctrl-g h/j/k/l" desc="swap focused pane with neighbor" />
        <IntroRow name="esc" desc="dismiss open overlays" />
        <IntroRow name="ctrl-c / ctrl-d ctrl-d" desc="exit silvercode" />
      </Box>
    </Box>
  )
}

function IntroRow({ name, desc }: { name: string; desc: string }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={2} paddingLeft={2}>
      <Box flexBasis={24}>
        <Text color="$accent">{name}</Text>
      </Box>
      <Box flexGrow={1}>
        <Muted>{desc}</Muted>
      </Box>
    </Box>
  )
}
