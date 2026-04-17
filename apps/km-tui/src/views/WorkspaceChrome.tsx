/**
 * WorkspaceChrome — workspace-level overlays rendered once for the entire terminal.
 *
 * Contains: bottom bar (CommandBox + StatusCounters), ToastStack, SyncPane,
 * bell indicator, and all dialog overlays. These were previously rendered
 * per-pane inside BoardCore — moving them here ensures they render exactly
 * once regardless of pane count, and dialogs center on the full screen.
 */

import React, { useCallback, useMemo } from "react"
import { Box, Text } from "@silvery/ag-react"
import { useApp as useAppStore, StoreContext } from "@silvery/create"
import type { BoardAppStore } from "../state/board-app-store.ts"
import { useFocusedPaneSignals, useSignal } from "../hooks/use-signal.ts"
import type { PaneSignals } from "../state/pane-signals.ts"
import { useUndoHandle, useToastQueue } from "../services-context.tsx"
import { usePaneUI } from "../state/ui-context.tsx"
import { useRepo } from "../repo-context.tsx"
import { useBoardDialogs } from "./use-board-dialogs.ts"
import { CommandBox, StatusCounters } from "./CommandBox.tsx"
import { ToastStack } from "./ToastStack.tsx"
import { SyncPane } from "./SyncPane.tsx"
import { ItemPicker } from "./ItemPicker.tsx"
import { loadProjectOptions, loadTagOptions, loadAssigneeOptions, loadItemOptions } from "./picker-loaders.ts"
import { HelpOverlay } from "./HelpOverlay.tsx"
import { DatePromptDialog } from "./DatePromptDialog.tsx"
import { SearchDialog } from "./SearchDialog.tsx"
import { FilterDialog } from "./FilterDialog.tsx"
import { UnifiedOmnibox } from "./UnifiedOmnibox.tsx"
import { ConfirmDialog } from "./shared-components.tsx"
import { dialogTargetRef } from "../dialog-target.ts"
import { SearchReplaceDialog } from "./SearchReplaceDialog.tsx"
import { NewItemDialog } from "./NewItemDialog.tsx"
import { popDialogMode } from "../dialog-guard.ts"
import { dispatchCommandById, defaultBuildOpCtx } from "../board/board-app.ts"
import { buildKeybindingContextFromOpCtx } from "../board/command-bridge.ts"
import { FILTER_PANEL_WIDTH, computeOmniboxDialogWidth, OMNIBOX_MAX_WIDTH } from "./board-layout.ts"
import type { ToastQueue } from "@km/core"
import type { PickerLoadOptions } from "./ItemPicker.tsx"
import { allCommands, getAllKeybindings, formatKeybinding } from "@km/commands"
import { applySigilRule, dispatchOmnibox, dismissOmnibox, modeOf, type OmniboxPane } from "../state/omnibox.ts"
import { commandResultsForOmnibox, nodeResultsForOmnibox } from "../state/omnibox-projection.ts"
import { getRecentsStore } from "../state/recents-store.ts"
import type { OmniboxRowData } from "./OmniboxRow.tsx"

// =============================================================================
// Picker configuration per type
// =============================================================================

type PickerType = "project" | "tag" | "assignee" | "item"
type PendingVerb = "goto" | "move" | "link" | "create"

const pickerConfig: Record<
  PickerType,
  {
    title: string
    loadOptions: PickerLoadOptions
    emptyLabel: string
  }
> = {
  project: { title: "project", loadOptions: loadProjectOptions, emptyLabel: "No matching projects" },
  tag: { title: "tag", loadOptions: loadTagOptions, emptyLabel: "No matching tags" },
  assignee: { title: "context", loadOptions: loadAssigneeOptions, emptyLabel: "No matching contexts" },
  item: { title: "item", loadOptions: loadItemOptions, emptyLabel: "No matching items" },
}

/** Verb-aware picker title for any picker type. A single dialog is
 *  reused across pickers — the title distinguishes intent by verb prefix,
 *  not by which sigil was typed. Matches the bare-sigil semantics where
 *  `+` `@` `#` `[` default to "go to" and explicit chords (a +, m +, c +)
 *  keep their original verbs. */
function pickerTitle(type: "item" | "project" | "tag" | "assignee", verb: PendingVerb | undefined): string {
  const noun = pickerConfig[type].title
  switch (verb) {
    case "goto":
      return `Go to ${noun}`
    case "move":
      return `Move to ${noun}`
    case "link":
      return `Link to ${noun}`
    case "create":
      return `Create under ${noun}`
    default:
      // Fallback — legacy call sites without an explicit verb. Default to
      // "go to" so the more common intent shows up in the title.
      return `Go to ${noun}`
  }
}

