/**
 * Board Driver - AI/Test Automation Interface
 *
 * Provides a unified interface for driving the Board TUI programmatically,
 * enabling AI exploration, fuzz testing, and headless automation.
 *
 * Uses a local BoardAppStore (signal store) for state management — the same store
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
 *   console.log('Cursor moved:', state.sel.node.cursor())
 * })
 *
 * // Drive via keybindings
 * await driver.press('j')  // Resolves to cursor_down
 * await driver.press('/')  // Opens search dialog
 * ```
 */

import React, { act } from "react"
import { createSignalStore, type SignalStoreApi as StoreApi } from "./state/signal-store.ts"
import { createRenderer, keyToAnsi, type App } from "@silvery/test"
import { createFocusManager, FocusManagerContext } from "@silvery/ag-react"
import { pipe, withCommands, type AppWithCommands, type AppState } from "@silvery/create/plugins"
import { StoreContext, type EventHandlerContext } from "@silvery/create"
import { parseKey } from "@silvery/ag-term/runtime"
import {
  createCommandRegistry,
  allCommands,
  defaultKeybindings,
  type CommandContext,
  type KmOp,
  type Keybinding,
  type ViewMode,
} from "@km/commands"
import { createToastQueue } from "@km/core"
import type { Repo } from "@km/storage"
import { createStoreFromRepo, withReactive } from "@km/storage"
import { createBoardState, hasDetailPaneFor } from "./board/board-types.ts"

import { BoardApp } from "./views/Board.tsx"
import { RepoProvider } from "./repo-context.tsx"
import { StoreProvider } from "./state/store-context.tsx"
import { createGridNavigator, createViewLens, createVisibleLens, type GridNavigator } from "@km/board"
import { buildNodeIndexFromTree, deriveCursorIndices } from "./hooks/use-columns.ts"
import { ensureCommandSystemInitialized } from "./board/command-bridge.ts"
import { resetDialogGuard, installDialogGuard } from "./dialog-guard.ts"
import {
  createBoardAppStoreState,
  Workspace,
  type BoardAppStore,
  type CreateBoardAppStoreParams,
} from "./state/board-app-store.ts"
import { createInitialUIState } from "./state/ui-reducer.ts"
import { handleKey } from "./board/board-app.ts"

// =============================================================================
// Types
// =============================================================================

/**
 * Dialog state in the TUI
 */
export interface DialogState {
  search: boolean
  newItem: boolean
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
  moveMode: boolean // derived from moveState.active
  /** Layout data (columnIds, colIndex, cardIndex) */
  columnIds: string[]
  colIndex: number
  cardIndex: number
  isAtCardLevel: boolean
  nodeIndex: Map<string, { colIndex: number; cardIndex: number }>
  /** Raw UI state from store */
  ui: import("./state/ui-reducer.ts").UIState
}

/**
 * Board driver interface for AI/test automation
 */
export interface BoardDriver extends AppWithCommands<App> {
  /** Get rich state for AI decision-making */
  getState(): TUIDriverState
  /** The underlying silvery App */
  readonly app: App
  /** Layout registry for position tracking */
  readonly navigator: GridNavigator
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

  // Initialize command system and reset dialog guard for clean state
  ensureCommandSystemInitialized()
  resetDialogGuard()

  // Derive initial cursor and collapsed nodes from the tree lens
  const initLens = createVisibleLens(createViewLens(repo, { rootId, foldDepths: new Map() }))
  const initColIds = rootId ? initLens.children(rootId) : []
  const firstColId = initColIds[0]
  const firstCardId = firstColId ? initLens.children(firstColId)[0] : null
  const initialCursor = firstCardId ?? firstColId ?? null

  const collapsedNodeIds = new Set<string>()
  if (rootId) {
    for (const child of repo.getChildren(rootId)) {
      if (child.rules?.collapse || child.data?.collapsed === true) {
        collapsedNodeIds.add(child.id)
      }
    }
  }

  // Create layout registry for position tracking
  const navigator = createGridNavigator()
  const toastQueue = createToastQueue()

