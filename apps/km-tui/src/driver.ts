/**
 * Board Driver - AI/Test Automation Interface
 *
 * Provides a unified interface for driving the Board TUI programmatically,
 * enabling AI exploration, fuzz testing, and headless automation.
 *
 * Uses a local BoardAppStore (Zustand) for state management — the same store
 * type used in production via createBoardApp(). Board renders in L3 mode
 * (useStore=true), reading state from the store via useApp() selectors.
 *
 * Key handling goes through handleKey() from board-app.ts — the same path
 * as production — which updates the store via get()/set().
 *
 * @example
 * ```typescript
 * import { createBoardDriver } from './driver.ts'
 * import { createFakeRepo } from '@km/storage'
 *
 * const nodes = item("board", item("col", item("task")))
 * const repo = createFakeRepo({ nodes })
 * const driver = createBoardDriver(repo, "board")
 *
 * // Execute commands directly
 * await driver.cmd.down()
 * await driver.cmd.right()
 *
 * // Get rich state for AI decisions
 * const state = driver.getState()
 * console.log(state.cursor)       // { col: 0, card: 1, level: 'card' }
 * console.log(state.selectedNode) // { id: 'task', title: 'task' }
 *
 * // Direct store access (for subscriptions)
 * driver.store.subscribe((state) => {
 *   console.log('Cursor moved:', state.cursorNodeId)
 * })
 *
 * // Drive via keybindings
 * await driver.press('j')  // Resolves to cursor_down
 * await driver.press('/')  // Opens search dialog
 * ```
 */

import React, { act } from "react"
import { createStore, type StoreApi } from "zustand"
import { createRenderer, keyToAnsi, type App } from "inkx/testing"
import { withCommands } from "inkx"
import type { AppWithCommands, AppState } from "inkx"
import { StoreContext } from "inkx/runtime"
import { parseKey } from "inkx/runtime"
import {
  createCommandRegistry,
  allCommands,
  defaultKeybindings,
  type CommandContext,
  type CommandAction,
  type Keybinding,
  type ViewMode,
} from "@km/commands"
import { createToastQueue } from "@km/core"
import type { Repo } from "@km/storage"
import { createBoardState } from "./board-types.ts"

import { Board } from "./views/Board.tsx"
import { RepoProvider } from "./repo-context.tsx"
import { buildBoardState } from "./state.ts"
import { createLayoutRegistry, type LayoutRegistry } from "./card-positions.ts"
import { ensureCommandSystemInitialized } from "./command-bridge.ts"
import { createBoardAppStoreState, type BoardAppStore, type CreateBoardAppStoreParams } from "./board-app-store.ts"
import { createInitialUIState } from "./ui-reducer.ts"
import { handleKey } from "./board-app.ts"
import { createCursorStore } from "./cursor-store.ts"

// =============================================================================
// Types
// =============================================================================

/**
 * Dialog state in the TUI
 */
export interface DialogState {
  search: boolean
  newItem: boolean
  projectPicker: boolean
  help: boolean
}

/**
 * Cursor position in the board
 */
export interface CursorPosition {
  col: number
  card: number
  level: "board" | "column" | "card"
}

/**
 * Rich state for AI introspection
 */
export interface TUIDriverState extends AppState {
  /** Current cursor position */
  cursor: CursorPosition
  /** ID of the currently selected node */
  selectedNodeId: string | null
  /** Current view mode */
  viewMode: ViewMode | null
  /** Active dialogs */
  dialogs: DialogState
  /** Detail pane open */
  detailPaneOpen: boolean
  /** Move mode active */
  moveMode: boolean
  /** Scroll offset for columns */
  scrollOffset: number
  /** Layout data (columns, colIndex, cardIndex) from store */
  layout: import("./types.ts").ColumnsLayout
  /** Raw UI state from store */
  ui: import("./ui-reducer.ts").UIState
}

/**
 * Board driver interface for AI/test automation
 */
