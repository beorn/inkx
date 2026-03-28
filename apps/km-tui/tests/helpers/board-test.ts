/**
 * Board Test Helper - Fluent API for Visual Board Testing
 *
 * Wraps silvery createRenderer with a concise, documentation-like API
 * for testing TUI board rendering.
 *
 * ## Architecture (3-layer pattern)
 *
 * Uses BoardCore (pure rendering) for static tests, or Board (stateful)
 * for keyboard navigation tests:
 * - Static visual testing with BoardCore
 * - Keyboard navigation with Board (useReducer + useInput)
 *
 * ## Tree Builder API (decker-inspired)
 *
 * Quick fixture creation with nested function calls:
 *
 * @example
 * ```typescript
 * // Create nodes inline
 * const nodes = item("board",
 *   item("col1", item("1a"), item("1b")),
 *   item("col2", item("2a"))
 * );
 *
 * // One-line test with fluent API
 * const { board } = testEnv(() =>
 *   item("board", item("col1", item("task1"), item("task2")))
 * );
 * board.press("j").expectVisible("task2");
 * ```
 */
/* oxlint-disable complexity/complexity -- Test helper — fixture builder complexity is acceptable */

import React, { act } from "react"
import { createStore, type StoreApi } from "zustand"

/** Helper: React.createElement with children as prop (avoids React 19 overload mismatch) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const h = (type: any, props: any, ...children: any[]): React.ReactElement =>
  React.createElement(
    type,
    children.length === 1 ? { ...props, children: children[0] } : children.length > 0 ? { ...props, children } : props,
  )
import { ReactiveNodeStore, ReactiveNodeStoreProvider } from "../../src/reactive.ts"
import { createRenderer, keyToAnsi, bufferToText, type App, type AutoLocator } from "@silvery/test"
import { compareBuffers, formatMismatch } from "@silvery/ag-term/toolbelt"
import { StoreContext } from "@silvery/create/create-app"
import { parseKey } from "@silvery/ag-term/runtime"
import {
  createFocusManager,
  FocusManagerContext,
  ThemeProvider,
  hitTest,
  processMouseEvent,
  createMouseEventProcessor,
} from "@silvery/ag-react"
import { expect } from "vitest"
import { createFakeRepo, type Repo } from "@km/storage"
import { createBoardState, createPaneState } from "../../src/board-types.ts"
import { createToastQueue, type KNode, type NodeRules, type NodeType } from "@km/core"
import { parseHeadingRules } from "@km/markdown"

import { BoardCore, Board, BoardApp } from "../../src/views/Board.tsx"
import { buildBoardState } from "../../src/state.ts"
import { createInitialUIState, createInitialPaneUI } from "../../src/ui-reducer.ts"
import { createGridNavigator } from "@km/board"
import { RepoProvider } from "../../src/repo-context.tsx"
import { ensureCommandSystemInitialized } from "../../src/command-bridge.ts"
import { getChordState } from "@km/commands"
import { resetModeStack } from "../../src/dialog-guard.ts"
import { TreeRenderProvider, deriveTreeConfig } from "../../src/ui-context.tsx"
import {
  createBoardAppStoreState,
  type BoardAppStore,
  type CreateBoardAppStoreParams,
} from "../../src/board-app-store.ts"
import { handleKey, handleMouse, resetBoardAppState } from "../../src/board-app.ts"
import { defaultKmTheme } from "../../src/theme.ts"
import type { ParsedMouse } from "@silvery/ag-react"
import type { InitialBoardData } from "../../src/types.ts"
import { createCursorStoreFromRepo } from "../../src/cursor-store.ts"

// NOTE: BoardCore is pure rendering (no hooks) - use for static visual tests.
// Board includes useReducer + useInput - use for keyboard navigation tests.
import {
  createBoardState as createBoardStateFixture,
  createColumnView,
  createCardNode,
} from "../fixtures/board-fixtures.ts"

// =============================================================================
// Command → Key reverse lookup (for command() semantic alias)
// =============================================================================

/** Maps command IDs to their key sequence(s). Used by board.command() to
 *  dispatch via the full key handler path while keeping tests readable. */
const COMMAND_TO_KEYS: Record<string, string[]> = {
  // Navigation
  cursor_down: ["j"],
  cursor_up: ["k"],
  cursor_left: ["h"],
  cursor_right: ["l"],
  cursor_first: ["g", "g"],
  cursor_last: ["G"],
  block_nav_down: ["J"],
  block_nav_up: ["K"],

  // Fold
  fold_node: ["H"],
  unfold_node: ["L"],
  fold_all: ["\x1b[44;2u"], // shift+, (Kitty CSI: codepoint 44=comma, modifier 2=shift)
  unfold_all: ["\x1b[46;2u"], // shift+. (Kitty CSI: codepoint 46=period, modifier 2=shift)

  // Zoom
  zoom_inwards: ["z"],
  zoom_outwards: ["Z"],

  // Edit
  enter_inline_edit: ["i"],
  enter_body_edit: ["I"],
  insert_below: ["o"],
  insert_above: ["O"],
  undo: ["u"],
  redo: ["U"],
  indent_node: ["Tab"],
  // shift+Enter — Kitty CSI sequence (ANSI can't distinguish shift+Enter from Enter)
  "text.child_block": ["\x1b[13;2u"],

  // Task
  toggle_task_done: ["x"],
  cycle_task_status: ["X"],

  // Selection
  select_toggle: [" "],

  // View
  filter: ["V"],
  show_help: ["?"],
  increase_content_lines: ["."],
  decrease_content_lines: [","],
  local_find: ["/"],
  command_palette: [":"],
  quit: ["q"],

  // Detail
  toggle_detail_pane: ["D"],

  // Dialogs
  task_dialog: ["T"],
  manage_favorites: ["M"],
  search_replace: ["F"],

  // v-prefix chords
  toggle_collapse: ["v", "c"],
  toggle_hide_done: ["v", "d"],
  cycle_view_mode: ["v", "m"],

  visual_mode_enter: ["v", "v"],
  ignore_node: ["v", "x"],
  toggle_show_ignored: ["v", "X"],
  clear_filters: ["v", "-"],
  pane_split_vertical: ["v", "s"],
  pane_focus_left: ["v", "h"],
  pane_focus_down: ["v", "j"],
  pane_focus_up: ["v", "k"],
  pane_focus_right: ["v", "l"],
  pane_resize_grow: ["v", ">"],
  pane_resize_shrink: ["v", "<"],
  pane_equalize: ["v", "="],
  pane_close: ["v", "w"],
  pane_only: ["v", "o"],
  pane_zoom: ["v", "z"],
  pane_focus_next: ["v", "n"],
  pane_focus_prev: ["v", "N"],
  pane_focus_previous: ["v", "p"],

  // g-prefix chords
  open_in_system: ["g", "o"],
  open_in_terminal: ["g", "O"],

  // m-prefix chords
  enter_move_mode: ["m", "m"],
  archive: ["m", "a"],

  // t-prefix chords
  clear_task: ["t", "-"],
  set_assignee: ["t", "o"],
  set_due_date: ["t", "d"],
  set_priority: ["t", "!"],
  set_priority_0: ["t", "0"],
  set_priority_1: ["t", "1"],
  set_priority_2: ["t", "2"],
  set_priority_3: ["t", "3"],
  set_priority_4: ["t", "4"],
  cycle_task_status_t: ["t", "s"],
  set_recurring: ["t", "r"],
  set_label: ["t", "l"],
}

// =============================================================================
// Cursor Initialization Helper
// =============================================================================

/**
 * Compute initial cursor placement for a board state.
 * Skips collapsed columns to avoid placing cursor on invisible cards.
 */
