/**
 * Board TUI — thin connector + production entry.
 *
 * Architecture (tree v4 detail-unify):
 *   1. BoardView.tsx            — pure render (BoardCore + provider wrapper), no lifecycle hooks
 *   2. useBoardController.ts    — all lifecycle effects, signal subscriptions, derived state
 *   3. Board.tsx (this file)    — thin connector: calls useBoardController(), renders BoardView
 *      + BoardApp production entry that wires up panes, chrome, and the link handler
 *
 * State lives in the BoardAppStore (signal store). Keys flow through the term:key
 * handler in board-app.ts; nothing here owns keys.
 */
import React, { useCallback, useEffect, useState } from "react"
import { Box, useApp, type PatchedConsole } from "@silvery/ag-react"
import { useApp as useAppStore, StoreContext } from "@silvery/create"
import type { ViewMode } from "../types.ts"
import { useRepo } from "../repo-context.tsx"
import { ServicesProvider } from "../services-context.tsx"
import type { GridNavigator } from "@km/board"
import { Workspace, type BoardAppStore } from "../state/board-app-store.ts"
import { EmptyPaneWelcome } from "./EmptyPaneWelcome.tsx"
import { ensureCommandSystemInitialized } from "../board/command-bridge.ts"
import { WorkspaceView } from "./WorkspaceView.tsx"
import { PaneIdProvider } from "../pane-context.tsx"
import { WorkspaceChrome, WorkspaceBottomBar } from "./WorkspaceChrome.tsx"
import { useLinkOpen } from "../hooks/use-link-open.ts"
import type { ToastQueue } from "@km/core"
import { navigateToNode } from "../navigation/navigate-to-node.ts"
import { saveNavHistoryFromPane } from "../keyboard/keyboard-helpers.ts"
import { parseKmUrl, resolveKmLink } from "../internal-link.ts"
import { BoardView } from "./BoardView.tsx"
import { useBoardController } from "./useBoardController.ts"

// Initialize command system at module level (idempotent — runs once on first import).
// Previously a useEffect in Board; moved here to reduce effect count.
ensureCommandSystemInitialized()

// Re-export view layer pieces used by tests, storybook, screenshot CLI, and testing.ts.
// BoardCore and its prop types live in BoardView.tsx now — this keeps the public
// surface of Board.tsx stable for all downstream importers.
export { BoardCore } from "./BoardView.tsx"
export type { BoardCoreProps, ColumnFilterState } from "./BoardView.tsx"

// =============================================================================
// Board — thin connector
// =============================================================================

export interface BoardProps {
  /** Initial view mode (default: "cards") */
  initialViewMode?: ViewMode
  /** Terminal dimensions */
  dimensions: { columns: number; rows: number }
  /** Exit callback */
  onExit: () => void
  /** Toast queue instance (injected, not global) */
  toastQueue?: ToastQueue
  /** Optional layout registry for card position tracking (for testing) */
  navigator?: GridNavigator
  /** Patched console for debug output modal */
  patchedConsole?: PatchedConsole | null
}

/**
 * Board connector component.
 *
 * Reads ui + board nav fields from the signal store via useBoardController,
 * which computes derived layout (column derivation, cursor position), wires up
 * effects, and returns a prop bag for BoardView.
 *
 * Keys are handled by the term:key handler in board-app.ts — not here.
 */
export function Board({ patchedConsole }: BoardProps) {
  const viewProps = useBoardController({ patchedConsole })
  return <BoardView {...viewProps} />
}

// =============================================================================
// BoardApp — production entry (used by tui.tsx)
// =============================================================================

export interface BoardAppProps {
  /** Initial view mode (default: "cards") */
  initialViewMode?: ViewMode
  /** Toast queue instance (injected from runBoard) */
  toastQueue?: ToastQueue
  /** Optional layout registry for card position tracking (for testing) */
  navigator?: GridNavigator
  /** Patched console for capturing console output (optional) */
  patchedConsole?: PatchedConsole | null
}

/**
 * Production entry component with external integrations.
 * Gets repo, dimensions, exit from context/hooks.
 */
