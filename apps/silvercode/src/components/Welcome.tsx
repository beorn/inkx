import React from "react"
import { Box, H3, Muted, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"

/**
 * Empty-state card shown when a session has no messages yet. Contains only
 * the help surface users reach for BEFORE they've sent a first message:
 * a one-line product marker and the command / mode / keybind reference
 * tables. Everything else (claudeCodeVersion, model, mode, account, tool
 * count, MCP servers, cost) lives in the SidePanel's bottom metadata
 * block — duplicating it here was noise.
 */
export function Welcome(_: { handle: SessionHandle }): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
      <Box flexDirection="row" gap={1}>
        <Text bold color="$accent">
          ◈
        </Text>
        <Text bold>Silver Code for Claude Code</Text>
      </Box>

      <Box flexDirection="column">
        <H3>Getting started</H3>
        <Text>Type a message and press Enter to send. Type `/` to open the command palette.</Text>
      </Box>

      <Box flexDirection="column">
        <H3>Commands</H3>
        <IntroRow name="/inbox" desc="cross-session permission triage" />
        <IntroRow name="/panel" desc="toggle the todos + agents side panel" />
        <IntroRow name="/history" desc="replay + search past sessions" />
        <IntroRow name="/mode [name]" desc="cycle plan / accept-edits / auto / bypass" />
        <IntroRow name="/handoff <prompt>" desc="move task + context to another session" />
        <IntroRow name="/fork" desc="spawn a seeded sibling session" />
        <IntroRow name="/spawn [name]" desc="open another session in the grid" />
      </Box>

      <Box flexDirection="column">
        <H3>Modes</H3>
        <Muted>Click the ⚡ label in the side panel to cycle.</Muted>
        <IntroRow name="plan" desc="Claude plans but doesn't write — review before running" />
        <IntroRow name="accept-edits" desc="file edits apply automatically; other tools still prompt" />
        <IntroRow name="auto" desc="default — everything Claude can do runs unattended" />
        <IntroRow name="bypass" desc="skip all approvals (sandboxes only)" />
      </Box>

      <Box flexDirection="column">
        <H3>Keybindings</H3>
        <IntroRow name="Ctrl+O" desc="toggle the side panel (todos + agents)" />
        <IntroRow name="Ctrl+E" desc="permission inbox" />
        <IntroRow name="Ctrl+R" desc="history view" />
        <IntroRow name="Ctrl+N" desc="next session (multi-session)" />
        <IntroRow name="Esc" desc="dismiss open overlays" />
        <IntroRow name="Ctrl+C / Ctrl+D Ctrl+D" desc="exit silvercode" />
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
