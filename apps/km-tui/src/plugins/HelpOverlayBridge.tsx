/**
 * HelpOverlayBridge — feature-flagged adapter between km's help overlay
 * and either the legacy `ui.showHelp` state or the TEA plugin store.
 *
 * When `KM_TEA_HELP=1`, reads state from the plugin via
 * `useHelpOverlay()`. Otherwise, reads from the props passed down from
 * the legacy UI state. This lets a single render path in
 * WorkspaceChrome render either source without branching logic outside
 * this file.
 *
 * Phase 0 mini-cutover scope: the bridge exists for one dialog only
 * (help). Phase 1 (`withDialogs`) will replace it with a generic
 * dialog-host plugin that owns all overlays uniformly.
 */
import React from "react"
import { HelpOverlay } from "../views/HelpOverlay.tsx"
import { useHelpOverlay } from "./use-help-overlay.ts"
import { isTeaHelpEnabled } from "./with-help-overlay.ts"

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
 * Renders the help overlay when visibility is on. Reads from the plugin
 * store when the TEA flag is set, otherwise from the passed-in legacy
 * props. HelpOverlay itself stays completely unchanged — only the
 * visibility-and-offset pair switches sources.
 */
export function HelpOverlayBridge({
  legacyVisible,
  legacyScrollOffset,
  width,
  height,
}: HelpOverlayBridgeProps): React.ReactElement | null {
  return isTeaHelpEnabled() ? (
    <TeaHelpOverlay width={width} height={height} />
  ) : legacyVisible ? (
    <HelpOverlay width={width} height={height} scrollOffset={legacyScrollOffset} />
  ) : null
}

/**
 * TEA-path render: subscribes to the plugin store via
 * `useSyncExternalStore` (the Phase B pattern from tea-lifecycle-spike).
 * The hook MUST be called unconditionally — hence the separate
 * component rather than inlining a ternary with the hook.
 */
function TeaHelpOverlay({ width, height }: { width: number; height: number }): React.ReactElement | null {
  const { visible, scrollOffset } = useHelpOverlay()
  if (!visible) return null
  return <HelpOverlay width={width} height={height} scrollOffset={scrollOffset} />
}