export function BoardApp({ initialViewMode = "cards", toastQueue, navigator, patchedConsole }: BoardAppProps) {
  const { exit } = useApp()
  const repo = useRepo()
  const storeApi = React.useContext(StoreContext) as
    | import("../state/signal-store.ts").SignalStoreApi<BoardAppStore>
    | null

  // Handle clicks on links — opens external URLs, dispatches internal km:// links.
  // Supported schemes: km://node/{id}, km://wiki/{name}, km://block/{id}, km://zoom/{id}
  const handleInternalLink = useCallback(
    (href: string) => {
      if (!storeApi) return

      // km://zoom/{id} — always zoom to node (used by breadcrumb segments)
      if (href.startsWith("km://zoom/")) {
        const targetId = href.slice("km://zoom/".length)
        if (!targetId) return
        const state = storeApi.getState()
        const boardPane = Workspace.getActiveBoardPane(state)
        if (boardPane) saveNavHistoryFromPane(state.setUI, boardPane)
        state.dispatchBoard({ type: "ZOOM_IN", nodeId: targetId })
        state.sel.node.select([targetId as import("@silvery/selection").ID])
        return
      }

      const parsed = parseKmUrl(href)
      if (!parsed) return
      const targetId = resolveKmLink(parsed, repo)
      if (!targetId) return

      // Read current state imperatively (event handler, not render)
      const state = storeApi.getState()
      const boardPane = Workspace.getActiveBoardPane(state)
      const rootId = boardPane?.rootId ?? null

      // In detail view: clicking a link zooms the detail view to that node
      if (boardPane?.viewMode === "detail") {
        if (boardPane) saveNavHistoryFromPane(state.setUI, boardPane)
        state.dispatchBoard({ type: "ZOOM_IN", nodeId: targetId })
        state.sel.node.select([targetId as import("@silvery/selection").ID])
        return
      }

      const nav = navigateToNode(targetId, rootId, repo)
      if (!nav) return

      // Save nav history before navigating (enables { / } back/forward)
      if (boardPane) {
        saveNavHistoryFromPane(state.setUI, boardPane)
      }

      if (nav.action === "SELECT") {
        state.sel.node.select([nav.cursorTarget as import("@silvery/selection").ID])
      } else if (nav.action === "DETAIL_VIEW" && nav.zoomTarget) {
        state.dispatchBoard({ type: "ZOOM_IN", nodeId: nav.zoomTarget })
        if (nav.cursorTarget) state.sel.node.select([nav.cursorTarget as import("@silvery/selection").ID])
        state.openDetailPane()
      } else if (nav.zoomTarget) {
        state.dispatchBoard({ type: "ZOOM_IN", nodeId: nav.zoomTarget })
        if (nav.cursorTarget) state.sel.node.select([nav.cursorTarget as import("@silvery/selection").ID])
      }
    },
    [repo, storeApi],
  )
  useLinkOpen(handleInternalLink)

  const storeDimensions = useAppStore<BoardAppStore, { columns: number; rows: number }>((s) => s.ui.dimensions)
  const workspace = useAppStore<BoardAppStore, BoardAppStore["workspace"]>((s) => s.workspace)
  const focusPaneById = useAppStore<BoardAppStore, (id: string) => void>((s) => s.focusPaneById)
  const storeToastQueue = useAppStore<BoardAppStore, import("@km/core").ToastQueue>((s) => s.toastQueue)
  const jobRunner = useAppStore<BoardAppStore, import("@km/core").JobRunner>((s) => s.jobRunner)
  const undoHandle = useAppStore<BoardAppStore, import("../undo/undoable-repo.ts").UndoableRepoHandle>(
    (s) => s.undoHandle,
  )
  const servicesProviderToastQueue = toastQueue ?? storeToastQueue

  // Resize is handled via "term:resize" event in board-app.ts → store.setDimensions().
  // createApp provides a mock stdout to StdoutContext, so stdout.on("resize") is a no-op.

  // Console stats via direct subscription (workspace-level, shared across panes)
  const [consoleStats, setConsoleStats] = useState<{ total: number; errors: number; warnings: number } | undefined>()
  useEffect(() => {
    if (!patchedConsole) return
    const initial = patchedConsole.getStats()
    let prevTotal = initial.total
    if (initial.total > 0) setConsoleStats(initial)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const unsub = patchedConsole.subscribe(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        const stats = patchedConsole.getStats()
        if (stats.total === prevTotal) return
        prevTotal = stats.total
        setConsoleStats(stats)
      }, 200)
    })
    return () => {
      unsub()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [patchedConsole])

  const renderPane = useCallback(
    (paneId: string) => (
      <PaneIdProvider value={paneId}>
        <Board
          initialViewMode={initialViewMode}
          dimensions={storeDimensions}
          onExit={exit}
          toastQueue={toastQueue}
          navigator={navigator}
          patchedConsole={patchedConsole}
        />
      </PaneIdProvider>
    ),
    [initialViewMode, storeDimensions, exit, toastQueue, navigator, patchedConsole],
  )

  // Workspace chrome (bottom bar, dialogs, toasts) rendered once for entire terminal
  const chrome = (
    <WorkspaceChrome
      termWidth={storeDimensions.columns}
      termHeight={storeDimensions.rows}
      consoleStats={consoleStats}
      toastQueue={toastQueue}
    />
  )

  const bottomBar = <WorkspaceBottomBar consoleStats={consoleStats} />

  // Single pane (common case) — render Board directly, no wrapper overhead.
  // Use workspace.focusedPaneId instead of hardcoded "main" — after closing
  // the main pane via vw, the remaining pane may have a different ID.
  // PopoverProvider is now mounted INSIDE BoardView (each pane) so that
  // PopoverOverlay is a descendant of NodeStoreProvider + TreeRenderProvider
  // and contexts cascade to popover content via the fiber tree. This
  // eliminates the "bridge N per-pane contexts into the popover render
  // callback" duct-tape pattern. See km-tui.popover-nodestore.
  if (workspace.panes.size <= 1) {
    const singlePaneId = workspace.focusedPaneId
    const singlePane = workspace.panes.get(singlePaneId)
    const isSinglePaneBoard = singlePane?.viewType === "board"
    return (
      <ServicesProvider toastQueue={servicesProviderToastQueue} jobRunner={jobRunner} undoHandle={undoHandle}>
        <Box flexDirection="column" height={storeDimensions.rows} id={singlePaneId} testID={singlePaneId} focusScope>
          {isSinglePaneBoard ? renderPane(singlePaneId) : <EmptyPaneWelcome />}
          {bottomBar}
          {chrome}
        </Box>
      </ServicesProvider>
    )
  }

  // Multiple panes — use WorkspaceView for split layout
  return (
    <ServicesProvider toastQueue={servicesProviderToastQueue} jobRunner={jobRunner} undoHandle={undoHandle}>
      <Box flexDirection="column" width={storeDimensions.columns} height={storeDimensions.rows}>
        <WorkspaceView
          layout={workspace.layout}
          panes={workspace.panes}
          focusedPaneId={workspace.focusedPaneId}
          renderPane={renderPane}
          onPaneClick={focusPaneById}
        />
        {bottomBar}
        {chrome}
      </Box>
    </ServicesProvider>
  )
}
