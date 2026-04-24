import React from "react"
import { Box, H1, H2, Muted, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"

/**
 * Empty-state card shown when a session has no messages yet. Contains only
 * the help surface users reach for BEFORE they've sent a first message:
 * product title, getting-started hint, command + keybind reference.
 * Modes live in the side panel (hover over "Mode: …") — duplicating them
 * here was noise; the user lives in the mode indicator once they're past
 * the intro screen.
 */
export function Welcome(_: { handle: SessionHandle }): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
      <Box flexDirection="row" gap={1}>
        <Text bold color="$accent">
          ◈
        </Text>
        <H1>Silver Code for Claude Code</H1>
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
