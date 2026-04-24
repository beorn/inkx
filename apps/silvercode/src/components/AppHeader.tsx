import React from "react"
import { Box, Muted, Text } from "silvery"

/**
 * Top banner — silvercode logo + tagline + current cwd. Matches the shape
 * of Claude Code's own top-of-session heading so the visual hierarchy feels
 * familiar: glyph + product name, then metadata line, then path.
 */
export function AppHeader({ cwd, track }: { cwd: string; track: string }): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        <Text color="$accent" bold>
          ◈
        </Text>
        <Text bold color="$primary">
          silvercode
        </Text>
        <Muted>— silvery-native agent workspace</Muted>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Muted>{cwd}</Muted>
        <Muted>·</Muted>
        <Muted>track:{track}</Muted>
      </Box>
    </Box>
  )
}
