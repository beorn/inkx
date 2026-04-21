/**
 * HelpOverlayBridge — feature-flagged adapter between km's help overlay
 * and one of three plugin stores (v1 singleton, v2 definePlugin, v3 pipe).
 *
 * Branch selection (first match wins):
 *   KM_TEA_HELP_V3=1 → `HelpOverlayV3Bridge` (pipe + with-plugin + createSlice wrapper)
 *   KM_TEA_HELP_V2=1 → `helpOverlay` definePlugin store
 *   KM_TEA_HELP=1    → v1 zustand singleton (`useHelpOverlay()`)
 *   else             → legacy `ui.showHelp` / `ui.helpScrollOffset`
 *
 * All three plugin paths stay alive so the parity test matrix can drive
 * identical user journeys through every store and assert matching state.
 * Cleanup (removing v1 + v2) is a separate cutover — bead
 * km-tui.tea-help-overlay-v3.
 */
import React from "react"
import { HelpOverlay } from "../views/HelpOverlay.tsx"
import { useHelpOverlay } from "./use-help-overlay.ts"
import { isTeaHelpEnabled } from "./with-help-overlay.ts"
import { helpOverlay, isTeaHelpV2Enabled } from "./help-overlay.v2.ts"
import { isTeaHelpV3Enabled } from "./help-overlay.v3.ts"
import { HelpOverlayV3Bridge } from "./HelpOverlayV3Bridge.tsx"

export interface HelpOverlayBridgeProps {
  /** Legacy path: ui.showHelp from the board-app store. */
  legacyVisible: boolean
  /** Legacy path: ui.helpScrollOffset from the board-app store. */
  legacyScrollOffset: number
  /** Terminal width, pass-through to HelpOverlay. */
  width: number
  /** Content height, pass-through to HelpOverlay. */
  height: number
}

/**
 * Renders the help overlay when visibility is on. The store that owns
 * visibility-and-offset is chosen by feature flag (see module header);
 * `<HelpOverlay />` itself is unchanged across all paths.
 *
 * Flags are read per-render so tests can flip them between cases without
 * a process restart.
 */
export function HelpOverlayBridge({
  legacyVisible,
  legacyScrollOffset,
  width,
  height,
}: HelpOverlayBridgeProps): React.ReactElement | null {
  if (isTeaHelpV3Enabled()) return <HelpOverlayV3Bridge width={width} height={height} />
  if (isTeaHelpV2Enabled()) return <V2HelpOverlay width={width} height={height} />
  if (isTeaHelpEnabled()) return <V1HelpOverlay width={width} height={height} />
  if (!legacyVisible) return null
  return <HelpOverlay width={width} height={height} scrollOffset={legacyScrollOffset} />
}

/** v1 path — zustand singleton via `useHelpOverlay()` / `useSyncExternalStore`. */
function V1HelpOverlay({ width, height }: { width: number; height: number }): React.ReactElement | null {
  const { visible, scrollOffset } = useHelpOverlay()
  if (!visible) return null
  return <HelpOverlay width={width} height={height} scrollOffset={scrollOffset} />
}

/** v2 path — definePlugin store. Subscribes via its own `subscribe()`/`getState()`. */
function V2HelpOverlay({ width, height }: { width: number; height: number }): React.ReactElement | null {
  const { visible, scrollOffset } = React.useSyncExternalStore(
    helpOverlay.subscribe,
    helpOverlay.getState,
    helpOverlay.getState,
  )
  if (!visible) return null
  return <HelpOverlay width={width} height={height} scrollOffset={scrollOffset} />
}