// =============================================================================
// Dialog Layout Helpers
// =============================================================================

/** Centered dialog — horizontally centered, vertical position via topFraction.
 *
 *  The wrapper Box is pinned to a fixed `width` so the dialog cannot reflow
 *  as its children's measured sizes fluctuate (e.g. the omnibox's result
 *  list growing/shrinking between frames). Without an explicit width, the
 *  Box would auto-fit to its inner ModalDialog, and any content-driven
 *  reflow inside the dialog would propagate outward and jitter the border.
 *
 *  Callers can override `widthFraction` for a different fraction of the
 *  terminal width; `pinWidth` forces a literal column count (used when
 *  the caller already computed it against a shared constant).
 */
function CenterDialog({
  termWidth,
  contentHeight,
  maxWidth,
  widthFraction = 1 / 2,
  pinWidth,
  topFraction,
  children,
  focusScope,
  ...rest
}: {
  termWidth: number
  contentHeight: number
  maxWidth: number
  widthFraction?: number
  /** Explicit column count — overrides the `maxWidth`/`widthFraction` math. */
  pinWidth?: number
  topFraction: number
  children: React.ReactNode
  "data-dialog": string
  focusScope?: boolean
}): React.ReactElement {
  const w = pinWidth ?? Math.min(maxWidth, Math.floor(termWidth * widthFraction))
  return (
    <Box
      position="absolute"
      width={w}
      marginLeft={Math.floor((termWidth - w) / 2)}
      marginTop={Math.floor(contentHeight * topFraction)}
      focusScope={focusScope}
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
  focusScope,
  ...rest
}: {
  termWidth: number
  width: number
  children: React.ReactNode
  "data-dialog": string
  focusScope?: boolean
}): React.ReactElement {
  return (
    <Box
      position="absolute"
      marginLeft={Math.max(0, termWidth - width)}
      marginTop={1}
      focusScope={focusScope}
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
      data-child-count={dc.childCount}
      data-backlink-count={dc.backlinkCount}
    >
      <ConfirmDialog title={`Delete "${dc.title}"?`} warnings={warnings} width={dialogWidth} />
    </Box>
  )
}

// =============================================================================
// Cursor-Aware Dialog Wrappers
// =============================================================================

/**
 * CursorAwareNewItemDialog - reads cursor card from sel store.
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
  const repo = useRepo()
  const ps = useFocusedPaneSignals()!
  const cursorId = useSignal(ps.sel.node.cursor) as string | null
  const cursorNode = cursorId ? (repo.getNode(cursorId) ?? null) : null
  return <NewItemDialog cursorNode={cursorNode} onCreate={onCreate} onCancel={onCancel} width={width} height={height} />
}

// =============================================================================
// UnifiedOmniboxConnector — runtime wiring for the unified omnibox
// =============================================================================

/**
 * Bridges `ui.omnibox` (the OmniboxPane value object) to the UnifiedOmnibox
 * presentation component. Responsibilities:
 *
 * - Project `pane.state.buffer` → ranked row list via commandResultsForOmnibox
 *   (command mode) or nodeResultsForOmnibox (content sigils + universal).
 * - Mirror keystrokes into the reducer via SET_BUFFER, applying the asymmetric
 *   slippery-sigil rule on single-char inserts. Silvery's TextInput runs in
 *   controlled mode — transforming the value inside onChange is sufficient
 *   because TextInput respects parent-driven value overrides.
 * - Route Enter / Esc / Up / Down from the command system (dialog.confirm,
 *   dialog.cancel, dialog.nav_up, dialog.nav_down) through `dialogTargetRef`.
 * - Project `selectedIndex` → `pane.state.selectedArgumentId` so Enter picks
 *   the highlighted row.
 * - On confirm: resolve the effective command, strip "cmd:"/"node:" namespace
 *   from the selected ID, and dispatch via `dispatchCommandById` with the
 *   frozen subject snapshot so binary verbs operate on the anchor pane's
 *   cursor, not the omnibox's target pick.
 *
 * See docs/design/omnibox.md and apps/km-tui/src/state/omnibox.ts.
 */
