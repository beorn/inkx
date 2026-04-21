/**
 * DeleteConfirmDialogBridge — feature-flagged adapter between km's delete-confirm
 * overlay and either the legacy `ui.deleteConfirm` state or the TEA plugin store.
 *
 * When `KM_TEA_DELETE_CONFIRM=1`, reads the pending payload from the plugin via
 * `useDeleteConfirm()`. Otherwise, reads from the props passed down from the
 * legacy UI state. This lets a single render path in WorkspaceChrome render
 * either source without branching logic outside this file.
 *
 * Scope discipline (mirrors HelpOverlayBridge + SearchDialogBridge):
 *
 * - Bridge owns the flag-check, the DeleteConfirm positioning wrapper, and
 *   which state source feeds the payload.
 * - Bridge does NOT own: the actual ConfirmDialog component, deletion
 *   execution, or the keybinding gating (`deleteConfirmOpen` in command-bridge
 *   continues to read the legacy field via dual-write).
 *
 * The positioning math is inlined from WorkspaceChrome.tsx's DeleteConfirmDialogBox
 * so this bridge is a single drop-in replacement for that inline block.
 */
import React from "react"
import { Box } from "@silvery/ag-react"
import { ConfirmDialog } from "../views/shared-components.tsx"
import { useDeleteConfirm } from "./use-delete-confirm.ts"
import { isTeaDeleteConfirmEnabled, type DeleteConfirmPayload } from "./with-delete-confirm.ts"

export interface DeleteConfirmDialogBridgeProps {
  /** Legacy path: ui.deleteConfirm from the board-app store. */
  legacyPayload: DeleteConfirmPayload | null
  /** Terminal width for positioning. */
  termWidth: number
  /** Content height for positioning. */
  contentHeight: number
}

/**
 * Render the delete-confirm dialog from either state source. Positioning
 * matches WorkspaceChrome's DeleteConfirmDialogBox exactly — keeps visual
 * parity when the flag flips.
 */
export function DeleteConfirmDialogBridge({
  legacyPayload,
  termWidth,
  contentHeight,
}: DeleteConfirmDialogBridgeProps): React.ReactElement | null {
  // `useDeleteConfirm` must be called unconditionally (Rules of Hooks), so we
  // use a child component for the TEA path — same idiom as SearchDialogBridge.
  return isTeaDeleteConfirmEnabled() ? (
    <TeaDeleteConfirmDialog termWidth={termWidth} contentHeight={contentHeight} />
  ) : legacyPayload ? (
    <DeleteConfirmDialogWrapper termWidth={termWidth} contentHeight={contentHeight} payload={legacyPayload} />
  ) : null
}

/**
 * TEA-path render: subscribes to the plugin store via `useSyncExternalStore`.
 * The hook MUST be called unconditionally — hence the separate component.
 */
function TeaDeleteConfirmDialog({
  termWidth,
  contentHeight,
}: {
  termWidth: number
  contentHeight: number
}): React.ReactElement | null {
  const { payload } = useDeleteConfirm()
  if (!payload) return null
  return <DeleteConfirmDialogWrapper termWidth={termWidth} contentHeight={contentHeight} payload={payload} />
}

/**
 * DeleteConfirmDialogWrapper — the exact positioning + data-attr shape the
 * legacy `DeleteConfirmDialogBox` (in WorkspaceChrome.tsx) used. Inlined here
 * so the bridge is a single drop-in replacement.
 *
 * Positioning: dialogWidth = min(50, floor(termWidth/2)), horizontally
 * centered, topFraction = 1/3.
 */
function DeleteConfirmDialogWrapper({
  termWidth,
  contentHeight,
  payload,
}: {
  termWidth: number
  contentHeight: number
  payload: DeleteConfirmPayload
}): React.ReactElement {
  const dialogWidth = Math.min(50, Math.floor(termWidth / 2))
  const warnings: string[] = []
  if (payload.childCount > 0) {
    warnings.push(`${payload.childCount} child${payload.childCount !== 1 ? "ren" : ""} will be deleted`)
  }
  if (payload.backlinkCount > 0) {
    warnings.push(`${payload.backlinkCount} backlink${payload.backlinkCount !== 1 ? "s" : ""} will break`)
  }
  if (payload.hasMetadata) warnings.push("Has metadata (frontmatter)")

  return (
    <Box
      position="absolute"
      marginLeft={Math.floor((termWidth - dialogWidth) / 2)}
      marginTop={Math.floor(contentHeight / 3)}
      data-dialog="delete-confirm"
      data-child-count={payload.childCount}
      data-backlink-count={payload.backlinkCount}
    >
      <ConfirmDialog title={`Delete "${payload.title}"?`} warnings={warnings} width={dialogWidth} />
    </Box>
  )
}
