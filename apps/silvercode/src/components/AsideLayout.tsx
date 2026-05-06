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

export function AsideLayout({
  mode,
  asideWidth,
  aside,
  children,
  asideBackgroundColor,
}: AsideLayoutProps): React.ReactElement {
  // Stable React tree across modes — render the aside subtree always,
  // varying only its layout props. Eliminates the unmount-remeasure-flip-
  // remount feedback loop documented in
  // `@km/silvercode/post-resize-ui-stability`. Combined with the
  // `Content.Row` structural fix (Content.tsx), this addresses both the
  // primary `available=0→N` loop and the secondary `88↔120` sidebar-mode
  // loop. Wrapper always `position="relative"` — no-op for inline/hidden,
  // correct anchor for overlay.
  const isOverlay = mode === "overlay"
  const isHidden = mode === "hidden"
  return (
    <Box flexDirection="row" flexGrow={1} minHeight={0} position="relative">
      {children}
      <Box
        flexDirection="column"
        backgroundColor={isHidden ? undefined : asideBackgroundColor}
        display={isHidden ? "none" : "flex"}
        position={isOverlay ? "absolute" : undefined}
        top={isOverlay ? 0 : undefined}
        right={isOverlay ? 0 : undefined}
        bottom={isOverlay ? 0 : undefined}
        width={isOverlay ? asideWidth : undefined}
        flexShrink={isOverlay ? undefined : 0}
        flexBasis={isOverlay ? undefined : asideWidth}
      >
        {aside}
      </Box>
    </Box>
  )
}