function computeInitialCursor(initialState: InitialBoardData) {
  let cursorNodeId: string | null = null
  let colIndex = 0
  let cardIndex = -1

  if (initialState.columns.length > 0) {
    // Find first non-collapsed column
    for (let i = 0; i < initialState.columns.length; i++) {
      const col = initialState.columns[i]
      if (!col) continue
      if (initialState.collapsedNodeIds.has(col.node.id)) continue
      colIndex = i
      if (col.cardNodes.length > 0) {
        cursorNodeId = col.cardNodes[0]?.id ?? col.node.id
        cardIndex = 0
      } else {
        cursorNodeId = col.node.id
        cardIndex = -1
      }
      break
    }
    // If all columns collapsed, use first column header
    if (cursorNodeId === null && initialState.columns.length > 0) {
      const firstCol = initialState.columns[0]!
      cursorNodeId = firstCol.node.id
      colIndex = 0
      cardIndex = -1
    }
  }

  const selectedCol = initialState.columns[colIndex]
  const isCollapsed = selectedCol ? initialState.collapsedNodeIds.has(selectedCol.node.id) : false
  const hasCards = selectedCol && !isCollapsed && selectedCol.cardNodes.length > 0
  const selectionLevel: "board" | "column" | "card" = cursorNodeId === null ? "board" : hasCards ? "card" : "column"

  return { cursorNodeId, colIndex, cardIndex: hasCards ? 0 : cardIndex, selectedCol, selectionLevel }
}

// =============================================================================
// Tree Fixture Builder (decker-inspired)
// =============================================================================

/**
 * Tree-style fixture builder using nested function calls
 * Content is used as the ID for easy test referencing
 *
 * @example
 * const nodes = item("board",
 *   item("col1",
 *     item("1a"),
 *     item("1b")
 *   ),
 *   item("col2",
 *     item("2a")
 *   )
 * );
 *
 * // With WIP limits
 * const nodes = item("board",
 *   item("col1 km.limit:: 3",
 *     item("1a"),
 *     item("1b")
 *   )
 * );
 */
export function item(content: string, ...childArrays: KNode[][]): KNode[] {
  // Nodes with children become folders (columns), leaf nodes become tasks (cards)
  const hasChildren = childArrays.length > 0

  // Parse rules from content using km.key:: value syntax (e.g., "col1 km.limit:: 3")
  let cleanContent = content
  let rules: NodeRules | undefined

  if (hasChildren) {
    const parsed = parseHeadingRules(content)
    if (Object.keys(parsed.rules).length > 0) {
      rules = parsed.rules
      cleanContent = parsed.title
    }
  }

  const node: KNode = {
    id: content,
    type: hasChildren ? "h" : "p",
    item: true,
    ...(hasChildren
      ? { fstype: "folder" as const }
      : { list_marker: "-", task_marker: "[ ]", task_status: "todo" as const }),
    content: hasChildren ? undefined : cleanContent,
    data: hasChildren ? { name: cleanContent } : {},
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
    ...(rules ? { rules } : {}),
  }

  // Process each child array (each call to item())
  const result: KNode[] = [node]
  childArrays.forEach((childArray, idx) => {
    // The first node in each child array is the direct child
    const directChild = childArray[0]
    if (directChild) {
      directChild.parent_id = content
      directChild.parent_idx = idx
    }
    // Add all nodes from this child array to the result
    result.push(...childArray)
  })

  return result
}

// Internal helper for type-specific node creation
function makeNodeWithType(
  content: string,
  type: NodeType,
  props: { is_repo_root?: boolean; fstype?: KNode["fstype"]; list_marker?: string; item?: boolean },
  ...childArrays: KNode[][]
): KNode[] {
  const hasChildren = childArrays.length > 0

  const node: KNode = {
    id: content,
    type,
    ...(props.item !== undefined ? { item: props.item } : {}),
    ...(props.fstype ? { fstype: props.fstype } : {}),
    ...(props.list_marker ? { list_marker: props.list_marker } : {}),
    // Set name for mdsection nodes to match production (ast2nodes sets name: slugified heading)
    ...(props.fstype === "mdsection" && hasChildren ? { name: content.toLowerCase().replace(/\s+/g, "-") } : {}),
    content: hasChildren ? undefined : content,
    data: {
      ...(hasChildren ? { name: content } : {}),
      ...(props.is_repo_root ? { is_repo_root: true } : {}),
    },
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }

  const result: KNode[] = [node]
  childArrays.forEach((childArray, idx) => {
    const directChild = childArray[0]
    if (directChild) {
      directChild.parent_id = content
      directChild.parent_idx = idx
    }
    result.push(...childArray)
  })

  return result
}

// Type-specific factories attached to item()
item.root = (content: string, ...childArrays: KNode[][]): KNode[] =>
  makeNodeWithType(content, "h", { item: true, is_repo_root: true, fstype: "repo" }, ...childArrays)

item.folder = (content: string, ...childArrays: KNode[][]): KNode[] =>
  makeNodeWithType(content, "h", { item: true, fstype: "folder" }, ...childArrays)

item.section = (content: string, ...childArrays: KNode[][]): KNode[] =>
  makeNodeWithType(content, "h", { item: true, fstype: "mdsection" }, ...childArrays)

item.paragraph = (content: string): KNode[] => makeNodeWithType(content, "p", {})

item.file = (content: string, ...childArrays: KNode[][]): KNode[] =>
  makeNodeWithType(content, "h", { item: true, fstype: "mdfile" }, ...childArrays)

item.code = (content: string): KNode[] => makeNodeWithType(content, "code", {})

