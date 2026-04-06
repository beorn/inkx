/**
 * Overflow Indicator Component
 *
 * Shows scroll overflow indicators (▲/▼) for virtualized lists.
 * Unified component used by all views (CardColumn, ListView, ColumnsView, TabsView).
 *
 * Design: Inverse text (white on gray) with centered arrow and count.
 */
import React from "react"
import { Box, Text } from "@silvery/ag-react"

export interface OverflowIndicatorProps {
  direction: "up" | "down"
  count: number
  /** Width to center the text within (optional) */
  width?: number
}

/**
 * Overflow indicator for scrollable content.
 * Shows centered "▲ N more" or "▼ N more" text with inverse styling.
 * Returns null when count is 0.
 */
export function OverflowIndicator({ direction, count, width }: OverflowIndicatorProps): React.ReactElement | null {
  if (count <= 0) return null

  const arrow = direction === "up" ? "▲" : "▼"
  const text = `${arrow} ${count} more`

  // If width provided and sufficient, center the text with full-width background
  if (width && width > text.length) {
    const leftPad = Math.floor((width - text.length) / 2)
    const rightPad = width - text.length - leftPad
    return (
      <Box width={width} flexShrink={0} userSelect="none">
        <Text backgroundColor="$muted" color="$fg">
          {" ".repeat(leftPad)}
          {text}
          {" ".repeat(rightPad)}
        </Text>
      </Box>
    )
  }

  // No width or too narrow - just show the text with inverse styling
  return (
    <Text backgroundColor="$muted" color="$fg">
      {text}
    </Text>
  )
}
