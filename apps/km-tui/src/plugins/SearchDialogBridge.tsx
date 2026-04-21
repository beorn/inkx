/**
 * SearchDialogBridge — feature-flagged adapter between km's search overlay
 * and either the legacy `ui.showSearchDialog` state or the TEA plugin store.
 *
 * When `KM_TEA_SEARCH=1`, reads visibility/scope/initialInput from the plugin
 * via `useSearchDialog()`. Otherwise, reads from the props passed down from
 * the legacy UI state. This lets the single render path in WorkspaceChrome
 * render either source without branching logic outside this file.
 *
 * Scope discipline (mirrors HelpOverlayBridge):
 *
 * - Bridge owns the flag-check, the SearchDialog-wrapping wrapper (positioning),
 *   and which state source feeds the props.
 * - Bridge does NOT own: text query, selectedIndex, result rendering,
 *   onSelect/onCancel callbacks, dialog-guard scope stack.
 *
 * This cutover keeps SearchDialog.tsx itself completely unchanged — the
 * bridge just switches which four state fields feed it.
 */
import React from "react"
import { Box } from "@silvery/ag-react"
import { SearchDialog } from "../views/SearchDialog.tsx"
import { useSearchDialog } from "./use-search-dialog.ts"
import { isTeaSearchEnabled } from "./with-search-dialog.ts"
import type { KNode } from "@km/core"

export interface SearchDialogBridgeProps {
  /** Legacy path: ui.showSearchDialog. */
  legacyVisible: boolean
  /** Legacy path: ui.searchDialogInitialInput. */
  legacyInitialInput: string
  /** Legacy path: ui.searchScope. */
  legacyScope: "all" | "selected"
  /** Legacy path: ui.searchScopeNodeIds. */
  legacyScopeNodeIds: string[]
  /** Called when the dialog commits a selection (unchanged from legacy). */
  onSelect: (targetNode: KNode) => void
  /** Called when the dialog is cancelled (unchanged from legacy). */
  onCancel: () => void
  /** Called when initial input is consumed (legacy path clears ui field). */
  onConsumeInitialInput: () => void
  /** Terminal width for positioning. */
  termWidth: number
  /** Content height for positioning. */
  contentHeight: number
}

/**
 * Render the search dialog from either state source. The wrapper positioning
 * matches WorkspaceChrome.tsx's CenterDialog for the search case (widthFraction
 * 2/3, maxWidth 90, topFraction 1/6). Inlined here because CenterDialog is a
 * local function in WorkspaceChrome and this bridge is meant to be a single
 * drop-in replacement.
 */
export function SearchDialogBridge({
  legacyVisible,
  legacyInitialInput,
  legacyScope,
  legacyScopeNodeIds,
  onSelect,
  onCancel,
  onConsumeInitialInput,
  termWidth,
  contentHeight,
}: SearchDialogBridgeProps): React.ReactElement | null {
  // `useSearchDialog` must be called unconditionally (Rules of Hooks), so we
  // use a child component for the TEA path — same idiom as HelpOverlayBridge.
  return isTeaSearchEnabled() ? (
    <TeaSearchDialog
      onSelect={onSelect}
      onCancel={onCancel}
      onConsumeInitialInput={onConsumeInitialInput}
      termWidth={termWidth}
      contentHeight={contentHeight}
    />
  ) : legacyVisible ? (
    <SearchDialogWrapper
      termWidth={termWidth}
      contentHeight={contentHeight}
      initialInput={legacyInitialInput}
      scope={legacyScope}
      scopeNodeIds={legacyScopeNodeIds}
      onSelect={onSelect}
      onCancel={onCancel}
      onConsumeInitialInput={onConsumeInitialInput}
    />
  ) : null
}

/**
 * TEA-path render: subscribes to the plugin store via `useSyncExternalStore`.
 * The hook MUST be called unconditionally — hence the separate component.
 */
function TeaSearchDialog({
  onSelect,
  onCancel,
  onConsumeInitialInput,
  termWidth,
  contentHeight,
}: {
  onSelect: (targetNode: KNode) => void
  onCancel: () => void
  onConsumeInitialInput: () => void
  termWidth: number
  contentHeight: number
}): React.ReactElement | null {
  const { visible, initialInput, scope, scopeNodeIds } = useSearchDialog()
  if (!visible) return null
  return (
    <SearchDialogWrapper
      termWidth={termWidth}
      contentHeight={contentHeight}
      initialInput={initialInput}
      scope={scope}
      scopeNodeIds={scopeNodeIds}
      onSelect={onSelect}
      onCancel={onCancel}
      onConsumeInitialInput={onConsumeInitialInput}
    />
  )
}

/**
 * SearchDialogWrapper — the same positioning/chrome WorkspaceChrome.tsx used
 * for the legacy path. Kept here so the bridge is a single drop-in replacement
 * for the `{ui.showSearchDialog && <CenterDialog> ... </CenterDialog>}` block.
 *
 * Positioning matches WorkspaceChrome's CenterDialog for the search case:
 * maxWidth 90, widthFraction 2/3, topFraction 1/6.
 */
function SearchDialogWrapper({
  termWidth,
  contentHeight,
  initialInput,
  scope,
  scopeNodeIds,
  onSelect,
  onCancel,
  onConsumeInitialInput,
}: {
  termWidth: number
  contentHeight: number
  initialInput: string
  scope: "all" | "selected"
  scopeNodeIds: string[]
  onSelect: (targetNode: KNode) => void
  onCancel: () => void
  onConsumeInitialInput: () => void
}): React.ReactElement {
  const w = Math.min(90, Math.floor((termWidth * 2) / 3))
  return (
    <Box
      position="absolute"
      width={w}
      marginLeft={Math.floor((termWidth - w) / 2)}
      marginTop={Math.floor(contentHeight / 6)}
      focusScope
      data-dialog="search"
    >
      <SearchDialog
        onSelect={onSelect}
        onCancel={onCancel}
        width={w}
        maxHeight={Math.floor((contentHeight * 2) / 3)}
        initialInput={initialInput}
        onConsumeInitialInput={onConsumeInitialInput}
        scope={scope}
        scopeNodeIds={scopeNodeIds}
      />
    </Box>
  )
}
