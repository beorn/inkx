import React, { useEffect, useMemo, useState } from "react"
import { Box, ListView, Text } from "silvery"
import { useInput } from "silvery/runtime"
import { filterCommands, mergeRemoteCommands, type SlashCommand } from "../slash-commands.ts"

const MAX_VISIBLE_COMMANDS = 30
const COMMAND_ROW_ESTIMATE = 3

/**
 * Available-commands palette. Appears inline above the input whenever the
 * current prompt starts with `/`.
 *
 * Backed by `available_commands_update` from the focused session's
 * session-init event (ACP `session/prompt` surface). Enter executes the
 * highlighted command; Esc closes the palette.
 *
 * Enter = execute the currently-highlighted command (NOT autocomplete —
 * autocomplete was the old flow and it confused users: "hitting Enter just
 * added a space." Now Enter triggers the real action and clears the input.)
 * Esc = close the palette.
 */
export function AvailableCommandsPalette({
  query,
  remoteCommands,
  remoteSkills: _remoteSkills,
  onSubmit,
  onClose,
}: {
  query: string
  /** Slash commands discovered from the focused session's session-init event. */
  remoteCommands?: readonly string[]
  /** Skills discovered from the focused session's session-init event (unused for now). */
  remoteSkills?: readonly string[]
  /** Fired with the command name when the user confirms a row. */
  onSubmit: (commandName: string) => void
  onClose: () => void
}): React.ReactElement | null {
  const [cursor, setCursor] = useState(0)
  const merged = useMemo(() => mergeRemoteCommands(remoteCommands ?? []), [remoteCommands])
  const filtered = useMemo(() => filterCommands(query, merged), [query, merged])
  useEffect(() => setCursor(0), [query])
  useInput(
    (input, key) => {
      if (key.escape) return onClose()
      if (key.return) {
        const cmd = filtered[cursor]
        if (cmd) onSubmit(cmd.name)
      }
    },
    { isActive: filtered.length > 0 },
  )
  if (filtered.length === 0) return null
  const visible = filtered.slice(0, MAX_VISIBLE_COMMANDS)
  const commandWidth = Math.max(10, ...filtered.map((cmd) => cmd.name.length)) + 1
  return (
    <Box flexDirection="column" backgroundColor="$bg-surface-overlay">
      <Box height={1} flexShrink={0} backgroundColor="$bg-surface-overlay">
        <Text backgroundColor="$bg-surface-overlay"> </Text>
      </Box>
      <ListView
        items={visible}
        height={visible.length * COMMAND_ROW_ESTIMATE}
        estimateHeight={COMMAND_ROW_ESTIMATE}
        nav
        active
        scrollbar={false}
        cursorKey={cursor}
        onCursor={setCursor}
        onSelect={(index) => {
          const cmd = filtered[index]
          if (cmd) onSubmit(cmd.name)
        }}
        onItemHover={setCursor}
        onItemClick={(index) => {
          setCursor(index)
          const cmd = filtered[index]
          if (cmd) onSubmit(cmd.name)
        }}
        getKey={(cmd) => cmd.name}
        renderItem={(cmd: SlashCommand, _index, meta) => (
          <Box width="100%" backgroundColor={meta.isCursor ? "$bg-cursor" : undefined}>
            <Box flexDirection="row" paddingLeft={3} width="100%" minWidth={0}>
              <Box width={commandWidth} flexShrink={0}>
                <Text
                  bold={meta.isCursor}
                  color={meta.isCursor ? "$fg-cursor" : "$fg"}
                  backgroundColor={meta.isCursor ? "$bg-cursor" : undefined}
                >
                  {cmd.name.padEnd(commandWidth)}
                </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text
                  wrap="wrap"
                  color={meta.isCursor ? "$fg-cursor" : "$fg-muted"}
                  backgroundColor={meta.isCursor ? "$bg-cursor" : undefined}
                >
                  {cmd.description}
                </Text>
              </Box>
            </Box>
          </Box>
        )}
      />
    </Box>
  )
}
