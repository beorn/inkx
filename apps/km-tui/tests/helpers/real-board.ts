/**
 * Test Board Helper - Load Real Vaults for TUI Testing
 *
 * Complements createDriverTest() (which uses fixtures) by loading real vault paths.
 * Uses the same fluent API pattern.
 *
 * @example
 * ```typescript
 * // Load a real vault
 * const board = await testBoard("/tmp/my-vault")
 *
 * // Navigate and inspect
 * board.press("j").press("j")
 * console.log(board.screenshot())
 *
 * // DOM queries (auto-refreshing locators)
 * board.q("[data-cursor]").textContent()
 *
 * // Assertions
 * board.expect("[data-cursor]").toExist()
 * board.expect("[data-bell]").not.toExist()
 * ```
 *
 * ## Default dimensions
 *
 * Full-app helpers default to **360 × 120** — the wide / dense terminal
 * geometry that matches modern dev workstations and is the size at which
 * pipeline / layout regressions actually surface (cf. the 352×117 cyan-strip
 * bug). Narrow component fixtures (TextInput, Spinner, single-column lists)
 * keep their 80×24 defaults; this helper exists for full-app rendering.
 * See `feedback-km-view-test-dimensions.md` for the rationale.
 *
 * ## Why this helper wraps `BoardApp`, not `Board`
 *
 * `<Board>` is a bare core view that doesn't pin width/height — when fed
 * straight into `createRenderer` it lays out as `height=1` (the title-bar
 * row only). `<BoardApp>` is the production entry component: it reads
 * dimensions from the store and emits a top-level `<Box width={cols}
 * height={rows}>`, which matches what `<Screen>` does in production. Wiring
 * tests through `BoardApp` keeps the helper in sync with what the user
 * actually sees.
 *
 * Bead: `@km/all/test-system/test-board-empty-frame`.
 */

import React, { act } from "react"
import { createSignalStore, type SignalStoreApi as StoreApi } from "../../src/state/signal-store.ts"
import { createRenderer, keyToAnsi, type App } from "@silvery/test"
import { StoreContext } from "@silvery/create"
import { parseKey } from "@silvery/ag-term/runtime"
import { createFocusManager, FocusManagerContext, ThemeProvider } from "@silvery/ag-react"
import { installDialogGuard } from "../../src/dialog-guard.ts"
import { expect } from "vitest"
import { createRepo, createStoreFromRepo, withReactive, type Repo } from "@km/storage"
import { createBoardState } from "../../src/board/board-types.ts"
import { runGenerator, createToastQueue } from "@km/core"

import { BoardApp } from "../../src/views/Board.tsx"
import { createGridNavigator, createViewLens, createVisibleLens } from "@km/board"
import { RepoProvider } from "../../src/repo-context.tsx"
import { StoreProvider } from "../../src/state/store-context.tsx"
import { ServicesProvider } from "../../src/services-context.tsx"
import { ensureCommandSystemInitialized } from "../../src/board/command-bridge.ts"
import {
  createBoardAppStoreState,
  type BoardAppStore,
  type CreateBoardAppStoreParams,
} from "../../src/state/board-app-store.ts"
import { createInitialUIState } from "../../src/state/ui-reducer.ts"
import { handleKey } from "../../src/board/board-app.ts"
import { createUndoableRepo } from "../../src/undo/undoable-repo.ts"
import { createUndoStack } from "../../src/undo-stack.ts"
import { defaultKmTheme } from "../../src/theme.ts"

/**
 * Default terminal geometry for full-app fixtures. Matches modern dev
 * workstation defaults — the terminal sizes at which pipeline regressions
 * (cyan-strip residue, sticky overlap, scroll-tier flips) actually surface.
 * See `@km/all/test-system/full-app-default-dimensions`.
 */
export const FULL_APP_DEFAULT_COLS = 360
export const FULL_APP_DEFAULT_ROWS = 120

export interface TestBoardOptions {
  /** Terminal columns (default: 360 — full-app geometry, see module docstring). */
  columns?: number
  /** Terminal rows (default: 120 — full-app geometry, see module docstring). */
  rows?: number
  /** View mode (default: "cards") */
  viewMode?: "cards" | "columns" | "list" | "tabs"
  /**
   * Disable the degenerate-frame canary. Off by default — the canary throws
   * if the initial render paints fewer than 5% of cells, which catches
   * silent harness regressions (e.g. missing root width/height pin).
   */
  skipFrameCanary?: boolean
}