item.hr = (id?: string): KNode[] => {
  const nodeId = id ?? "hr-" + Math.random().toString(36).slice(2, 8)
  const node: KNode = {
    id: nodeId,
    type: "hr",
    content: undefined,
    data: {},
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
  return [node]
}

item.quote = (content: string): KNode[] => makeNodeWithType(content, "quote", {})

item.task = (content: string, status?: string): KNode[] => {
  const nodes = makeNodeWithType(content, "p", { item: true, list_marker: "-" })
  if (nodes[0]) {
    nodes[0].task_status = (status ?? "todo") as KNode["task_status"]
    nodes[0].task_marker = "[ ]"
  }
  return nodes
}

item.link = (content: string, linkTo: string): KNode[] => {
  const nodes = makeNodeWithType(content, "p", {})
  if (nodes[0]) {
    nodes[0].embed_source = linkTo
  }
  return nodes
}

/** Standard 1-column board with 3 cards — the most common test fixture */
item.simpleBoard = (): KNode[] => item("board", item("col1", item("1a"), item("1b"), item("1c")))

/** 3-column board with 1 card each — for horizontal navigation tests */
item.multiColBoard = (): KNode[] =>
  item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a")))

/** Board with nested folder — for zoom/fold tests */
item.nestedBoard = (): KNode[] =>
  item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")), item("sibling")))

/**
 * Standard board fixture for common tests
 */
function standardBoard() {
  const nodes = item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a")), item("col3"))

  return {
    repo: createFakeRepo({ nodes }),
    root: "board",
  }
}

/**
 * One-line fixture creation + rendering with fluent API
 *
 * @example
 * const { board } = testEnv(() =>
 *   item("board",
 *     item("col1", item("1a"), item("1b"))
 *   )
 * );
 * board.press("j").expect("#1b[data-cursor]").toExist();
 *
 * // Test with specific view mode
 * const { board: listBoard } = testEnv(() => item("board", item("col1", item("1a"))), {
 *   viewMode: "list"
 * });
 */

/** Build an EventHandlerContext with focus support for tests */
function buildTestEventHandlerCtx(store: StoreApi<BoardAppStore>, fm: ReturnType<typeof createFocusManager>, app: App) {
  return {
    get: store.getState,
    set: store.setState,
    focusManager: fm,
    focus(testID: string) {
      // Use focusById with the render tree root. If a real focusable node with
      // this testID exists, it gets focused. Otherwise focusById falls through
      // to virtual focus (sets activeId without a DOM node).
      fm.focusById(testID, app.getContainer(), "programmatic")
    },
    activateScope(scopeId: string) {
      fm.activateScope(scopeId, app.getContainer())
    },
    getFocusPath() {
      return fm.getFocusPath(app.getContainer())
    },
    hitTest(x: number, y: number) {
      return hitTest(app.getContainer(), x, y)
    },
  }
}

// =============================================================================
// Shared Test Render Environment (internal)
// =============================================================================

/** Options shared by testEnv and testEnvWithRepo */
interface TestEnvOptions {
  columns?: number
  rows?: number
  viewMode?: "cards" | "columns" | "list" | "tabs"
  /** Enable incremental rendering (buffer clone + subtree skip). Default: true */
  incremental?: boolean
  /** Compare incremental vs fresh render after every press(). Default: true */
  checkIncremental?: boolean
}

/**
 * Internal helper that creates the shared test rendering infrastructure.
 * Both testEnv() and testEnvWithRepo() delegate to this.
 *
 * Handles: command system init, store setup, renderer creation, pressKey/sendMouse,
 * and the full fluent board API with all assertion methods.
 */
function createTestRenderEnv(repo: Repo, rootId: string, options?: TestEnvOptions) {
  // Build initial board state from repo
  const initialState = buildBoardState(repo, rootId)

  // Reset all module-level state for isolate:false compatibility.
  // Without this, timers/caches/state from previous test files leak through.
  ensureCommandSystemInitialized()
  getChordState().cancel()
  resetModeStack()
  resetBoardAppState()

  // Set up store (same pattern as driver)
  const columns = options?.columns ?? 80
  const rows = options?.rows ?? 24
  const viewMode = options?.viewMode ?? "cards"
  const registry = createGridNavigator()
  const toastQueue = createToastQueue()

  const { cursorNodeId: initialCursorNodeId } = computeInitialCursor(initialState)

  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator: registry,
    cursorStore: createCursorStoreFromRepo(repo, initialState.rootId, initialCursorNodeId),
    initialBoardState: createBoardState(
      initialState.rootId,
      initialState.rootPath,
      initialCursorNodeId,
      initialState.collapsedNodeIds,
    ),
    initialUIState: createInitialUIState({ columns, rows }),
    initialViewMode: viewMode,
    dimensions: { columns, rows },
  }

  const store = createStore<BoardAppStore>(createBoardAppStoreState(storeParams))

  // Create focus manager for focus tree (matches create-app.tsx production setup)
  const focusManager = createFocusManager()

  // Render BoardApp with StoreContext.Provider for L3 mode.
  // BoardApp handles workspace pane layout (including detail pane rendering)
  // and reads dimensions from the store via useApp() selectors.
  // singlePassLayout matches production's create-app.tsx rendering pipeline.
  const render = createRenderer({ cols: columns, rows, singlePassLayout: true })
  const boardAppElement = React.createElement(BoardApp, {
    initialViewMode: viewMode,
    toastQueue,
    navigator: registry,
  })
  const result = render(
    h(
      ThemeProvider,
      { theme: defaultKmTheme },
      h(
        StoreContext.Provider,
        { value: store as StoreApi<unknown> },
        h(FocusManagerContext.Provider, { value: focusManager }, h(RepoProvider, { repo, children: boardAppElement })),
      ),
    ),
    { incremental: options?.incremental ?? true },
  )

  // Override press to route through handleKey (same path as driver/production)
  const originalPress = result.press.bind(result)
  const doCheckIncremental = options?.checkIncremental !== false
  const eventCtx = buildTestEventHandlerCtx(store, focusManager, result)
  const pressKey = (key: string) => {
    const ansi = keyToAnsi(key)
    const [input, parsedKey] = parseKey(ansi)
    act(() => {
      handleKey({ input, key: parsedKey }, eventCtx, () => {})
      // Trigger a no-op Zustand store update to ensure any pending
      // useSyncExternalStore updates (from repo mutations done outside
      // of press) get flushed during this act() cycle. Without this,
      // external store changes aren't reflected until the next
      // state-changing keypress.
      store.setState((s) => s)
    })
    // Flush remaining React effects via originalPress.
    // IMPORTANT: Do NOT wrap in act() — sendInput + doRender have their own
    // act() calls internally. Wrapping in an outer act() makes doRender's
    // inner act() a nested no-op, preventing React from flushing between
    // pipeline iterations. This breaks the deferred resolve pattern (Phase 2.7
    // cursor Y-correction) which needs React to commit between iterations.
    void originalPress(key)

    // Incremental rendering check: compare incremental buffer against fresh render.
    // Catches ghost pixels, stale regions, and unmount rendering bugs.
    if (doCheckIncremental) {
      const incBuf = result.lastBuffer()
      if (incBuf) {
        const freshBuf = result.freshRender()
        const mismatch = compareBuffers(incBuf, freshBuf)
        if (mismatch) {
          const msg = formatMismatch(mismatch, {
            key,
            incrementalText: bufferToText(incBuf),
            freshText: bufferToText(freshBuf),
          })
          throw new Error(`Incremental rendering mismatch after press("${key}"):\n${msg}`)
        }
      }
    }
  }

  // Send a mouse event through handleMouse (same path as production)
  const sendMouseEvent = (mouse: ParsedMouse) => {
    act(() => {
      handleMouse(mouse, eventCtx as Parameters<typeof handleMouse>[1])
      store.setState((s) => s)
    })
    // Flush React effects via a no-op press
    void originalPress("") // triggers doRender without actual key processing
  }

  // Dispatch DOM-level mouse events through silvery's tree (onMouseDown, onClick, etc.).
  // This is separate from sendMouseEvent because the board-app handleMouse already handles
  // card selection and focus; processMouseEvent is only needed for component-level handlers
  // like click-to-position in edit fields.
  const mouseEventState = createMouseEventProcessor()
  const sendTreeMouseEvent = (mouse: ParsedMouse) => {
    act(() => {
      processMouseEvent(mouseEventState, mouse, result.getContainer())
      store.setState((s) => s)
    })
    void originalPress("")
  }

  // Dispatch a command by name — reverse-looks up the key(s) and calls pressKey().
  // This is a semantic alias: tests express intent (command name) instead of mechanism (key).
  // The full key handler path is exercised, including focus, visual mode, dialogs, etc.
  const dispatchCommand = (commandId: string) => {
    const keys = COMMAND_TO_KEYS[commandId]
    if (!keys) throw new Error(`command("${commandId}"): no key mapping found. Add it to COMMAND_TO_KEYS.`)
    for (const key of keys) {
      pressKey(key)
    }
  }

  // Build the full fluent board API with all assertion methods
  const board = createFluentBoardApi({
    result,
    columns,
    rows,
    pressKey,
    sendMouseEvent,
    sendTreeMouseEvent,
    dispatchCommand,
  })

  return { board, registry, toastQueue, store, focusManager, result }
}

// =============================================================================
// Fluent Board API Builder (internal)
// =============================================================================

/**
 * Builds the complete fluent board API object from a rendered test environment.
 * All assertion methods, screen inspection, mouse events, etc. are included.
 */
