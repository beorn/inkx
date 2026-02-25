/**
 * WorkspaceChrome — workspace-level overlays rendered once for the entire terminal.
 *
 * Contains: bottom bar (CommandBox + StatusCounters), ToastStack, SyncPane,
 * bell indicator, and all dialog overlays. These were previously rendered
 * per-pane inside BoardCore — moving them here ensures they render exactly
 * once regardless of pane count, and dialogs center on the full screen.
 */

import React, { useCallback, useMemo } from "react"
import { Box, Text } from "inkx"
import { useApp as useAppStore, StoreContext } from "inkx/runtime"
import type { BoardAppStore } from "../board-app-store.ts"
import type { UIState } from "../ui-reducer.ts"
import { useRepo } from "../repo-context.tsx"
import { useBoardDialogs } from "./use-board-dialogs.ts"
import { useCursorNodePosition, CursorStoreProvider } from "../cursor-context.tsx"
import { CommandBox, StatusCounters } from "./CommandBox.tsx"
import { ToastStack } from "./ToastStack.tsx"
import { SyncPane } from "./SyncPane.tsx"
import { ProjectPicker } from "./ProjectPicker.tsx"
import { HelpOverlay } from "./HelpOverlay.tsx"
import { DatePromptDialog } from "./DatePromptDialog.tsx"
import { SearchDialog } from "./SearchDialog.tsx"
import { FilterDialog } from "./FilterDialog.tsx"
import { Omnibox, type OmniboxResult } from "./Omnibox.tsx"
import { ConfirmDialog } from "./shared-components.tsx"
import { SearchReplaceDialog } from "./SearchReplaceDialog.tsx"
import { NewItemDialog } from "./NewItemDialog.tsx"
import { popDialogMode } from "../dialog-guard.ts"
import { dispatchCommandById } from "../board-app.ts"
import { FILTER_PANEL_WIDTH } from "./board-layout.ts"
import type { ToastQueue } from "@km/core"
import type { CursorStore } from "../cursor-store.ts"

// =============================================================================
// Dialog Layout Helpers (moved from Board.tsx)
// =============================================================================

function DialogBox({
  termWidth,
  contentHeight,
  maxWidth,
  widthFraction = 1 / 2,
  topFraction,
  children,
  ...rest
}: {
  termWidth: number
  contentHeight: number
  maxWidth: number
  widthFraction?: number
  topFraction: number
  children: React.ReactNode
  "data-dialog": string
}): React.ReactElement {
  const w = Math.min(maxWidth, Math.floor(termWidth * widthFraction))
  return (
    <Box
      position="absolute"
      marginLeft={Math.floor((termWidth - w) / 2)}
      marginTop={Math.floor(contentHeight * topFraction)}
      {...rest}
    >
      {children}
    </Box>
  )
}

function DeleteConfirmDialogBox({
  termWidth,
  contentHeight,
  deleteConfirm: dc,
}: {
  termWidth: number
  contentHeight: number
  deleteConfirm: { nodeIds: string[]; title: string; childCount: number; backlinkCount: number; hasMetadata?: boolean }
}): React.ReactElement {
  const dialogWidth = Math.min(50, Math.floor(termWidth / 2))
  const warnings: string[] = []
  if (dc.childCount > 0) warnings.push(`${dc.childCount} child${dc.childCount !== 1 ? "ren" : ""} will be deleted`)
  if (dc.backlinkCount > 0) warnings.push(`${dc.backlinkCount} backlink${dc.backlinkCount !== 1 ? "s" : ""} will break`)
  if (dc.hasMetadata) warnings.push("Has metadata (frontmatter)")
  return (
    <Box
      position="absolute"
      marginLeft={Math.floor((termWidth - dialogWidth) / 2)}
      marginTop={Math.floor(contentHeight / 3)}
      data-dialog="delete-confirm"
    >
      <ConfirmDialog title={`Delete "${dc.title}"?`} warnings={warnings} width={dialogWidth} />
    </Box>
  )
}

// =============================================================================
// Cursor-Aware Dialog Wrappers
// =============================================================================

/**
 * CursorAwareNewItemDialog - subscribes to cursor position for cursorNode.
 */
function CursorAwareNewItemDialog({
  onCreate,
  onCancel,
  width,
  height,
}: {
  onCreate: (newNodeId: string) => void
  onCancel: () => void
  width: number
  height: number
}): React.ReactElement {
  const cursorPos = useCursorNodePosition()
  const repo = useRepo()
  const cursorNode = cursorPos.cursorCardNodeId ? (repo.getNode(cursorPos.cursorCardNodeId) ?? null) : null
  return <NewItemDialog cursorNode={cursorNode} onCreate={onCreate} onCancel={onCancel} width={width} height={height} />
}

// =============================================================================
// WorkspaceChrome
// =============================================================================

export interface WorkspaceChromeProps {
  termWidth: number
  termHeight: number
  consoleStats?: { total: number; errors: number; warnings: number }
  toastQueue?: ToastQueue
  cursorStore: CursorStore
}

