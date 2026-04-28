/**
 * HelpOverlayBridge — render the help overlay from the v3 plugin.
 *
 * After the km-tui.tea-help-overlay-v3 cleanup, v3 is the only plugin
 * path; v1 (zustand singleton) and v2 (definePlugin) have been removed.
 * The legacy `ui.showHelp` / `ui.helpScrollOffset` zustand fields are
 * still updated by `board-actions.ts` as a mirror so command-bridge
 * predicates and the escape cascade keep working without a wider TEA
 * migration — but visibility for the rendered overlay is now sourced
 * exclusively from `app.help` via the v3 plugin.
 */
import type React from "react"
import { HelpOverlayV3Bridge } from "./HelpOverlayV3Bridge.tsx"

export interface HelpOverlayBridgeProps {
  /** Terminal width, pass-through to HelpOverlay. */
  width: number
  /** Content height, pass-through to HelpOverlay. */
  height: number
}

/**
 * Renders the help overlay when the v3 plugin reports visible. The plugin
 * maintains its own state and notifies React via `useSyncExternalStore`.
 */
export function HelpOverlayBridge({ width, height }: HelpOverlayBridgeProps): React.ReactElement | null {
  return <HelpOverlayV3Bridge width={width} height={height} />
}
