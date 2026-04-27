/**
 * AsideLayout — main + aside layout with three placement modes.
 *
 * Encapsulates the "do I render the aside as a flex sibling, an absolute
 * overlay, or not at all?" branching in one place. Apps stop hand-writing
 * the position="absolute" + flexBasis variants; the responsive policy is
 * cleanly separable from the geometry.
 *
 * Modes:
 *   - `inline`  — aside renders as a flex sibling to main, taking `asideWidth`
 *                 columns. Main flexes into the remaining space.
 *   - `overlay` — aside renders as an absolute-positioned overlay, right-
 *                 anchored, full-height, on top of main. Main takes full
 *                 width (so its content doesn't reflow under the overlay).
 *                 The wrapper Box has position="relative" so absolute
 *                 children anchor correctly.
 *   - `hidden`  — aside not rendered. Main takes full width.
 *
 * Caller computes mode + showAside via useResponsiveDisclosure or similar.
 * This component is purely presentational.
 *
 * Bead: docs/llm-research/tui-responsive-design-patterns (pro review).
 */

import React from "react"
import { Box } from "silvery"

export type AsideMode = "inline" | "overlay" | "hidden"

export interface AsideLayoutProps {
  /** Placement strategy. */
  mode: AsideMode
  /** Aside column count. Used by both `inline` (flexBasis) and `overlay` (width). */
  asideWidth: number
  /** The aside content. Not rendered when mode === 'hidden'. */
  aside: React.ReactNode
  /** Main content. Always rendered. */
  children: React.ReactNode
  /**
   * Optional background color for the aside Box wrapper. Use a semantic
   * token (e.g. "$bg-surface-subtle") to keep the chrome cohesive.
   */
  asideBackgroundColor?: string
}

export function AsideLayout({ mode, asideWidth, aside, children, asideBackgroundColor }: AsideLayoutProps): React.ReactElement {
  // The caller's `children` is the main region — it owns its own flexGrow / overflow / etc.
  // AsideLayout only handles the row container + the aside placement.
  if (mode === "hidden") {
    return (
      <Box flexDirection="row" flexGrow={1} minHeight={0}>
        {children}
      </Box>
    )
  }

  if (mode === "overlay") {
    return (
      <Box flexDirection="row" flexGrow={1} minHeight={0} position="relative">
        {children}
        <Box
          position="absolute"
          top={0}
          bottom={0}
          right={0}
          width={asideWidth}
          flexDirection="column"
          backgroundColor={asideBackgroundColor}
        >
          {aside}
        </Box>
      </Box>
    )
  }

  // inline
  return (
    <Box flexDirection="row" flexGrow={1} minHeight={0}>
      {children}
      <Box flexShrink={0} flexBasis={asideWidth} flexDirection="column" backgroundColor={asideBackgroundColor}>
        {aside}
      </Box>
    </Box>
  )
}
