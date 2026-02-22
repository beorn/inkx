/**
 * Empty Pane Welcome — shown in newly-created panes before navigation.
 * Displays keyboard shortcut hints for common navigation commands.
 */

import React from "react"
import { Box, Text } from "inkx"

export function EmptyPaneWelcome(): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      <Text dimColor>Empty pane</Text>
      <Text> </Text>
      <Text dimColor>  gp  open board picker</Text>
      <Text dimColor>  gi  go to inbox</Text>
      <Text dimColor>  gj  go to journal</Text>
      <Text dimColor>  gh  go to home</Text>
      <Text dimColor>  gN  go to next actions</Text>
      <Text> </Text>
      <Text dimColor>  Ctrl+W q  close this pane</Text>
    </Box>
  )
}