export interface TestBoardResult {
  /** Whether bell was triggered (boundary hit) */
  readonly bell: boolean
  /** Send a key press, returns self for chaining */
  press: (key: string) => TestBoardResult
  /** Query DOM with CSS selector (auto-refreshing) */
  q: (selector: string) => ReturnType<App["locator"]>
  /** Assertion helpers */
  expect: (selector: string) => {
    toExist: () => void
    not: { toExist: () => void }
    toHaveCount: (n: number) => void
  }
  /** Get plain text screenshot */
  screenshot: () => string
  /** Whether status message is showing */
  readonly hasStatus: boolean
  /** Get current status message if visible */
  getStatus: () => { level: string; message: string } | null
  /** Access to underlying silvery App for advanced use */
  _result: App
  /** Access to underlying Repo for advanced use */
  _repo: Repo
}

/**
 * Count cells that aren't default-empty. A cell is "painted" iff char !== " "
 * OR any cell-style flag is set (bg, fg, attr). This matches silvery's
 * `TerminalBuffer.countPaintedCells()` — same definition, different surface.
 *
 * The silvery render() entry has its own canary using the same definition;
 * this helper-side check is belt-and-braces and produces a more specific
 * error message for tests using `testBoard`.
 */
function countPaintedCells(app: App): number {
  let painted = 0
  for (let row = 0; row < app.height; row++) {
    for (let col = 0; col < app.width; col++) {
      const cell = app.cell(col, row)
      if (cell.char !== " " && cell.char !== "") {
        painted++
        continue
      }
      if (cell.bg !== null || cell.fg !== null) {
        painted++
        continue
      }
      // Any non-trivial attr flag = painted.
      if (
        cell.bold ||
        cell.dim ||
        cell.italic ||
        cell.underline ||
        cell.inverse ||
        cell.strikethrough ||
        cell.overline ||
        cell.blink
      ) {
        painted++
      }
    }
  }
  return painted
}

/**
 * Create a test board from a real vault path.
 *
 * @example
 * ```typescript
 * const board = await testBoard("/tmp/my-vault")
 * board.press("j").press("j")
 * console.log(board.screenshot())
 * board.q("[data-cursor]").textContent()
 * ```
 */
