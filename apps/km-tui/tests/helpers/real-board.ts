/**
 * Test Board Helper - Load Real Vaults for TUI Testing
 *
 * Complements testEnv() (which uses fixtures) by loading real vault paths.
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
import { createStore, type StoreApi } from "zustand"
import { createRenderer, keyToAnsi, type App } from "inkx/testing"
import { StoreContext, parseKey } from "inkx/runtime"
import { expect } from "vitest"
import { createRepo, type Repo } from "@km/storage"
import { createBoardState } from "../../src/board-types.ts"
import { runGenerator, createToastQueue } from "@km/core"

import { Board } from "../../src/views/Board.tsx"
import { buildBoardState } from "../../src/state.ts"
import { createLayoutRegistry } from "../../src/card-positions.ts"
import { RepoProvider } from "../../src/repo-context.tsx"
import { ensureCommandSystemInitialized } from "../../src/command-bridge.ts"
import {
  createBoardAppStoreState,
  type BoardAppStore,
  type CreateBoardAppStoreParams,
} from "../../src/board-app-store.ts"
import { createInitialUIState } from "../../src/ui-reducer.ts"
import { handleKey } from "../../src/board-app.ts"

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
  /** Access to underlying inkx App for advanced use */
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

  // Build state
  const initialState = buildBoardState(repo, rootNode.id)

  // Ensure command system is initialized before rendering
  ensureCommandSystemInitialized()

  // Compute initial cursor
  let initialCursorNodeId: string | null = null
  if (initialState.columns.length > 0) {
    const firstCol = initialState.columns[0]
    if (firstCol && firstCol.cards.length > 0) {
      initialCursorNodeId = firstCol.cards[0]?.node.id ?? firstCol.node.id
    } else if (firstCol) {
      initialCursorNodeId = firstCol.node.id
    }
  }

  // Set up store (same pattern as driver/testEnv)
  const registry = createLayoutRegistry()
  const toastQueue = createToastQueue()

  const initialLayout = {
    columns: initialState.columns,
    colIndex: 0,
    cardIndex: 0,
    subPath: [] as string[],
    isAtCardLevel:
      initialCursorNodeId !== null &&
      initialState.columns.length > 0 &&
      (initialState.columns[0]?.cards.length ?? 0) > 0,
    isInOutlineMode: false,
  }

  const selectedCol = initialState.columns[0]
  const selectedCard = selectedCol?.cards[0]
  const initialSelectedNode = selectedCard?.node ?? selectedCol?.node ?? null
  const initialSelectionLevel: "board" | "column" | "card" =
    initialCursorNodeId === null ? "board" : selectedCard ? "card" : "column"

  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    layoutRegistry: registry,
    initialBoardState: createBoardState(initialState.rootId, initialState.rootPath, initialCursorNodeId, initialState.collapsedNodeIds),
    initialUIState: createInitialUIState(
      viewMode,
      [...(initialState.collapsedColumns ?? [])],
      { columns, rows },
      initialState.rootId,
    ),
    initialLayout,
    initialTUIBoardState: initialState,
    initialSelectedNode,
    initialSelectionLevel,
    dimensions: { columns, rows },
  }

  const store = createStore<BoardAppStore>(createBoardAppStoreState(storeParams))

  // Render Board with StoreContext.Provider for L3 mode
  const render = createRenderer({ cols: columns, rows })
  const boardElement = React.createElement(Board, {
    initialState,
    initialViewMode: viewMode,
    dimensions: { columns, rows },
    onExit: () => {},
    toastQueue,
    layoutRegistry: registry,
  })
  const result = render(
    React.createElement(
      StoreContext.Provider,
      { value: store as StoreApi<unknown> },
      React.createElement(RepoProvider, { repo, children: boardElement }),
    ),
  )

  // Override press to route through handleKey (same path as production)
  const originalPress = result.press.bind(result)
  const pressKey = (key: string) => {
    const ansi = keyToAnsi(key)
    const [input, parsedKey] = parseKey(ansi)
    act(() => {
      handleKey({ input, key: parsedKey }, { get: store.getState, set: store.setState }, () => {})
    })
    void originalPress(key)
  }

  // Return fluent API matching testEnv().board
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
