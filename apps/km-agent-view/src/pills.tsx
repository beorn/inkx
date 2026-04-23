import React from "react"
import { Text } from "silvery"

/**
 * Pill — tiny inline chip.
 *
 * Convention (matches apps/km-logview/src/LogRow.tsx `Pill`):
 *   - Colored bold text, NO inverse fill. Inverse was tried; too loud.
 *   - When the row is the cursor row, pill fg collapses to `$fg-cursor` so it
 *     reads against the cursor-bg without clashing.
 *
 * This is the agent-view building block for hook clusters, kind chips inside
 * bubbles, and any future filter-bar chips. Inline by default — wrap the pill
 * in a Box with padding if you want visual breathing room.
 */
export function Pill({
  color,
  bold = true,
  isCursor = false,
  children,
}: {
  color?: string
  bold?: boolean
  isCursor?: boolean
  children: React.ReactNode
}) {
  return (
    <Text color={isCursor ? "$fg-cursor" : color} bold={bold || undefined}>
      {children}
    </Text>
  )
}
