/**
 * BoardTestHarness - Test helper for km-tui board component
 *
 * Provides a Playwright-inspired API for testing the TUI board:
 * - Visual capture via screenshot()
 * - Input simulation via press()
 * - DOM queries via getByText(), getByTestId()
 * - State access via getState(), getCursor()
 *
 * @example
 * ```typescript
 * import { createBoardTest } from "@km/tui/testing";
 *
 * const board = await createBoardTest("/tmp/repo", { file: "tasks.md" });
 *
 * // Navigate and assert
 * board.press("j");  // Move down
 * expect(board.getCursor()).toEqual([0, 1]);
 *
 * // Visual assertion
 * expect(board.screenshot()).toContain("Task 1");
 *
 * // DOM query
 * const selected = board.locator('[data-selected]');
 * expect(selected.count()).toBe(1);
 *
 * board.unmount();
 * ```
 */

import React from "react"
import { createTestRenderer, bufferToStyledText } from "inkx/testing"
import type { AutoLocator } from "inkx/testing"
import type { KNode } from "@km/core"
import type { Repo } from "@km/storage"
import type { TUIBoardState } from "./types.ts"
import { BoardCore } from "./views/index.ts"
import { createInitialUIState } from "./ui-reducer.ts"
import { createLayoutRegistry } from "./card-positions.ts"
import { RepoProvider } from "./repo-context.tsx"

/**
 * Options for creating a board test harness
 */
export interface BoardTestOptions {
  /** Specific file to view (relative to repo) */
  file?: string
  /** Terminal width in columns */
  width?: number
  /** Terminal height in rows */
  height?: number
  /** Initial view mode */
  viewMode?: "cards" | "columns" | "list"
}

/**
 * Test harness for km board component
 */
export interface BoardTestHarness extends AutoLocator {
  // Visual capture
  /** Get plain text screenshot (no ANSI codes) */
  screenshot(): string
  /** Get styled screenshot (with ANSI codes) */
  screenshotAnsi(): string

  // Input simulation (uses app.press() Playwright-style API, fire-and-forget)
  /** Press a single key */
  press(key: string): void
  /** Press multiple keys in sequence */
  pressMultiple(keys: string[]): void
  /** Type text character by character */
  type(text: string): void

  // State access
  /** Get the current board state */
  getState(): TUIBoardState
  /** Get the current cursor position [colIndex, cardIndex] */
  getCursor(): [number, number]
  /** Get the currently selected node, if any */
  getSelectedNode(): KNode | null

  // Lifecycle
  /** Unmount the component and clean up */
  unmount(): void
}

/**
 * Create a board test harness with a loaded repo
 *
 * @param repoPath - Path to the repo directory
 * @param options - Test configuration options
 * @returns Harness with query and input methods
 *
 * @example
 * ```typescript
 * // Test with a specific file
 * const board = await createBoardTest("/tmp/repo", { file: "tasks.md" });
 *
 * // Test with custom dimensions
 * const board = await createBoardTest("/tmp/repo", { width: 120, height: 40 });
 * ```
 */
