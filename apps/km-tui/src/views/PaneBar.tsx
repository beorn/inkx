/**
 * PaneBar — shared top bar component for all pane types.
 *
 * Provides consistent styling across board, detail, and empty panes:
 * - Chrome bg/fg ($fg-on-inverse/$fg-on-inverse) by default (light bg, dark text in dark themes)
 * - Yellow ($selected) background when board-level selected
 * - Per-pane theme dims tokens for unfocused panes
 * - Left/right layout with overflow hidden on the left
 * - Pane label [N] on the right in multi-pane mode
 *
 * Each pane type provides its own left and right content as children.
 */

import React from "react"
import { Box, Text } from "@silvery/ag-react"

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
  // Per-pane theme dims all $tokens for unfocused panes — no manual dimColor needed.
  const bg = backgroundColor ?? "$bg-inverse"

  return (
    <Box
      id="top-bar"
      data-view="top-bar"
      flexShrink={0}
      flexDirection="row"
      backgroundColor={bg}
      color="$fg-on-inverse"
      userSelect="none"
    >
      {/* Left: content (path, title, etc.) */}
      <Box flexGrow={1} overflow="hidden">
        {left}
      </Box>
      {/* Right: indicators + pane label */}
      <Box flexShrink={0} flexDirection="row">
        {right}
        {paneLabel != null && <Text bold={isFocused}> [{paneLabel}]</Text>}
      </Box>
    </Box>
  )
}