export async function testBoard(vaultPath: string, options?: TestBoardOptions): Promise<TestBoardResult> {
  const columns = options?.columns ?? FULL_APP_DEFAULT_COLS
  const rows = options?.rows ?? FULL_APP_DEFAULT_ROWS
  const viewMode = options?.viewMode ?? "cards"

  // Load real repo using runGenerator
  const rawRepo = runGenerator(
    createRepo(vaultPath, {
      loadFiles: true,
    }),
  )

  // Find root node (board) - use repo's built-in method
  const rootNode = rawRepo.getRepoRootNode()
  if (!rootNode) {
    throw new Error(`No board found in vault: ${vaultPath}`)
  }

  // Wrap repo with undo proxy so useRepo() observers see the same instance as
  // the store does. Mirrors createDriverTest's setup — without this the
  // production code paths that rely on useRepo() === store.repo silently
  // fork.
  const undoStack = createUndoStack()
  const { repo: undoableRepo, handle: undoHandle } = createUndoableRepo(rawRepo, undoStack)

  // Reactive store wraps the raw repo (the Proxy still forwards subscribe).
  const reactiveStore = withReactive(createStoreFromRepo(rawRepo))

  // Derive initial cursor from lens (no buildBoardState)
  const collapsedNodeIds = new Set<string>()
  for (const child of rawRepo.getChildren(rootNode.id)) {
    if (child.rules?.collapse || child.data?.collapsed === true) {
      collapsedNodeIds.add(child.id)
    }
  }
  const initLens = createVisibleLens(createViewLens(rawRepo, { rootId: rootNode.id, foldDepths: new Map() }), {
    collapsedNodes: collapsedNodeIds.size > 0 ? collapsedNodeIds : undefined,
  })
  const colIds = rootNode.id ? initLens.children(rootNode.id) : []
  const firstColId = colIds[0]
  const firstCardId = firstColId ? initLens.children(firstColId)[0] : null
  const initialCursor = firstCardId ?? firstColId ?? null

  ensureCommandSystemInitialized()

  const registry = createGridNavigator()
  const toastQueue = createToastQueue()

  const storeParams: CreateBoardAppStoreParams = {
    repo: undoableRepo,
    undoInfra: { handle: undoHandle, stack: undoStack },
    toastQueue,
    navigator: registry,
    initialBoardState: createBoardState(rootNode.id, rawRepo.path, collapsedNodeIds),
    initialCursor,
    initialUIState: createInitialUIState({ columns, rows }),
    initialViewMode: viewMode,
    dimensions: { columns, rows },
  }

  const store = createSignalStore<BoardAppStore>(createBoardAppStoreState(storeParams))

  // Create focus manager for focus tree (matches create-app.tsx production setup)
  const focusManager = createFocusManager()
  installDialogGuard(focusManager)

  // Render BoardApp with the full provider stack mirroring tui.tsx
  // (ThemeProvider → ServicesProvider → StoreContext → FocusManagerContext →
  // StoreProvider → RepoProvider → BoardApp). BoardApp pins root width/height
  // from store dimensions (Board.tsx:287), which is what `<Screen>` does in
  // production. The previous version of this helper used the bare `<Board>`
  // core view, which left the root unpinned and collapsed every full-app
  // fixture to a 1-row title-bar frame — see
  // `@km/all/test-system/test-board-empty-frame`.
  const render = createRenderer({ cols: columns, rows, singlePassLayout: true })
  const boardAppElement = React.createElement(BoardApp, {
    initialViewMode: viewMode,
    toastQueue,
    navigator: registry,
    showMemoryModeBanner: false,
  })
  const result = render(
    React.createElement(
      ThemeProvider,
      { theme: defaultKmTheme, children: null },
      React.createElement(
        ServicesProvider,
        { toastQueue, jobRunner: store.getState().jobRunner, undoHandle, children: null },
        React.createElement(
          StoreContext.Provider,
          { value: store as StoreApi<unknown> },
          React.createElement(
            FocusManagerContext.Provider,
            { value: focusManager },
            React.createElement(
              StoreProvider,
              { store: reactiveStore, children: null },
              React.createElement(RepoProvider, { repo: undoableRepo, children: boardAppElement }),
            ),
          ),
        ),
      ),
    ),
  )

  // Degenerate-frame canary. A real board at any non-trivial geometry paints
  // tens of thousands of cells; if the harness is mis-wired the frame
  // collapses to ~one row (title bar). 5% is a generous floor that still
  // catches the regression. Off via skipFrameCanary if a test deliberately
  // wants an empty fixture (none today).
  if (!options?.skipFrameCanary) {
    const totalCells = columns * rows
    const painted = countPaintedCells(result)
    const ratio = painted / totalCells
    if (ratio < 0.05) {
      throw new Error(
        `[testBoard] degenerate frame: only ${painted} of ${totalCells} cells painted ` +
          `(${(ratio * 100).toFixed(2)}%) at ${columns}x${rows}. ` +
          `Expected >= 5%. The harness probably skipped the root width/height pin — ` +
          `see @km/all/test-system/test-board-empty-frame.`,
      )
    }
  }

  // Focus-aware event handler context
  const eventCtx = {
    get: store.getState,
    set: store.setState,
    focusManager,
    focus(testID: string) {
      focusManager.focusById(testID, result.getContainer(), "programmatic")
    },
    activateScope(scopeId: string) {
      focusManager.activateScope(scopeId, result.getContainer())
    },
    getFocusPath() {
      return focusManager.getFocusPath(result.getContainer())
    },
    hitTest(_x: number, _y: number) {
      return null
    },
  }

  // Override press to route through handleKey (same path as production)
  const originalPress = result.press.bind(result)
  const pressKey = (key: string) => {
    const ansi = keyToAnsi(key)
    const [input, parsedKey] = parseKey(ansi)
    act(() => {
      handleKey({ input, key: parsedKey }, eventCtx, () => {})
      store.setState((s) => s)
    })
    void originalPress(key)
  }

  // Return fluent API matching createDriverTest().board
  const board: TestBoardResult = {
    get bell(): boolean {
      return result.locator("[data-bell]").count() > 0
    },
    press: (key: string) => {
      pressKey(key)
      return board
    },
    q: (selector: string) => result.locator(selector),
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
    get hasStatus(): boolean {
      const bottomBar = result.locator("#bottom-bar")
      return bottomBar.count() > 0 && !!bottomBar.getAttribute("data-status")
    },
    getStatus: (): { level: string; message: string } | null => {
      const bottomBar = result.locator("#bottom-bar")
      if (bottomBar.count() === 0) {
        return null
      }
      const level = bottomBar.getAttribute("data-status")
      if (!level) {
        return null
      }
      const statusEl = result.locator("#status-message")
      if (statusEl.count() === 0) {
        return null
      }
      const text = statusEl.textContent()
      const spaceIndex = text.indexOf(" ")
      const message = spaceIndex >= 0 ? text.slice(spaceIndex + 1).trim() : text
      return level && message ? { level, message } : null
    },
    _result: result,
    _repo: undoableRepo,
  }

  return board
}
