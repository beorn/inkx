import React from "react"
import { Box, H1, H3, Muted, Small, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"

/**
 * Empty-state card shown when a session has no messages yet. Reads live from
 * the store so fields populated by session-init (claudeCodeVersion, model,
 * tools count, mcp servers) appear as soon as the subprocess announces them.
 *
 * The shape mirrors Claude Code's own top-of-session banner so the visual
 * hierarchy feels familiar: logo + product line, then metadata, then help.
 */
export function Welcome({ handle }: { handle: SessionHandle }): React.ReactElement {
  const state = useStoreSignal(handle.store)
  const hasInit = state.sessionId != null
  const version = state.claudeCodeVersion || "…"
  const model = state.model || "…"
  const mode = state.mode || "…"
  const mcp = state.mcpServers.length === 0 ? "–" : state.mcpServers.join(", ")
  const toolCount = state.tools.length
  const skillCount = state.skills.length
  const pluginCount = state.plugins.length

  return (
    <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
      {/* Logo line */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="$accent">
          ◈
        </Text>
        <H1>silvercode</H1>
        <Muted>— silvery-native shell over Claude Code</Muted>
      </Box>

      {/* Claude Code info */}
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color="$accent">✻</Text>
          <Text bold>Claude Code</Text>
          <Muted>v{version}</Muted>
          <Muted>·</Muted>
          <Muted>{model}</Muted>
          <Muted>·</Muted>
          <Muted>mode: {mode}</Muted>
          {handle.account && (
            <>
              <Muted>·</Muted>
              <Muted>@{handle.account}</Muted>
            </>
          )}
        </Box>
        <Box flexDirection="row" gap={1} paddingLeft={2}>
          <Small>
            {toolCount} tools · {skillCount} skills · {pluginCount} plugins · MCP: {mcp}
          </Small>
        </Box>
      </Box>

      {/* Getting started */}
      <Box flexDirection="column">
        <H3>Getting started</H3>
        <Text>Type a message and press Enter to send. Type `/` to open the command palette.</Text>
      </Box>

      {/* Slash commands table */}
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

      {/* Modes */}
      <Box flexDirection="column">
        <H3>Modes</H3>
        <Muted>Click the ⚡ label in the status bar to cycle.</Muted>
        <IntroRow name="plan" desc="Claude plans but doesn't write — review before running" />
        <IntroRow name="accept-edits" desc="file edits apply automatically; other tools still prompt" />
        <IntroRow name="auto" desc="default — everything Claude can do runs unattended" />
        <IntroRow name="bypass" desc="skip all approvals (sandboxes only)" />
      </Box>

      {/* Keybindings */}
      <Box flexDirection="column">
        <H3>Keybindings</H3>
        <IntroRow name="Ctrl+O" desc="toggle the side panel (todos + agents)" />
        <IntroRow name="Ctrl+E" desc="permission inbox" />
        <IntroRow name="Ctrl+R" desc="history view" />
        <IntroRow name="Ctrl+N" desc="next session (multi-session)" />
        <IntroRow name="Esc" desc="dismiss open overlays" />
        <IntroRow name="Ctrl+C / Ctrl+D Ctrl+D" desc="exit silvercode" />
      </Box>

      {!hasInit && (
        <Muted>spawning claude subprocess — session-init will populate the details above…</Muted>
      )}
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
