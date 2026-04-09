/**
 * TestApp -- Unified test driver abstraction for km board tests.
 *
 * Wraps createBoardDriver + withDiagnostics behind a simple API:
 *   press(key), type(text), text, expectScreen(text), expectNoScreen(text),
 *   cell(col, row), screenshot(path?), locator(), getByText(), getByTestId(),
 *   [Symbol.dispose]()
 *
 * Two backends:
 * - **headless** (default): createBoardDriver + withDiagnostics -- synchronous, fast,
 *   incremental rendering checks, buffer-level assertions.
 * - **termless**: createBoardApp + createTermless -- full 5-phase pipeline through a
 *   real xterm.js emulator. Catches ANSI generation bugs that headless misses.
 *
 * Select backend via `TEST_BACKEND` env var or `backend` option.
 *
 * @example
 * ```typescript
 * using app = createTestApp(realisticBoard(), { cols: 120, rows: 30 })
 * await app.press("j")
 * app.expectScreen("Buy groceries")
 * app.expectNoScreen("nonexistent")
 * ```
 */

import React from "react"
import { expect } from "vitest"
import { withDiagnostics } from "@silvery/ag-react"
import { createBoardDriver, type BoardDriver } from "../../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { createStoreFromRepo, withReactive } from "@km/storage"
import type { KNode } from "@km/core"
import { createToastQueue } from "@km/core"
import type { FrameCell } from "@silvery/ag"
import { createTermless, type AutoLocator } from "@silvery/test"
import type { Term } from "@silvery/ag-term"
import { createGridNavigator, createViewLens, createVisibleLens } from "@km/board"
import { createBoardApp } from "../../src/board/board-app.ts"
import { createBoardState } from "../../src/board/board-types.ts"
import { type CreateBoardAppStoreParams } from "../../src/state/board-app-store.ts"
import { createInitialUIState } from "../../src/state/ui-reducer.ts"
import { BoardApp } from "../../src/views/Board.tsx"
import { RepoProvider } from "../../src/repo-context.tsx"
import { StoreProvider } from "../../src/state/store-context.tsx"
import { setLogLevel, getLogLevel } from "loggily"
import { item } from "./board-test.ts"

// =============================================================================
// Types
// =============================================================================

export interface TestApp {
  /** Send a keypress (e.g. "j", "Enter", "Control+d") */
  press(key: string): Promise<void>
  /** Type a sequence of characters (each character sent as a keypress) */
  type(text: string): Promise<void>
  /** Current screen content as plain text */
  readonly text: string
  /** Assert that the screen contains the given text */
  expectScreen(text: string): void
  /** Assert that the screen does NOT contain the given text */
  expectNoScreen(text: string): void
  /** Get cell info at the given column and row */
  cell(col: number, row: number): CellInfo
  /** Capture a screenshot (requires Playwright) */
  screenshot(path?: string): Promise<Buffer>
  /** Access the underlying BoardDriver for advanced use (headless only) */
  readonly driver: BoardDriver
  /**
   * CSS-style locator for querying the AgNode tree (headless only).
   * Termless backend does not have access to the AgNode tree.
   */
  locator(selector: string): AutoLocator
  /**
   * Find nodes by text content (headless only).
   * Termless backend does not have access to the AgNode tree.
   */
  getByText(text: string | RegExp): AutoLocator
  /**
   * Find nodes by testID attribute (headless only).
   * Termless backend does not have access to the AgNode tree.
   */
  getByTestId(id: string): AutoLocator
  /** Dispose the test app */
  [Symbol.dispose](): void
}

export interface CellInfo {
  char: string
  fg: { r: number; g: number; b: number } | null
  bg: { r: number; g: number; b: number } | null
  bold: boolean
  dim: boolean
  italic: boolean
}

export interface TestAppOptions {
  /** Terminal width (default: 120) */
  cols?: number
  /** Terminal height (default: 30) */
  rows?: number
  /** Backend type (default: env TEST_BACKEND or "headless") */
  backend?: "headless" | "termless"
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
 * @param nodes - Node array from item() or realisticBoard()
 * @param opts - Terminal dimensions and backend selection
 */
export function createTestApp(nodes: KNode[], opts: TestAppOptions = {}): TestApp {
  const { cols = 120, rows = 30, backend } = opts
  const resolvedBackend = backend ?? process.env.TEST_BACKEND ?? "headless"

  if (resolvedBackend === "termless") {
    return createTermlessTestApp(nodes, cols, rows)
  }

  return createHeadlessTestApp(nodes, cols, rows)
}

// =============================================================================
// Headless Backend
// =============================================================================

function createHeadlessTestApp(nodes: KNode[], cols: number, rows: number): TestApp {
  const boardRootId = nodes[0]!.id
  const repo = createFakeRepo({ nodes })

  const driver = withDiagnostics(createBoardDriver(repo, boardRootId, { columns: cols, rows }), {
    checkIncremental: true,
    checkStability: true,
    skipLines: [0, -1], // breadcrumb and status bar may have timing diffs
  })

  return {
    async press(key: string): Promise<void> {
      await driver.press(key)
    },

    async type(text: string): Promise<void> {
      await driver.type(text)
    },

    get text(): string {
      return driver.text
    },

    expectScreen(text: string): void {
      expect(driver.containsText(text)).toBe(true)
    },

    expectNoScreen(text: string): void {
      expect(driver.containsText(text)).toBe(false)
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
      }
    },

    async screenshot(path?: string): Promise<Buffer> {
      return driver.screenshot(path)
    },

    get driver(): BoardDriver {
      return driver
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

    [Symbol.dispose](): void {
      if ("unmount" in driver && typeof driver.unmount === "function") {
        driver.unmount()
      }
    },
  }
}

// =============================================================================
// Termless Backend
// =============================================================================

/** Settle delay after press -- waits for React reconciliation + render + output. */
const TERMLESS_SETTLE_MS = 50

function createTermlessTestApp(nodes: KNode[], cols: number, rows: number): TestApp {
  const boardRootId = nodes[0]!.id
  const repo = createFakeRepo({ nodes })

  // Build storeParams identically to createBoardDriver (driver.ts:175-215)
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
  // Do NOT use `using` -- these resources must outlive this function scope.
  // They are cleaned up in [Symbol.dispose]() below.
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
    initialViewMode: "cards",
    dimensions: { columns: cols, rows },
  }

