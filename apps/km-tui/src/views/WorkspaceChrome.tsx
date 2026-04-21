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
import { HelpOverlayBridge } from "../plugins/HelpOverlayBridge.tsx"
import { SearchDialogBridge } from "../plugins/SearchDialogBridge.tsx"
import { DatePromptDialog } from "./DatePromptDialog.tsx"
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
import { allCommands, getAllKeybindings, formatKeybinding } from "@km/commands"
import {
  applySigilRule,
  dispatchOmnibox,
  dismissOmnibox,
  modeOf,
  omniboxCursor,
  type OmniboxPane,
} from "../state/omnibox.ts"
import { commandResultsForOmnibox, nodeResultsForOmnibox } from "../state/omnibox-projection.ts"
import { getRecentsStore } from "../state/recents-store.ts"
import type { OmniboxRowData } from "./OmniboxRow.tsx"

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
 * - On confirm: resolve the effective command, branch on the row's `kind`
 *   (command rows self-dispatch; node rows become the targetId for the
 *   effective default command), then dispatch via `dispatchCommandById`
 *   with the frozen subject snapshot so binary verbs operate on the anchor
 *   pane's cursor, not the omnibox's target pick.
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
    const store = storeRef as import("../state/signal-store.ts").SignalStoreApi<BoardAppStore> | null
    const kbCtx = store
      ? buildKeybindingContextFromOpCtx(defaultBuildOpCtx(store.getState.bind(store), () => {}))
      : null
    const commandBoost = getRecentsStore().getCommandBoost()

    if (!store || !kbCtx) {
      rows = []
    } else if (buffer.length === 0) {
      // Empty buffer: PrefixGuide carries the UX; we seed results with a
      // short list of MRU commands so explicit openOmnibox callers (shift-m,
      // item_picker, etc.) have something to pick from while they type.
      rows = commandResultsForOmnibox(allCommands, kbCtx, "", "normal", commandBoost).slice(0, 12)
    } else if (mode === "command") {
      // `:foo` — command palette only.
      rows = commandResultsForOmnibox(allCommands, kbCtx, buffer.slice(1), "normal", commandBoost)
    } else if (mode === "universal") {
      // No prefix + text — search everything: commands fuzzy, nodes FTS.
      // Commands first so "goto <node>"-style actions surface above any
      // content match with the same token.
      const commandRows = commandResultsForOmnibox(allCommands, kbCtx, buffer, "normal", commandBoost)
      const nodeRows = nodeResultsForOmnibox(repo, buffer, "universal")
      rows = [...commandRows, ...nodeRows]
    } else {
      // Sigil modes (+ @ # [) and bracket task filters (`[]`, `[x]`, ...)
      // dispatch through node search. local_find returns empty here — Phase 9
      // owns the find-bar surface.
      rows = nodeResultsForOmnibox(repo, buffer, mode)
    }
    // Decorate command rows with their keybinding hint. Node rows fall through
    // unchanged (their hint remains whatever the adapter set, typically nothing).
    return rows.map((row) => {
      if (row.kind !== "command") return row
      const kb = keybindingMap.get(row.id)
      return kb ? { ...row, hint: kb } : { ...row, hint: undefined }
    })
  }, [pane.state.buffer, repo, storeRef, keybindingMap])

  // Keep selectedIndex in range as results change.
  React.useEffect(() => {
    if (selectedIndex >= results.length) {
      setSelectedIndex(Math.max(0, results.length - 1))
    }
  }, [results.length, selectedIndex])

  // Project selectedIndex → pane.state.selectedArgumentId (raw id, no prefix).
  // Consumers that need to know whether the argument is a command or node
  // branch on `row.kind` at the point of use (see runSelection below).
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
      const effectiveCmdId = p.state.buffer.startsWith("/") ? "local_find" : p.state.defaultCommand
      const subject = p.spec.subjectSelection

      // Dispatch by row kind — commands run themselves, nodes become the
      // targetId for the effective default command. When no row is selected
      // (empty results), fall back to the bare default command.
      let commandToRun = effectiveCmdId
      let targetId: string | undefined
      if (row) {
        if (row.kind === "command") {
          commandToRun = row.id
        } else {
          targetId = row.id
        }
      } else {
        // Programmatic dispatch path (dialog.confirm without a current row):
        // treat the omnibox's cursor as a node target. `omniboxCursor(p)`
        // is the TEA-shim accessor per km-tui.omnibox-cursor (Phase 6) —
        // reading the pane's `.cursor` here is the only caller outside
        // the command executor allowed to see selectedArgumentId.
        const cursor = omniboxCursor(p)
        if (cursor != null) targetId = cursor
      }

      // km-tui.itempicker-unify: for subject-action commands, the target
      // is the raw tag/assignee text. The buffer is the source of truth —
      // the user typed the exact tag/assignee they want, sigil included.
      // Row titles from FTS results name whole nodes ("work #important"),
      // not the tag token, so deriving the target from the buffer keeps
      // `#important` as `#important` instead of expanding to the matching
      // node's full title.
      if (commandToRun === "omnibox.append_tag_to_subject" || commandToRun === "omnibox.set_assignee_on_subject") {
        const bufferText = p.state.buffer
        const rawFromBuffer =
          bufferText.startsWith("#") || bufferText.startsWith("@") ? bufferText.slice(1) : bufferText
        targetId = rawFromBuffer.trim() || undefined
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
      {/* Search dialog modal — routed through SearchDialogBridge for the
          KM_TEA_SEARCH=1 cutover. Bridge reads from the plugin store when the
          flag is on, otherwise from the legacy ui fields. */}
      <SearchDialogBridge
        legacyVisible={ui.showSearchDialog}
        legacyInitialInput={ui.searchDialogInitialInput}
        legacyScope={ui.searchScope}
        legacyScopeNodeIds={ui.searchScopeNodeIds}
        onSelect={dialogHandlers.handleSearchSelect}
        onCancel={dialogHandlers.handleSearchCancel}
        onConsumeInitialInput={() => setUI({ searchDialogInitialInput: "" })}
        termWidth={termWidth}
        contentHeight={contentHeight}
      />
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
      {/* Help overlay — bridged through TEA plugin when KM_TEA_HELP=1.
          Phase 0 mini-cutover: the bridge reads from either the legacy
          `ui.showHelp` field or the `withHelpOverlay` plugin store. */}
      <HelpOverlayBridge
        legacyVisible={ui.showHelp}
        legacyScrollOffset={ui.helpScrollOffset}
        width={termWidth}
        height={contentHeight}
      />
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
