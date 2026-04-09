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
 * using app = await createTestApp(realisticBoard(), { cols: 120, rows: 30 })
 * await app.press("j")
 * app.expectScreen("Buy groceries")
 * app.expect("#ch1").toExist()
 * await app.command("fold_more")
 * app.expect("#ch1").not.toExist()
 * ```
 */

import React from "react"
import { expect } from "vitest"
import { withDiagnostics } from "@silvery/ag-react"
import { createBoardDriver, type BoardDriver } from "../../src/driver.ts"
import { createFakeRepo, type Repo } from "@km/storage"
import { createStoreFromRepo, withReactive } from "@km/storage"
import type { KNode } from "@km/core"
import { createToastQueue } from "@km/core"
import type { FrameCell } from "@silvery/ag"
import { createTermless, createAutoLocator, type AutoLocator } from "@silvery/test"
import type { Term } from "@silvery/ag-term"
import type { AgNode } from "@silvery/ag/types"
import { createGridNavigator, createViewLens, createVisibleLens } from "@km/board"
import { createBoardApp, resetBoardAppState, dispatchCommandById } from "../../src/board/board-app.ts"
import type { BoardAppStore } from "../../src/state/board-app-store.ts"
import type { SignalStoreApi } from "../../src/state/signal-store.ts"
import { act } from "react"
import { createBoardState } from "../../src/board/board-types.ts"
import { type CreateBoardAppStoreParams } from "../../src/state/board-app-store.ts"
import { createInitialUIState } from "../../src/state/ui-reducer.ts"
import { BoardApp } from "../../src/views/Board.tsx"
import { RepoProvider } from "../../src/repo-context.tsx"
import { StoreProvider } from "../../src/state/store-context.tsx"
import { setLogLevel, getLogLevel } from "loggily"
import { ensureCommandSystemInitialized } from "../../src/board/command-bridge.ts"
import { resetDialogGuard } from "../../src/dialog-guard.ts"
import { getChordState } from "@km/commands"
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

export interface TestApp {
  /** Send a keypress. Returns a chainable thenable: `await app.press("j").press("l")` */
  press(key: string): TestAppChain
  /** Type a sequence of characters. Returns a chainable thenable. */
  type(text: string): TestAppChain
  /** Dispatch a command by name. Returns a chainable thenable: `await app.command("cursor_down").command("cursor_right")` */
  command(commandId: string): TestAppChain
  /**
   * Dispatch a command by ID directly through the command executor, bypassing key mapping.
   * Use for orphan commands with no key binding (e.g. "search" dialog).
   */
  dispatch(commandId: string): TestAppChain
  /** Wait for initial render to complete. Required on termless backend before sync assertions. No-op on headless. */
  ready(): Promise<void>
  /** Navigate cursor to a node by pressing cursor_down (max 50 steps). Throws if not found. */
  navigateTo(target: string): Promise<void>
  /** Current screen content as plain text */
  readonly text: string
  /** Whether bell was triggered (boundary hit) */
  readonly bell: boolean
  /** Whether status bar is showing */
  readonly hasStatus: boolean
  /** Get current status message if visible, or null */
  getStatus(): { level: string; message: string } | null
  /** Assert that the screen contains the given text. Chainable. */
  expectScreen(text: string): TestApp
  /** Assert that the screen does NOT contain the given text. Chainable. */
  expectScreenNot(text: string): TestApp
  /** Assert that row n contains text or matches a regex. Chainable. */
  expectRow(n: number, pattern: string | RegExp): TestApp
  /** Assert cell character at screen position. Chainable. */
  expectCellChar(x: number, y: number, char: string): TestApp
  /** Assert cell fg/bg color at screen position. Chainable. */
  expectCellColor(x: number, y: number, opts: { fg?: number | null; bg?: number | null }): TestApp
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
  /** Access to the repo for persistence assertions */
  readonly repo: Repo
  /** Access the underlying BoardDriver (headless only — throws on termless) */
  readonly driver: BoardDriver
  /** Dispose the test app */
  [Symbol.dispose](): void
}

/**
 * Chainable thenable for fluent async commands.
 *
 * Queues actions and executes them in order when awaited:
 *
 * ```typescript
 * await app.command("cursor_down").command("cursor_right").press("z")
 * ```
 *
 * Each method returns a new chain. The chain is lazy — actions only run on `await`.
 */
export interface TestAppChain extends PromiseLike<void> {
  press(key: string): TestAppChain
  type(text: string): TestAppChain
  command(commandId: string): TestAppChain
  dispatch(commandId: string): TestAppChain
}

export interface CellInfo {
  char: string
  fg: { r: number; g: number; b: number } | number | null
  bg: { r: number; g: number; b: number } | number | null
  bold: boolean
  dim: boolean
  italic: boolean
}

export interface ScreenAccess {
  readonly text: string
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
 * using app = await createTestApp(item("board", item("col1")))
 * app.expect("#col1").toExist()  // works immediately — handle is ready
 * ```
 */