  // Create the board app and run it with writable routing to the termless emulator.
  // The `writable` option puts createApp in headless mode but routes ANSI output
  // to the xterm.js emulator backing the Term, exercising the full output phase.
  const boardApp = createBoardApp(storeParams)
  const handlePromise = boardApp.run(
    React.createElement(
      RepoProvider,
      { repo },
      React.createElement(
        StoreProvider,
        { store: reactiveStore },
        React.createElement(BoardApp, {
          initialViewMode: "cards",
          toastQueue,
          navigator,
        }),
      ),
    ),
    {
      cols,
      rows,
      writable: { write: (data: string) => (term as Term & { write(s: string): void }).write(data) },
    },
  )

  // The handle resolves asynchronously (initial render).
  // We store the promise and resolve it lazily on first press().
  let handle: { press(key: string): Promise<void>; unmount(): void; text: string } | null = null
  const handleReady: Promise<void> = handlePromise.then((h) => {
    handle = h as typeof handle
  })

  async function ensureHandle(): Promise<void> {
    if (!handle) await handleReady
  }

  // Suppress silvery:perf budget warnings -- the termless pipeline naturally
  // takes >16ms per keypress due to xterm.js emulation overhead.
  const savedLogLevel = getLogLevel()

  return {
    async press(key: string): Promise<void> {
      await ensureHandle()
      // Suppress perf budget warnings during press (termless is inherently slower)
      setLogLevel("error")
      try {
        await handle!.press(key)
      } finally {
        setLogLevel(savedLogLevel)
      }
      // Allow React effects + render + output to propagate through emulator
      await new Promise((r) => setTimeout(r, TERMLESS_SETTLE_MS))
    },

    async type(text: string): Promise<void> {
      for (const ch of text) {
        await this.press(ch)
      }
    },

    get text(): string {
      return handle?.text ?? ""
    },

    expectScreen(text: string): void {
      const screenText = handle?.text ?? ""
      expect(screenText).toContain(text)
    },

    expectNoScreen(text: string): void {
      const screenText = handle?.text ?? ""
      expect(screenText).not.toContain(text)
    },

    cell(col: number, row: number): CellInfo {
      // Termless: use the emulator's cell for resolved styling
      const screen = (term as Term & { screen?: { cell(row: number, col: number): unknown } }).screen
      if (!screen) {
        return { char: " ", fg: null, bg: null, bold: false, dim: false, italic: false }
      }
      // termless cell(row, col) -- note: row-first unlike silvery's col-first
      const c = screen.cell(row, col) as {
        char?: string
        fg?: { r: number; g: number; b: number } | null
        bg?: { r: number; g: number; b: number } | null
        bold?: boolean
        dim?: boolean
        italic?: boolean
      }
      return {
        char: c?.char ?? " ",
        fg: c?.fg ?? null,
        bg: c?.bg ?? null,
        bold: c?.bold ?? false,
        dim: c?.dim ?? false,
        italic: c?.italic ?? false,
      }
    },

    async screenshot(_path?: string): Promise<Buffer> {
      throw new Error("screenshot() not yet implemented for termless backend")
    },

    get driver(): BoardDriver {
      throw new Error("driver is not available on termless backend -- use headless backend for driver access")
    },

    // AutoLocator methods are headless-only (require AgNode tree access)
    locator(_selector: string): AutoLocator {
      throw new Error("locator() not available on termless backend -- requires AgNode tree (headless only)")
    },

    getByText(_text: string | RegExp): AutoLocator {
      throw new Error("getByText() not available on termless backend -- requires AgNode tree (headless only)")
    },

    getByTestId(_id: string): AutoLocator {
      throw new Error("getByTestId() not available on termless backend -- requires AgNode tree (headless only)")
    },

    [Symbol.dispose](): void {
      if (handle) handle.unmount()
      term[Symbol.dispose]()
      reactiveStore[Symbol.dispose]()
      toastQueue[Symbol.dispose]()
    },
  }
}
