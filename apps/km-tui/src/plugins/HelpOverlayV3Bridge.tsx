/**
 * HelpOverlayV3Bridge — React adapter for the v3 `withHelpOverlay()` plugin.
 *
 * Renders the same `<HelpOverlay />` view the v1 and v2 bridges render. The
 * only difference is the state source: this bridge subscribes to the v3
 * app's `help` contribution via `useHelpOverlayV3()` (which is a thin
 * `useSyncExternalStore` over the plugin's closure-owned state).
 *
 * Hook must be called unconditionally, so the subscription lives in its
 * own component rather than inlined in a ternary.
 */
import React from "react"
import { HelpOverlay } from "../views/HelpOverlay.tsx"
import { getHelpV3App, useHelpOverlayV3 } from "./help-overlay.v3.ts"

export function HelpOverlayV3Bridge({ width, height }: { width: number; height: number }): React.ReactElement | null {
  const app = getHelpV3App()
  const { visible, scrollOffset } = useHelpOverlayV3(app)
  if (!visible) return null
  return <HelpOverlay width={width} height={height} scrollOffset={scrollOffset} />
}