export async function createTestApp(
  nodes: KNode[] | (() => KNode[]),
  opts: TestAppOptions = {},
): Promise<TestApp> {
  const resolvedNodes = typeof nodes === "function" ? nodes() : nodes
  const { cols = 120, rows = 30, backend } = opts
  const resolvedBackend = backend ?? process.env.TEST_BACKEND ?? "headless"

  if (resolvedBackend === "termless") {
    const app = createTermlessTestApp(resolvedNodes, cols, rows, opts)
    await app.ready()
    return app
  }

  return createHeadlessTestApp(resolvedNodes, cols, rows, opts)
}

// =============================================================================
// TestAppChain — lazy chainable thenable
// =============================================================================

class TestAppChainImpl implements TestAppChain {
  constructor(
    private fns: {
      press: (key: string) => Promise<void>
      type: (text: string) => Promise<void>
      command: (commandId: string) => Promise<void>
      dispatch: (commandId: string) => Promise<void>
    },
    private queue: Array<() => Promise<void>>,
  ) {}

  press(key: string): TestAppChain {
    return new TestAppChainImpl(this.fns, [...this.queue, () => this.fns.press(key)])
  }

  type(text: string): TestAppChain {
    return new TestAppChainImpl(this.fns, [...this.queue, () => this.fns.type(text)])
  }

  command(commandId: string): TestAppChain {
    return new TestAppChainImpl(this.fns, [...this.queue, () => this.fns.command(commandId)])
  }

  dispatch(commandId: string): TestAppChain {
    return new TestAppChainImpl(this.fns, [...this.queue, () => this.fns.dispatch(commandId)])
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected)
  }

  private async run(): Promise<void> {
    for (const fn of this.queue) await fn()
  }
}

// =============================================================================
// Headless Backend
// =============================================================================