function createFluentBoardApi(ctx: {
  result: ReturnType<ReturnType<typeof createRenderer>>
  columns: number
  rows: number
  pressKey: (key: string) => void
  sendMouseEvent: (mouse: ParsedMouse) => void
  sendTreeMouseEvent?: (mouse: ParsedMouse) => void
  dispatchCommand?: (commandId: string) => void
}) {
  const { result, columns, rows, pressKey, sendMouseEvent, sendTreeMouseEvent, dispatchCommand } = ctx

  // Create fluent API using App's auto-refreshing locators
  const board = {
    /** Whether bell was triggered (boundary hit) */
    get bell(): boolean {
      return result.locator("[data-bell]").count() > 0
    },
    press: (key: string) => {
      pressKey(key)
      return board
    },
    /** Dispatch a command by name — semantic alias for press(). Chainable. */
    command: (commandId: string) => {
      if (!dispatchCommand) throw new Error("command() requires testEnv() — not available in renderBoard()")
      dispatchCommand(commandId)
      return board
    },
    /** Navigate cursor to a specific node by pressing cursor_down repeatedly (max 50 steps).
     *  Throws if target not reached. */
    navigateTo: (target: string) => {
      if (!dispatchCommand) throw new Error("navigateTo() requires testEnv() — not available in renderBoard()")
      for (let i = 0; i < 50; i++) {
        const loc = result.locator(`#${target}[data-cursor]`)
        if (loc.count() > 0) return board
        dispatchCommand("cursor_down")
      }
      throw new Error(`navigateTo: could not reach "${target}" in 50 steps`)
    },
    /** Simulate a left mouse click at screen coordinates (x, y). Chainable. */
    click: (x: number, y: number, opts?: { ctrl?: boolean }) => {
      sendMouseEvent({
        button: 0,
        x,
        y,
        action: "down",
        delta: 0,
        shift: false,
        meta: false,
        ctrl: opts?.ctrl ?? false,
      })
      return board
    },
    /** Simulate a double-click at screen coordinates (x, y). Chainable. */
    doubleClick: (x: number, y: number) => {
      // First click
      sendMouseEvent({
        button: 0,
        x,
        y,
        action: "down",
        delta: 0,
        shift: false,
        meta: false,
        ctrl: false,
      })
      // Second click (within double-click threshold)
      sendMouseEvent({
        button: 0,
        x,
        y,
        action: "down",
        delta: 0,
        shift: false,
        meta: false,
        ctrl: false,
      })
      return board
    },
    /** Dispatch a DOM-level mousedown at screen coordinates (x, y) through the silvery tree.
     *  Fires onMouseDown handlers on Box components. Use for component-level click handling
     *  (e.g. silvery's CursorLine/EditContextDisplay onCursorClick).
     *  Does NOT handle board-level logic (card selection) — use click() first, then clickTree(). */
    clickTree: (x: number, y: number) => {
      if (!sendTreeMouseEvent) throw new Error("clickTree() requires testEnv()")
      sendTreeMouseEvent({
        button: 0,
        x,
        y,
        action: "down",
        delta: 0,
        shift: false,
        meta: false,
        ctrl: false,
      })
      return board
    },
    q: (selector: string) => {
      return result.locator(selector)
    },
    expect: (selector: string) => ({
      toExist: () => {
        const loc = result.locator(selector)
        expect(loc.count()).toBeGreaterThan(0)
      },
      not: {
        toExist: () => {
          const loc = result.locator(selector)
          expect(loc.count()).toBe(0)
        },
      },
      toHaveCount: (n: number) => {
        const loc = result.locator(selector)
        expect(loc.count()).toBe(n)
      },
    }),
    screenshot: () => result.text,
    /** Check if status message is showing */
    get hasStatus(): boolean {
      const bottomBar = result.locator("#bottom-bar")
      return bottomBar.count() > 0 && !!bottomBar.getAttribute("data-status")
    },
    /** Get current status message if visible, or null if no status */
    getStatus: (): { level: string; message: string } | null => {
      const bottomBar = result.locator("#bottom-bar")
      if (bottomBar.count() === 0) {
        return null
      }
      const level = bottomBar.getAttribute("data-status")
      if (!level) {
        return null
      }
      // Status feedback is rendered in CommandFeedback's FlashMessage (#feedback-message)
      // which floats above the bottom bar. Fall back to legacy #status-message in bottom bar.
      const feedbackEl = result.locator("#feedback-message")
      if (feedbackEl.count() > 0) {
        const message = feedbackEl.textContent().trim()
        return level && message ? { level, message } : null
      }
      const statusEl = result.locator("#status-message")
      if (statusEl.count() === 0) {
        return null
      }
      const text = statusEl.textContent()
      // Text format: "icon message" - extract message after first space
      const spaceIndex = text.indexOf(" ")
      const message = spaceIndex >= 0 ? text.slice(spaceIndex + 1).trim() : text
      return level && message ? { level, message } : null
    },
    _result: result,

    // =========================================================================
    // Visual Test Toolbelt — screen buffer inspection & assertions
    // =========================================================================

    /**
     * Screen access for visual testing.
     * Provides direct access to the rendered terminal buffer, including
     * character content, colors, and text attributes at any position.
     *
     * @example
     * ```typescript
     * // Check what's rendered
     * const rows = board.screen.rows
     * const cell = board.screen.cell(10, 5) // { char, fg, bg, attrs }
     *
     * // Find where a node is rendered
     * const pos = board.screen.nodePos("task1")
     * const borderCell = board.screen.cell(pos.x, pos.y)
     * ```
     */
    screen: {
      /** Plain text content (no ANSI codes) — same as screenshot() */
      get text(): string {
        return result.text
      },
      /** ANSI-coded content with color escape sequences */
      get ansi(): string {
        return result.ansi
      },
      /** Text split into rows */
      get rows(): string[] {
        return result.text.split("\n")
      },
      /** Get text of a specific row (0-indexed) */
      row(n: number): string {
        return result.text.split("\n")[n] ?? ""
      },
      /**
       * Get cell at screen coordinates.
       * Returns { char, fg, bg, attrs } where:
       * - fg/bg: Color (number for 256-color, {r,g,b} for truecolor, null for default)
       * - attrs: { bold, dim, italic, underline, inverse, strikethrough }
       *
       * Named colors: 0=black, 1=red, 2=green, 3=yellow, 4=blue, 5=magenta, 6=cyan, 7=white
       */
      cell(x: number, y: number) {
        return result.term.cell(x, y)
      },
      /**
       * Get screen position of a node's top-left corner.
       * Uses locator boundingBox to find where the node is rendered.
       */
      nodePos(nodeId: string): { x: number; y: number } | null {
        const loc = result.locator(`[id="${nodeId}"]`)
        if (loc.count() === 0) return null
        const box = loc.boundingBox()
        return box ? { x: box.x, y: box.y } : null
      },
      /**
       * Get bounding box of a node.
       * Returns { x, y, width, height } or null if not found.
       */
      nodeBox(nodeId: string) {
        const loc = result.locator(`[id="${nodeId}"]`)
        if (loc.count() === 0) return null
        return loc.boundingBox()
      },
      /**
       * Find the first row index containing the given text.
       * Returns -1 if not found.
       */
      findRow(text: string): number {
        const rows = result.text.split("\n")
        return rows.findIndex((row) => row.includes(text))
      },
      /** Terminal width */
      width: columns,
      /** Terminal height */
      height: rows,
    },

    /**
     * Assert rendered screen text contains the given string.
     * Chainable — returns board for fluent API.
     *
     * @example
     * ```typescript
     * board.expectScreen("Task 1").expectScreen("─")
     * ```
     */
    expectScreen(text: string) {
      expect(result.text).toContain(text)
      return board
    },

    /**
     * Assert rendered screen text does NOT contain the given string.
     */
    expectScreenNot(text: string) {
      expect(result.text).not.toContain(text)
      return board
    },

    /**
     * Assert that row n contains text or matches a regex.
     *
     * @example
     * ```typescript
     * board.expectRow(5, "─────")  // HR row has line chars
     * board.expectRow(0, /│.*col1.*│/) // Border pattern
     * ```
     */
    expectRow(n: number, pattern: string | RegExp) {
      const row = result.text.split("\n")[n] ?? ""
      if (typeof pattern === "string") {
        expect(row).toContain(pattern)
      } else {
        expect(row).toMatch(pattern)
      }
      return board
    },

    /**
     * Assert the character at screen position (x, y).
     *
     * @example
     * ```typescript
     * board.expectCellChar(0, 3, "│") // Left border present
     * ```
     */
    expectCellChar(x: number, y: number, char: string) {
      const cell = result.term.cell(x, y)
      expect(cell.char, `cell(${x},${y}).char`).toBe(char)
      return board
    },

    /**
     * Assert foreground and/or background color at screen position.
     * Named colors: 0=black, 1=red, 2=green, 3=yellow, 4=blue, 5=magenta, 6=cyan, 7=white
     * Pass null for default terminal color.
     *
     * @example
     * ```typescript
     * board.expectCellColor(5, 3, { fg: 0, bg: 3 }) // black on yellow
     * board.expectCellColor(5, 3, { bg: 3 })         // just check bg
     * ```
     */
    expectCellColor(x: number, y: number, opts: { fg?: number | null; bg?: number | null }) {
      const cell = result.term.cell(x, y)
      if (opts.fg !== undefined) {
        expect(cell.fg, `cell(${x},${y}).fg`).toEqual(opts.fg)
      }
      if (opts.bg !== undefined) {
        expect(cell.bg, `cell(${x},${y}).bg`).toEqual(opts.bg)
      }
      return board
    },

    /**
     * Assert foreground and/or background color of a node's rendered text.
     * Finds the node by ID, gets its screen position, checks the first
     * non-border character's colors.
     *
     * @example
     * ```typescript
     * board.expectNodeColor("task1", { fg: 0, bg: 3 }) // black on yellow (selected)
     * board.expectNodeColor("task1", { attrs: { dim: true } }) // dimmed text
     * ```
     */
    expectNodeColor(nodeId: string, opts: { fg?: number | null; bg?: number | null; attrs?: Record<string, boolean> }) {
      const loc = result.locator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return board
      // Check the first non-space character in the node's area
      for (let x = box.x; x < box.x + box.width; x++) {
        const cell = result.term.cell(x, box.y)
        if (cell.char.trim() === "") continue
        if (opts.fg !== undefined) {
          expect(cell.fg, `node "${nodeId}" fg at (${x},${box.y}) char="${cell.char}"`).toEqual(opts.fg)
        }
        if (opts.bg !== undefined) {
          expect(cell.bg, `node "${nodeId}" bg at (${x},${box.y}) char="${cell.char}"`).toEqual(opts.bg)
        }
        if (opts.attrs) {
          for (const [attr, value] of Object.entries(opts.attrs)) {
            expect(
              (cell.attrs as Record<string, unknown>)[attr],
              `node "${nodeId}" attrs.${attr} at (${x},${box.y})`,
            ).toBe(value)
          }
        }
        break
      }
      return board
    },

    /**
     * Assert that a node has a complete border (│ on left and right edges
     * for each row of its bounding box).
     *
     * @example
     * ```typescript
     * board.expectNodeBorder("task1")     // has border
     * board.expectNodeNoBorder("hr-node") // no border
     * ```
     */
    expectNodeBorder(nodeId: string) {
      const loc = result.locator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return board
      // The nodeBox is the TreeNode content area INSIDE the Card's bordered Box.
      // Border characters are 1 cell outside the nodeBox on each side.
      const borderLeft = box.x - 1
      const borderRight = box.x + box.width
      for (let y = box.y; y < box.y + box.height; y++) {
        const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
        if (borderLeft >= 0) {
          const leftCell = result.term.cell(borderLeft, y)
          expect(
            isBorderChar(leftCell.char),
            `node "${nodeId}" left border at (${borderLeft},${y}): got "${leftCell.char}"`,
          ).toBe(true)
        }
        if (borderRight < columns) {
          const rightCell = result.term.cell(borderRight, y)
          expect(
            isBorderChar(rightCell.char),
            `node "${nodeId}" right border at (${borderRight},${y}): got "${rightCell.char}"`,
          ).toBe(true)
        }
      }
      return board
    },

    /**
     * Assert that a node does NOT have border characters at its edges.
     */
    expectNodeNoBorder(nodeId: string) {
      const loc = result.locator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return board
      // Check 1 cell outside the nodeBox (where Card border would be)
      const borderLeft = box.x - 1
      const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
      if (borderLeft >= 0) {
        const leftCell = result.term.cell(borderLeft, box.y)
        expect(
          isBorderChar(leftCell.char),
          `node "${nodeId}" should not have border at (${borderLeft},${box.y}): got "${leftCell.char}"`,
        ).toBe(false)
      }
      return board
    },

    /**
     * Assert that a node has a colored gutter bar (background color) at its left edge.
     * Body cards use a 1-char gutter bar instead of border chars.
     * @param expectedBg - ANSI color index for the gutter (3=yellow, default)
     */
    expectNodeGutter(nodeId: string, expectedBg = 3) {
      const loc = result.locator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return board
      const gutterX = box.x - 1
      if (gutterX >= 0) {
        const gutterCell = result.term.cell(gutterX, box.y)
        expect(
          gutterCell.bg,
          `node "${nodeId}" gutter at (${gutterX},${box.y}): expected bg=${expectedBg}, got bg=${gutterCell.bg}`,
        ).toBe(expectedBg)
      }
      return board
    },

    /**
     * Debug helper: dump cell info at a position (char, fg, bg, attrs).
     * Returns the cell for further inspection. Not an assertion.
     */
    inspectCell(x: number, y: number) {
      const cell = result.term.cell(x, y)
      // eslint-disable-next-line no-console
      console.log(`cell(${x},${y}):`, JSON.stringify({ char: cell.char, fg: cell.fg, bg: cell.bg, attrs: cell.attrs }))
      return cell
    },

    /**
     * Debug helper: dump a node's screen position and first cell.
     */
    inspectNode(nodeId: string) {
      const loc = result.locator(`[id="${nodeId}"]`)
      if (loc.count() === 0) {
        // eslint-disable-next-line no-console
        console.log(`node "${nodeId}": NOT FOUND`)
        return null
      }
      const box = loc.boundingBox()
      if (!box) {
        // eslint-disable-next-line no-console
        console.log(`node "${nodeId}": no boundingBox`)
        return null
      }
      const cell = result.term.cell(box.x, box.y)
      // eslint-disable-next-line no-console
      console.log(
        `node "${nodeId}": box=${JSON.stringify(box)}, cell(${box.x},${box.y})=${JSON.stringify({ char: cell.char, fg: cell.fg, bg: cell.bg, attrs: cell.attrs })}`,
      )
      return { box, cell }
    },

    // =========================================================================
    // Visual Invariant Assertions
    // =========================================================================

    /**
     * Assert that all 4 sides of a node's border box are continuous (no gaps).
     * Checks top/bottom rows for horizontal border chars and left/right columns
     * for vertical border chars.
     *
     * @example
     * ```typescript
     * board.expectBorderContinuous("task1")
     * ```
     */
    expectBorderContinuous(nodeId: string) {
      const HORIZONTAL = new Set("─═┌┐└┘╭╮╰╯┬┴╔╗╚╝")
      const VERTICAL = new Set("│║┌┐└┘╭╮╰╯├┤╔╗╚╝")

      const loc = result.locator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return board

      // The nodeBox is the content area; borders are 1 cell outside
      const bLeft = box.x - 1
      const bRight = box.x + box.width
      const bTop = box.y - 1
      const bBottom = box.y + box.height

      // Check top row
      if (bTop >= 0) {
        for (let x = bLeft; x <= bRight && x < columns; x++) {
          if (x < 0) continue
          const ch = result.term.cell(x, bTop).char
          expect(
            HORIZONTAL.has(ch) || VERTICAL.has(ch),
            `node "${nodeId}" top border at (${x},${bTop}): expected border char, got "${ch}"`,
          ).toBe(true)
        }
      }

      // Check bottom row
      if (bBottom < rows) {
        for (let x = bLeft; x <= bRight && x < columns; x++) {
          if (x < 0) continue
          const ch = result.term.cell(x, bBottom).char
          expect(
            HORIZONTAL.has(ch) || VERTICAL.has(ch),
            `node "${nodeId}" bottom border at (${x},${bBottom}): expected border char, got "${ch}"`,
          ).toBe(true)
        }
      }

      // Check left column
      if (bLeft >= 0) {
        for (let y = bTop; y <= bBottom && y < rows; y++) {
          if (y < 0) continue
          const ch = result.term.cell(bLeft, y).char
          expect(
            VERTICAL.has(ch) || HORIZONTAL.has(ch),
            `node "${nodeId}" left border at (${bLeft},${y}): expected border char, got "${ch}"`,
          ).toBe(true)
        }
      }

      // Check right column
      if (bRight < columns) {
        for (let y = bTop; y <= bBottom && y < rows; y++) {
          if (y < 0) continue
          const ch = result.term.cell(bRight, y).char
          expect(
            VERTICAL.has(ch) || HORIZONTAL.has(ch),
            `node "${nodeId}" right border at (${bRight},${y}): expected border char, got "${ch}"`,
          ).toBe(true)
        }
      }

      return board
    },

    /**
     * Assert that a specific horizontal border exists for a node.
     * Checks the row above (top) or below (bottom) the node content area
     * for horizontal border characters.
     *
     * @example
     * ```typescript
     * board.expectHorizontalBorder("task1", "top")
     * board.expectHorizontalBorder("task1", "bottom")
     * ```
     */
    expectHorizontalBorder(nodeId: string, side: "top" | "bottom") {
      const BORDER_CHARS = new Set("─═┌┐└┘╭╮╰╯┬┴╔╗╚╝")

      const loc = result.locator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return board

      const borderY = side === "top" ? box.y - 1 : box.y + box.height
      expect(
        borderY >= 0 && borderY < rows,
        `node "${nodeId}" ${side} border row ${borderY} is within screen bounds`,
      ).toBe(true)
      if (borderY < 0 || borderY >= rows) return board

      // Check that at least some cells in the border row contain border chars
      let foundBorder = false
      const cellChars: string[] = []
      for (let x = box.x - 1; x <= box.x + box.width && x < columns; x++) {
        if (x < 0) continue
        const ch = result.term.cell(x, borderY).char
        cellChars.push(ch)
        if (BORDER_CHARS.has(ch)) foundBorder = true
      }

      expect(
        foundBorder,
        `node "${nodeId}" ${side} border at row ${borderY}: no border chars found in [${cellChars.map((c) => `"${c}"`).join(", ")}]`,
      ).toBe(true)

      return board
    },

    /**
     * Assert that the node AND its neighbors all have intact borders.
     * Checks the rows above and below the node's bounding box for border
     * characters. Catches the fold-border-blank bug where folding destroys
     * the card below's border.
     *
     * @example
     * ```typescript
     * board.press("z").expectAdjacentBorders("task1")
     * ```
     */
    expectAdjacentBorders(nodeId: string) {
      const BORDER_CHARS = new Set("─═┌┐└┘╭╮╰╯┬┴├┤│║╔╗╚╝")

      const loc = result.locator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return board

      const bTop = box.y - 1
      const bBottom = box.y + box.height

      // Check row above the node (should be top border or bottom border of card above)
      if (bTop >= 0) {
        let foundBorder = false
        const cellChars: string[] = []
        for (let x = box.x - 1; x <= box.x + box.width && x < columns; x++) {
          if (x < 0) continue
          const ch = result.term.cell(x, bTop).char
          cellChars.push(ch)
          if (BORDER_CHARS.has(ch)) foundBorder = true
        }
        expect(
          foundBorder,
          `node "${nodeId}" row above (${bTop}): no border chars found in [${cellChars.map((c) => `"${c}"`).join(", ")}]`,
        ).toBe(true)
      }

      // Check row below the node (should be bottom border or top border of card below)
      if (bBottom < rows) {
        let foundBorder = false
        const cellChars: string[] = []
        for (let x = box.x - 1; x <= box.x + box.width && x < columns; x++) {
          if (x < 0) continue
          const ch = result.term.cell(x, bBottom).char
          cellChars.push(ch)
          if (BORDER_CHARS.has(ch)) foundBorder = true
        }
        expect(
          foundBorder,
          `node "${nodeId}" row below (${bBottom}): no border chars found in [${cellChars.map((c) => `"${c}"`).join(", ")}]`,
        ).toBe(true)
      }

      return board
    },

    /**
     * Scan a region (or full screen) for likely rendering artifacts:
     * NUL bytes, stray control characters, "[object Object]", "undefined", "NaN".
     *
     * @example
     * ```typescript
     * board.expectNoGhostChars()  // full screen
     * board.expectNoGhostChars({ x: 0, y: 0, width: 40, height: 12 })  // region
     * ```
     */
    expectNoGhostChars(region?: { x: number; y: number; width: number; height: number }) {
      const x0 = region?.x ?? 0
      const y0 = region?.y ?? 0
      const w = region?.width ?? columns
      const h = region?.height ?? rows

      // Check for control characters and NUL bytes cell-by-cell
      for (let y = y0; y < y0 + h && y < rows; y++) {
        for (let x = x0; x < x0 + w && x < columns; x++) {
          const ch = result.term.cell(x, y).char
          if (ch.length === 1) {
            const code = ch.charCodeAt(0)
            // NUL byte
            expect(code !== 0, `ghost char: NUL byte at (${x},${y})`).toBe(true)
            // Control characters (1-31) excluding tab(9), newline(10), carriage return(13)
            if (code >= 1 && code <= 31 && code !== 9 && code !== 10 && code !== 13) {
              expect(false, `ghost char: control char 0x${code.toString(16).padStart(2, "0")} at (${x},${y})`).toBe(
                true,
              )
            }
          }
        }
      }

      // Check for artifact strings in the text
      const screenText = result.text
      const artifactPatterns = ["[object Object]", "undefined", "NaN"]
      for (const pattern of artifactPatterns) {
        expect(!screenText.includes(pattern), `ghost char: found "${pattern}" in screen text`).toBe(true)
      }

      return board
    },

    /**
     * Assert that a rectangular region contains only spaces.
     * Fails with the first non-space character found and its position.
     *
     * @example
     * ```typescript
     * board.expectBlankRegion(0, 10, 80, 5)
     * ```
     */
    expectBlankRegion(x: number, y: number, width: number, height: number) {
      for (let cy = y; cy < y + height && cy < rows; cy++) {
        for (let cx = x; cx < x + width && cx < columns; cx++) {
          const ch = result.term.cell(cx, cy).char
          expect(ch === " " || ch === "", `expected blank at (${cx},${cy}), got "${ch}"`).toBe(true)
        }
      }
      return board
    },

    /**
     * Assert no completely blank rows exist in a range (default: full screen).
     * A "blank line" = every cell in the row is a space character.
     * Useful for detecting missing borders or content gaps.
     *
     * @example
     * ```typescript
     * board.expectNoBlankLine()           // full screen
     * board.expectNoBlankLine(2, 20)      // rows 2-20
     * ```
     */
    expectNoBlankLine(fromRow?: number, toRow?: number) {
      const start = fromRow ?? 0
      const end = toRow ?? rows

      for (let y = start; y < end && y < rows; y++) {
        let allBlank = true
        for (let x = 0; x < columns; x++) {
          const ch = result.term.cell(x, y).char
          if (ch !== " " && ch !== "") {
            allBlank = false
            break
          }
        }
        expect(!allBlank, `unexpected blank line at row ${y}`).toBe(true)
      }
      return board
    },

    /**
     * Assert that a cursor element exists and is within the visible screen bounds.
     * Finds the element with `[data-cursor]` attribute and checks its bounding
     * box is within screen bounds (0 <= x < cols, 0 <= y < rows).
     *
     * @example
     * ```typescript
     * board.press("j").expectCursorVisible()
     * ```
     */
    expectCursorVisible() {
      const loc = result.locator("[data-cursor]")
      expect(loc.count(), "cursor element ([data-cursor]) exists").toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, "cursor element has boundingBox").not.toBeNull()
      if (!box) return board

      expect(box.x >= 0 && box.x < columns, `cursor x=${box.x} is within screen bounds [0, ${columns})`).toBe(true)
      expect(box.y >= 0 && box.y < rows, `cursor y=${box.y} is within screen bounds [0, ${rows})`).toBe(true)

      return board
    },

    /**
     * Assert that text within a node is truncated (doesn't overflow its bounding box).
     * Checks that no non-space characters appear beyond the node's right edge.
     * Useful for verifying wrap="truncate" and overflow="hidden" behavior.
     *
     * @example
     * ```typescript
     * board.expectTextNotOverflowing("col1-header")
     * ```
     */
    expectTextNotOverflowing(nodeId: string) {
      const loc = result.locator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return board

      // Check that no non-space chars appear in the row(s) beyond the node's right edge
      const rightEdge = box.x + box.width
      for (let y = box.y; y < box.y + box.height && y < rows; y++) {
        // Only check between rightEdge and the next visible element or screen edge
        // We check a few cells past the edge to catch overflow
        const checkEnd = Math.min(rightEdge + 3, columns)
        for (let x = rightEdge; x < checkEnd; x++) {
          const ch = result.term.cell(x, y).char
          // Space, empty, and border chars are fine past the edge
          const BORDER_CHARS = new Set("─═│║┌┐└┘╭╮╰╯┬┴├┤╔╗╚╝")
          if (ch !== " " && ch !== "" && !BORDER_CHARS.has(ch)) {
            expect.fail(
              `text overflow: node "${nodeId}" has char "${ch}" at (${x},${y}), ` +
                `${x - box.x - box.width + 1}px past right edge (rightEdge=${rightEdge})`,
            )
          }
        }
      }

      return board
    },

    /**
     * Assert that columns are vertically aligned — each column's left edge
     * matches the expected position based on equal-width distribution.
     * Catches layout bugs where columns shift or overlap.
     *
     * @example
     * ```typescript
     * board.expectColumnsAligned(["col1", "col2", "col3"])
     * ```
     */
    expectColumnsAligned(columnIds: string[]) {
      if (columnIds.length < 2) return board

      const boxes = columnIds.map((id) => {
        const loc = result.locator(`[id="${id}"]`)
        expect(loc.count(), `column "${id}" exists`).toBeGreaterThan(0)
        return { id, box: loc.boundingBox() }
      })

      // All columns should exist
      for (const { id, box } of boxes) {
        expect(box, `column "${id}" has boundingBox`).not.toBeNull()
      }

      const validBoxes = boxes.filter((b) => b.box != null) as {
        id: string
        box: NonNullable<(typeof boxes)[0]["box"]>
      }[]
      if (validBoxes.length < 2) return board

      // Columns should be sorted left-to-right
      const sorted = [...validBoxes].sort((a, b) => a.box.x - b.box.x)
      for (let i = 0; i < sorted.length; i++) {
        expect(sorted[i]!.id, `column order: position ${i} should be ${columnIds[i]}`).toBe(columnIds[i])
      }

      // No overlap: each column's left edge >= previous column's right edge
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!
        const curr = sorted[i]!
        expect(
          curr.box.x >= prev.box.x + prev.box.width,
          `columns "${prev.id}" and "${curr.id}" overlap: ` +
            `"${prev.id}" ends at x=${prev.box.x + prev.box.width}, "${curr.id}" starts at x=${curr.box.x}`,
        ).toBe(true)
      }

      // Consistent height: all columns should have the same height (±1 for rounding)
      const heights = validBoxes.map((b) => b.box.height)
      const maxH = Math.max(...heights)
      const minH = Math.min(...heights)
      expect(
        maxH - minH <= 1,
        `column heights differ: ${validBoxes.map((b) => `"${b.id}"=${b.box.height}`).join(", ")}`,
      ).toBe(true)

      return board
    },

    /**
     * Assert that a node's text content is visually truncated —
     * the rendered text is shorter than the full node text.
     * The node must have a bounding box narrower than its full text.
     *
     * @example
     * ```typescript
     * board.expectTextTruncated("long-title-node")
     * ```
     */
    expectTextTruncated(nodeId: string) {
      const loc = result.locator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return board

      const fullText = loc.textContent()
      // If the full text fits in the box width, it's not truncated
      if (fullText.length <= box.width) return board

      // Read the actual rendered text from the buffer at the node's position
      let renderedText = ""
      for (let x = box.x; x < box.x + box.width && x < columns; x++) {
        renderedText += result.term.cell(x, box.y).char
      }
      renderedText = renderedText.trimEnd()

      // The rendered text should be shorter than the full text
      expect(
        renderedText.length < fullText.length,
        `expected text truncation for "${nodeId}": rendered "${renderedText}" (${renderedText.length} chars) ` +
          `but full text "${fullText}" (${fullText.length} chars) fits in width ${box.width}`,
      ).toBe(true)

      return board
    },

    /**
     * Assert that the screen has no unexpected horizontal gaps —
     * no row within the content area is completely blank when it shouldn't be.
     * More intelligent than expectNoBlankLine: skips rows that are
     * legitimately blank (below all content, status bar separators).
     *
     * @param contentRows - Number of rows that should contain content (default: rows - 1 for status bar)
     *
     * @example
     * ```typescript
     * board.expectNoContentGaps()
     * board.expectNoContentGaps(20) // Only check first 20 rows
     * ```
     */
    expectNoContentGaps(contentRows?: number) {
      const checkRows = contentRows ?? rows - 1 // Default: all but status bar

      // Find the last row that has any non-space content
      let lastContentRow = 0
      for (let y = 0; y < checkRows && y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          const ch = result.term.cell(x, y).char
          if (ch !== " " && ch !== "") {
            lastContentRow = y
            break
          }
        }
      }

      // Check for blank rows within the content area (row 0 to lastContentRow)
      for (let y = 0; y <= lastContentRow; y++) {
        let allBlank = true
        for (let x = 0; x < columns; x++) {
          const ch = result.term.cell(x, y).char
          if (ch !== " " && ch !== "") {
            allBlank = false
            break
          }
        }
        expect(
          !allBlank,
          `unexpected content gap: row ${y} is blank within content area (last content at row ${lastContentRow})`,
        ).toBe(true)
      }

      return board
    },

    /**
     * Compare current incremental render buffer against a fresh render.
     * For each mismatch, reports position, incremental cell, and fresh cell.
     *
     * Only meaningful when `incremental: true` was passed to testEnv (which is
     * the default). Delegates to silvery's `compareBuffers` + `formatMismatch`.
     *
     * @example
     * ```typescript
     * board.press("j").press("z").expectIncrementalMatchesFresh()
     * ```
     */
    expectIncrementalMatchesFresh() {
      const incremental = result.lastBuffer()
      expect(incremental, "incremental buffer exists (lastBuffer)").toBeDefined()
      if (!incremental) return board

      let fresh: ReturnType<typeof result.freshRender> | undefined
      try {
        fresh = result.freshRender()
      } catch {
        // freshRender() may not be available in non-test renderers
        return board
      }
      expect(fresh, "fresh buffer exists (freshRender)").toBeDefined()
      if (!fresh) return board

      const mismatch = compareBuffers(incremental, fresh)
      if (mismatch) {
        const incrementalText = result.text
        const freshText = Array.from({ length: fresh.height }, (_, y) =>
          Array.from({ length: fresh.width }, (_, x) => fresh!.getCellChar(x, y)).join(""),
        ).join("\n")

        expect.fail(`Incremental/fresh buffer mismatch:\n${formatMismatch(mismatch, { incrementalText, freshText })}`)
      }

      return board
    },
  }

  return board
}

