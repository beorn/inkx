/**
 * Vertical Scroll Indicator Component
 *
 * Shows a full-height vertical bar with centered arrow (‹ or ›)
 * indicating horizontal scroll direction.
 *
 * Note: This component still requires an explicit height because terminals
 * cannot render background colors on empty space - each row needs a character.
 * However, the height is passed from the parent which can derive it from
 * flexbox calculations, keeping the dimension logic centralized.
 */
import React from "react";
import { Box, Text } from "inkx";

export interface VerticalScrollIndicatorProps {
  direction: "left" | "right";
  /** Height of the indicator bar. Required because terminals need character content. */
  height: number;
}

/**
 * Vertical scroll indicator that fills the specified height with gray background.
 * Arrow is centered vertically within the bar.
 */
export function VerticalScrollIndicator({
  direction,
  height,
}: VerticalScrollIndicatorProps): React.ReactElement {
  const arrow = direction === "left" ? "‹" : "›";
  const midpoint = Math.floor(height / 2);

  return (
    <Box flexDirection="column" width={1} height={height}>
      {Array.from({ length: height }).map((_, i) => (
        <Text key={i} backgroundColor="gray" color="white">
          {i === midpoint ? arrow : " "}
        </Text>
      ))}
    </Box>
  );
}

/**
 * Vertical separator line between columns.
 * Shows a blank line at top then vertical line characters.
 */
export interface ColumnSeparatorProps {
  /** Height of the separator. Required because terminals need character content. */
  height: number;
}

export function ColumnSeparator({
  height,
}: ColumnSeparatorProps): React.ReactElement {
  return (
    <Box flexDirection="column" width={1} height={height}>
      {/* Blank line to align with column header spacing */}
      <Text> </Text>
      {Array.from({ length: height - 1 }).map((_, j) => (
        <Text key={j} color="gray">
          │
        </Text>
      ))}
    </Box>
  );
}
