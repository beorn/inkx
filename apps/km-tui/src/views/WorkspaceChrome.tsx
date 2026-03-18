/**
 * WorkspaceChrome — workspace-level overlays rendered once for the entire terminal.
 *
 * Contains: bottom bar (CommandBox + StatusCounters), ToastStack, SyncPane,
 * bell indicator, and all dialog overlays. These were previously rendered
 * per-pane inside BoardCore — moving them here ensures they render exactly
 * once regardless of pane count, and dialogs center on the full screen.
 */

import React, { useCallback, useMemo } from "react"
import { Box, Text } from "@silvery/react"
import { useApp as useAppStore, StoreContext } from "@silvery/term/runtime"
import { getActiveBoardPane, type BoardAppStore } from "../board-app-store.ts"
import { usePaneUI } from "../ui-context.tsx"
import { useRepo } from "../repo-context.tsx"
import { useBoardDialogs } from "./use-board-dialogs.ts"
import { useCursorNodePosition, CursorStoreProvider } from "../cursor-context.tsx"
import { CommandBox, StatusCounters } from "./CommandBox.tsx"
import { ToastStack } from "./ToastStack.tsx"
import { SyncPane } from "./SyncPane.tsx"
import { ItemPicker } from "./ItemPicker.tsx"
import { loadProjectOptions, loadTagOptions, loadAssigneeOptions } from "./picker-loaders.ts"
import { HelpOverlay } from "./HelpOverlay.tsx"
import { DatePromptDialog } from "./DatePromptDialog.tsx"
import { SearchDialog } from "./SearchDialog.tsx"
import { FilterDialog } from "./FilterDialog.tsx"
import { Omnibox, type OmniboxResult } from "./Omnibox.tsx"
import { ConfirmDialog } from "./shared-components.tsx"
import { SearchReplaceDialog } from "./SearchReplaceDialog.tsx"
import { FavoritesDialog } from "./FavoritesDialog.tsx"
import { NewItemDialog } from "./NewItemDialog.tsx"
import { popDialogMode } from "../dialog-guard.ts"
import { dispatchCommandById } from "../board-app.ts"
import { FILTER_PANEL_WIDTH } from "./board-layout.ts"
import type { ToastQueue } from "@km/core"
import type { CursorStore } from "../cursor-store.ts"
import type { PickerLoadOptions } from "./ItemPicker.tsx"

// =============================================================================
// Picker configuration per type
// =============================================================================

const pickerConfig: Record<
  "project" | "tag" | "assignee",
  {
    title: string
    loadOptions: PickerLoadOptions
    emptyLabel: string
  }
> = {
  project: { title: "Move to project", loadOptions: loadProjectOptions, emptyLabel: "No matching projects" },
  tag: { title: "Add tag", loadOptions: loadTagOptions, emptyLabel: "No matching tags" },
  assignee: { title: "Assign to", loadOptions: loadAssigneeOptions, emptyLabel: "No matching assignees" },
}

// =============================================================================
// Dialog Layout Helpers
// =============================================================================

