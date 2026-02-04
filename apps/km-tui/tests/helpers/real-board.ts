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

import React from "react"
import { createRenderer, type App } from "inkx/testing"
import { expect } from "vitest"
import { createRepo, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"

import { Board } from "../../src/views/Board.tsx"
import { buildBoardState } from "../../src/state.ts"
import { createLayoutRegistry } from "../../src/card-positions.ts"
import { RepoProvider } from "../../src/repo-context.tsx"
import { ensureCommandSystemInitialized } from "../../src/command-bridge.ts"

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
export async function testBoard(
  vaultPath: string,
  options?: TestBoardOptions,
): Promise<TestBoardResult> {
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

  // Render
  const render = createRenderer({ cols: columns, rows })
  const boardElement = React.createElement(Board, {
    initialState,
    initialViewMode: viewMode,
    dimensions: { columns, rows },
    onExit: () => {},
    layoutRegistry: createLayoutRegistry(),
  })
  const result = render(
    React.createElement(RepoProvider, { repo, children: boardElement }),
  )

  // Return fluent API matching testEnv().board
  const board: TestBoardResult = {
    get bell(): boolean {
      return result.locator("[data-bell]").count() > 0
    },
    press: (key: string) => {
      void result.press(key)
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
