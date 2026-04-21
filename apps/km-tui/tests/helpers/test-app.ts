/**
 * TestApp -- Unified test driver abstraction for km board tests.
 *
 * Write tests once, run on either backend:
 * - **headless** (default): createBoardDriver + withDiagnostics — synchronous, fast (2ms/op),
 *   incremental rendering checks, buffer-level assertions. Phases 1-4.
 * - **termless**: createBoardApp + createTermless — full 5-phase pipeline through a
 *   real xterm.js emulator. Catches ANSI generation bugs that headless misses.
 *
 * Select backend via `TEST_BACKEND` env var or `backend` option.
 *
 * @example
 * ```typescript
 * using app = createTestApp(realisticBoard(), { cols: 120, rows: 30 })
 * app.press("j")
 * app.expectScreen("Buy groceries")
 * app.expect("#ch1").toExist()
 * app.command("fold_more")
 * app.expect("#ch1").not.toExist()
 * ```
 */

import React from "react"
import { expect, vi, onTestFailed } from "vitest"
// Register termless matchers (toMatchTerminalSnapshot, toMatchSvgSnapshot, etc.)
// so tests using createTestApp().expectSnapshot() get them without extra imports.
import "@termless/test/matchers"
import { withDiagnostics } from "@silvery/ag-react"
import { createBoardDriver, type BoardDriver } from "../../src/driver.ts"
import { createFakeRepo, type Repo } from "@km/storage"
import { createStoreFromRepo, withReactive } from "@km/storage"
import type { KNode } from "@km/core"
import { createToastQueue } from "@km/core"
import type { FrameCell } from "@silvery/ag"
import { createFocusManager, hitTest } from "@silvery/ag-react"
import { createMouseEventProcessor, processMouseEvent } from "@silvery/ag-term"
import { createTermless, createAutoLocator, type AutoLocator } from "@silvery/test"
import type { Term } from "@silvery/ag-term"
import type { AgNode } from "@silvery/ag/types"
import { createGridNavigator, createViewLens, createVisibleLens } from "@km/board"
import { createBoardApp, resetBoardAppState, dispatchCommandById, handleMouse } from "../../src/board/board-app.ts"
import { createUndoableRepo } from "../../src/undo/undoable-repo.ts"
import { createUndoStack } from "../../src/undo-stack.ts"
import type { EventHandlerContext } from "@silvery/create"
import type { ParsedMouse } from "@silvery/ag-react"
import { Workspace, type BoardAppStore, type CreateBoardAppStoreParams } from "../../src/state/board-app-store.ts"
import type { SignalStoreApi } from "../../src/state/signal-store.ts"
import { act } from "react"
import { createBoardState } from "../../src/board/board-types.ts"
import { createInitialUIState } from "../../src/state/ui-reducer.ts"
import { BoardApp } from "../../src/views/Board.tsx"
import { RepoProvider } from "../../src/repo-context.tsx"
import { StoreProvider } from "../../src/state/store-context.tsx"
import { setLogLevel, getLogLevel } from "loggily"
import { ensureCommandSystemInitialized } from "../../src/board/command-bridge.ts"
import { resetDialogGuard } from "../../src/dialog-guard.ts"
import { getChordState, type ViewMode } from "@km/commands"
import { parseMarkdownToNodes } from "@km/markdown"
import { hasDetailPaneFor } from "../../src/board/board-types.ts"
import { item } from "./board-test.ts"

// =============================================================================
// Command → Key mapping (mirrors board-test.ts COMMAND_TO_KEYS)
// =============================================================================