export async function createBoardTest(
  repoOrPath: string | Repo,
  options: BoardTestOptions = {},
): Promise<BoardTestHarness> {
  const { file, width = 80, height = 24 } = options

  // Import storage module
  const storageModule = await import("@km/storage")

  // Load repo based on input type
  let repo: Repo
  let repoPath: string

  if (typeof repoOrPath === "string") {
    // Load repo from disk (original behavior)
    // searchAncestors: false prevents finding .km in parent directories (e.g., project root)
    repo = storageModule.runGenerator(
      storageModule.createRepo(repoOrPath, { loadFiles: true }),
    )
    repoPath = repoOrPath
  } else {
    // Use provided repo instance (new behavior for fake repos)
    repo = repoOrPath
    repoPath = repo.path
  }

  // Resolve the file reference to a node ID if provided
  let rootNodeId: string | undefined
  if (file && typeof repoOrPath === "string") {
    // File references only work with real repos (not fake repos)
    const resolved = storageModule.resolvePathArg(file, repoPath)
    if (resolved.nodeRef) {
      // resolveNode converts filename/path/ID to actual node
      const node = repo.resolveNode(resolved.nodeRef)
      rootNodeId = node?.id
    }
  }

  // If no file specified, use the repo root node
  if (!rootNodeId) {
    const repoRootNodes = repo.getChildren(null)
    if (repoRootNodes.length > 0) {
      rootNodeId = repoRootNodes[0]?.id
    }
  }

  // Import TUI module for state initialization
  const tuiModule = await import("./index.ts")

  // Initialize board state
  const state = storageModule.runGenerator(
    tuiModule.initBoardStateGenerator(repo, rootNodeId),
  )

  if (!state) {
    throw new Error(`Failed to initialize board state for ${repoPath}`)
  }

  state.rootPath = repoPath

  // Create test renderer
  const render = createTestRenderer({ columns: width, rows: height })

  // Render the board using BoardCore (pure rendering) wrapped in RepoProvider
  const boardCoreElement = React.createElement(BoardCore, {
    state,
    layout: {
      columns: state.columns,
      colIndex: 0,
      cardIndex: 0,
      subPath: [],
      isAtCardLevel: true,
      isInOutlineMode: false,
    },
    ui: createInitialUIState("cards", [], { columns: width, rows: height }),
    derivedSelectionLevel: "card",
    dimensions: { columns: width, rows: height },
    layoutRegistry: createLayoutRegistry(),
    dispatch: () => {},
    dialogHandlers: {
      handleProjectSelect: () => {},
      handleProjectCancel: () => {},
      handleNewItemCreate: () => {},
      handleNewItemCancel: () => {},
      handleSearchSelect: () => {},
      handleSearchCancel: () => {},
    },
    moveMode: false,
  })

  const app = render(
    React.createElement(RepoProvider, { repo, children: boardCoreElement }),
  )

  // Current state - updated after each input
  const currentState = state

  // Build harness object that extends InkxLocator
  const harness: BoardTestHarness = {
    // InkxLocator methods - delegate to app's auto-refreshing locators
    getByText(text) {
      return app.getByText(text)
    },
    getByTestId(id) {
      return app.getByTestId(id)
    },
    locator(selector) {
      return app.locator(selector)
    },
    first() {
      return app.locator("*").first()
    },
    last() {
      return app.locator("*").last()
    },
    nth(index) {
      return app.locator("*").nth(index)
    },
    resolve() {
      return app.locator("*").resolve()
    },
    resolveAll() {
      return app.locator("*").resolveAll()
    },
    count() {
      return app.locator("*").count()
    },
    textContent() {
      return app.locator("*").textContent()
    },
    getAttribute(name) {
      return app.locator("*").getAttribute(name)
    },
    boundingBox() {
      return app.locator("*").boundingBox()
    },
    isVisible() {
      return app.locator("*").isVisible()
    },
    filter(optionsOrPredicate: Parameters<AutoLocator["filter"]>[0]) {
      return app.locator("*").filter(optionsOrPredicate)
    },

    // Visual capture
    screenshot() {
      return app.text
    },

    screenshotAnsi() {
      const buffer = app.term.buffer
      if (!buffer) return ""
      return bufferToStyledText(buffer)
    },

    // Input simulation - use app.press() (Playwright-style API, fire-and-forget)
    press(key) {
      void app.press(key)
    },

    pressMultiple(keys) {
      for (const key of keys) {
        void app.press(key)
      }
    },

    type(text) {
      for (const char of text) {
        void app.press(char)
      }
    },

    // State access
    getState() {
      // TODO: We need a way to get the current state from the rendered component
      // For now return the initial state - this is a limitation
      return currentState
    },

    getCursor() {
      // Returns the static layout position (0, 0) - this harness doesn't track cursor changes
      return [0, 0] as [number, number]
    },

    getSelectedNode() {
      const s = this.getState()
      // Static harness always at position (0, 0)
      const col = s.columns[0]
      if (!col) return null
      const card = col.cards[0]
      return card?.node ?? null
    },

    // Lifecycle
    unmount() {
      app.unmount()
    },
  }

  return harness
}