function createHeadlessTestApp(nodes: KNode[], cols: number, rows: number, opts: TestAppOptions): TestApp {
  // Reset module-level state for isolate:false compatibility (matches testEnv behavior)
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
    }),
    {
      checkIncremental: opts.checkIncremental !== false,
      checkStability: true,
      skipLines: [0, -1],
    },
  )

  // Raw async implementations (not chainable — used internally by chain)
  const rawPress = async (key: string) => {
    await driver.press(key)
  }
  const rawType = async (text: string) => {
    await driver.type(text)
  }
  const rawCommand = async (commandId: string) => {
    const keys = COMMAND_TO_KEYS[commandId]
    if (!keys) throw new Error(`command("${commandId}"): no key mapping found`)
    for (const key of keys) {
      await driver.press(key)
    }
  }
  const rawDispatch = async (commandId: string) => {
    act(() => {
      dispatchCommandById(commandId, driver.store.getState as () => BoardAppStore)
      driver.store.setState((s) => s)
    })
    await driver.press("Backspace")
  }

  const chainFns = { press: rawPress, type: rawType, command: rawCommand, dispatch: rawDispatch }

  const app: TestApp = {
    press(key: string): TestAppChain {
      return new TestAppChainImpl(chainFns, [() => rawPress(key)])
    },

    type(text: string): TestAppChain {
      return new TestAppChainImpl(chainFns, [() => rawType(text)])
    },

    command(commandId: string): TestAppChain {
      return new TestAppChainImpl(chainFns, [() => rawCommand(commandId)])
    },

    dispatch(commandId: string): TestAppChain {
      return new TestAppChainImpl(chainFns, [() => rawDispatch(commandId)])
    },

    async ready(): Promise<void> {
      // No-op on headless — synchronous backend is always ready
    },

    async navigateTo(target: string): Promise<void> {
      for (let i = 0; i < 50; i++) {
        const loc = driver.locator(`#${target}[data-cursor]`)
        if (loc.count() > 0) return
        await driver.press("j")
      }
      throw new Error(`navigateTo: could not reach "${target}" in 50 steps`)
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
      return { char: fc.char, fg: fc.fg, bg: fc.bg, bold: fc.bold, dim: fc.dim, italic: fc.italic }
    },

    get screen(): ScreenAccess {
      return {
        get text() {
          return driver.text
        },
        get rows() {
          return driver.text.split("\n")
        },
        row(n: number) {
          return driver.text.split("\n")[n] ?? ""
        },
        cell(x: number, y: number): CellInfo {
          const fc: FrameCell = driver.cell(x, y)
          return { char: fc.char, fg: fc.fg, bg: fc.bg, bold: fc.bold, dim: fc.dim, italic: fc.italic }
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

    [Symbol.dispose](): void {
      if ("unmount" in driver && typeof driver.unmount === "function") {
        driver.unmount()
      }
    },
  }

  return app
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
  const reactiveStore = withReactive(createStoreFromRepo(repo))

  const storeParams: CreateBoardAppStoreParams = {
    repo,
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
      repo,
      children: React.createElement(StoreProvider, {
        store: reactiveStore,
        children: React.createElement(BoardApp, {
          initialViewMode: viewMode,
          toastQueue,
          navigator,
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
      return { char: " ", fg: null, bg: null, bold: false, dim: false, italic: false }
    }
    const raw = handle.buffer.getCell(x, y)
    return {
      char: raw.char ?? " ",
      fg: (raw as { fg?: number | null }).fg ?? null,
      bg: (raw as { bg?: number | null }).bg ?? null,
      bold: !!(raw as { bold?: boolean }).bold,
      dim: !!(raw as { dim?: boolean }).dim,
      italic: !!(raw as { italic?: boolean }).italic,
    }
  }

  // Raw async implementations for chain
  const rawPress = async (key: string) => {
    await ensureHandle()
    setLogLevel("error")
    try {
      await handle!.press(key)
    } finally {
      setLogLevel(savedLogLevel)
    }
    await new Promise((r) => setTimeout(r, TERMLESS_SETTLE_MS))
  }
  const rawType = async (text: string) => {
    for (const ch of text) await rawPress(ch)
  }
  const rawCommand = async (commandId: string) => {
    const keys = COMMAND_TO_KEYS[commandId]
    if (!keys) throw new Error(`command("${commandId}"): no key mapping found`)
    for (const key of keys) await rawPress(key)
  }
  const rawDispatch = async (commandId: string) => {
    await ensureHandle()
    act(() => {
      dispatchCommandById(commandId, handle!.store.getState as () => BoardAppStore)
      handle!.store.setState((s) => s)
    })
    await rawPress("Backspace")
  }

  const chainFns = { press: rawPress, type: rawType, command: rawCommand, dispatch: rawDispatch }

  const app: TestApp = {
    press(key: string): TestAppChain {
      return new TestAppChainImpl(chainFns, [() => rawPress(key)])
    },

    type(text: string): TestAppChain {
      return new TestAppChainImpl(chainFns, [() => rawType(text)])
    },

    command(commandId: string): TestAppChain {
      return new TestAppChainImpl(chainFns, [() => rawCommand(commandId)])
    },

    dispatch(commandId: string): TestAppChain {
      return new TestAppChainImpl(chainFns, [() => rawDispatch(commandId)])
    },

    async ready(): Promise<void> {
      await ensureHandle()
    },

    async navigateTo(target: string): Promise<void> {
      await ensureHandle()
      for (let i = 0; i < 50; i++) {
        const loc = getLocator(`#${target}[data-cursor]`)
        if (loc.count() > 0) return
        await app.press("j")
      }
      throw new Error(`navigateTo: could not reach "${target}" in 50 steps`)
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

    [Symbol.dispose](): void {
      if (handle) handle.unmount()
      term[Symbol.dispose]()
      reactiveStore[Symbol.dispose]()
      toastQueue[Symbol.dispose]()
    },
  }

  return app
}