export interface BoardDriver extends AppWithCommands {
  /** Get rich state for AI decision-making */
  getState(): TUIDriverState
  /** The underlying inkx App */
  readonly app: App
  /** Layout registry for position tracking */
  readonly layoutRegistry: LayoutRegistry
  /**
   * Direct access to the board app store for reactive state access.
   * Use store.subscribe() for state change notifications.
   */
  readonly store: StoreApi<BoardAppStore>
}

/**
 * Options for creating a board driver
 */
export interface CreateBoardDriverOptions {
  /** Terminal width */
  columns?: number
  /** Terminal height */
  rows?: number
  /** Initial view mode */
  viewMode?: ViewMode
  /** Enable incremental rendering (required for withDiagnostics checkIncremental) */
  incremental?: boolean
}

// =============================================================================
// Driver Factory
// =============================================================================

/**
 * Create a board driver for AI/test automation.
 *
 * This renders a full Board component in L3 mode (useStore=true) with a local
 * BoardAppStore. Keys are processed through handleKey() — the same path as
 * production — and state is read from store.getState().
 *
 * @param repo - The repository (real or fake) containing nodes
 * @param rootId - The ID of the root node to display as the board
 * @param options - Driver configuration options
 */
export function createBoardDriver(repo: Repo, rootId: string, options: CreateBoardDriverOptions = {}): BoardDriver {
  const { columns = 80, rows = 24, viewMode = "cards", incremental = false } = options

  // Initialize command system
  ensureCommandSystemInitialized()

  // Build initial board state for computing initial store params
  const initialTUIState = buildBoardState(repo, rootId)

  // Compute initial cursor node
  const firstCol = initialTUIState.columns[0]
  const initialCursorNodeId = firstCol?.cards[0]?.node.id ?? firstCol?.node.id ?? null

  // Create layout registry for position tracking
  const layoutRegistry = createLayoutRegistry()
  const toastQueue = createToastQueue()

  // Compute initial layout from TUI state
  const initialLayout = {
    columns: initialTUIState.columns,
    colIndex: 0,
    cardIndex: 0,
    isAtCardLevel:
      initialCursorNodeId !== null &&
      initialTUIState.columns.length > 0 &&
      (initialTUIState.columns[0]?.cards.length ?? 0) > 0,
  }

  const selectedCol = initialTUIState.columns[0]
  const selectedCard = selectedCol?.cards[0]
  const initialSelectedNode = selectedCard?.node ?? selectedCol?.node ?? null
  const initialSelectionLevel: "board" | "column" | "card" =
    initialCursorNodeId === null ? "board" : selectedCard ? "card" : "column"

  // Create the BoardAppStore (same type as production createBoardApp)
  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    layoutRegistry,
    cursorStore: createCursorStore({
      cursorNodeId: initialCursorNodeId,
      colIndex: 0,
      cardIndex: 0,
      selectionLevel: initialSelectionLevel,
    }),
    initialBoardState: createBoardState(initialTUIState.rootId, initialTUIState.rootPath, initialCursorNodeId, initialTUIState.collapsedNodeIds),
    initialUIState: createInitialUIState(
      viewMode,
      [...(initialTUIState.collapsedColumns ?? [])],
      { columns, rows },
      initialTUIState.rootId,
    ),
    initialLayout,
    initialTUIBoardState: initialTUIState,
    initialSelectedNode,
    initialSelectionLevel,
    dimensions: { columns, rows },
  }

  const store = createStore<BoardAppStore>(createBoardAppStoreState(storeParams))

  // Create command registry
  const registry = createCommandRegistry()
  registry.registerAll(allCommands)

  // Render Board component with StoreContext.Provider for L3 mode
  const render = createRenderer({ cols: columns, rows })
  const boardElement = React.createElement(Board, {
    initialState: initialTUIState,
    initialViewMode: viewMode,
    dimensions: { columns, rows },
    onExit: () => {},
    toastQueue,
    layoutRegistry,
  })
  const baseApp = render(
    React.createElement(
      StoreContext.Provider,
      { value: store as StoreApi<unknown> },
      React.createElement(RepoProvider, {
        repo,
        children: boardElement,
      }),
    ),
    incremental === false ? { incremental: false } : undefined,
  )

  // Build command context from store state
  const getContext = (): CommandContext => {
    const s = store.getState()
    const column = s.layout.columns[s.layout.colIndex]

    return {
      currentNode: s.selectedNode as CommandContext["currentNode"],
      currentNodeId: s.selectedNode?.id ?? null,
      selectedNodes: Array.from(s.selectedNodes),
      viewMode: s.ui.viewMode,
      siblingIndex: s.layout.cardIndex,
      siblingCount: column?.cards.length ?? 0,
      columnIndex: s.layout.colIndex,
      columnCount: s.layout.columns.length,
      moveMode: s.moveMode,
      foldedNodes: s.foldedNodes,
    }
  }

  // Handle actions - informational only (actual state changes happen via handleKey)
  const handleAction = (_action: CommandAction): void => {}

  // Get keybindings for command metadata
  const getKeybindings = (): Keybinding[] => defaultKeybindings

  // Apply withCommands plugin for introspection
  const appWithCmd = withCommands(baseApp, {
    registry,
    getContext,
    handleAction,
    getKeybindings,
  })

  // Override press() to route through handleKey (same path as production)
  const originalPress = baseApp.press.bind(baseApp)
  const driverPress = async (key: string): Promise<App> => {
    // Parse the key and route through the board-app key handler.
    // Must run inside act() so that Zustand → useApp → setState updates are
    // processed synchronously by React, triggering Board L3 re-render +
    // useEffect(updateLayout) within the same act() boundary.
    const ansi = keyToAnsi(key)
    const [input, parsedKey] = parseKey(ansi)
    act(() => {
      handleKey({ input, key: parsedKey }, { get: store.getState, set: store.setState }, () => {})
      // Trigger a no-op Zustand store update to ensure any pending
      // useSyncExternalStore updates (from CursorStore mutations done by
      // handleKey's SELECT fast path) get flushed during this act() cycle.
      // Without this, external store changes aren't reflected until the
      // next state-changing keypress.
      store.setState((s) => s)
    })

    // Trigger a second act() to flush any remaining effects (e.g. updateLayout
    // writing back to store → further useApp subscriptions → re-renders).
    // originalPress sends the raw key through stdin which Board L3 ignores,
    // but the act() boundary inside sendInput flushes pending React work.
    return originalPress(key)
  }

  // Build rich getState for AI introspection.
  // Save original before Object.assign overwrites it.
  const baseGetState = appWithCmd.getState.bind(appWithCmd)
  const getDriverState = (): TUIDriverState => {
    const baseState = baseGetState()
    const s = store.getState()

    return {
      ...baseState,
      cursor: {
        col: s.layout.colIndex,
        card: s.layout.cardIndex,
        level: s.selectionLevel,
      },
      selectedNodeId: s.selectedNode?.id ?? null,
      viewMode: s.ui.viewMode,
      dialogs: {
        search: s.ui.showSearchDialog,
        newItem: s.ui.showNewItemDialog,
        projectPicker: s.ui.showProjectPicker,
        help: s.ui.showHelp,
      },
      detailPaneOpen: s.ui.showDetailPane,
      moveMode: s.moveMode,
      scrollOffset: 0,
      layout: s.layout,
      ui: s.ui,
    }
  }

  // Return driver with all capabilities.
  // IMPORTANT: Use Object.assign (same pattern as withCommands) instead of spread.
  // Spread `{ ...appWithCmd }` snapshots getters (text, ansi, lastBuffer) as
  // static values from the initial render. Object.assign mutates the original
  // object, preserving its getters so they return current buffer state.
  return Object.assign(appWithCmd, {
    press: driverPress,
    getState: getDriverState,
    app: baseApp,
    layoutRegistry,
    store,
  }) as BoardDriver
}
