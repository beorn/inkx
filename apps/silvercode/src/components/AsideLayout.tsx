/**
 * AsideLayout — main + aside, responsive flex direction.
 *
 * The component auto-decides aside-vs-inline from the viewport breakpoint:
 *
 *   - At or above `breakpoint`: `flexDirection: "row"`. Aside renders as a
 *     right-side flex sibling consuming `asideWidth` columns; main flexes
 *     into the remaining space.
 *   - Below `breakpoint`: `flexDirection: "column"`. Aside stacks below
 *     main, using full available width — "render as aside if there's
 *     space, otherwise inline as body."
 *
 * Caller passes `aside={null}` to hide the aside entirely (e.g. user
 * dismissed the panel). Layout decision is the component's; presence
 * decision is the caller's.
 *
 * No position="absolute" overlay, no `mode` enum. Driven by silvery's
 * `useResponsiveBoxProps` reading the global terminal width via
 * `useResponsiveValue` — the canonical responsive-layout primitive.
 *
 * Bead: @km/silvercode/aside-auto-layout.
 */

import React from "react"
import { Box, type Breakpoint, useResponsiveBoxProps } from "silvery"

export interface AsideLayoutProps {
  /** Breakpoint at and above which the aside renders as a side column. Default: "lg". */
  breakpoint?: Breakpoint
  /** Aside column count at wide widths. Used as flexBasis in row mode. */
  asideWidth: number
  /** Aside content. Pass null/undefined to omit entirely. */
  aside: React.ReactNode | null
  /** Main content. Always rendered. */
  children: React.ReactNode
  /**
   * Optional background color for the aside Box wrapper. Use a semantic
   * token (e.g. "$bg-surface-subtle") to keep the chrome cohesive.
   */
  asideBackgroundColor?: string
}

export function AsideLayout({
  breakpoint = "lg",
  asideWidth,
  aside,
  children,
  asideBackgroundColor,
}: AsideLayoutProps): React.ReactElement {
  const containerLayout = useResponsiveBoxProps({
    default: { flexDirection: "column" },
    [breakpoint]: { flexDirection: "row" },
  })
  const asideLayout = useResponsiveBoxProps({
    default: { width: "100%", flexShrink: 0 },
    [breakpoint]: { flexBasis: asideWidth, flexShrink: 0, width: undefined },
  })

  if (!aside) {
    return (
      <Box flexGrow={1} flexDirection="row" minHeight={0}>
        {children}
      </Box>
    )
  }

  return (
    <Box flexGrow={1} minHeight={0} {...containerLayout}>
      {children}
      <Box {...asideLayout} flexDirection="column" backgroundColor={asideBackgroundColor}>
        {aside}
      </Box>
    </Box>
  )
}
