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
 */

import React, { act } from "react"
import { createSignalStore, type SignalStoreApi as StoreApi } from "../../src/state/signal-store.ts"
import { createRenderer, keyToAnsi, type App } from "@silvery/test"
import { StoreContext } from "@silvery/create/create-app"
import { parseKey } from "@silvery/ag-term/runtime"
import { createFocusManager, FocusManagerContext } from "@silvery/ag-react"
import { installDialogGuard } from "../../src/dialog-guard.ts"
import { expect } from "vitest"
import { createRepo, type Repo } from "@km/storage"
import { createBoardState } from "../../src/board/board-types.ts"
import { runGenerator, createToastQueue } from "@km/core"

import { Board } from "../../src/views/Board.tsx"
import { createGridNavigator, createViewLens, createVisibleLens } from "@km/board"
import { RepoProvider } from "../../src/repo-context.tsx"
import { ensureCommandSystemInitialized } from "../../src/board/command-bridge.ts"
import {
  createBoardAppStoreState,
  type BoardAppStore,
  type CreateBoardAppStoreParams,
} from "../../src/state/board-app-store.ts"
import { createInitialUIState } from "../../src/state/ui-reducer.ts"
import { handleKey } from "../../src/board/board-app.ts"

export interface TestBoardOptions {
  /** Terminal columns (default: 80) */
  columns?: number
  /** Terminal rows (default: 24) */
  rows?: number
  /** View mode (default: "cards") */
  viewMode?: "cards" | "columns" | "list" | "tabs"
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
  const columns = options?.columns ?? 80
  const rows = options?.rows ?? 24
  const viewMode = options?.viewMode ?? "cards"

  // Load real repo using runGenerator
  const repo = runGenerator(
    createRepo(vaultPath, {
      loadFiles: true,
    }),
  )

  // Find root node (board) - use repo's built-in method
  const rootNode = repo.getRepoRootNode()
  if (!rootNode) {
    throw new Error(`No board found in vault: ${vaultPath}`)
  }

  // Derive initial cursor from lens (no buildBoardState)
  const collapsedNodeIds = new Set<string>()
  for (const child of repo.getChildren(rootNode.id)) {
    if (child.rules?.collapse || child.data?.collapsed === true) {
      collapsedNodeIds.add(child.id)
    }
  }
  const initLens = createVisibleLens(createViewLens(repo, { rootId: rootNode.id, foldDepths: new Map() }), {
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
    repo,
    toastQueue,
    navigator: registry,
    initialBoardState: createBoardState(rootNode.id, repo.path, collapsedNodeIds),
    initialCursor,
    initialUIState: createInitialUIState({ columns, rows }),
    initialViewMode: viewMode,
    dimensions: { columns, rows },
  }

  const store = createSignalStore<BoardAppStore>(createBoardAppStoreState(storeParams))

  // Create focus manager for focus tree (matches create-app.tsx production setup)
  const focusManager = createFocusManager()
  installDialogGuard(focusManager)

  // Render Board with StoreContext.Provider for L3 mode
  const render = createRenderer({ cols: columns, rows })
  const boardElement = React.createElement(Board, {
    initialViewMode: viewMode,
    dimensions: { columns, rows },
    onExit: () => {},
    toastQueue,
    navigator: registry,
  })
  const result = render(
    React.createElement(
      StoreContext.Provider,
      { value: store as StoreApi<unknown> },
      React.createElement(
        FocusManagerContext.Provider,
        { value: focusManager },
        React.createElement(RepoProvider, { repo, children: boardElement }),
      ),
    ),
  )

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
    _repo: repo,
  }

  return board
}
