/**
 * PaneBar — shared top bar component for all pane types.
 *
 * Provides consistent styling across board, detail, and empty panes:
 * - White background when focused (yellow when board-level selected)
 * - Dimmed text when unfocused
 * - Left/right layout with overflow hidden on the left
 * - Pane label [N] on the right in multi-pane mode
 *
 * Each pane type provides its own left and right content as children.
 */

import React from "react"
import { Box, Text } from "inkx"

export interface PaneBarProps {
  /** Left side content (path, title, etc.) — will be overflow-hidden */
  left: React.ReactNode
  /** Right side content (view mode, indicators, etc.) — won't shrink */
  right?: React.ReactNode
  /** Whether this pane has focus */
  isFocused: boolean
  /** Override background color (e.g., "yellow" for board-level selection) */
  backgroundColor?: string
  /** Pane label for multi-pane mode (e.g., "1", "2", "1d") */
  paneLabel?: string | null
}

export function PaneBar({ left, right, isFocused, backgroundColor, paneLabel }: PaneBarProps): React.ReactElement {
  // Focused: white bg (ANSI 7). Unfocused: gray bg (ANSI 8) — subtly dimmed.
  const bg = backgroundColor ?? (isFocused ? "$border" : "$muted")

  return (
    <Box id="top-bar" flexShrink={0} flexDirection="row" backgroundColor={bg} color={"$selectedfg"} dimColor={!isFocused}>
      {/* Left: content (path, title, etc.) */}
      <Box flexGrow={1} overflow="hidden">
        {left}
      </Box>
      {/* Right: indicators + pane label */}
      <Box flexShrink={0} flexDirection="row">
        {right}
        {paneLabel != null && (
          <Text dimColor={!isFocused} bold={isFocused}>
            {" "}[{paneLabel}]
          </Text>
        )}
      </Box>
    </Box>
  )
}