/** Centered dialog — horizontally centered, vertical position via topFraction. */
function CenterDialog({
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

/** Top-right dialog — anchored to top-right corner, below the top bar (marginTop=1). */
function TopRightDialog({
  termWidth,
  width,
  children,
  ...rest
}: {
  termWidth: number
  width: number
  children: React.ReactNode
  "data-dialog": string
}): React.ReactElement {
  return (
    <Box position="absolute" marginLeft={Math.max(0, termWidth - width)} marginTop={1} {...rest}>
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
  const ui = usePaneUI()
  const setUI = useAppStore<BoardAppStore, BoardAppStore["setUI"]>((s) => s.setUI)
  const rootPath = useAppStore<BoardAppStore, string | null>((s) => {
    const p = getActiveBoardPane(s)
    return p?.rootPath ?? null
  })
  const moveMode = useAppStore<BoardAppStore, boolean>((s) => {
    const p = getActiveBoardPane(s)
    return p?.moveMode ?? false
  })
  const rootId = useAppStore<BoardAppStore, string | null>((s) => {
    const p = getActiveBoardPane(s)
    return p?.rootId ?? null
  })
  const cursorNodeId = useAppStore<BoardAppStore, string | null>((s) => {
    const p = getActiveBoardPane(s)
    return p?.cursorNodeId ?? null
  })
  const dispatchBoard = useAppStore<BoardAppStore, BoardAppStore["dispatchBoard"]>((s) => s.dispatchBoard)
  const openDetailPane = useAppStore<BoardAppStore, BoardAppStore["openDetailPane"]>((s) => s.openDetailPane)
  const undoHandle = useAppStore<BoardAppStore, import("../undo/undoable-repo.ts").UndoableRepoHandle>(
    (s) => s.undoHandle,
  )
  const storeToastQueue = useAppStore<BoardAppStore, ToastQueue>((s) => s.toastQueue)
  const activeToastQueue = toastQueue ?? storeToastQueue

  // Registered handlers from the focused Board connector
  const findQueryHandler = useAppStore<BoardAppStore, ((query: string) => void) | null>((s) => s._findQueryHandler)
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
      {/* Absolute overlays — floating on top of content */}
      <Box
        position="absolute"
        height={termHeight}
        width={termWidth}
        flexDirection="column-reverse"
        alignItems="flex-start"
        paddingLeft={1}
        pointerEvents="none"
      >
        {/* Sync activity pane (above bottom bar) */}
        {ui.showSyncPane && <SyncPane events={ui.syncEvents} watcherStatus={ui.watcherStatus} width={termWidth} />}
        {/* Bell indicator - hidden element for test detection */}
        {ui.bellState && <Text data-bell={ui.bellState}>{/* Bell triggered */}</Text>}
        {/* Command box — absolute overlay, appears above the bottom bar when active */}
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
        {/* Generic picker modal (project / tag / assignee) */}
        {ui.activePicker && (
          <CenterDialog
            termWidth={termWidth}
            contentHeight={contentHeight}
            maxWidth={80}
            topFraction={1 / 2}
            data-dialog="picker"
          >
            <ItemPicker
              title={pickerConfig[ui.activePicker.type].title}
              loadOptions={pickerConfig[ui.activePicker.type].loadOptions}
              onSelect={
                ui.activePicker.type === "project"
                  ? dialogHandlers.handlePickerSelect
                  : ui.activePicker.type === "tag"
                    ? dialogHandlers.handleTagSelect
                    : dialogHandlers.handleAssigneeSelect
              }
              onCancel={dialogHandlers.handlePickerCancel}
              width={Math.min(80, Math.floor(termWidth / 2))}
              height={Math.floor(contentHeight / 2)}
              recentIds={ui.recentProjectIds}
              emptyLabel={pickerConfig[ui.activePicker.type].emptyLabel}
            />
          </CenterDialog>
        )}
        {/* New item dialog modal */}
        {ui.showNewItemDialog && (
          <CenterDialog
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
          </CenterDialog>
        )}
      </CursorStoreProvider>
      {/* Search dialog modal */}
      {ui.showSearchDialog && (
        <CenterDialog
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
        </CenterDialog>
      )}
      {/* Filter panel — top-right corner, below top bar */}
      {ui.showFilterDialog && (
        <TopRightDialog termWidth={termWidth} width={FILTER_PANEL_WIDTH} data-dialog="filter">
          <FilterDialog
            filterProperties={ui.filterProperties}
            filterText={ui.filterText}
            viewMode={ui.viewMode}
            iconStyle={ui.iconStyle}
            cursorRow={ui.filterCursorRow}
            cursorVal={ui.filterCursorVal}
            width={FILTER_PANEL_WIDTH}
          />
        </TopRightDialog>
      )}
      {/* Delete confirmation dialog */}
      {ui.deleteConfirm && (
        <DeleteConfirmDialogBox termWidth={termWidth} contentHeight={contentHeight} deleteConfirm={ui.deleteConfirm} />
      )}
      {/* Date prompt dialog */}
      {ui.datePrompt && (
        <CenterDialog
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
        </CenterDialog>
      )}
      {/* Omnibox / command palette */}
      {ui.showOmnibox && (
        <CenterDialog
          termWidth={termWidth}
          contentHeight={contentHeight}
          maxWidth={100}
          widthFraction={3 / 4}
          topFraction={1 / 6}
          data-dialog="omnibox"
        >
          <Omnibox
            onSelect={dialogHandlers.handleOmniboxSelect}
            onCancel={dialogHandlers.handleOmniboxCancel}
            width={Math.min(100, Math.floor((termWidth * 3) / 4))}
            maxHeight={Math.floor((contentHeight * 2) / 3)}
          />
        </CenterDialog>
      )}
      {/* Search & replace dialog */}
      {ui.searchReplace && (
        <CenterDialog
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
        </CenterDialog>
      )}
      {/* Favorites dialog */}
      {ui.showFavoritesDialog && (
        <CenterDialog
          termWidth={termWidth}
          contentHeight={contentHeight}
          maxWidth={50}
          topFraction={1 / 4}
          data-dialog="favorites"
        >
          <FavoritesDialog
            selectedKey={ui.favoritesSelectedKey}
            width={Math.min(50, Math.floor(termWidth / 2))}
            assignNodeId={cursorNodeId}
          />
        </CenterDialog>
      )}
      {/* Help overlay */}
      {ui.showHelp && <HelpOverlay width={termWidth} height={contentHeight} scrollOffset={ui.helpScrollOffset} />}
      {/* Console now uses screen switching (pause/resume) instead of overlay */}
    </>
  )
}

// =============================================================================
// WorkspaceBottomBar — real layout element, takes 1 row at bottom of workspace
// =============================================================================

export interface WorkspaceBottomBarProps {
  consoleStats?: { total: number; errors: number; warnings: number }
}

export function WorkspaceBottomBar({ consoleStats }: WorkspaceBottomBarProps): React.ReactElement {
  const ui = usePaneUI()
  const rootPath = useAppStore<BoardAppStore, string | null>((s) => {
    const p = getActiveBoardPane(s)
    return p?.rootPath ?? null
  })
  const repo = useRepo()

  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      height={1}
      justifyContent="flex-end"
      paddingX={1}
      id="bottom-bar"
      data-status={ui.status?.level}
    >
      <StatusCounters
        ui={ui}
        storageMode={repo.mode}
        rootPath={rootPath}
        nodeCount={repo.stats.nodeCount}
        consoleStats={consoleStats}
      />
    </Box>
  )
}
