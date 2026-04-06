/**
 * Vertical Scroll Indicator Component
 *
 * Shows a full-height 1-char column with dark grey arrows indicating
 * horizontal scroll direction. Always rendered to prevent layout shift;
 * arrows only appear when there is overflow (hiddenCount > 0).
 */
import React from "react"
import { Box, Text } from "@silvery/ag-react"

export interface VerticalScrollIndicatorProps {
  direction: "left" | "right"
  /** Number of hidden items in this direction. 0 = placeholder only (no arrows). */
  hiddenCount?: number
}

/** Arrow + blank line pattern, repeated to fill any height. Clipped by overflow="hidden". */
const ARROW_FILL_LEFT = "◂\n \n".repeat(100)
const ARROW_FILL_RIGHT = "▸\n \n".repeat(100)

/**
 * Vertical scroll indicator — 1 char wide, fills available height.
 * When active (hiddenCount > 0): dark grey arrows with blank lines between.
 * When inactive (hiddenCount === 0): empty 1-char spacer (prevents layout shift).
 */
export function VerticalScrollIndicator({
  direction,
  hiddenCount = 1,
}: VerticalScrollIndicatorProps): React.ReactElement {
  const active = hiddenCount > 0

  return (
    <Box data-scroll-indicator={direction} width={1} flexShrink={0} flexGrow={0} overflow="hidden" userSelect="none">
      {active && (
        <Text dimColor color="$muted">
          {direction === "left" ? ARROW_FILL_LEFT : ARROW_FILL_RIGHT}
        </Text>
      )}
    </Box>
  )
}