export function testEnv(treeBuilder: () => KNode[], options?: TestEnvOptions) {
  const nodes = treeBuilder()
  const repo = createFakeRepo({ nodes })
  const rootNode = nodes[0]
  if (!rootNode) {
    throw new Error("Tree builder must return at least one node")
  }

  const env = createTestRenderEnv(repo, rootNode.id, options)
  return {
    board: env.board,
    repo,
    registry: env.registry,
    toastQueue: env.toastQueue,
    store: env.store,
    focusManager: env.focusManager,
  }
}

/**
 * Test environment using an existing Repo instead of treeBuilder.
 *
 * Use this to test with real vault data or complex repo configurations
 * that can't easily be expressed with item() DSL.
 *
 * @example
 * ```typescript
 * // Load a real repo and test navigation
 * const repo = await loadRepo('/tmp/test-vault')
 * using board = testEnvWithRepo(repo, rootId, { incremental: true })
 *
 * board.press('l').press('j')
 * board.expect('#some-card[data-cursor]').toExist()
 * // Auto-cleanup via `using` — no .unmount() needed
 * ```
 */
export function testEnvWithRepo(repo: Repo, rootId: string, options?: TestEnvOptions) {
  const env = createTestRenderEnv(repo, rootId, options)

  // Wrap board with disposable pattern for automatic cleanup
  const board = Object.assign(env.board, {
    [Symbol.dispose]: () => {
      env.result.unmount()
    },
  })

  return { board, registry: env.registry, toastQueue: env.toastQueue, store: env.store, focusManager: env.focusManager }
}

