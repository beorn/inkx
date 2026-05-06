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
  // Stable React tree across modes — the aside subtree is ALWAYS mounted,
  // we only vary its layout props. This eliminates the
  // unmount-remeasure-flip-remount feedback loop documented in
  // `@km/silvercode/post-resize-ui-stability` (150 STRICT layout-overflow
  // violations during a single cmux workspace-switch repro). With a
  // conditional render, every SIGWINCH that flipped the
  // `inline`/`overlay`/`hidden` decision tore down the SidePanel subtree
  // and rebuilt it, which re-fed dimensions into the breakpoint logic
  // that drove the next mode flip — repeat ad infinitum.
  //
  // The wrapper is always `position="relative"` so the absolute-positioned
  // overlay branch anchors correctly when in overlay mode; relative is a
  // no-op for the inline/hidden modes.
  const isOverlay = mode === "overlay"
  const isHidden = mode === "hidden"
  return (
    <Box flexDirection="row" flexGrow={1} minHeight={0} position="relative">
      {children}
      <Box
        // Stable identity — same Box element across modes. Layout props
        // below switch the placement strategy without remounting.
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
