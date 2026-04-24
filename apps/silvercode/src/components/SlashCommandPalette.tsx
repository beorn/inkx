import React, { useEffect, useMemo, useState } from "react"
import { Box, Muted, SelectList, Text } from "silvery"
import { useInput } from "silvery/runtime"
import { filterCommands, mergeRemoteCommands } from "../slash-commands.ts"

/**
 * Slash-command palette. Appears inline above the input whenever the current
 * prompt starts with `/`.
 *
 * Enter = execute the currently-highlighted command (NOT autocomplete —
 * autocomplete was the old flow and it confused users: "hitting Enter just
 * added a space." Now Enter triggers the real action and clears the input.)
 * Esc = close the palette.
 */
export function SlashCommandPalette({
  query,
  remoteCommands,
  onSubmit,
  onClose,
}: {
  query: string
  /** Slash commands discovered from the focused session's session-init event. */
  remoteCommands?: readonly string[]
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
  return (
    <Box flexDirection="column" paddingX={1} backgroundColor="$surfacebg">
      <Box flexDirection="row" gap={1}>
        <Text bold color="$accent">
          Slash commands
        </Text>
        <Muted>Enter to run · Esc to close</Muted>
      </Box>
      <SelectList
        items={filtered.map((c) => ({ label: `${c.name}  —  ${c.description}`, value: c.name }))}
        highlightedIndex={cursor}
        onHighlight={setCursor}
        onSelect={(opt) => onSubmit(opt.value)}
        maxVisible={5}
        isActive
      />
    </Box>
  )
}