// =============================================================================
// Custom Matchers
// =============================================================================

declare module "vitest" {
  interface Matchers<T> {
    toExist(): void
    toHaveCount(expected: number): void
  }
}

expect.extend({
  toExist(received: unknown) {
    const locator = received as AutoLocator
    const pass = locator.count() > 0
    return {
      pass,
      message: () => (pass ? `Expected element not to exist` : `Expected element to exist`),
    }
  },
  toHaveCount(received: unknown, expected: number) {
    const locator = received as AutoLocator
    const count = locator.count()
    return {
      pass: count === expected,
      message: () => `Expected count ${expected}, got ${count}`,
    }
  },
})

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Render a board with the given state and return a test helper
 */
export function renderBoard(state: InitialBoardData, options: { columns?: number; rows?: number } = {}) {
  const { columns = 80, rows = 24 } = options

  // Create a fake repo for static rendering tests
  const repo = createFakeRepo()

  // singlePassLayout matches production's create-app.tsx rendering pipeline
  const render = createRenderer({ cols: columns, rows, singlePassLayout: true })
  const boardCoreElement = React.createElement(BoardCore, {
    rootId: state.rootId,
    columns: state.columns,
    colIndex: 0,
    cardIndex: 0,
    ui: createInitialPaneUI("cards", [], { columns, rows }),
    derivedSelectionLevel: "card",
    dimensions: { columns, rows },
    collapsedNodes: new Set<string>(),
    hasDetailPane: false,
  })
  // Wrap in StoreContext + ReactiveNodeStoreProvider + TreeRenderProvider so TreeNode's hooks work
  const initialUI = createInitialPaneUI("cards", [], { columns, rows })
  const mockPane = createPaneState("main", createBoardState(state.rootId, state.rootPath), {
    viewMode: "cards",
    cursorStore: createCursorStoreFromRepo(repo, state.rootId, state.columns[0]?.cardNodes[0]?.id ?? null),
  })
  const store = createStore(() => ({
    foldDepths: new Map<string, number>(),
    ui: initialUI,
    navigator: null,
    setUI: () => {},
    workspace: {
      panes: new Map([["main", mockPane]]),
      focusedPaneId: "main",
      previousFocusedPaneId: null,
      layout: { type: "leaf" as const, paneId: "main" },
      preZoomLayout: null,
      preZoomPanes: null,
    },
  }))
  const treeConfig = deriveTreeConfig(initialUI.viewMode, initialUI.maxContentLines, initialUI)
  const nodeStore = new ReactiveNodeStore()
  const noopJobRunner = { submit: () => ({ cancel: () => {}, promise: Promise.resolve() }) }
  const noopUndoHandle = {
    startBatch: () => {},
    endBatch: () => {},
    setCursor: () => {},
    setCursorAfter: () => {},
    undo: () => ({ success: false }),
    redo: () => ({ success: false }),
    canUndo: () => false,
    canRedo: () => false,
  }
  const wrappedElement = h(
    TreeRenderProvider,
    {
      treeConfig,
      setUI: () => {},
      jobRunner: noopJobRunner as any,
      undoHandle: noopUndoHandle as any,
      taskStatusFilter: new Set<string>(),
      boardFocused: true,
    },
    boardCoreElement,
  )
  const result = render(
    h(
      StoreContext.Provider,
      { value: store as StoreApi<unknown> },
      h(ReactiveNodeStoreProvider, { value: nodeStore }, h(RepoProvider, { repo, children: wrappedElement })),
    ),
  )

  return {
    press(key: string) {
      void result.press(key)
      return this
    },
    expectVisible(text: string) {
      expect(result.text).toContain(text)
      return this
    },
    screenshot(): string {
      return result.text
    },
  }
}