export function WorkspaceChrome({
  termWidth,
  termHeight,
  consoleStats,
  toastQueue,
  cursorStore,
}: WorkspaceChromeProps): React.ReactElement {
  const repo = useRepo()
  const ui = useAppStore<BoardAppStore, UIState>((s) => s.ui)
  const setUI = useAppStore<BoardAppStore, BoardAppStore["setUI"]>((s) => s.setUI)
  const rootPath = useAppStore<BoardAppStore, string | null>((s) => s.rootPath)
  const moveMode = useAppStore<BoardAppStore, boolean>((s) => s.moveMode)
  const rootId = useAppStore<BoardAppStore, string | null>((s) => s.rootId)
  const cursorNodeId = useAppStore<BoardAppStore, string | null>((s) => s.cursorNodeId)
  const dispatchBoard = useAppStore<BoardAppStore, BoardAppStore["dispatchBoard"]>((s) => s.dispatchBoard)
  const openDetailPane = useAppStore<BoardAppStore, BoardAppStore["openDetailPane"]>((s) => s.openDetailPane)
  const undoHandle = useAppStore<BoardAppStore, import("../undo/undoable-repo.ts").UndoableRepoHandle>(
    (s) => s.undoHandle,
  )
  const storeToastQueue = useAppStore<BoardAppStore, ToastQueue>((s) => s.toastQueue)
  const activeToastQueue = toastQueue ?? storeToastQueue

  // Registered handlers from the focused Board connector
  const findQueryHandler = useAppStore<BoardAppStore, ((query: string) => void) | null>(
    (s) => s._findQueryHandler,
  )
  const searchReplaceSearchHandler = useAppStore<BoardAppStore, ((query: string) => void) | null>(
    (s) => s._searchReplaceSearchHandler,
  )
  const searchReplaceReplaceHandler = useAppStore<BoardAppStore, ((query: string) => void) | null>(
    (s) => s._searchReplaceReplaceHandler,
  )

  // Dialog handlers
  const baseDialogHandlers = useBoardDialogs({
    repo,
    setUI,
    dispatchBoard,
    openDetailPane,
    cursorNodeId,
    rootId,
    undoHandle,
  })

  // Omnibox handlers
  const storeRef = React.useContext(StoreContext)
  const handleOmniboxSelect = useCallback(
    (result: OmniboxResult) => {
      popDialogMode()
      setUI({ showOmnibox: false })
      if (result.type === "search" && result.nodeId) {
        const node = repo.getNode(result.nodeId)
        if (node) baseDialogHandlers.handleSearchSelect(node)
      } else if (result.commandId && storeRef) {
        const store = storeRef as import("zustand").StoreApi<BoardAppStore>
        dispatchCommandById(result.commandId, store.getState.bind(store), () => {}, result.targetId)
      }
    },
    [setUI, storeRef, repo, baseDialogHandlers, dispatchCommandById],
  )
  const handleOmniboxCancel = useCallback(() => {
    popDialogMode()
    setUI({ showOmnibox: false })
  }, [setUI])

  const dialogHandlers = useMemo(
    () => ({
      ...baseDialogHandlers,
      handleOmniboxSelect,
      handleOmniboxCancel,
    }),
    [baseDialogHandlers, handleOmniboxSelect, handleOmniboxCancel],
  )

  // Content height for dialog positioning — use full terminal
  const contentHeight = termHeight

  return (
    <>
      {/* Toast stack - bottom-right corner (already position=absolute internally) */}
      <ToastStack toasts={activeToastQueue?.getAll() ?? []} termWidth={termWidth} termHeight={termHeight} />
      {/* Bottom overlays — absolute, floating on top of content */}
      <Box
        position="absolute"
        height={termHeight}
        width={termWidth}
        flexDirection="column-reverse"
        alignItems="flex-start"
        paddingLeft={1}
      >
        {/* Sync activity pane (above bottom bar) */}
        {ui.showSyncPane && <SyncPane events={ui.syncEvents} watcherStatus={ui.watcherStatus} width={termWidth} />}
        {/* Bell indicator - hidden element for test detection */}
        {ui.bellState && <Text data-bell={ui.bellState}>{/* Bell triggered */}</Text>}
        {/* Status counters — bottom-right */}
        <Box flexDirection="row" width={termWidth - 2} justifyContent="flex-end" id="bottom-bar" data-status={ui.status?.level}>
          <StatusCounters
            ui={ui}
            storageMode={repo.mode}
            rootPath={rootPath}
            nodeCount={repo.stats.nodeCount}
            consoleStats={consoleStats}
          />
        </Box>
        {/* Command box — bottom-left, stacked above status */}
        <CommandBox
          ui={ui}
          termWidth={termWidth}
          storageMode={repo.mode}
          rootPath={rootPath}
          nodeCount={repo.stats.nodeCount}
          moveMode={moveMode}
          consoleStats={consoleStats}
          toastQueue={activeToastQueue}
          localSearch={ui.localSearch}
          onQueryChange={findQueryHandler ?? undefined}
        />
      </Box>

      {/* ================================================================= */}
      {/* Dialogs — all positioned using full terminal dimensions           */}
      {/* ================================================================= */}

      <CursorStoreProvider store={cursorStore}>
        {/* Project picker modal */}
        {ui.showProjectPicker && (
          <DialogBox
            termWidth={termWidth}
            contentHeight={contentHeight}
            maxWidth={80}
            topFraction={1 / 2}
            data-dialog="project-picker"
          >
            <ProjectPicker
              onSelect={dialogHandlers.handleProjectSelect}
              onCancel={dialogHandlers.handleProjectCancel}
              width={Math.min(80, Math.floor(termWidth / 2))}
              height={Math.floor(contentHeight / 2)}
              recentProjectIds={ui.recentProjectIds}
            />
          </DialogBox>
        )}
        {/* New item dialog modal */}
        {ui.showNewItemDialog && (
          <DialogBox
            termWidth={termWidth}
            contentHeight={contentHeight}
            maxWidth={70}
            topFraction={1 / 3}
            data-dialog="new-item"
          >
            <CursorAwareNewItemDialog
              onCreate={dialogHandlers.handleNewItemCreate}
              onCancel={dialogHandlers.handleNewItemCancel}
              width={Math.min(70, Math.floor(termWidth / 2))}
              height={10}
            />
          </DialogBox>
        )}
      </CursorStoreProvider>
      {/* Search dialog modal */}
      {ui.showSearchDialog && (
        <DialogBox
          termWidth={termWidth}
          contentHeight={contentHeight}
          maxWidth={90}
          widthFraction={2 / 3}
          topFraction={1 / 6}
          data-dialog="search"
        >
          <SearchDialog
            onSelect={dialogHandlers.handleSearchSelect}
            onCancel={dialogHandlers.handleSearchCancel}
            width={Math.min(90, Math.floor((termWidth * 2) / 3))}
            maxHeight={Math.floor((contentHeight * 2) / 3)}
            initialInput={ui.searchDialogInitialInput}
            onConsumeInitialInput={() => setUI({ searchDialogInitialInput: "" })}
            scope={ui.searchScope}
            scopeNodeIds={ui.searchScopeNodeIds}
          />
        </DialogBox>
      )}
      {/* Filter panel — top-right corner */}
      {ui.showFilterDialog && (
        <Box
          position="absolute"
          marginLeft={Math.max(0, termWidth - FILTER_PANEL_WIDTH)}
          marginTop={0}
          data-dialog="filter"
        >
          <FilterDialog
            filterProperties={ui.filterProperties}
            filterText={ui.filterText}
            viewMode={ui.viewMode}
            iconStyle={ui.iconStyle}
            cursorRow={ui.filterCursorRow}
            cursorVal={ui.filterCursorVal}
            width={FILTER_PANEL_WIDTH}
          />
        </Box>
      )}
      {/* Delete confirmation dialog */}
      {ui.deleteConfirm && (
        <DeleteConfirmDialogBox
          termWidth={termWidth}
          contentHeight={contentHeight}
          deleteConfirm={ui.deleteConfirm}
        />
      )}
      {/* Date prompt dialog */}
      {ui.datePrompt && (
        <DialogBox
          termWidth={termWidth}
          contentHeight={contentHeight}
          maxWidth={60}
          topFraction={1 / 3}
          data-dialog="date-prompt"
        >
          <DatePromptDialog
            field={ui.datePrompt.field}
            currentValue={ui.datePrompt.currentValue}
            onConfirm={dialogHandlers.handleDatePromptConfirm}
            onCancel={dialogHandlers.handleDatePromptCancel}
            width={Math.min(60, Math.floor(termWidth / 2))}
            height={14}
          />
        </DialogBox>
      )}
      {/* Omnibox / command palette */}
      {ui.showOmnibox && (
        <DialogBox
          termWidth={termWidth}
          contentHeight={contentHeight}
          maxWidth={80}
          widthFraction={2 / 3}
          topFraction={1 / 6}
          data-dialog="omnibox"
        >
          <Omnibox
            onSelect={dialogHandlers.handleOmniboxSelect}
            onCancel={dialogHandlers.handleOmniboxCancel}
            width={Math.min(80, Math.floor((termWidth * 2) / 3))}
            maxHeight={Math.floor((contentHeight * 2) / 3)}
          />
        </DialogBox>
      )}
      {/* Search & replace dialog */}
      {ui.searchReplace && (
        <DialogBox
          termWidth={termWidth}
          contentHeight={contentHeight}
          maxWidth={70}
          widthFraction={0.6}
          topFraction={1 / 6}
          data-dialog="search-replace"
        >
          <SearchReplaceDialog
            state={ui.searchReplace}
            width={Math.min(70, Math.floor(termWidth * 0.6))}
            onSearchChange={searchReplaceSearchHandler ?? (() => {})}
            onReplaceChange={searchReplaceReplaceHandler ?? (() => {})}
          />
        </DialogBox>
      )}
      {/* Help overlay */}
      {ui.showHelp && <HelpOverlay width={termWidth} height={contentHeight} scrollOffset={ui.helpScrollOffset} />}
      {/* Console now uses screen switching (pause/resume) instead of overlay */}
    </>
  )
}
