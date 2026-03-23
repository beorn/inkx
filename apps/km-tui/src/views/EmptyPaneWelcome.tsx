/**
 * Empty Pane Welcome — shown in newly-created panes before navigation.
 * Displays keyboard shortcut hints for common navigation commands.
 */

import React from "react"
import { Box, Muted, Small } from "@silvery/ag-react"

export function EmptyPaneWelcome(): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      <Muted>Empty pane</Muted>
      <Small> </Small>
      <Small> gp open board picker</Small>
      <Small> gi go to inbox</Small>
      <Small> gj go to journal</Small>
      <Small> gh go to home</Small>
      <Small> gN go to next actions</Small>
      <Small> </Small>
      <Small> Ctrl+W q close this pane</Small>
    </Box>
  )
}