const COMMAND_TO_KEYS: Record<string, string[]> = {
  cursor_down: ["j"],
  cursor_up: ["k"],
  cursor_left: ["h"],
  cursor_right: ["l"],
  cursor_first: ["g", "g"],
  cursor_last: ["G"],
  block_nav_down: ["J"],
  block_nav_up: ["K"],
  fold_more: ["H"],
  unfold_more: ["L"],
  fold_all_more: ["\x1b[44;2u"],
  unfold_all_more: ["\x1b[46;2u"],
  zoom_inwards: ["z"],
  zoom_outwards: ["Z"],
  enter_inline_edit: ["i"],
  enter_body_edit: ["I"],
  insert_below: ["o"],
  insert_above: ["O"],
  delete_node: ["Backspace"],
  undo: ["u"],
  redo: ["U"],
  indent_node: ["Tab"],
  "text.child_block": ["\x1b[13;2u"],
  toggle_task_done: ["x"],
  cycle_task_status: ["X"],
  select_toggle: [" "],
  filter: ["V"],
  show_help: ["?"],
  increase_content_lines: ["."],
  decrease_content_lines: [","],
  local_find: ["/"],
  command_palette: [":"],
  toggle_detail_pane: ["D"],
  task_dialog: ["T"],
  manage_favorites: ["M"],
  search_replace: ["F"],
  toggle_collapse: ["v", "c"],
  toggle_hide_done: ["v", "d"],
  cycle_view_mode: ["v", "m"],
  visual_mode_enter: ["v", "v"],
  hide_node: ["v", "x"],
  toggle_show_hidden: ["v", "X"],
  clear_filters: ["v", "-"],
  pane_split_vertical: ["v", "|"],
  toggle_sticky_fold: ["v", "s"],
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
  open_in_system: ["g", "o"],
  open_in_terminal: ["g", "O"],
  enter_move_mode: ["m", "m"],
  archive: ["m", "a"],
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
// Types
// =============================================================================

/**
 * Declarative snapshot of board state — cursor, selection, view, overlay, bell, visible nodes.
 */
export interface TestAppState {
  /** Current cursor node ID, or null if no cursor */
  cursor: string | null
  /** Selected node IDs */
  selection: string[]
  /** Current view mode */
  view: ViewMode
  /** Top overlay/dialog name, or null */
  overlay: string | null
  /** Bell count (number of times bell was triggered) */
  bell: number
  /** Node ID being edited (inline text edit), or null */
  editing: string | null
  /** Visible node IDs (from the tree) */
  visible: string[]
}

/**
 * Handle for a specific node — query its state without selectors.
 */
export interface NodeHandle {
  /** Whether the node exists in the tree */
  readonly exists: boolean
  /** Whether the node is visible on screen */
  readonly visible: boolean
  /** The node's text content */
  readonly text: string
  /** Whether this node is the cursor */
  readonly isCursor: boolean
  /** Whether this node is selected */
  readonly isSelected: boolean
}

export interface TestApp {
  /** Send a keypress. Chainable: `app.press("j").press("l")` */
  press(key: string): TestApp
  /** Type a sequence of characters (each char as a keypress). Chainable. */
  type(text: string): TestApp
  /** Dispatch a command by name. Chainable: `app.command("cursor_down").command("cursor_right")` */
  command(commandId: string): TestApp
  /**
   * Dispatch a command by ID directly through the command executor, bypassing key mapping.
   * Use for orphan commands with no key binding (e.g. "search" dialog). Chainable.
   */
  dispatch(commandId: string): TestApp
  /** Navigate cursor to a node by pressing cursor_down (max 50 steps). Throws if not found. */
  navigateTo(target: string): TestApp
  /** Current screen content as plain text */
  readonly text: string
  /** Whether bell was triggered (boundary hit) */
  readonly bell: boolean
  /** Whether status bar is showing */
  readonly hasStatus: boolean
  /** Get current status message if visible, or null */
  getStatus(): { level: string; message: string } | null
  /**
   * Declarative state snapshot — cursor, selection, view, overlay, bell, visible nodes.
   *
   * @example
   * ```typescript
   * expect(app.state.cursor).toBe("task1")
   * expect(app.state.view).toBe("cards")
   * expect(app.state.visible).toContain("task1")
   * ```
   */
  readonly state: TestAppState
  /**
   * Get a handle for a node by ID.
   *
   * @example
   * ```typescript
   * expect(app.node("task1").isCursor).toBe(true)
   * expect(app.node("task1").exists).toBe(true)
   * ```
   */
  node(id: string): NodeHandle
  /**
   * Get a handle for a card by title text (searches visible nodes for matching text).
   *
   * @example
   * ```typescript
   * expect(app.card("Buy groceries").isCursor).toBe(true)
   * ```
   */
  card(title: string): NodeHandle
  /**
   * Get a handle for a column by title text.
   *
   * @example
   * ```typescript
   * expect(app.column("Todo").visible).toBe(true)
   * ```
   */
  column(title: string): NodeHandle
  /**
   * Assert inline edit mode is active. If nodeId given, asserts that specific node is being edited.
   * Chainable.
   *
   * @example
   * ```typescript
   * app.press("i").expectEditing("task1")
   * app.press("i").expectEditing() // any node
   * ```
   */
  expectEditing(nodeId?: string): TestApp
  /**
   * Assert inline edit mode is NOT active. Chainable.
   *
   * @example
   * ```typescript
   * app.press("Escape").expectNotEditing()
   * ```
   */
  expectNotEditing(): TestApp
  /**
   * Assert that the screen contains the given text. Chainable.
   *
   * @deprecated Use `expect(app).toContainText(text)` — the canonical matcher.
   * See `apps/km-tui/tests/CLAUDE.md` for the migration pattern.
   */
  expectScreen(text: string): TestApp
  /**
   * Assert that the screen does NOT contain the given text. Chainable.
   *
   * @deprecated Use `expect(app).not.toContainText(text)` — the canonical matcher.
   * See `apps/km-tui/tests/CLAUDE.md` for the migration pattern.
   */
  expectScreenNot(text: string): TestApp
  /** Assert that row n contains text or matches a regex. Chainable. */
  expectRow(n: number, pattern: string | RegExp): TestApp
  /** Assert cell character at screen position. Chainable. */
  expectCellChar(x: number, y: number, char: string): TestApp
  /** Assert cell fg/bg color at screen position. Chainable. */
  expectCellColor(
    x: number,
    y: number,
    opts: {
      fg?: { r: number; g: number; b: number } | number | null
      bg?: { r: number; g: number; b: number } | number | null
    },
  ): TestApp
  /**
   * Simulate a left mouse click at terminal coordinates (x, y). Chainable.
   *
   * @example
   * ```typescript
   * app.click(5, 3) // click at column 5, row 3
   * app.click(10, 5, { ctrl: true }) // ctrl-click for multi-select
   * ```
   */
  click(x: number, y: number, opts?: { ctrl?: boolean }): TestApp
  /**
   * Simulate a full click at (x, y) through BOTH the DOM-level dispatch
   * (React onClick/onMouseDown) AND the app-level handleMouse. This matches
   * the real runtime pipeline (see invokeEventHandler) and is needed for
   * regression tests that exercise component click handlers alongside the
   * app mouse logic — e.g., card border clicks where Card's React onClick
   * and board-app.ts handleMouse both run. Chainable.
   */
  clickDom(x: number, y: number, opts?: { ctrl?: boolean; meta?: boolean }): TestApp
  /**
   * Assert that a rendered node has a complete border (vertical border chars
   * on left and right edges for each row of its bounding box). Chainable.
   *
   * @example
   * ```typescript
   * app.expectNodeBorder("task1")
   * ```
   */
  expectNodeBorder(nodeId: string): TestApp
  /**
   * Assert foreground and/or background color of a node's rendered text.
   * Finds the node by ID, gets its screen position, checks the first
   * non-space character's colors. Chainable.
   *
   * @example
   * ```typescript
   * app.expectNodeColor("task1", { fg: 0, bg: 3 }) // black on yellow (selected)
   * app.expectNodeColor("task1", { attrs: { dim: true } }) // dimmed text
   * ```
   */
  expectNodeColor(
    nodeId: string,
    opts: {
      fg?: { r: number; g: number; b: number } | number | null
      bg?: { r: number; g: number; b: number } | number | null
      attrs?: Record<string, boolean>
    },
  ): TestApp
  /**
   * Assert no ghost/leftover characters on screen: NUL bytes, stray control
   * characters, "[object Object]", "undefined", "NaN". Chainable.
   *
   * @example
   * ```typescript
   * app.expectNoGhostChars() // full screen
   * app.expectNoGhostChars({ x: 0, y: 0, width: 40, height: 12 }) // region
   * ```
   */
  expectNoGhostChars(region?: { x: number; y: number; width: number; height: number }): TestApp
  /**
   * Capture the full screen and match against a golden snapshot file.
   *
   * Snapshots land in `<test-dir>/__snapshots__/<test-file>.snap` (Vitest default).
   * - On **termless**, uses `toMatchTerminalSnapshot` (includes cursor + mode header).
   * - On **headless**, uses `toMatchSnapshot` on normalized stripped text
   *   (trailing whitespace removed per line, line endings normalized).
   *
   * @param name - Optional snapshot name (multiple snapshots per test).
   */
  expectSnapshot(name?: string): TestApp
  /** Locator-based assertions: app.expect("#id").toExist() */
  expect(selector: string): {
    toExist(): void
    not: { toExist(): void }
    toHaveCount(n: number): void
  }
  /** CSS-style locator for querying the AgNode tree */
  locator(selector: string): AutoLocator
  /** Find nodes by text content */
  getByText(text: string | RegExp): AutoLocator
  /** Find nodes by testID attribute */
  getByTestId(id: string): AutoLocator
  /** Locator-style query shorthand (alias for locator) */
  q(selector: string): AutoLocator
  /** Get cell info at the given column and row */
  cell(col: number, row: number): CellInfo
  /** Screen inspection object */
  readonly screen: ScreenAccess
  /** Resize the terminal. Chainable. */
  resize(cols: number, rows: number): TestApp
  /** Paste text (each char as keypress, newlines as Enter). Chainable. */
  paste(text: string): TestApp
  /** Advance fake timers by ms. Tests must call vi.useFakeTimers() first. Chainable. */
  tick(ms: number): TestApp
  /** History of all actions (press, type, command, dispatch, resize, paste, tick). */
  readonly actionHistory: readonly string[]
  /** Access to the repo for persistence assertions */
  readonly repo: Repo
  /** Access the underlying BoardDriver (headless only — throws on termless) */
  readonly driver: BoardDriver
  /**
   * White-box store access — intentionally callback-based to discourage casual use.
   * Prefer app.state, app.card(), app.node() for assertions. Use this ONLY when
   * the public API genuinely doesn't cover what you need (e.g., checking internal
   * UI state like undoStack, pane layout, text edit hints).
   *
   * @param reason - Optional label describing why store access is needed (for readability)
   * @param fn - Callback receiving the current store state
   *
   * @example
   * ```typescript
   * app.withStore(s => {
   *   expect(s.workspace.panes.size).toBe(2)
   * })
   * app.withStore("assert pane layout", s => {
   *   expect(s.workspace.panes.size).toBe(2)
   * })
   * ```
   */
  withStore<T>(fn: (store: BoardAppStore, set: (fn: (s: BoardAppStore) => Partial<BoardAppStore>) => void) => T): T
  withStore<T>(
    reason: string,
    fn: (store: BoardAppStore, set: (fn: (s: BoardAppStore) => Partial<BoardAppStore>) => void) => T,
  ): T
  /** Dispose the test app */
  [Symbol.dispose](): void
}

export interface CellInfo {
  char: string
  fg: { r: number; g: number; b: number } | number | null
  bg: { r: number; g: number; b: number } | number | null
  bold: boolean
  dim: boolean
  italic: boolean
  inverse: boolean
  underline: boolean
}

export interface ScreenAccess {
  readonly text: string
  /** ANSI-styled content with color escape sequences */
  readonly ansi: string
  readonly rows: string[]
  row(n: number): string
  cell(x: number, y: number): CellInfo
  readonly width: number
  readonly height: number
  nodePos(nodeId: string): { x: number; y: number } | null
  nodeBox(nodeId: string): { x: number; y: number; width: number; height: number } | null
  findRow(text: string): number
}

export interface TestAppOptions {
  /** Terminal width (default: 120) */
  cols?: number
  /** Terminal height (default: 30) */
  rows?: number
  /** Backend type (default: env TEST_BACKEND or "headless") */
  backend?: "headless" | "termless"
  /** Enable incremental rendering checks (default: true for headless) */
  checkIncremental?: boolean
  /** Enable incremental rendering (default: true for headless) */
  incremental?: boolean
  /** Initial view mode (default: "cards") */
  viewMode?: "cards" | "columns" | "list" | "tabs"
  /**
   * Render the memory-mode banner at the top of the workspace.
   * Default: `false` — legacy tests rely on fixed-row coordinates, so the
   * default driver suppresses the banner. Set `true` to opt in and verify
   * banner behaviour. Only takes effect when the underlying fake repo's
   * mode is "memory" (which is the default for createFakeRepo).
   * Bead: km-tui.memory-mode-silent-loss
   */
  showMemoryModeBanner?: boolean
}

// =============================================================================
// Snapshot normalization
// =============================================================================

/**
 * Normalize text for stable snapshot diffs:
 * - Convert CRLF → LF
 * - Strip trailing whitespace per line (blank cells padded by the renderer
 *   otherwise blow up the snapshot with invisible differences)
 * - Trim trailing blank lines (stable regardless of terminal height padding)
 */
function normalizeScreenText(text: string): string {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
  return lines.join("\n")
}

// =============================================================================
// Fixtures
// =============================================================================

/** Create a realistic board fixture with varied content (multi-column, tasks, dates, sections). */
export function realisticBoard(): KNode[] {
  return item(
    "board",
    item(
      "Next",
      item.task("Buy groceries"),
      item.task("Fix plumbing \u2014 call 2024-01-16"),
      item("+Taxes \u2014 reply to @Shubam", item("(1) confirm Q1 figures"), item("(2) send W-2 copies")),
      item.task("Schedule dentist"),
    ),
    item("Waiting", item.task("@JoseChu \u2014 file US Form 4868 extension"), item.task("Insurance claim #4421")),
    item(
      "Inbox",
      item("2025 Tax Document.pdf"),
      item("Meeting notes from Monday"),
      item("Project Alpha kickoff"),
      item("Review **bold text** and `code blocks`"),
    ),
    item("Done", item.task("Set up direct deposit"), item.task("File Q4 report")),
    item("Archived", item("Old project notes")),
  )
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a test app from a fixture node array.
 *
 * The headless backend wraps createBoardDriver + withDiagnostics with
 * incremental + stability checks enabled and breadcrumb/status bar lines skipped.
 *
 * The termless backend runs createBoardApp through a real xterm.js emulator
 * via createTermless(), exercising the full 5-phase render pipeline.
 *
 * @param nodes - Node array from item() or realisticBoard(), or a function returning one
 * @param opts - Terminal dimensions and backend selection
 *
 * Returns a Promise that resolves to the TestApp. On headless, resolves immediately.
 * On termless, waits for the initial render to complete so locators work from the start.
 *
 * @example
 * ```typescript
 * using app = createTestApp(item("board", item("col1")))
 * app.expect("#col1").toExist()  // works immediately — handle is ready
 * ```
 */
export function createTestApp(nodes: KNode[] | (() => KNode[]), opts: TestAppOptions = {}): TestApp {
  const resolvedNodes = typeof nodes === "function" ? nodes() : nodes
  const { cols = 120, rows = 30, backend } = opts
  const resolvedBackend = backend ?? process.env.TEST_BACKEND ?? "headless"

  if (resolvedBackend === "termless") {
    return createTermlessTestApp(resolvedNodes, cols, rows, opts)
  }

  return createHeadlessTestApp(resolvedNodes, cols, rows, opts)
}

/**
 * Create a test app from inline markdown.
 *
 * @example
 * ```typescript
 * using app = createTestApp.fromMarkdown("# col1\n- [ ] task1\n- [ ] task2")
 * app.expectScreen("task1")
 * ```
 */
createTestApp.fromMarkdown = function fromMarkdown(md: string, opts: TestAppOptions = {}): TestApp {
  const nodes = parseMarkdownToNodes(md, "/fake/vault/board.md")
  return createTestApp(nodes, opts)
}

/**
 * Create a test app from a real vault directory.
 *
 * @example
 * ```typescript
 * using app = createTestApp.fromVault("tests/fixtures/kanban-simple")
 * app.expectScreen("task1")
 * ```
 */
createTestApp.fromVault = function fromVault(vaultPath: string, opts: TestAppOptions = {}): TestApp {
  // Resolve relative paths from the project root
  const path = vaultPath.startsWith("/") ? vaultPath : `${import.meta.dir}/../../${vaultPath}`
  const nodes = loadVaultNodes(path)
  return createTestApp(nodes, opts)
}

/** Load nodes from a vault directory by parsing all .md files */
function loadVaultNodes(vaultPath: string): KNode[] {
  const { readdirSync, readFileSync } = require("node:fs") as typeof import("node:fs")
  const { join } = require("node:path") as typeof import("node:path")
  const allNodes: KNode[] = []
  for (const entry of readdirSync(vaultPath)) {
    if (entry.endsWith(".md")) {
      const content = readFileSync(join(vaultPath, entry), "utf-8")
      const nodes = parseMarkdownToNodes(content, join(vaultPath, entry))
      allNodes.push(...nodes)
    }
  }
  if (allNodes.length === 0) {
    throw new Error(`No .md files found in vault: ${vaultPath}`)
  }
  return allNodes
}

// =============================================================================
// Shared state helpers (used by both backends)
// =============================================================================

/** Get TestAppState from a headless BoardDriver */
function getHeadlessState(driver: BoardDriver): TestAppState {
  const ds = driver.getState()
  const s = driver.store.getState()
  const board = Workspace.getActiveBoardPane(s)

  const cursorId = (board?.sel.node.cursor() as string | null) ?? null
  const selection = board ? Array.from(board.sel.node.ids()) : []

  // Determine active overlay/dialog
  let overlay: string | null = null
  if (ds.dialogs.search) overlay = "search"
  else if (ds.dialogs.help) overlay = "help"
  else if (ds.dialogs.newItem) overlay = "newItem"
  else if (ds.detailPaneOpen) overlay = "detail"

  // Collect visible node IDs from tree
  const visible: string[] = []
  if (board?.signals) {
    const lens = board.signals.visibleLens()
    const rootId = board.rootId
    if (rootId) {
      collectVisibleIds(lens, rootId, visible)
    }
  }

  const bellCount = driver.locator("[data-bell]").count()

  // Check inline edit state
  const textSel = board?.sel.text()
  const editing = (textSel?.nodeId as string | undefined) ?? null

  return {
    cursor: cursorId,
    selection,
    view: (ds.viewMode ?? "cards") as ViewMode,
    overlay,
    bell: bellCount,
    editing,
    visible,
  }
}

/** Recursively collect visible node IDs from the tree lens */
function collectVisibleIds(lens: ReturnType<typeof createVisibleLens>, nodeId: string, result: string[]): void {
  result.push(nodeId)
  for (const childId of lens.children(nodeId)) {
    collectVisibleIds(lens, childId, result)
  }
}

/** Create a NodeHandle for a node by ID (headless) */
function getHeadlessNodeHandle(driver: BoardDriver, id: string): NodeHandle {
  const s = driver.store.getState()
  const board = Workspace.getActiveBoardPane(s)
  const node = s.repo.getNode(id)
  const cursorId = (board?.sel.node.cursor() as string | null) ?? null
  const selectedIds = board ? new Set(board.sel.node.ids()) : new Set<string>()

  const loc = driver.locator(`#${id}`)
  const isVisible = loc.count() > 0

  return {
    get exists() {
      return node != null
    },
    get visible() {
      return isVisible
    },
    get text() {
      if (isVisible) return loc.textContent()
      return String(node?.content ?? node?.data?.name ?? "")
    },
    get isCursor() {
      return cursorId === id
    },
    get isSelected() {
      return selectedIds.has(id)
    },
  }
}

/** Find a node by title text in the repo tree */
function findNodeByTitle(repo: Repo, title: string): KNode | null {
  // Search by trying the title as an ID first (item() uses content as ID)
  const direct = repo.getNode(title)
  if (direct) return direct

  // Search the subtree from root
  const root = repo.getChildren(null)
  for (const rootNode of root) {
    const match = findInSubtree(repo, rootNode, title)
    if (match) return match
  }
  return null
}

function findInSubtree(repo: Repo, node: KNode, title: string): KNode | null {
  if (node.content === title || node.data?.name === title) return node
  for (const child of repo.getChildren(node.id)) {
    const match = findInSubtree(repo, child, title)
    if (match) return match
  }
  return null
}

/** Create a NodeHandle for a node by title text (headless) */
function getHeadlessNodeHandleByTitle(driver: BoardDriver, title: string): NodeHandle {
  const s = driver.store.getState()
  const board = Workspace.getActiveBoardPane(s)
  const cursorId = (board?.sel.node.cursor() as string | null) ?? null
  const selectedIds = board ? new Set(board.sel.node.ids()) : new Set<string>()

  const matchedNode = findNodeByTitle(s.repo, title)

  const id = matchedNode?.id
  const loc = id ? driver.locator(`#${id}`) : null
  const isVisible = loc ? loc.count() > 0 : false

  return {
    get exists() {
      return matchedNode != null
    },
    get visible() {
      return isVisible
    },
    get text() {
      if (isVisible && loc) return loc.textContent()
      return String(matchedNode?.content ?? matchedNode?.data?.name ?? "")
    },
    get isCursor() {
      return id != null && cursorId === id
    },
    get isSelected() {
      return id != null && selectedIds.has(id)
    },
  }
}

// =============================================================================
// Dispose invariants (shared by both backends)
// =============================================================================

/**
 * Run lightweight invariant checks at test dispose time.
 * Uses expect() so failures appear as vitest test failures, not thrown errors.
 * Wrapped in try/catch so dispose always completes cleanup.
 *
 * SILVERY_STRICT levels:
 * - 0: Skip all checks (benchmarks)
 * - 1 (default): Run checks at dispose
 * - 2: Checks run after every action AND at dispose
 */
interface CellAccessorForInvariants {
  cell(col: number, row: number): CellInfo | null
  locator(selector: string): {
    count(): number
    boundingBox(): { x: number; y: number; width: number; height: number } | null
  }
}

function runDisposeInvariants(
  getStoreState: () => BoardAppStore,
  actionHistory: readonly string[],
  cellAccessor?: CellAccessorForInvariants,
): void {
  const strictLevel = Number(process.env.SILVERY_STRICT ?? "1")
  if (strictLevel === 0) return

  try {
    const s = getStoreState()
    const board = Workspace.getActiveBoardPane(s)
    if (!board) return

    const repo = s.repo
    const cursorId = (board.sel.node.cursor() as string | null) ?? null
    const selectedIds = Array.from(board.sel.node.ids()) as string[]
    const historyStr =
      actionHistory.length > 0 ? ` (after ${actionHistory.length} actions: ${actionHistory.slice(-5).join(", ")})` : ""

    // Check cursor points to an existing node
    if (cursorId) {
      expect(
        repo.getNode(cursorId),
        `Dispose invariant: cursor "${cursorId}" should exist in repo${historyStr}`,
      ).not.toBeNull()
    }

    // Check all selected nodes exist
    for (const nodeId of selectedIds) {
      expect(
        repo.getNode(nodeId),
        `Dispose invariant: selected node "${nodeId}" should exist in repo${historyStr}`,
      ).not.toBeNull()
    }

    // Check no duplicate columns
    if (board.signals) {
      const lens = board.signals.visibleLens()
      const rootId = board.rootId
      if (rootId) {
        const colIds = lens.children(rootId)
        const colIdSet = new Set(colIds)
        expect(
          colIdSet.size,
          `Dispose invariant: no duplicate columns (found ${colIds.length} columns, ${colIdSet.size} unique)${historyStr}`,
        ).toBe(colIds.length)
      }
    }

    // Check cursor is visible (not hidden by fold/filter)
    if (cursorId && board.signals) {
      const lens = board.signals.visibleLens()
      const rootId = board.rootId
      if (rootId) {
        const visible: string[] = []
        collectVisibleIds(lens, rootId, visible)
        // Only check if cursor is expected to be visible (not during zoom transitions)
        if (visible.length > 0) {
          expect(
            visible.includes(cursorId),
            `Dispose invariant: cursor "${cursorId}" should be visible in the tree (visible: ${visible.slice(0, 5).join(", ")}...)${historyStr}`,
          ).toBe(true)
        }
      }
    }

    // Border integrity — strict-2 only (expensive, ~5ms)
    if (strictLevel >= 2 && cellAccessor) {
      // Check visible cards have continuous vertical borders on left and right edges.
      // Uses the cell accessor callback to read rendered characters without
      // needing a direct driver reference.
      if (board.signals) {
        const lens = board.signals.visibleLens()
        const rootId = board.rootId
        if (rootId) {
          const colIds = lens.children(rootId)
          for (const colId of colIds) {
            const cardIds = lens.children(colId)
            for (const cardId of cardIds) {
              // Find the card's rendered location via locator
              const loc = cellAccessor.locator(`#${cardId}`)
              if (loc.count() === 0) continue
              const box = loc.boundingBox()
              if (!box || box.width < 2 || box.height < 1) continue

              // Check left and right border columns for border characters
              const borderChars = new Set([
                "│",
                "┃",
                "║",
                "┌",
                "┐",
                "└",
                "┘",
                "├",
                "┤",
                "╭",
                "╮",
                "╰",
                "╯",
                "█",
                "▏",
                "▎",
                "▍",
                "▌",
                "▋",
                "▊",
                "▉",
              ])
              for (let row = box.y; row < box.y + box.height; row++) {
                const leftCell = cellAccessor.cell(box.x, row)
                const rightCell = cellAccessor.cell(box.x + box.width - 1, row)
                if (leftCell && borderChars.has(leftCell.char)) continue
                if (rightCell && borderChars.has(rightCell.char)) continue
                // At least one edge should have a border char on each row
                const hasLeftBorder = leftCell != null && borderChars.has(leftCell.char)
                const hasRightBorder = rightCell != null && borderChars.has(rightCell.char)
                if (!hasLeftBorder && !hasRightBorder) {
                  expect
                    .soft(
                      false,
                      `Dispose invariant (strict-2): card "${cardId}" row ${row - box.y} missing border chars (left="${leftCell?.char ?? "?"}", right="${rightCell?.char ?? "?"}")${historyStr}`,
                    )
                    .toBe(true)
                  break // one failure per card is enough
                }
              }
            }
          }
        }
      }
    }
  } catch {
    // Swallow — dispose must always complete cleanup
  }
}

// =============================================================================
// Failure Artifact Dump
// =============================================================================

/**
 * Register an onTestFailed hook to dump action history, board state, and screen
 * content when a test using createTestApp fails. Provides context for debugging
 * without needing to re-run the test.
 *
 * Uses vitest's onTestFailed which must be called during test execution (not in
 * setup files). Wrapped in try/catch for safety — if called outside a test
 * context (e.g., beforeAll), it silently skips registration.
 */
function registerFailureArtifacts(
  actionHistory: readonly string[],
  getState: () => TestAppState | null,
  getText: () => string,
): void {
  try {
    onTestFailed((context) => {
      const state = getState()
      const lines = [
        `\n--- TestApp Failure Artifacts ---`,
        `Action history (${actionHistory.length} actions):`,
        ...actionHistory.map((a, i) => `  ${i + 1}. ${a}`),
      ]

      if (state) {
        lines.push(
          `Board state:`,
          `  cursor: ${state.cursor}`,
          `  selection: [${state.selection.join(", ")}]`,
          `  view: ${state.view}`,
          `  overlay: ${state.overlay}`,
          `  bell: ${state.bell}`,
          `  visible: [${state.visible.slice(0, 10).join(", ")}${state.visible.length > 10 ? `, ...(${state.visible.length} total)` : ""}]`,
        )
      }

      const screen = getText()
      if (screen) {
        lines.push(`Screen (first 20 rows):`)
        const rows = screen.split("\n").slice(0, 20)
        for (const row of rows) {
          lines.push(`  | ${row}`)
        }
      }

      lines.push(`--- End Failure Artifacts ---\n`)

      // Attach to the first error's message for vitest output
      const artifact = lines.join("\n")
      const errors = context.task.result?.errors
      if (errors?.[0]) {
        errors[0].message += artifact
      }
    })
  } catch {
    // Outside test context — skip silently
  }
}

// =============================================================================
// Headless Backend
// =============================================================================

function createHeadlessTestApp(nodes: KNode[], cols: number, rows: number, opts: TestAppOptions): TestApp {
  // Reset module-level state for isolate:false compatibility (matches createDriverTest behavior)
  ensureCommandSystemInitialized()
  getChordState().cancel()
  resetDialogGuard()
  resetBoardAppState()

  const boardRootId = nodes[0]!.id
  const repo = createFakeRepo({ nodes })

  const driver = withDiagnostics(
    createBoardDriver(repo, boardRootId, {
      columns: cols,
      rows,
      viewMode: opts.viewMode ?? "cards",
      incremental: opts.incremental !== false,
      showMemoryModeBanner: opts.showMemoryModeBanner ?? false,
    }),
    {
      checkIncremental: opts.checkIncremental !== false,
      checkStability: true,
      skipLines: [0, -1],
    },
  )

  // Synchronous press — same pattern as createDriverTest's pressKey (board-test.ts:592)
  const pressKey = (key: string) => {
    void driver.press(key) // fire-and-forget the microtask promise
  }

  // Build event handler context for mouse events — same shape as driver.ts eventCtx
  const mouseEventCtx: EventHandlerContext<BoardAppStore> = {
    get: driver.store.getState,
    set: driver.store.setState,
    focusManager: driver.focusManager,
    focus(testID: string) {
      driver.focusManager.focusById(testID, driver.getContainer(), "programmatic")
    },
    activateScope(scopeId: string) {
      driver.focusManager.activateScope(scopeId, driver.getContainer())
    },
    getFocusPath() {
      return driver.focusManager.getFocusPath(driver.getContainer())
    },
    hitTest(x: number, y: number) {
      return hitTest(driver.getContainer(), x, y)
    },
  }

  // Mouse event state for DOM-level dispatch (onClick/onMouseDown on Boxes).
  // Exposed via app.clickDom() so regression tests can exercise BOTH paths
  // that run in the real runtime (invokeEventHandler dispatches DOM events
  // AND calls the app-level handleMouse on the same raw event). See
  // km-tui.card-border-click for the bug this catches.
  const mouseEventState = createMouseEventProcessor()

  // Send a mouse event through handleMouse (same path as board-test.ts)
  const sendMouseEvent = (mouse: ParsedMouse) => {
    act(() => {
      handleMouse(mouse, mouseEventCtx)
      driver.store.setState((s) => s)
    })
    // Flush React effects via a no-op press
    void driver.press("")
  }

  // Send a click through BOTH the DOM dispatch AND the app-level handleMouse,
  // matching the real runtime pipeline in invokeEventHandler. Use this for
  // tests that need to exercise React onClick handlers (e.g., Card's click
  // handler in useCardInteraction) alongside the app-level mouse logic.
  const sendFullClick = (x: number, y: number, opts: { ctrl?: boolean; meta?: boolean } = {}) => {
    const base: ParsedMouse = {
      button: 0,
      x,
      y,
      action: "down",
      delta: 0,
      shift: false,
      meta: opts.meta ?? false,
      ctrl: opts.ctrl ?? false,
    }
    act(() => {
      // Real pipeline order: DOM dispatch first, then app handler.
      processMouseEvent(mouseEventState, base, driver.getContainer())
      handleMouse(base, mouseEventCtx)
      const upEvent: ParsedMouse = { ...base, action: "up" }
      processMouseEvent(mouseEventState, upEvent, driver.getContainer())
      handleMouse(upEvent, mouseEventCtx)
      driver.store.setState((s) => s)
    })
    void driver.press("")
  }

  const _actionHistory: string[] = []

  const app: TestApp = {
    press(key: string): TestApp {
      _actionHistory.push(`press(${key})`)
      pressKey(key)
      return app
    },

    type(text: string): TestApp {
      _actionHistory.push(`type(${JSON.stringify(text)})`)
      for (const ch of text) pressKey(ch)
      return app
    },

    command(commandId: string): TestApp {
      _actionHistory.push(`command(${commandId})`)
      const keys = COMMAND_TO_KEYS[commandId]
      if (!keys) throw new Error(`command("${commandId}"): no key mapping found`)
      for (const key of keys) pressKey(key)
      return app
    },

    dispatch(commandId: string): TestApp {
      _actionHistory.push(`dispatch(${commandId})`)
      act(() => {
        dispatchCommandById(commandId, driver.store.getState as () => BoardAppStore)
        driver.store.setState((s) => s)
      })
      void driver.press("Backspace") // flush render
      return app
    },

    navigateTo(target: string): TestApp {
      _actionHistory.push(`navigateTo(${target})`)
      for (let i = 0; i < 50; i++) {
        const loc = driver.locator(`#${target}[data-cursor]`)
        if (loc.count() > 0) return app
        pressKey("j")
      }
      throw new Error(`navigateTo: could not reach "${target}" in 50 steps`)
    },

    resize(newCols: number, newRows: number): TestApp {
      _actionHistory.push(`resize(${newCols},${newRows})`)
      const d = driver as unknown as { resize?: (c: number, r: number) => void }
      if (typeof d.resize === "function") d.resize(newCols, newRows)
      return app
    },

    paste(text: string): TestApp {
      _actionHistory.push(`paste(${JSON.stringify(text)})`)
      for (const ch of text) {
        if (ch === "\n") pressKey("Enter")
        else pressKey(ch)
      }
      return app
    },

    tick(ms: number): TestApp {
      _actionHistory.push(`tick(${ms})`)
      vi.advanceTimersByTime(ms)
      return app
    },

    get actionHistory(): readonly string[] {
      return _actionHistory
    },

    get text(): string {
      return driver.text
    },

    get bell(): boolean {
      return driver.locator("[data-bell]").count() > 0
    },

    get hasStatus(): boolean {
      const bottomBar = driver.locator("#bottom-bar")
      return bottomBar.count() > 0 && !!bottomBar.getAttribute("data-status")
    },

    getStatus(): { level: string; message: string } | null {
      const bottomBar = driver.locator("#bottom-bar")
      if (bottomBar.count() === 0) return null
      const level = bottomBar.getAttribute("data-status")
      if (!level) return null
      const feedbackEl = driver.locator("#feedback-message")
      if (feedbackEl.count() > 0) {
        const message = feedbackEl.textContent().trim()
        return level && message ? { level, message } : null
      }
      const statusEl = driver.locator("#status-message")
      if (statusEl.count() === 0) return null
      const text = statusEl.textContent()
      const spaceIndex = text.indexOf(" ")
      const message = spaceIndex >= 0 ? text.slice(spaceIndex + 1).trim() : text
      return level && message ? { level, message } : null
    },

    get state(): TestAppState {
      return getHeadlessState(driver)
    },

    node(id: string): NodeHandle {
      return getHeadlessNodeHandle(driver, id)
    },

    card(title: string): NodeHandle {
      return getHeadlessNodeHandleByTitle(driver, title)
    },

    column(title: string): NodeHandle {
      return getHeadlessNodeHandleByTitle(driver, title)
    },

    expectEditing(nodeId?: string): TestApp {
      const textSel = driver.store.getState().sel?.text()
      if (nodeId) {
        expect(textSel?.nodeId, `expected editing "${nodeId}"`).toBe(nodeId)
      } else {
        expect(textSel, "expected to be in edit mode").not.toBeNull()
      }
      return app
    },

    expectNotEditing(): TestApp {
      const textSel = driver.store.getState().sel?.text()
      expect(textSel, "expected NOT to be in edit mode").toBeNull()
      return app
    },

    expectScreen(text: string): TestApp {
      expect(driver.containsText(text)).toBe(true)
      return app
    },

    expectScreenNot(text: string): TestApp {
      expect(driver.containsText(text)).toBe(false)
      return app
    },

    expectRow(n: number, pattern: string | RegExp): TestApp {
      const row = driver.text.split("\n")[n] ?? ""
      if (typeof pattern === "string") {
        expect(row).toContain(pattern)
      } else {
        expect(row).toMatch(pattern)
      }
      return app
    },

    expectCellChar(x: number, y: number, char: string): TestApp {
      const c = driver.cell(x, y)
      expect(c.char, `cell(${x},${y}).char`).toBe(char)
      return app
    },

    expectCellColor(x: number, y: number, colorOpts: { fg?: number | null; bg?: number | null }): TestApp {
      const c = driver.cell(x, y)
      if (colorOpts.fg !== undefined) expect(c.fg, `cell(${x},${y}).fg`).toEqual(colorOpts.fg)
      if (colorOpts.bg !== undefined) expect(c.bg, `cell(${x},${y}).bg`).toEqual(colorOpts.bg)
      return app
    },

    click(x: number, y: number, clickOpts?: { ctrl?: boolean }): TestApp {
      _actionHistory.push(`click(${x},${y}${clickOpts?.ctrl ? ",ctrl" : ""})`)
      sendMouseEvent({
        button: 0,
        x,
        y,
        action: "down",
        delta: 0,
        shift: false,
        meta: false,
        ctrl: clickOpts?.ctrl ?? false,
      })
      return app
    },

    clickDom(x: number, y: number, clickOpts?: { ctrl?: boolean; meta?: boolean }): TestApp {
      _actionHistory.push(`clickDom(${x},${y}${clickOpts?.ctrl ? ",ctrl" : ""}${clickOpts?.meta ? ",meta" : ""})`)
      sendFullClick(x, y, clickOpts)
      return app
    },

    expectNodeBorder(nodeId: string): TestApp {
      const loc = driver.locator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return app
      const borderLeft = box.x - 1
      const borderRight = box.x + box.width
      const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
      for (let cy = box.y; cy < box.y + box.height; cy++) {
        if (borderLeft >= 0) {
          const leftCell = driver.cell(borderLeft, cy)
          expect(
            isBorderChar(leftCell.char),
            `node "${nodeId}" left border at (${borderLeft},${cy}): got "${leftCell.char}"`,
          ).toBe(true)
        }
        if (borderRight < cols) {
          const rightCell = driver.cell(borderRight, cy)
          expect(
            isBorderChar(rightCell.char),
            `node "${nodeId}" right border at (${borderRight},${cy}): got "${rightCell.char}"`,
          ).toBe(true)
        }
      }
      return app
    },

    expectNodeColor(
      nodeId: string,
      colorOpts: {
        fg?: { r: number; g: number; b: number } | number | null
        bg?: { r: number; g: number; b: number } | number | null
        attrs?: Record<string, boolean>
      },
    ): TestApp {
      const loc = driver.locator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return app
      for (let cx = box.x; cx < box.x + box.width; cx++) {
        const cell = driver.cell(cx, box.y)
        if (cell.char.trim() === "") continue
        if (colorOpts.fg !== undefined) {
          expect(cell.fg, `node "${nodeId}" fg at (${cx},${box.y}) char="${cell.char}"`).toEqual(colorOpts.fg)
        }
        if (colorOpts.bg !== undefined) {
          expect(cell.bg, `node "${nodeId}" bg at (${cx},${box.y}) char="${cell.char}"`).toEqual(colorOpts.bg)
        }
        if (colorOpts.attrs) {
          for (const [attr, value] of Object.entries(colorOpts.attrs)) {
            expect(
              (cell as unknown as Record<string, unknown>)[attr],
              `node "${nodeId}" attrs.${attr} at (${cx},${box.y})`,
            ).toBe(value)
          }
        }
        break
      }
      return app
    },

    expectNoGhostChars(region?: { x: number; y: number; width: number; height: number }): TestApp {
      const x0 = region?.x ?? 0
      const y0 = region?.y ?? 0
      const w = region?.width ?? cols
      const h = region?.height ?? rows
      for (let cy = y0; cy < y0 + h && cy < rows; cy++) {
        for (let cx = x0; cx < x0 + w && cx < cols; cx++) {
          const ch = driver.cell(cx, cy).char
          if (ch.length === 1) {
            const code = ch.charCodeAt(0)
            expect(code !== 0, `ghost char: NUL byte at (${cx},${cy})`).toBe(true)
            if (code >= 1 && code <= 31 && code !== 9 && code !== 10 && code !== 13) {
              expect(false, `ghost char: control char 0x${code.toString(16).padStart(2, "0")} at (${cx},${cy})`).toBe(
                true,
              )
            }
          }
        }
      }
      const screenText = driver.text
      const artifactPatterns = ["[object Object]", "undefined", "NaN"]
      for (const pattern of artifactPatterns) {
        expect(!screenText.includes(pattern), `ghost char: found "${pattern}" in screen text`).toBe(true)
      }
      return app
    },

    expectSnapshot(name?: string): TestApp {
      const snapshot = normalizeScreenText(driver.text)
      if (name !== undefined) expect(snapshot).toMatchSnapshot(name)
      else expect(snapshot).toMatchSnapshot()
      return app
    },

    expect(selector: string) {
      return {
        toExist: () => {
          const loc = driver.locator(selector)
          expect(loc.count()).toBeGreaterThan(0)
        },
        not: {
          toExist: () => {
            const loc = driver.locator(selector)
            expect(loc.count()).toBe(0)
          },
        },
        toHaveCount: (n: number) => {
          const loc = driver.locator(selector)
          expect(loc.count()).toBe(n)
        },
      }
    },

    locator(selector: string): AutoLocator {
      return driver.locator(selector)
    },

    getByText(text: string | RegExp): AutoLocator {
      return driver.getByText(text)
    },

    getByTestId(id: string): AutoLocator {
      return driver.getByTestId(id)
    },

    q(selector: string): AutoLocator {
      return driver.locator(selector)
    },

    cell(col: number, row: number): CellInfo {
      const fc: FrameCell = driver.cell(col, row)
      return {
        char: fc.char,
        fg: fc.fg,
        bg: fc.bg,
        bold: fc.bold,
        dim: fc.dim,
        italic: fc.italic,
        inverse: fc.inverse ?? false,
        underline: !!fc.underline,
      }
    },

    get screen(): ScreenAccess {
      return {
        get text() {
          return driver.text
        },
        get ansi() {
          return driver.ansi
        },
        get rows() {
          return driver.text.split("\n")
        },
        row(n: number) {
          return driver.text.split("\n")[n] ?? ""
        },
        cell(x: number, y: number): CellInfo {
          const fc: FrameCell = driver.cell(x, y)
          return {
            char: fc.char,
            fg: fc.fg,
            bg: fc.bg,
            bold: fc.bold,
            dim: fc.dim,
            italic: fc.italic,
            inverse: fc.inverse ?? false,
            underline: !!fc.underline,
          }
        },
        width: cols,
        height: rows,
        nodePos(nodeId: string) {
          const loc = driver.locator(`[id="${nodeId}"]`)
          if (loc.count() === 0) return null
          const box = loc.boundingBox()
          return box ? { x: box.x, y: box.y } : null
        },
        nodeBox(nodeId: string) {
          const loc = driver.locator(`[id="${nodeId}"]`)
          if (loc.count() === 0) return null
          return loc.boundingBox()
        },
        findRow(text: string) {
          return driver.text.split("\n").findIndex((row) => row.includes(text))
        },
      }
    },

    get repo(): Repo {
      return repo
    },

    get driver(): BoardDriver {
      return driver
    },

    withStore<T>(
      reasonOrFn:
        | string
        | ((store: BoardAppStore, set: (fn: (s: BoardAppStore) => Partial<BoardAppStore>) => void) => T),
      maybeFn?: (store: BoardAppStore, set: (fn: (s: BoardAppStore) => Partial<BoardAppStore>) => void) => T,
    ): T {
      const fn = typeof reasonOrFn === "function" ? reasonOrFn : maybeFn!
      return fn(
        driver.store.getState() as BoardAppStore,
        driver.store.setState as (fn: (s: BoardAppStore) => Partial<BoardAppStore>) => void,
      )
    },

    [Symbol.dispose](): void {
      runDisposeInvariants(() => driver.store.getState(), _actionHistory, {
        cell(col: number, row: number): CellInfo | null {
          try {
            const fc: FrameCell = driver.cell(col, row)
            return {
              char: fc.char,
              fg: fc.fg,
              bg: fc.bg,
              bold: fc.bold,
              dim: fc.dim,
              italic: fc.italic,
              inverse: fc.inverse ?? false,
              underline: !!fc.underline,
            }
          } catch {
            return null
          }
        },
        locator(selector: string) {
          const loc = driver.locator(selector)
          return { count: () => loc.count(), boundingBox: () => loc.boundingBox() }
        },
      })
      if ("unmount" in driver && typeof driver.unmount === "function") {
        driver.unmount()
      }
    },
  }

  registerFailureArtifacts(
    _actionHistory,
    () => {
      try {
        return app.state
      } catch {
        return null
      }
    },
    () => {
      try {
        return app.text
      } catch {
        return ""
      }
    },
  )

  return app
}

// =============================================================================
// Termless state helpers
// =============================================================================

/** Null node handle for when termless handle isn't ready */
const nullNodeHandle: NodeHandle = {
  get exists() {
    return false
  },
  get visible() {
    return false
  },
  get text() {
    return ""
  },
  get isCursor() {
    return false
  },
  get isSelected() {
    return false
  },
}

type TermlessHandle = {
  store: SignalStoreApi<BoardAppStore>
}

/** Get TestAppState from a termless boardApp */
function getTermlessState(
  handle: TermlessHandle,
  boardApp: ReturnType<typeof createBoardApp>,
  fallbackViewMode: ViewMode,
  getLocator: (sel: string) => AutoLocator,
): TestAppState {
  const s = handle.store.getState()
  const board = Workspace.getActiveBoardPane(s)
  const cursorId = (board?.sel.node.cursor() as string | null) ?? null
  const selection = board ? Array.from(board.sel.node.ids()) : []

  // Determine overlay
  let overlay: string | null = null
  if (s.ui.showSearchDialog) overlay = "search"
  else if (s.ui.showHelp) overlay = "help"
  else if (s.ui.showNewItemDialog) overlay = "newItem"
  else if (hasDetailPaneFor(s.workspace, s.workspace.focusedPaneId)) overlay = "detail"

  // Visible nodes
  const visible: string[] = []
  if (board?.signals) {
    const lens = board.signals.visibleLens()
    const rootId = board.rootId
    if (rootId) {
      collectVisibleIds(lens, rootId, visible)
    }
  }

  const bellCount = getLocator("[data-bell]").count()

  // Check inline edit state
  const textSel = board?.sel.text()
  const editing = (textSel?.nodeId as string | undefined) ?? null

  return {
    cursor: cursorId,
    selection,
    view: (board?.viewMode ?? fallbackViewMode) as ViewMode,
    overlay,
    bell: bellCount,
    editing,
    visible,
  }
}

/** Create a NodeHandle for a node by ID (termless) */
function getTermlessNodeHandle(
  handle: TermlessHandle,
  _boardApp: ReturnType<typeof createBoardApp>,
  id: string,
  getLocator: (sel: string) => AutoLocator,
): NodeHandle {
  const s = handle.store.getState()
  const board = Workspace.getActiveBoardPane(s)
  const node = s.repo.getNode(id)
  const cursorId = (board?.sel.node.cursor() as string | null) ?? null
  const selectedIds = board ? new Set(board.sel.node.ids()) : new Set<string>()

  const loc = getLocator(`#${id}`)
  const isVisible = loc.count() > 0

  return {
    get exists() {
      return node != null
    },
    get visible() {
      return isVisible
    },
    get text() {
      if (isVisible) return loc.textContent()
      return String(node?.content ?? node?.data?.name ?? "")
    },
    get isCursor() {
      return cursorId === id
    },
    get isSelected() {
      return selectedIds.has(id)
    },
  }
}

/** Create a NodeHandle for a node by title text (termless) */
function getTermlessNodeHandleByTitle(
  handle: TermlessHandle,
  _boardApp: ReturnType<typeof createBoardApp>,
  title: string,
  repo: Repo,
  getLocator: (sel: string) => AutoLocator,
): NodeHandle {
  const s = handle.store.getState()
  const board = Workspace.getActiveBoardPane(s)
  const cursorId = (board?.sel.node.cursor() as string | null) ?? null
  const selectedIds = board ? new Set(board.sel.node.ids()) : new Set<string>()

  const matchedNode = findNodeByTitle(repo, title)

  const id = matchedNode?.id
  const loc = id ? getLocator(`#${id}`) : null
  const isVisible = loc ? loc.count() > 0 : false

  return {
    get exists() {
      return matchedNode != null
    },
    get visible() {
      return isVisible
    },
    get text() {
      if (isVisible && loc) return loc.textContent()
      return String(matchedNode?.content ?? matchedNode?.data?.name ?? "")
    },
    get isCursor() {
      return id != null && cursorId === id
    },
    get isSelected() {
      return id != null && selectedIds.has(id)
    },
  }
}

// =============================================================================
// Termless Backend
// =============================================================================

/** Settle delay after press — waits for React reconciliation + render + output. */
const TERMLESS_SETTLE_MS = 50

function createTermlessTestApp(nodes: KNode[], cols: number, rows: number, _opts: TestAppOptions): TestApp {
  const boardRootId = nodes[0]!.id
  const repo = createFakeRepo({ nodes })
  const viewMode = _opts.viewMode ?? "cards"

  const initLens = createVisibleLens(createViewLens(repo, { rootId: boardRootId, foldDepths: new Map() }))
  const initColIds = boardRootId ? initLens.children(boardRootId) : []
  const firstColId = initColIds[0]
  const firstCardId = firstColId ? initLens.children(firstColId)[0] : null
  const initialCursor = firstCardId ?? firstColId ?? null

  const collapsedNodeIds = new Set<string>()
  if (boardRootId) {
    for (const child of repo.getChildren(boardRootId)) {
      if (child.rules?.collapse || child.data?.collapsed === true) {
        collapsedNodeIds.add(child.id)
      }
    }
  }

  const navigator = createGridNavigator()
  const toastQueue = createToastQueue()
  const term = createTermless({ cols, rows })

  // Wrap the repo once so `useRepo()` returns the SAME undoable proxy as
  // `state.repo` (fixes km-tui.title-edit-no-undo).
  const undoStack = createUndoStack()
  const { repo: undoableRepo, handle: undoHandle } = createUndoableRepo(repo, undoStack)
  // Reactive store subscribes to the raw repo — the Proxy passes `subscribe`
  // through so mutations still fire listeners.
  const reactiveStore = withReactive(createStoreFromRepo(repo))

  const storeParams: CreateBoardAppStoreParams = {
    repo: undoableRepo,
    undoInfra: { handle: undoHandle, stack: undoStack },
    toastQueue,
    navigator,
    initialBoardState: createBoardState(boardRootId, repo.path, collapsedNodeIds),
    initialCursor,
    initialUIState: createInitialUIState({ columns: cols, rows }),
    initialViewMode: viewMode,
    dimensions: { columns: cols, rows },
  }

  const boardApp = createBoardApp(storeParams)
  const handlePromise = boardApp.run(
    React.createElement(RepoProvider, {
      repo: undoableRepo,
      children: React.createElement(StoreProvider, {
        store: reactiveStore,
        children: React.createElement(BoardApp, {
          initialViewMode: viewMode,
          toastQueue,
          navigator,
          showMemoryModeBanner: _opts.showMemoryModeBanner ?? false,
        }),
      }),
    }),
    {
      cols,
      rows,
      writable: { write: (data: string) => (term as Term & { write(s: string): void }).write(data) },
    },
  )

  let handle: {
    press(key: string): Promise<void>
    unmount(): void
    text: string
    root: AgNode
    buffer: import("@silvery/ag-term/buffer").TerminalBuffer | null
    store: SignalStoreApi<BoardAppStore>
  } | null = null
  const handleReady: PromiseLike<void> = handlePromise.then((h) => {
    handle = h as typeof handle
  })

  async function ensureHandle(): Promise<void> {
    if (!handle) {
      await handleReady
      // Allow initial render + output to propagate through emulator
      await new Promise((r) => setTimeout(r, TERMLESS_SETTLE_MS))
    }
  }

  // Eagerly resolve the handle — by the time the test's first `await` runs,
  // the microtask for handleReady will have completed, making locators work.
  // This doesn't block the sync return of createTestApp, but ensures the
  // handle resolves as early as possible.
  void handleReady

  const savedLogLevel = getLogLevel()

  // Locator helpers: if handle isn't ready yet, return an empty locator
  // that reports count=0. This lets sync assertions work before the first
  // await (they'll fail with "expected >0, got 0" rather than crashing).
  // After the first press/command (which awaits handle), locators work normally.
  const emptyLocator: AutoLocator = {
    count: () => 0,
    textContent: () => "",
    boundingBox: () => null,
    getAttribute: () => null,
    getByText: () => emptyLocator,
    getByTestId: () => emptyLocator,
    locator: () => emptyLocator,
    filter: () => emptyLocator,
    first: () => emptyLocator,
    last: () => emptyLocator,
    nth: () => emptyLocator,
  } as unknown as AutoLocator

  function getLocator(selector: string): AutoLocator {
    if (!handle) return emptyLocator
    return createAutoLocator(() => handle!.root).locator(selector)
  }

  function getByTextLocator(text: string | RegExp): AutoLocator {
    if (!handle) return emptyLocator
    return createAutoLocator(() => handle!.root).getByText(text)
  }

  function getByTestIdLocator(id: string): AutoLocator {
    if (!handle) return emptyLocator
    return createAutoLocator(() => handle!.root).getByTestId(id)
  }

  function getCellFromBuffer(x: number, y: number): CellInfo {
    if (!handle?.buffer) {
      return { char: " ", fg: null, bg: null, bold: false, dim: false, italic: false, inverse: false, underline: false }
    }
    const raw = handle.buffer.getCell(x, y)
    return {
      char: raw.char ?? " ",
      fg: (raw as { fg?: number | null }).fg ?? null,
      bg: (raw as { bg?: number | null }).bg ?? null,
      bold: !!(raw as { bold?: boolean }).bold,
      dim: !!(raw as { dim?: boolean }).dim,
      italic: !!(raw as { italic?: boolean }).italic,
      inverse: !!(raw as { inverse?: boolean }).inverse,
      underline: !!(raw as { underline?: boolean | number }).underline,
    }
  }

  // Termless press: synchronous via act() — same pattern as headless.
  // handle.press() is async in create-app, but we bypass it by using
  // the board driver's handleKey path directly inside act().
  // The writable routes ANSI to the emulator, which processes synchronously.
  const pressKey = (key: string) => {
    if (!handle) throw new Error("press() called before handle is ready — termless init failed")
    setLogLevel("error")
    try {
      void handle.press(key) // fire-and-forget — act() in handleKey handles flush
    } finally {
      setLogLevel(savedLogLevel)
    }
  }

  // Focus manager for mouse event context — used by click().
  // The termless boardApp's internal focus manager isn't exposed, so we
  // create a minimal one for the handleMouse EventHandlerContext.
  const termlessClickFm = createFocusManager()

  // Send a mouse event through handleMouse (same module-level singleton as boardApp)
  const sendTermlessMouseEvent = (mouse: ParsedMouse) => {
    if (!handle) throw new Error("click() called before handle is ready — termless init failed")
    const mouseCtx: EventHandlerContext<BoardAppStore> = {
      get: handle.store.getState,
      set: handle.store.setState,
      focusManager: termlessClickFm,
      focus(_testID: string) {
        /* no-op in termless click */
      },
      activateScope(scopeId: string) {
        termlessClickFm.activateScope(scopeId, handle!.root)
      },
      getFocusPath() {
        return termlessClickFm.getFocusPath(handle!.root)
      },
      hitTest(x: number, y: number) {
        return hitTest(handle!.root, x, y)
      },
    }
    act(() => {
      handleMouse(mouse, mouseCtx)
      handle!.store.setState((s) => s)
    })
    // Flush via a no-op press
    void handle.press("")
  }

  const _actionHistory: string[] = []

  const app: TestApp = {
    press(key: string): TestApp {
      _actionHistory.push(`press(${key})`)
      pressKey(key)
      return app
    },

    type(text: string): TestApp {
      _actionHistory.push(`type(${JSON.stringify(text)})`)
      for (const ch of text) pressKey(ch)
      return app
    },

    command(commandId: string): TestApp {
      _actionHistory.push(`command(${commandId})`)
      const keys = COMMAND_TO_KEYS[commandId]
      if (!keys) throw new Error(`command("${commandId}"): no key mapping found`)
      for (const key of keys) pressKey(key)
      return app
    },

    dispatch(commandId: string): TestApp {
      _actionHistory.push(`dispatch(${commandId})`)
      if (!handle) throw new Error("dispatch() called before handle is ready")
      act(() => {
        dispatchCommandById(commandId, handle!.store.getState as () => BoardAppStore)
        handle!.store.setState((s) => s)
      })
      void handle.press("Backspace")
      return app
    },

    navigateTo(target: string): TestApp {
      _actionHistory.push(`navigateTo(${target})`)
      for (let i = 0; i < 50; i++) {
        const loc = getLocator(`#${target}[data-cursor]`)
        if (loc.count() > 0) return app
        pressKey("j")
      }
      throw new Error(`navigateTo: could not reach "${target}" in 50 steps`)
    },

    resize(newCols: number, newRows: number): TestApp {
      _actionHistory.push(`resize(${newCols},${newRows})`)
      // Termless: resize the terminal emulator
      const t = term as unknown as { resize?: (c: number, r: number) => void }
      if (typeof t.resize === "function") t.resize(newCols, newRows)
      return app
    },

    paste(text: string): TestApp {
      _actionHistory.push(`paste(${JSON.stringify(text)})`)
      for (const ch of text) {
        if (ch === "\n") pressKey("Enter")
        else pressKey(ch)
      }
      return app
    },

    tick(ms: number): TestApp {
      _actionHistory.push(`tick(${ms})`)
      vi.advanceTimersByTime(ms)
      return app
    },

    get actionHistory(): readonly string[] {
      return _actionHistory
    },

    get text(): string {
      return handle?.text ?? ""
    },

    get bell(): boolean {
      return getLocator("[data-bell]").count() > 0
    },

    get hasStatus(): boolean {
      const bottomBar = getLocator("#bottom-bar")
      return bottomBar.count() > 0 && !!bottomBar.getAttribute("data-status")
    },

    getStatus(): { level: string; message: string } | null {
      const bottomBar = getLocator("#bottom-bar")
      if (bottomBar.count() === 0) return null
      const level = bottomBar.getAttribute("data-status")
      if (!level) return null
      const feedbackEl = getLocator("#feedback-message")
      if (feedbackEl.count() > 0) {
        const message = feedbackEl.textContent().trim()
        return level && message ? { level, message } : null
      }
      const statusEl = getLocator("#status-message")
      if (statusEl.count() === 0) return null
      const text = statusEl.textContent()
      const spaceIndex = text.indexOf(" ")
      const message = spaceIndex >= 0 ? text.slice(spaceIndex + 1).trim() : text
      return level && message ? { level, message } : null
    },

    get state(): TestAppState {
      if (!handle) {
        return {
          cursor: null,
          selection: [],
          view: viewMode as ViewMode,
          overlay: null,
          bell: 0,
          editing: null,
          visible: [],
        }
      }
      return getTermlessState(handle, boardApp, viewMode as ViewMode, getLocator)
    },

    node(id: string): NodeHandle {
      if (!handle) return nullNodeHandle
      return getTermlessNodeHandle(handle, boardApp, id, getLocator)
    },

    card(title: string): NodeHandle {
      if (!handle) return nullNodeHandle
      return getTermlessNodeHandleByTitle(handle, boardApp, title, repo, getLocator)
    },

    column(title: string): NodeHandle {
      if (!handle) return nullNodeHandle
      return getTermlessNodeHandleByTitle(handle, boardApp, title, repo, getLocator)
    },

    expectEditing(nodeId?: string): TestApp {
      if (!handle) throw new Error("expectEditing() called before handle is ready")
      const textSel = handle.store.getState().sel?.text()
      if (nodeId) {
        expect(textSel?.nodeId, `expected editing "${nodeId}"`).toBe(nodeId)
      } else {
        expect(textSel, "expected to be in edit mode").not.toBeNull()
      }
      return app
    },

    expectNotEditing(): TestApp {
      if (!handle) throw new Error("expectNotEditing() called before handle is ready")
      const textSel = handle.store.getState().sel?.text()
      expect(textSel, "expected NOT to be in edit mode").toBeNull()
      return app
    },

    expectScreen(text: string): TestApp {
      expect(handle?.text ?? "").toContain(text)
      return app
    },

    expectScreenNot(text: string): TestApp {
      expect(handle?.text ?? "").not.toContain(text)
      return app
    },

    expectRow(n: number, pattern: string | RegExp): TestApp {
      const row = (handle?.text ?? "").split("\n")[n] ?? ""
      if (typeof pattern === "string") {
        expect(row).toContain(pattern)
      } else {
        expect(row).toMatch(pattern)
      }
      return app
    },

    expectCellChar(x: number, y: number, char: string): TestApp {
      const c = getCellFromBuffer(x, y)
      expect(c.char, `cell(${x},${y}).char`).toBe(char)
      return app
    },

    expectCellColor(x: number, y: number, colorOpts: { fg?: number | null; bg?: number | null }): TestApp {
      const c = getCellFromBuffer(x, y)
      if (colorOpts.fg !== undefined) expect(c.fg, `cell(${x},${y}).fg`).toEqual(colorOpts.fg)
      if (colorOpts.bg !== undefined) expect(c.bg, `cell(${x},${y}).bg`).toEqual(colorOpts.bg)
      return app
    },

    click(x: number, y: number, clickOpts?: { ctrl?: boolean }): TestApp {
      _actionHistory.push(`click(${x},${y}${clickOpts?.ctrl ? ",ctrl" : ""})`)
      sendTermlessMouseEvent({
        button: 0,
        x,
        y,
        action: "down",
        delta: 0,
        shift: false,
        meta: false,
        ctrl: clickOpts?.ctrl ?? false,
      })
      return app
    },

    clickDom(_x: number, _y: number, _clickOpts?: { ctrl?: boolean; meta?: boolean }): TestApp {
      // Termless backend routes mouse events through its own pipeline which
      // already dispatches both DOM and app handlers. For now, clickDom is a
      // headless-only helper — termless tests can use click() which exercises
      // the full pipeline natively.
      throw new Error("clickDom() is headless-only — use click() on the termless backend")
    },

    expectNodeBorder(nodeId: string): TestApp {
      const loc = getLocator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return app
      const borderLeft = box.x - 1
      const borderRight = box.x + box.width
      const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
      for (let cy = box.y; cy < box.y + box.height; cy++) {
        if (borderLeft >= 0) {
          const leftCell = getCellFromBuffer(borderLeft, cy)
          expect(
            isBorderChar(leftCell.char),
            `node "${nodeId}" left border at (${borderLeft},${cy}): got "${leftCell.char}"`,
          ).toBe(true)
        }
        if (borderRight < cols) {
          const rightCell = getCellFromBuffer(borderRight, cy)
          expect(
            isBorderChar(rightCell.char),
            `node "${nodeId}" right border at (${borderRight},${cy}): got "${rightCell.char}"`,
          ).toBe(true)
        }
      }
      return app
    },

    expectNodeColor(
      nodeId: string,
      colorOpts: {
        fg?: { r: number; g: number; b: number } | number | null
        bg?: { r: number; g: number; b: number } | number | null
        attrs?: Record<string, boolean>
      },
    ): TestApp {
      const loc = getLocator(`[id="${nodeId}"]`)
      expect(loc.count(), `node "${nodeId}" exists`).toBeGreaterThan(0)
      const box = loc.boundingBox()
      expect(box, `node "${nodeId}" has boundingBox`).not.toBeNull()
      if (!box) return app
      for (let cx = box.x; cx < box.x + box.width; cx++) {
        const cell = getCellFromBuffer(cx, box.y)
        if (cell.char.trim() === "") continue
        if (colorOpts.fg !== undefined) {
          expect(cell.fg, `node "${nodeId}" fg at (${cx},${box.y}) char="${cell.char}"`).toEqual(colorOpts.fg)
        }
        if (colorOpts.bg !== undefined) {
          expect(cell.bg, `node "${nodeId}" bg at (${cx},${box.y}) char="${cell.char}"`).toEqual(colorOpts.bg)
        }
        if (colorOpts.attrs) {
          for (const [attr, value] of Object.entries(colorOpts.attrs)) {
            expect(
              (cell as unknown as Record<string, unknown>)[attr],
              `node "${nodeId}" attrs.${attr} at (${cx},${box.y})`,
            ).toBe(value)
          }
        }
        break
      }
      return app
    },

    expectNoGhostChars(region?: { x: number; y: number; width: number; height: number }): TestApp {
      const x0 = region?.x ?? 0
      const y0 = region?.y ?? 0
      const w = region?.width ?? cols
      const h = region?.height ?? rows
      for (let cy = y0; cy < y0 + h && cy < rows; cy++) {
        for (let cx = x0; cx < x0 + w && cx < cols; cx++) {
          const ch = getCellFromBuffer(cx, cy).char
          if (ch.length === 1) {
            const code = ch.charCodeAt(0)
            expect(code !== 0, `ghost char: NUL byte at (${cx},${cy})`).toBe(true)
            if (code >= 1 && code <= 31 && code !== 9 && code !== 10 && code !== 13) {
              expect(false, `ghost char: control char 0x${code.toString(16).padStart(2, "0")} at (${cx},${cy})`).toBe(
                true,
              )
            }
          }
        }
      }
      const screenText = handle?.text ?? ""
      const artifactPatterns = ["[object Object]", "undefined", "NaN"]
      for (const pattern of artifactPatterns) {
        expect(!screenText.includes(pattern), `ghost char: found "${pattern}" in screen text`).toBe(true)
      }
      return app
    },

    expectSnapshot(name?: string): TestApp {
      // Termless: delegate to @termless/test toMatchTerminalSnapshot, which
      // renders a human-readable grid (header + cursor + altScreen + numbered lines)
      // from the actual xterm.js emulator state.
      if (name !== undefined) {
        ;(expect(term) as unknown as { toMatchTerminalSnapshot(o: { name: string }): void }).toMatchTerminalSnapshot({
          name,
        })
      } else (expect(term) as unknown as { toMatchTerminalSnapshot(): void }).toMatchTerminalSnapshot()
      return app
    },

    expect(selector: string) {
      return {
        toExist: () => {
          const loc = getLocator(selector)
          expect(loc.count()).toBeGreaterThan(0)
        },
        not: {
          toExist: () => {
            const loc = getLocator(selector)
            expect(loc.count()).toBe(0)
          },
        },
        toHaveCount: (n: number) => {
          const loc = getLocator(selector)
          expect(loc.count()).toBe(n)
        },
      }
    },

    locator(selector: string): AutoLocator {
      return getLocator(selector)
    },

    getByText(text: string | RegExp): AutoLocator {
      return getByTextLocator(text)
    },

    getByTestId(id: string): AutoLocator {
      return getByTestIdLocator(id)
    },

    q(selector: string): AutoLocator {
      return getLocator(selector)
    },

    cell(col: number, row: number): CellInfo {
      return getCellFromBuffer(col, row)
    },

    get screen(): ScreenAccess {
      return {
        get text() {
          return handle?.text ?? ""
        },
        get ansi() {
          // Termless: no direct ANSI from silvery output phase — return plain text
          return handle?.text ?? ""
        },
        get rows() {
          return (handle?.text ?? "").split("\n")
        },
        row(n: number) {
          return (handle?.text ?? "").split("\n")[n] ?? ""
        },
        cell: getCellFromBuffer,
        width: cols,
        height: rows,
        nodePos(nodeId: string) {
          const loc = getLocator(`[id="${nodeId}"]`)
          if (loc.count() === 0) return null
          const box = loc.boundingBox()
          return box ? { x: box.x, y: box.y } : null
        },
        nodeBox(nodeId: string) {
          const loc = getLocator(`[id="${nodeId}"]`)
          if (loc.count() === 0) return null
          return loc.boundingBox()
        },
        findRow(text: string) {
          return (handle?.text ?? "").split("\n").findIndex((row) => row.includes(text))
        },
      }
    },

    get repo(): Repo {
      return repo
    },

    get driver(): BoardDriver {
      throw new Error("driver is not available on termless backend — use headless backend for driver access")
    },

    withStore<T>(
      reasonOrFn:
        | string
        | ((store: BoardAppStore, set: (fn: (s: BoardAppStore) => Partial<BoardAppStore>) => void) => T),
      maybeFn?: (store: BoardAppStore, set: (fn: (s: BoardAppStore) => Partial<BoardAppStore>) => void) => T,
    ): T {
      if (!handle) throw new Error("withStore: termless handle not ready")
      const fn = typeof reasonOrFn === "function" ? reasonOrFn : maybeFn!
      return fn(
        handle.store.getState() as BoardAppStore,
        handle.store.setState as (fn: (s: BoardAppStore) => Partial<BoardAppStore>) => void,
      )
    },

    [Symbol.dispose](): void {
      if (handle) {
        runDisposeInvariants(() => handle!.store.getState(), _actionHistory)
        handle.unmount()
      }
      term[Symbol.dispose]()
      reactiveStore[Symbol.dispose]()
      toastQueue[Symbol.dispose]()
    },
  }

  registerFailureArtifacts(
    _actionHistory,
    () => {
      try {
        return app.state
      } catch {
        return null
      }
    },
    () => {
      try {
        return app.text
      } catch {
        return ""
      }
    },
  )

  return app
}
