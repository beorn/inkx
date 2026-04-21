/**
 * MemoryModeBanner — prominent top-of-screen warning for memory mode.
 *
 * Rendered when the repo is running without a `.km/` directory (no
 * persistence). The tiny "MEM" indicator in the bottom-right status
 * counters is too subtle — users have lost work believing their edits
 * were saved. This banner takes one row at the top with a warning-
 * colored background so it's impossible to miss.
 *
 * Bead: km-tui.memory-mode-silent-loss
 */

import React from "react"
import { Box, Text } from "@silvery/ag-react"

export interface MemoryModeBannerProps {
  /** Terminal width so the banner fills the whole row. */
  width: number
}

/**
 * Render a single-row warning banner at the top of the workspace.
 *
 * Styling uses semantic tokens:
 *   - `$bg-warning` background — unmissable yellow/amber per theme.
 *   - `$fg-on-accent` text — guaranteed contrast against warning bg.
 *
 * The banner is read-only chrome: not focusable, no input handling,
 * fixed at 1 row. Pane content flows beneath it in the column layout.
 */
export function MemoryModeBanner({ width }: MemoryModeBannerProps): React.ReactElement {
  return (
    <Box
      id="memory-mode-banner"
      testID="memory-mode-banner"
      flexDirection="row"
      flexShrink={0}
      height={1}
      width={width}
      backgroundColor="$bg-warning"
      paddingX={1}
      justifyContent="center"
      userSelect="none"
    >
      <Text color="$fg-on-accent" bold>
        ⚠ Memory mode — edits will NOT be saved. Run `km init` to persist changes.
      </Text>
    </Box>
  )
}
