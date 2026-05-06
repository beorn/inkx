/**
 * <BoundedScroll>
 *
 * Wrap any disclosed content (Accordion body, ToolCall expanded body, popovers)
 * with a height bound + scroll behavior. Short content renders verbatim;
 * content exceeding `maxRows` becomes scrollable via mouse wheel — no
 * indefinite vertical scroll-jacking when a tool dumps thousands of lines.
 *
 * Why this exists:
 * Disclosures that show their full content "as-is" turn one expanded block
 * into a screenful of context that pushes everything else out. The user's
 * design rule: any disclosure caps at 30 visible rows and becomes a kinetic
 * scroll container past that bound. The maxRows default matches that rule.
 *
 * Usage:
 *
 *     <BoundedScroll>
 *       <Text>{longBody}</Text>
 *     </BoundedScroll>
 *
 *     // Custom cap (e.g. tighter bound for inline previews):
 *     <BoundedScroll maxRows={10}>
 *       <Text>{summary}</Text>
 *     </BoundedScroll>
 *
 * Bead: km-silvercode.acp-tool-call.
 */

import React from "react"
import { Box, useKineticScroll } from "silvery"

export const DEFAULT_DISCLOSURE_MAX_ROWS = 30

export interface BoundedScrollProps {
  /** Cap on visible rows. Content exceeding this scrolls. Default: 30. */
  maxRows?: number
  /** Body — any silvery node tree. */
  children: React.ReactNode
}

export function BoundedScroll({
  maxRows = DEFAULT_DISCLOSURE_MAX_ROWS,
  children,
}: BoundedScrollProps): React.ReactElement {
  // maxScroll undefined → "not yet known"; the layout phase clamps regardless,
  // so we can omit the upfront content measurement and let the scroll engine
  // discover the bound on first wheel event.
  const { scrollOffset, onWheel } = useKineticScroll({})
  return (
    <Box
      flexDirection="column"
      flexGrow={0}
      flexShrink={1}
      maxHeight={maxRows}
      overflow="scroll"
      scrollOffset={scrollOffset}
      onWheel={onWheel}
    >
      {children}
    </Box>
  )
}
