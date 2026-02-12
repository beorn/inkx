/**
 * Status bar - displays user feedback messages
 *
 * Shows status messages with appropriate styling based on notification level.
 * Used for action feedback like "3 tasks selected", "File saved", etc.
 */
import React from "react"
import { Box, Text } from "inkx"
import type { UIState } from "../ui-reducer.ts"

interface StatusBarProps {
  ui: UIState
  termWidth: number
}

/**
 * Status level icons and colors
 */
const STATUS_DISPLAY = {
  info: { icon: "ℹ", color: "cyan" },
  success: { icon: "✓", color: "green" },
  warning: { icon: "⚠", color: "yellow" },
  error: { icon: "✗", color: "red" },
} as const

/**
 * StatusBar component - displays feedback messages for user actions
 */
export function StatusBar({ ui, termWidth }: StatusBarProps): React.ReactElement | null {
  // Don't render if no status message
  if (!ui.status) {
    return null
  }

  const { level, message } = ui.status
  const { icon, color } = STATUS_DISPLAY[level]

  // Truncate message if too long for terminal width
  const maxMessageLength = termWidth - 4 // Account for icon and padding
  const displayMessage = message.length > maxMessageLength ? message.slice(0, maxMessageLength - 1) + "…" : message

  return (
    <Box flexDirection="row" gap={1} data-status={level} id="status">
      <Text color={color}>{icon}</Text>
      <Text>{displayMessage}</Text>
    </Box>
  )
}