function UnifiedOmniboxConnector({
  pane,
  setUI,
  width,
  maxHeight,
}: {
  pane: OmniboxPane
  setUI: BoardAppStore["setUI"]
  width: number
  maxHeight: number
}): React.ReactElement {
  const storeRef = React.useContext(StoreContext)
  const repo = useRepo()
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  // Build keybinding lookup once — commandId → first registered hint string.
  // Used to decorate command rows with their keyboard shortcut on the right.
  const keybindingMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const binding of getAllKeybindings()) {
      if (binding.wildcard) continue
      if (map.has(binding.commandId)) continue
      map.set(binding.commandId, formatKeybinding(binding))
    }
    return map
  }, [])

  // Live-computed results — sigil-dispatched per docs/design/omnibox.md.
  //
  // - `:` (command mode) → projected from @km/commands via
  //   commandResultsForOmnibox (gates on both `def.modes` and `def.when`)
  // - `+ @ # ~` (content sigils) → repo.search() via nodeResultsForOmnibox
  //   (FTS5 BM25 column weights + depth tie-break live in SQL)
  // - empty buffer (universal) → top-N commands as a starting point until
  //   recents land in a later phase
  const results: OmniboxRowData[] = useMemo(() => {
    const buffer = pane.state.buffer
    const mode = modeOf(buffer)
    let rows: OmniboxRowData[]
    if (mode === "command" || buffer.length === 0) {
      const store = storeRef as import("../state/signal-store.ts").SignalStoreApi<BoardAppStore> | null
      if (!store) return []
      const opCtx = defaultBuildOpCtx(store.getState.bind(store), () => {})
      const kbCtx = buildKeybindingContextFromOpCtx(opCtx)
      const query = mode === "command" ? buffer.slice(1) : ""
      const projected = commandResultsForOmnibox(
        allCommands,
        kbCtx,
        query,
        "normal",
        getRecentsStore().getCommandBoost(),
      )
      rows = buffer.length === 0 ? projected.slice(0, 12) : projected
    } else {
      // Content sigils (+ @ # ~) and the bare `node` mode dispatch through
      // node search. local_find returns empty here — Phase 9 owns that surface.
      rows = nodeResultsForOmnibox(repo, buffer, mode)
    }
    // Decorate command rows with their keybinding hint. The row's id is
    // "cmd:<commandId>" — strip the namespace to look up the binding. Node
    // rows fall through unchanged (their hint remains whatever the adapter
    // set, typically nothing).
    return rows.map((row) => {
      if (!row.id.startsWith("cmd:")) return row
      const cmdId = row.id.slice("cmd:".length)
      const kb = keybindingMap.get(cmdId)
      return kb ? { ...row, hint: kb } : { ...row, hint: undefined }
    })
  }, [pane.state.buffer, repo, storeRef, keybindingMap])

  // Keep selectedIndex in range as results change.
  React.useEffect(() => {
    if (selectedIndex >= results.length) {
      setSelectedIndex(Math.max(0, results.length - 1))
    }
  }, [results.length, selectedIndex])

  // Project selectedIndex → pane.state.selectedArgumentId (ID, not object).
  // OmniboxRowData.id already carries the "cmd:" or "node:" namespace.
  React.useEffect(() => {
    const selected = results[selectedIndex]
    const nextId = selected?.id ?? null
    if (nextId !== pane.state.selectedArgumentId) {
      dispatchOmnibox(setUI as (patch: { omnibox: OmniboxPane | null }) => void, pane, {
        type: "SET_SELECTED_ARGUMENT",
        argumentId: nextId,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, selectedIndex])

  // Refs for stable callbacks.
  const paneRef = React.useRef(pane)
  paneRef.current = pane
  const resultsRef = React.useRef(results)
  resultsRef.current = results
  const selectedIndexRef = React.useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex

  /**
   * Run the currently-highlighted row. Extracted so both Enter (via
   * dialogTargetRef.confirm) and row clicks can share the path.
   *
   * When called with an explicit index (row click), we first update
   * `selectedArgumentId` so the current pane state matches the clicked row
   * before resolving the command. For Enter (index === undefined) we trust
   * that the selection effect has already propagated the current selectedIndex.
   */
  const runSelection = useCallback(
    (explicitIndex?: number) => {
      const p = paneRef.current
      if (!p) return
      const items = resultsRef.current
      const idx = explicitIndex ?? selectedIndexRef.current
      const row = items[idx]
      const argumentId = row?.id ?? p.state.selectedArgumentId
      const effectiveCmdId = p.state.buffer.startsWith("/") ? "local_find" : p.state.defaultCommand
      const subject = p.spec.subjectSelection

      // Strip the namespace prefix — the executor consumes raw IDs.
      let commandToRun = effectiveCmdId
      let targetId: string | undefined
      if (argumentId?.startsWith("cmd:")) {
        commandToRun = argumentId.slice("cmd:".length)
        targetId = undefined
      } else if (argumentId?.startsWith("node:")) {
        targetId = argumentId.slice("node:".length)
      } else if (argumentId != null) {
        targetId = argumentId
      }

      // Dismiss BEFORE dispatching so popDialogMode lands before the command
      // potentially opens another dialog (keeps the scope stack clean).
      popDialogMode()
      dismissOmnibox(setUI as (patch: { omnibox: OmniboxPane | null }) => void)

      if (storeRef) {
        const store = storeRef as import("../state/signal-store.ts").SignalStoreApi<BoardAppStore>
        dispatchCommandById(commandToRun, store.getState.bind(store), () => {}, targetId, subject)
      }
    },
    [setUI, storeRef],
  )

  const handleCancel = useCallback(() => {
    popDialogMode()
    dismissOmnibox(setUI as (patch: { omnibox: OmniboxPane | null }) => void)
  }, [setUI])

  // Track the last buffer we mirrored into the reducer so onChange can detect
  // single-char insertions and apply the asymmetric slippery-sigil rule.
  // Initialised to the pane's initial buffer so the first keystroke compares
  // against the correct baseline.
  const prevBufferRef = React.useRef(pane.state.buffer)

  /**
   * Silvery TextInput's onChange fires on every keystroke. We apply the
   * slippery sigil rule here and dispatch SET_BUFFER with the adjusted value.
   *
   * Because TextInput is controlled (value={pane.state.buffer}), transforming
   * the value here is sufficient: silvery's TextInput detects that the parent
   * echoed back a different value than it emitted and syncs readline to the
   * overridden buffer. See vendor/silvery feat(ag-react): TextInput parent
   * override commit for the supporting change.
   */
  const handleBufferChange = useCallback(
    (value: string) => {
      const prev = prevBufferRef.current
      let adjusted = value
      // Only single-char inserts run through the slippery rule — pastes,
      // deletes, and cursor-move edits fall through to a flat SET_BUFFER.
      if (value.length === prev.length + 1) {
        // Find the insertion point — walk the common prefix until they differ.
        let i = 0
        while (i < prev.length && prev[i] === value[i]) i++
        const typedChar = value[i] ?? ""
        adjusted = applySigilRule(prev, typedChar)
      }
      prevBufferRef.current = adjusted
      dispatchOmnibox(setUI as (patch: { omnibox: OmniboxPane | null }) => void, paneRef.current, {
        type: "SET_BUFFER",
        buffer: adjusted,
      })
      setSelectedIndex(0)
    },
    [setUI],
  )

  // Wire dialogTargetRef so the command system can drive navigation from
  // dialog.nav_up / dialog.nav_down / dialog.confirm / dialog.cancel bindings.
  React.useLayoutEffect(() => {
    dialogTargetRef.current = {
      navUp() {
        setSelectedIndex((i) => Math.max(0, i - 1))
      },
      navDown() {
        setSelectedIndex((i) => Math.min(i + 1, Math.max(0, resultsRef.current.length - 1)))
      },
      confirm() {
        runSelection()
      },
      cancel() {
        handleCancel()
      },
    }
    return () => {
      dialogTargetRef.current = null
    }
  }, [runSelection, handleCancel])

  // Row click: move selection to the clicked row and run the selection path.
  // Row hover: move selection to the hovered row (tree-view behavior).
  const handleRowClick = useCallback(
    (_row: OmniboxRowData, index: number) => {
      setSelectedIndex(index)
      runSelection(index)
    },
    [runSelection],
  )

  return (
    <UnifiedOmnibox
      pane={pane}
      results={results}
      selectedIndex={selectedIndex}
      onBufferChange={handleBufferChange}
      onConfirm={() => runSelection()}
      onRowClick={handleRowClick}
      onRowHover={setSelectedIndex}
      width={width}
      maxHeight={maxHeight}
    />
  )
}

// =============================================================================
// WorkspaceChrome
// =============================================================================

export interface WorkspaceChromeProps {
  termWidth: number
  termHeight: number
  consoleStats?: { total: number; errors: number; warnings: number }
  toastQueue?: ToastQueue
}

export function WorkspaceChrome({
  termWidth,
  termHeight,
  consoleStats,
  toastQueue,
}: WorkspaceChromeProps): React.ReactElement {
  const repo = useRepo()
  const ui = usePaneUI()
  const setUI = useAppStore<BoardAppStore, BoardAppStore["setUI"]>((s) => s.setUI)
  const ps = useFocusedPaneSignals()!
  const rootPath = useSignal(ps.rootPath)
  const moveState = useSignal(ps.moveState)
  const moveMode = moveState.active
  const rootId = useSignal(ps.rootId)
  const sel = ps.sel
  const cursor = useSignal(sel.node.cursor) as string | null
  const dispatchBoard = useAppStore<BoardAppStore, BoardAppStore["dispatchBoard"]>((s) => s.dispatchBoard)
  const openDetailPane = useAppStore<BoardAppStore, BoardAppStore["openDetailPane"]>((s) => s.openDetailPane)
  const undoHandle = useUndoHandle()
  const storeToastQueue = useToastQueue()
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
    sel,
    dispatchBoard,
    openDetailPane,
    cursor,
    rootId,
    undoHandle,
  })

  const dialogHandlers = baseDialogHandlers

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

      {/* Generic picker modal (project / tag / assignee) */}
      {ui.activePicker && (
        <CenterDialog
          termWidth={termWidth}
          contentHeight={contentHeight}
          maxWidth={80}
          topFraction={1 / 6}
          data-dialog="picker"
          focusScope
        >
          <ItemPicker
            title={pickerTitle(ui.activePicker.type, ui.activePicker.pendingVerb)}
            loadOptions={pickerConfig[ui.activePicker.type].loadOptions}
            onSelect={
              ui.activePicker.type === "item"
                ? dialogHandlers.handleItemPickerSelect
                : ui.activePicker.type === "project"
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
          focusScope
        >
          <CursorAwareNewItemDialog
            onCreate={dialogHandlers.handleNewItemCreate}
            onCancel={dialogHandlers.handleNewItemCancel}
            width={Math.min(70, Math.floor(termWidth / 2))}
            height={10}
          />
        </CenterDialog>
      )}
      {/* Search dialog modal */}
      {ui.showSearchDialog && (
        <CenterDialog
          termWidth={termWidth}
          contentHeight={contentHeight}
          maxWidth={90}
          widthFraction={2 / 3}
          topFraction={1 / 6}
          data-dialog="search"
          focusScope
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
        <TopRightDialog termWidth={termWidth} width={FILTER_PANEL_WIDTH} data-dialog="filter" focusScope>
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
          focusScope
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
      {/* Unified omnibox — singleton command palette + node search surface.
           Dialog width is pinned via `computeOmniboxDialogWidth` so both the
           outer wrapper and the inner ModalDialog resolve to the same column
           count. See regression test in unified-omnibox-integration.test.ts —
           "dialog width is stable across frames as results stream in". */}
      {ui.omnibox && (
        <CenterDialog
          termWidth={termWidth}
          contentHeight={contentHeight}
          maxWidth={OMNIBOX_MAX_WIDTH}
          pinWidth={computeOmniboxDialogWidth(termWidth)}
          topFraction={1 / 6}
          data-dialog="unified-omnibox"
          focusScope
        >
          <UnifiedOmniboxConnector
            pane={ui.omnibox}
            setUI={setUI}
            width={computeOmniboxDialogWidth(termWidth)}
            maxHeight={Math.max(10, Math.floor((contentHeight * 2) / 3))}
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
          focusScope
        >
          <SearchReplaceDialog
            state={ui.searchReplace}
            width={Math.min(70, Math.floor(termWidth * 0.6))}
            onSearchChange={searchReplaceSearchHandler ?? (() => {})}
            onReplaceChange={searchReplaceReplaceHandler ?? (() => {})}
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
  const ps = useFocusedPaneSignals()

  // When focused pane has no signals (e.g. empty pane), render minimal bottom bar
  if (!ps) {
    return <Box flexDirection="row" flexShrink={0} height={1} justifyContent="flex-end" paddingX={1} id="bottom-bar" />
  }

  return <WorkspaceBottomBarInner consoleStats={consoleStats} ps={ps} />
}

function WorkspaceBottomBarInner({
  consoleStats,
  ps,
}: WorkspaceBottomBarProps & { ps: PaneSignals }): React.ReactElement {
  const ui = usePaneUI()
  const rootPath = useSignal(ps.rootPath)
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
      userSelect="none"
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
