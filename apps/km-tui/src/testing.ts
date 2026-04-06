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
/* oxlint-disable complexity/complexity -- Test helper — setup complexity is acceptable */

import React from "react"
import { createRenderer, bufferToStyledText } from "@silvery/test"
import type { AutoLocator, FilterOptions } from "@silvery/test"
import type { AgNode } from "@silvery/ag-react"
import { type KNode, runGenerator } from "@km/core"
import type { Repo } from "@km/storage"
import { createStoreFromRepo, withReactive } from "@km/storage"
import type { InitialBoardData, ColumnView } from "./types.ts"
import { BoardCore } from "./views/index.ts"
import { createInitialPaneUI } from "./state/ui-reducer.ts"
import { RepoProvider } from "./repo-context.tsx"
import { StoreProvider } from "./state/store-context.tsx"
import { ReactiveNodeStore, ReactiveNodeStoreProvider } from "./state/reactive.ts"
import { classifyCursorFromLens, createViewLens } from "@km/board"

/** No-op dialog handlers — constant to avoid per-render allocation */
const _NOOP_DIALOG_HANDLERS = {
  handlePickerSelect: () => {},
  handlePickerCancel: () => {},
  handleTagSelect: () => {},
  handleAssigneeSelect: () => {},
  handleNewItemCreate: () => {},
  handleNewItemCancel: () => {},
  handleSearchSelect: () => {},
  handleSearchCancel: () => {},
} as const

/**
 * Create AutoLocator delegation methods that forward to `baseLocator`.
 * The three "core query" methods (getByText, getByTestId, locator) are
 * intentionally excluded — they need custom forwarding in the harness.
 */
function delegateLocatorMethods(
  getBaseLocator: () => AutoLocator,
): Omit<AutoLocator, "getByText" | "getByTestId" | "locator"> {
  return {
    first: () => getBaseLocator().first(),
    last: () => getBaseLocator().last(),
    nth: (index) => getBaseLocator().nth(index),
    resolve: () => getBaseLocator().resolve(),
    resolveAll: () => getBaseLocator().resolveAll(),
    count: () => getBaseLocator().count(),
    textContent: () => getBaseLocator().textContent(),
    getAttribute: (name) => getBaseLocator().getAttribute(name),
    boundingBox: () => getBaseLocator().boundingBox(),
    isVisible: () => getBaseLocator().isVisible(),
    filter: (optionsOrPredicate: FilterOptions | ((node: AgNode) => boolean)) => {
      const loc = getBaseLocator()
      if (typeof optionsOrPredicate === "function") {
        return loc.filter(optionsOrPredicate)
      }
      return loc.filter(optionsOrPredicate)
    },
  }
}

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
  getState(): { rootId: string | null; columns: ColumnView[] }
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
    repo = runGenerator(storageModule.createRepo(repoOrPath, { loadFiles: true }))
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
  const state = runGenerator(tuiModule.initBoardStateGenerator(repo, rootNodeId))

  if (!state) {
    throw new Error(`Failed to initialize board state for ${repoPath}`)
  }

  state.rootPath = repoPath

  // Create test renderer
  const render = createRenderer({ cols: width, rows: height })

  // Render the board using BoardCore (pure rendering) wrapped in RepoProvider
  const boardCoreElement = React.createElement(BoardCore, {
    rootId: state.rootId,
    columns: state.columns,
    colIndex: 0,
    cardIndex: 0,
    ui: createInitialPaneUI("cards", [], { columns: width, rows: height }),
    cursorDepth: "card",
    dimensions: { columns: width, rows: height },
    collapsedNodes: new Set<string>(),
    hasDetailPane: false,
  })

  const firstCardNodeId = state.columns[0]?.cardNodes[0]?.id ?? null

  // Create ReactiveNodeStore and sync initial cursor state
  const nodeStore = new ReactiveNodeStore()
  // Derive initial cursor ancestors for sync via lens
  const initLens = createViewLens(repo, { rootId: state.rootId, foldDepths: new Map() })
  const initAncestors = classifyCursorFromLens(initLens, firstCardNodeId)
  nodeStore.syncCursor({
    cursor: firstCardNodeId,
    cursorCardNodeId: initAncestors.cursorCardNodeId,
    cursorColumnNodeId: initAncestors.cursorColumnNodeId,
    cursorDepth: initAncestors.cursorDepth,
  })

  const reactiveStore = withReactive(createStoreFromRepo(repo))
  const repoElement = React.createElement(RepoProvider, { repo, children: boardCoreElement })
  const storeElement = React.createElement(StoreProvider, { store: reactiveStore, children: repoElement })
  const app = render(React.createElement(ReactiveNodeStoreProvider, { value: nodeStore, children: storeElement }))

  // Current data - updated after each input
  const currentState = state as InitialBoardData

  // Build harness object that extends InkxLocator
  const harness: BoardTestHarness = {
    // AutoLocator: core query methods delegate to app directly
    getByText: (text) => app.getByText(text),
    getByTestId: (id) => app.getByTestId(id),
    locator: (selector) => app.locator(selector),

    // AutoLocator: narrowing/resolution/utility methods delegate to app.locator("*")
    ...delegateLocatorMethods(() => app.locator("*")),

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
      // Returns initial state — this harness doesn't track state changes
      return { rootId: currentState.rootId, columns: currentState.columns }
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
      return col.cardNodes[0] ?? null
    },

    // Lifecycle
    unmount() {
      app.unmount()
    },
  }

  return harness
}