  // Create the BoardAppStore (same type as production createBoardApp)
  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator,
    initialBoardState: createBoardState(rootId, repo.path, collapsedNodeIds),
    initialCursor: initialCursor,
    initialUIState: createInitialUIState({ columns, rows }),
    initialViewMode: viewMode,
    dimensions: { columns, rows },
  }

  const store = createSignalStore<BoardAppStore>(createBoardAppStoreState(storeParams))

  // Create reactive store for signal-based subscriptions (useStore/useChildIdsSignal/useCommitVersion)
  const reactiveStore = withReactive(createStoreFromRepo(repo))

  // Create focus manager for focus tree (matches create-app.tsx production setup)
  // TODO(km-canonical): Once the driver uses a full pipe() chain with withFocus(),
  // the focus manager can be provided via the plugin instead of manual creation.
  // withFocus({ focusManager }) already accepts an external instance.
  const focusManager = createFocusManager()

  // Install the focus manager as the dialog guard backend so push/pop/current
  // read and mutate its scope stack directly.
  installDialogGuard(focusManager)

  // Create command registry
  const registry = createCommandRegistry()
  registry.registerAll(allCommands)

  // Render BoardApp component with StoreContext.Provider for L3 mode.
  // BoardApp handles workspace pane layout (including detail pane rendering)
  // and reads dimensions from the store via useApp() selectors.
  // singlePassLayout matches production's create-app.tsx rendering pipeline.
  const render = createRenderer({ cols: columns, rows, singlePassLayout: true })
  const boardAppElement = React.createElement(BoardApp, {
    initialViewMode: viewMode,
    toastQueue,
    navigator,
  })
  const baseApp = render(
    React.createElement(
      StoreContext.Provider,
      { value: store as StoreApi<unknown> },
      React.createElement(
        FocusManagerContext.Provider,
        { value: focusManager },
        React.createElement(StoreProvider, {
          store: reactiveStore,
          children: React.createElement(RepoProvider, {
            repo,
            children: boardAppElement,
          }),
        }),
      ),
    ),
    incremental === false ? { incremental: false } : undefined,
  )

  // Build command context from store state — derive layout on demand
  const getContext = (): CommandContext => {
    const s = store.getState()
    const board = Workspace.getActiveBoardPane(s)
    const rootId = board?.rootId ?? null
    const foldDepths = board?.foldDepths ?? new Map<string, number>()
    const ni = board?.signals
      ? buildNodeIndexFromTree(board.signals.visibleLens())
      : new Map<string, { colIndex: number; cardIndex: number }>()
    const ctxColIds = rootId && board?.signals ? [...board.signals.visibleLens().children(rootId)] : []
    const cursor = (board?.sel.node.cursor() as string | null) ?? null
    const cursorPos = deriveCursorIndices({ length: ctxColIds.length }, cursor, ni, (id) => s.repo.getNode(id))
    const ctxColumnId = ctxColIds[cursorPos.colIndex] ?? null
    const ctxCardIds = ctxColumnId && board?.signals ? board.signals.visibleLens().children(ctxColumnId) : []
    const ctxCardId = ctxCardIds[cursorPos.cardIndex]
    const card = ctxCardId ? s.repo.getNode(ctxCardId) : null
    const selectedNode = card ?? (ctxColumnId ? s.repo.getNode(ctxColumnId) : null) ?? null

    return {
      currentNode: selectedNode as CommandContext["currentNode"],
      currentNodeId: selectedNode?.id ?? null,
      cursor,
      selectedNodes: Array.from(s.sel.node.ids()),
      viewMode: board?.viewMode ?? "columns",
      siblingIndex: cursorPos.cardIndex,
      siblingCount: ctxColumnId ? ctxCardIds.length : 0,
      columnIndex: cursorPos.colIndex,
      columnCount: ctxColIds.length,
      moveMode: board?.moveState.active ?? false,
      foldDepths,
    }
  }

  // Handle actions - informational only (actual state changes happen via handleKey)
  const handleAction = (_action: KmOp): void => {}

  // Get keybindings for command metadata
  const getKeybindings = (): Keybinding[] => defaultKeybindings()

  // Apply plugins via pipe() composition
  const appWithCmd = pipe(
    baseApp,
    withCommands({
      registry,
      getContext,
      handleAction,
      getKeybindings,
    }),
  )

  // Focus-aware event handler context (same shape as EventHandlerContext from create-app.tsx)
  const eventCtx: EventHandlerContext<BoardAppStore> = {
    get: store.getState,
    set: store.setState,
    focusManager,
    focus(testID: string) {
      // Use focusById with the render tree root. If a real focusable node with
      // this testID exists, it gets focused. Otherwise focusById falls through
      // to virtual focus (sets activeId without a DOM node).
      focusManager.focusById(testID, baseApp.getContainer(), "programmatic")
    },
    activateScope(scopeId: string) {
      focusManager.activateScope(scopeId, baseApp.getContainer())
    },
    getFocusPath() {
      return focusManager.getFocusPath(baseApp.getContainer())
    },
    hitTest(_x: number, _y: number) {
      return null
    },
  }

  // Override press() to route through handleKey (same path as production)
  const originalPress = baseApp.press.bind(baseApp)
  const driverPress = async (key: string): Promise<App> => {
    // Parse the key and route through the board-app key handler.
    // Must run inside act() so that store → useApp → setState updates are
    // processed synchronously by React, triggering Board L3 re-render.
    const ansi = keyToAnsi(key)
    const [input, parsedKey] = parseKey(ansi)
    act(() => {
      handleKey({ input, key: parsedKey }, eventCtx, () => {})
      // Trigger a no-op signal store update to ensure any pending
      // alien-signals bridge updates get flushed during this act() cycle.
      // Without this, external store changes aren't reflected until the
      // next state-changing keypress.
      store.setState((s) => s)
    })

    // Trigger a second act() to flush any remaining effects (e.g. selection
    // sync → further useApp subscriptions → re-renders).
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
    const board = Workspace.getActiveBoardPane(s)
    const rootId = board?.rootId ?? null
    const foldDepths = board?.foldDepths ?? new Map<string, number>()

    // Derive layout from tree on demand
    const ni = board?.signals
      ? buildNodeIndexFromTree(board.signals.visibleLens())
      : new Map<string, { colIndex: number; cardIndex: number }>()
    const treeColIds = rootId && board?.signals ? [...board.signals.visibleLens().children(rootId)] : []
    const cursorId = (board?.sel.node.cursor() as string | null) ?? null
    const cursorPos = deriveCursorIndices({ length: treeColIds.length }, cursorId, ni, (id) => s.repo.getNode(id))
    const columnId = treeColIds[cursorPos.colIndex] ?? null
    const treeCardIds = columnId && board?.signals ? board.signals.visibleLens().children(columnId) : []
    const cardNodeId = treeCardIds[cursorPos.cardIndex]
    const card = cardNodeId ? s.repo.getNode(cardNodeId) : null
    const selectedNode = card ?? (columnId ? s.repo.getNode(columnId) : null) ?? null
    const level = cursorPos.colIndex === -1 ? "board" : cursorPos.cardIndex === -1 ? "column" : "card"

    return {
      ...baseState,
      cursor: {
        col: cursorPos.colIndex,
        card: cursorPos.cardIndex,
        level,
      },
      selectedNodeId: selectedNode?.id ?? null,
      viewMode: board?.viewMode ?? "columns",
      dialogs: {
        search: s.ui.showSearchDialog,
        newItem: s.ui.showNewItemDialog,
        help: s.ui.showHelp,
      },
      detailPaneOpen: hasDetailPaneFor(s.workspace, s.workspace.focusedPaneId),
      moveMode: board?.moveState.active ?? false,
      columnIds: treeColIds,
      colIndex: cursorPos.colIndex,
      cardIndex: cursorPos.cardIndex,
      isAtCardLevel: cursorPos.isAtCardLevel,
      nodeIndex: ni,
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
    navigator,
    store,
  }) as BoardDriver
}
