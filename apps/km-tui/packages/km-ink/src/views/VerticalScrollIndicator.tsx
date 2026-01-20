/**
 * Vertical Scroll Indicator Component
 *
 * Shows a full-height vertical bar with centered arrow (‹ or ›)
 * indicating horizontal scroll direction.
 *
 * Uses inkx Box backgroundColor to fill the area - no manual height needed.
 * The component uses flexGrow to fill available vertical space.
 */
import React from "react";
import { Box, Text } from "inkx";

export interface VerticalScrollIndicatorProps {
  direction: "left" | "right";
}

/**
 * Vertical scroll indicator that fills available height with gray background.
 * Arrow is centered vertically using flexbox justifyContent.
 */
export function VerticalScrollIndicator({
  direction,
}: VerticalScrollIndicatorProps): React.ReactElement {
  const arrow = direction === "left" ? "‹" : "›";

  return (
    <Box
      flexDirection="column"
      width={1}
      flexGrow={1}
      backgroundColor="gray"
      justifyContent="center"
      alignItems="center"
    >
      <Text color="white">{arrow}</Text>
    </Box>
  );
}

/**
 * Vertical separator line between columns.
 * Uses flexGrow to fill available height. Shows blank line at top
 * then vertical line characters filling the rest.
 */
export function ColumnSeparator(): React.ReactElement {
  return (
    <Box flexDirection="column" width={1} flexGrow={1}>
      {/* Blank line to align with column header spacing */}
      <Box height={1} flexShrink={0}>
        <Text> </Text>
      </Box>
      {/* Vertical line fills remaining space */}
      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        <Text color="gray">│</Text>
      </Box>
    </Box>
  );
}