/**
 * Render Board with a Zustand store context (for tests that render Board directly).
 *
 * Use this when you need to render Board but don't need keyboard handling.
 * For keyboard tests, use testEnv() instead.
 */
export function renderBoardWithStore(
  repo: Repo,
  rootId: string,
  options: {
    columns?: number
    rows?: number
    viewMode?: "cards" | "columns" | "list" | "tabs"
    navigator?: ReturnType<typeof createGridNavigator>
    render?: ReturnType<typeof createRenderer>
  } = {},
) {
  const columns = options.columns ?? 80
  const rows = options.rows ?? 24
  const viewMode = options.viewMode ?? "cards"
  const registry = options.navigator ?? createGridNavigator()
  const toastQueue = createToastQueue()
  const initialState = buildBoardState(repo, rootId)

  ensureCommandSystemInitialized()
  getChordState().cancel()
  resetModeStack()
  resetBoardAppState()

  const { cursorNodeId: initialCursorNodeId } = computeInitialCursor(initialState)

  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator: registry,
    cursorStore: createCursorStoreFromRepo(repo, initialState.rootId, initialCursorNodeId),
    initialBoardState: createBoardState(
      initialState.rootId,
      initialState.rootPath,
      initialCursorNodeId,
      initialState.collapsedNodeIds,
    ),
    initialUIState: createInitialUIState({ columns, rows }),
    initialViewMode: viewMode,
    dimensions: { columns, rows },
  }

  const store = createStore<BoardAppStore>(createBoardAppStoreState(storeParams))

  // singlePassLayout matches production's create-app.tsx rendering pipeline
  const renderFn = options.render ?? createRenderer({ cols: columns, rows, singlePassLayout: true })
  const boardElement = React.createElement(Board, {
    initialViewMode: viewMode,
    dimensions: { columns, rows },
    onExit: () => {},
    toastQueue,
    navigator: registry,
  })

  return renderFn(
    React.createElement(
      StoreContext.Provider,
      { value: store as StoreApi<unknown> },
      React.createElement(RepoProvider, { repo, children: boardElement }),
    ),
  )
}

