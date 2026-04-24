import React, { useEffect, useMemo, useState } from "react"
import { Box, Muted, SelectList, Text } from "silvery"
import { useInput } from "silvery/runtime"
import { filterCommands } from "../slash-commands.ts"

export function SlashCommandPalette({
  query,
  onSelect,
  onClose,
}: {
  query: string
  onSelect: (commandName: string) => void
  onClose: () => void
}): React.ReactElement | null {
  const [cursor, setCursor] = useState(0)
  const filtered = useMemo(() => filterCommands(query), [query])
  useEffect(() => setCursor(0), [query])
  useInput((input, key) => {
    if (key.escape) return onClose()
    if (key.return) {
      const cmd = filtered[cursor]
      if (cmd) onSelect(cmd.name)
    }
  }, { isActive: filtered.length > 0 })
  if (filtered.length === 0) return null
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="$accent"
      paddingX={1}
      backgroundColor="$surfacebg"
    >
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
        onSelect={(opt) => onSelect(opt.value)}
        isActive
      />
    </Box>
  )
}
