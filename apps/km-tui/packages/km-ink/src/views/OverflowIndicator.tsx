/**
 * Overflow Indicator Component
 *
 * Shows scroll overflow indicators (▲/▼) for virtualized lists.
 * Shared between CardColumn and ListView.
 */
import React from "react";
import { Box, Text } from "ink";

export interface OverflowIndicatorProps {
  direction: "up" | "down";
  count: number;
  width: number;
  /** Style variant: "bar" shows full-width background, "text" shows simple text */
  variant?: "bar" | "text";
}

/**
 * Overflow indicator for scrollable content.
 * Returns null when count is 0.
 */
export function OverflowIndicator({
  direction,
  count,
  width,
  variant = "bar",
}: OverflowIndicatorProps): React.ReactElement | null {
  if (count <= 0) return null;

  const arrow = direction === "up" ? "▲" : "▼";

  if (variant === "text") {
    return (
      <Text dimColor>
        {arrow} {count} more {direction === "up" ? "above" : "below"}
      </Text>
    );
  }

  // Bar variant: full-width background
  const padding = Math.max(0, Math.floor((width - 2) / 2));
  return (
    <Box width={width} flexShrink={0}>
      <Text backgroundColor="gray" color="white">
        {" ".repeat(padding)}
        {arrow}
        {" ".repeat(Math.max(0, width - padding - 1))}
      </Text>
    </Box>
  );
}