// =============================================================================
// Fixture Builders - Concise DSL for creating test boards
// =============================================================================

/**
 * Create a column for the board DSL
 */
export function column(title: string, cards: (string | { title: string; children?: string[] })[]) {
  const cardStates = cards.map((card, idx) => {
    if (typeof card === "string") {
      return createCardNode({ content: card, parent_idx: idx })
    }
    const children = (card.children ?? []).map((childContent, childIdx) => ({
      id: `child-${idx}-${childIdx}`,
      type: "p" as const,
      item: true,
      list_marker: "-" as const,
      parent_id: `card-${idx}`,
      parent_idx: childIdx,
      content: childContent,
      data: {},
      embed_source: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }))
    return createCardNode({ content: card.title, parent_idx: idx }, children)
  })

  return createColumnView({ content: title }, cardStates)
}

/**
 * Create a board fixture from columns
 *
 * @example
 * ```typescript
 * const SIMPLE_BOARD = board({
 *   columns: [
 *     column('To Do', ['Task 1', 'Task 2']),
 *     column('Done', ['Task 3']),
 *   ],
 * });
 * ```
 */
export function board(config: { columns: ReturnType<typeof column>[] }): InitialBoardData {
  return createBoardStateFixture(config.columns)
}

// =============================================================================
// Common Fixtures
// =============================================================================

/**
 * Simple 2-column board with basic tasks
 */
export const SIMPLE_BOARD = board({
  columns: [column("To Do", ["Task 1", "Task 2"]), column("Done", ["Task 3"])],
})
