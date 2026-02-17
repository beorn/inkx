/**
 * Board Test Helper - Fluent API for Visual Board Testing
 *
 * Wraps inkx createRenderer with a concise, documentation-like API
 * for testing TUI board rendering.
 *
 * ## Architecture (3-layer pattern)
 *
 * Uses BoardCore (pure rendering) for static tests, or Board (stateful)
 * for keyboard navigation tests:
 * - ✅ Static visual testing with BoardCore
 * - ✅ Keyboard navigation with Board (useReducer + useInput)
 *
 * ## Tree Builder API (NEW - decker-inspired)
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
 *
 * // Use standardBoard() for common tests
 * const { repo, root } = standardBoard();
 * const state = buildBoardState(repo, root);
 * ```
 *
 * ## Classic API (existing)
 *
 * @example
 * ```typescript
 * const b = renderBoard(SIMPLE_BOARD);
 *
 * // Content assertions
 * b.expectVisible('Task 1');
 * b.expect('Task 1').toBeVisible();
 *
 * // Keyboard navigation (works with Board)
 * b.press('j');
 * b.expectVisible('Task 2');
 *
 * // Screenshot for debugging
 * console.log(b.screenshot());
 * ```
 */
/* oxlint-disable complexity/complexity -- Test helper — fixture builder complexity is acceptable */

import React, { act } from "react"
import { createStore, type StoreApi } from "zustand"
import { createRenderer, keyToAnsi, type App, type AutoLocator } from "inkx/testing"
import { compareBuffers, formatMismatch } from "inkx/toolbelt"
import { StoreContext } from "inkx/runtime"
import { parseKey } from "inkx/runtime"
import { expect } from "vitest"
import { createFakeRepo, type Repo } from "@km/storage"
import { createBoardState } from "../../src/board-types.ts"
import { createToastQueue, type KNode, type NodeRules, type NodeType } from "@km/core"

import { BoardCore, Board } from "../../src/views/Board.tsx"
import { buildBoardState } from "../../src/state.ts"
import { createInitialUIState } from "../../src/ui-reducer.ts"
import { createGridNavigator } from "@km/board"
import { RepoProvider } from "../../src/repo-context.tsx"
import { ensureCommandSystemInitialized } from "../../src/command-bridge.ts"
import { TreeRenderProvider, deriveTreeConfig } from "../../src/ui-context.tsx"
import {
  createBoardAppStoreState,
  type BoardAppStore,
  type CreateBoardAppStoreParams,
} from "../../src/board-app-store.ts"
import { handleKey } from "../../src/board-app.ts"
import type { TUIBoardState } from "../../src/types.ts"
import { createCursorStore } from "../../src/cursor-store.ts"

// NOTE: BoardCore is pure rendering (no hooks) - use for static visual tests.
// Board includes useReducer + useInput - use for keyboard navigation tests.
import {
  createBoardState as createBoardStateFixture,
  createColumnState,
  createCardState,
} from "../fixtures/board-fixtures.ts"

// =============================================================================
// Cursor Initialization Helper
// =============================================================================

/**
 * Compute initial cursor placement for a board state.
 * Skips collapsed columns to avoid placing cursor on invisible cards.
 */
function computeInitialCursor(initialState: TUIBoardState) {
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
      if (col.cards.length > 0) {
        cursorNodeId = col.cards[0]?.node.id ?? col.node.id
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
  const selectedCard = selectedCol && !isCollapsed ? selectedCol.cards[0] : undefined
  const selectionLevel: "board" | "column" | "card" =
    cursorNodeId === null ? "board" : selectedCard ? "card" : "column"

  return { cursorNodeId, colIndex, cardIndex: selectedCard ? 0 : cardIndex, selectedCard, selectedCol, selectionLevel }
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
 *   item("col1 limit=3",
 *     item("1a"),
 *     item("1b")
 *   )
 * );
 */
export function item(content: string, ...childArrays: KNode[][]): KNode[] {
  // Nodes with children become folders (columns), leaf nodes become tasks (cards)
  const hasChildren = childArrays.length > 0

  // Parse rules from content (e.g., "col1 limit=3" -> name="col1", rules={limit:3})
  let cleanContent = content
  let rules: NodeRules | undefined

  if (hasChildren) {
    // Generic key=value extraction from column name
    const regex = /`?(\w[\w-]*)=(?:"([^"]+)"|'([^']+)'|([^\s"'`]+))`?/gi
    const addValues: string[] = []
    let match
    while ((match = regex.exec(content)) !== null) {
      const key = match[1]!
      const value = match[2] ?? match[3] ?? match[4]!
      if (!rules) rules = {}
      switch (key) {
        case "add":
          addValues.push(value)
          break
        case "sync":
          rules.sync = value
          break
        case "collapse":
          if (value === "true") rules.collapse = true
          break
        case "limit":
          rules.limit = Number.parseInt(value, 10)
          break
        case "default":
          if (value === "true") rules.default = true
          break
        case "color":
          rules.color = value
          break
      }
    }
    if (addValues.length === 1) {
      if (!rules) rules = {}
      rules.add = addValues[0]
    } else if (addValues.length > 1) {
      if (!rules) rules = {}
      rules.add = addValues
    }

    if (rules) {
      // Remove key=value patterns from content to get clean name
      cleanContent = content.replace(/`?(\w[\w-]*)=(?:"([^"]+)"|'([^']+)'|([^\s"'`]+))`?/gi, "").trim()
    }
  }

  const node: KNode = {
    id: content,
    type: hasChildren ? "oi" : "li",
    ...(hasChildren ? { fstype: "folder" as const } : { list_marker: "-", task_marker: "[ ]", task_status: "todo" as const }),
    content: hasChildren ? undefined : cleanContent,
    data: hasChildren ? { name: cleanContent } : {},
    parent_id: null,
    parent_idx: 0,
    link_to: null,
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
  props: { is_repo_root?: boolean; fstype?: KNode["fstype"]; list_marker?: string },
  ...childArrays: KNode[][]
): KNode[] {
  const hasChildren = childArrays.length > 0

  const node: KNode = {
    id: content,
    type,
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
    link_to: null,
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
  makeNodeWithType(content, "oi", { is_repo_root: true, fstype: "repo" }, ...childArrays)

item.folder = (content: string, ...childArrays: KNode[][]): KNode[] =>
  makeNodeWithType(content, "oi", { fstype: "folder" }, ...childArrays)

item.section = (content: string, ...childArrays: KNode[][]): KNode[] =>
  makeNodeWithType(content, "oi", { fstype: "mdsection" }, ...childArrays)

item.paragraph = (content: string): KNode[] => makeNodeWithType(content, "p", {})

item.file = (content: string, ...childArrays: KNode[][]): KNode[] =>
  makeNodeWithType(content, "oi", { fstype: "mdfile" }, ...childArrays)

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
    link_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
  return [node]
}

item.quote = (content: string): KNode[] => makeNodeWithType(content, "quote", {})

item.task = (content: string, status?: string): KNode[] => {
  const nodes = makeNodeWithType(content, "li", { list_marker: "-" })
  if (nodes[0]) {
    nodes[0].task_status = (status ?? "todo") as KNode["task_status"]
    nodes[0].task_marker = "[ ]"
  }
  return nodes
}

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
export function testEnv(
  treeBuilder: () => KNode[],
  options?: {
    columns?: number
    rows?: number
    viewMode?: "cards" | "columns" | "list" | "tabs"
    /** Enable incremental rendering (buffer clone + subtree skip). Default: false */
    incremental?: boolean
  },
) {
  const nodes = treeBuilder()
  const repo = createFakeRepo({ nodes })
  const rootNode = nodes[0]
  if (!rootNode) {
    throw new Error("Tree builder must return at least one node")
  }

  // Build initial board state from repo
  const initialState = buildBoardState(repo, rootNode.id)

  // Ensure command system is initialized before rendering
  ensureCommandSystemInitialized()

  // Set up store (same pattern as driver)
  const columns = options?.columns ?? 80
  const rows = options?.rows ?? 24
  const viewMode = options?.viewMode ?? "cards"
  const registry = createGridNavigator()
  const toastQueue = createToastQueue()

  const { cursorNodeId: initialCursorNodeId, colIndex: initialColIndex, selectedCard, selectedCol, selectionLevel: initialSelectionLevel } = computeInitialCursor(initialState)

  const initialLayout = {
    columns: initialState.columns,
    colIndex: initialColIndex,
    cardIndex: selectedCard ? 0 : -1,
    isAtCardLevel: selectedCard != null,
  }

  const initialSelectedNode = selectedCard?.node ?? selectedCol?.node ?? null

  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator: registry,
    cursorStore: createCursorStore({
      cursorNodeId: initialCursorNodeId,
      colIndex: initialColIndex,
      cardIndex: selectedCard ? 0 : -1,
      selectionLevel: initialSelectionLevel,
    }),
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
    navigator: registry,
  })
  const result = render(
    React.createElement(
      StoreContext.Provider,
      { value: store as StoreApi<unknown> },
      React.createElement(RepoProvider, { repo, children: boardElement }),
    ),
    { incremental: options?.incremental ?? true },
  )

  // Override press to route through handleKey (same path as driver/production)
  const originalPress = result.press.bind(result)
  const pressKey = (key: string) => {
    const ansi = keyToAnsi(key)
    const [input, parsedKey] = parseKey(ansi)
    act(() => {
      handleKey({ input, key: parsedKey }, { get: store.getState, set: store.setState }, () => {})
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
  }

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
      // Status message is in #status-message element within bottom bar
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
      console.log(`node "${nodeId}": box=${JSON.stringify(box)}, cell(${box.x},${box.y})=${JSON.stringify({ char: cell.char, fg: cell.fg, bg: cell.bg, attrs: cell.attrs })}`)
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
            expect(
              code !== 0,
              `ghost char: NUL byte at (${x},${y})`,
            ).toBe(true)
            // Control characters (1-31) excluding tab(9), newline(10), carriage return(13)
            if (code >= 1 && code <= 31 && code !== 9 && code !== 10 && code !== 13) {
              expect(
                false,
                `ghost char: control char 0x${code.toString(16).padStart(2, "0")} at (${x},${y})`,
              ).toBe(true)
            }
          }
        }
      }

      // Check for artifact strings in the text
      const screenText = result.text
      const artifactPatterns = ["[object Object]", "undefined", "NaN"]
      for (const pattern of artifactPatterns) {
        expect(
          !screenText.includes(pattern),
          `ghost char: found "${pattern}" in screen text`,
        ).toBe(true)
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
          expect(
            ch === " " || ch === "",
            `expected blank at (${cx},${cy}), got "${ch}"`,
          ).toBe(true)
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
        expect(
          !allBlank,
          `unexpected blank line at row ${y}`,
        ).toBe(true)
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

      expect(
        box.x >= 0 && box.x < columns,
        `cursor x=${box.x} is within screen bounds [0, ${columns})`,
      ).toBe(true)
      expect(
        box.y >= 0 && box.y < rows,
        `cursor y=${box.y} is within screen bounds [0, ${rows})`,
      ).toBe(true)

      return board
    },

    /**
     * Compare current incremental render buffer against a fresh render.
     * For each mismatch, reports position, incremental cell, and fresh cell.
     *
     * Only meaningful when `incremental: true` was passed to testEnv (which is
     * the default). Delegates to inkx's `compareBuffers` + `formatMismatch`.
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

        expect.fail(
          `Incremental/fresh buffer mismatch:\n${formatMismatch(mismatch, { incrementalText, freshText })}`,
        )
      }

      return board
    },
  }
  return { board, repo, registry, toastQueue }
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
export function testEnvWithRepo(
  repo: Repo,
  rootId: string,
  options?: {
    columns?: number
    rows?: number
    viewMode?: "cards" | "columns" | "list" | "tabs"
    /** Enable incremental rendering diagnostics. Default: false */
    incremental?: boolean
  },
) {
  // Build initial board state from repo
  const initialState = buildBoardState(repo, rootId)

  // Ensure command system is initialized before rendering
  ensureCommandSystemInitialized()

  // Set up store (same pattern as driver/testEnv)
  const columns = options?.columns ?? 80
  const rows = options?.rows ?? 24
  const viewMode = options?.viewMode ?? "cards"
  const registry = createGridNavigator()
  const toastQueue = createToastQueue()

  const { cursorNodeId: initialCursorNodeId, colIndex: initialColIndex, selectedCard, selectedCol, selectionLevel: initialSelectionLevel } = computeInitialCursor(initialState)

  const initialLayout = {
    columns: initialState.columns,
    colIndex: initialColIndex,
    cardIndex: selectedCard ? 0 : -1,
    isAtCardLevel: selectedCard != null,
  }

  const initialSelectedNode = selectedCard?.node ?? selectedCol?.node ?? null

  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator: registry,
    cursorStore: createCursorStore({
      cursorNodeId: initialCursorNodeId,
      colIndex: initialColIndex,
      cardIndex: selectedCard ? 0 : -1,
      selectionLevel: initialSelectionLevel,
    }),
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
    navigator: registry,
  })
  const result = render(
    React.createElement(
      StoreContext.Provider,
      { value: store as StoreApi<unknown> },
      React.createElement(RepoProvider, { repo, children: boardElement }),
    ),
    { incremental: options?.incremental ?? true },
  )

  // Override press to route through handleKey (same path as driver/production)
  const originalPress = result.press.bind(result)
  const pressKey = (key: string) => {
    const ansi = keyToAnsi(key)
    const [input, parsedKey] = parseKey(ansi)
    act(() => {
      handleKey({ input, key: parsedKey }, { get: store.getState, set: store.setState }, () => {})
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
  }

  // Create fluent API with disposable pattern
  const board = {
    /** Whether bell was triggered (boundary hit) */
    get bell(): boolean {
      return result.locator("[data-bell]").count() > 0
    },
    press: (key: string) => {
      pressKey(key)
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
    screenshot: () => {
      return result.text
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
    // Disposable pattern for automatic cleanup
    [Symbol.dispose]: () => {
      result.unmount()
    },
  }
  return { board, registry, toastQueue }
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
// Types
// =============================================================================

interface BoardTestOptions {
  columns?: number
  rows?: number
}

interface CursorPosition {
  col?: number
  card?: number
}

/**
 * Content assertion builder - returned by expect(text)
 */
interface ContentAssertion {
  /** Assert the text is visible in the rendered output */
  toBeVisible(): BoardTest
  /** Assert the text is in a specific column */
  inColumn(title: string): BoardTest
  /** Assert this element is positioned left of another */
  toBeLeftOf(testId: string): BoardTest
  /** Assert this element is positioned right of another */
  toBeRightOf(testId: string): BoardTest
  /** Assert this element is positioned above another */
  toBeAbove(testId: string): BoardTest
  /** Assert this element is positioned below another */
  toBeBelow(testId: string): BoardTest
}

/**
 * Main board test interface - fluent API for testing board navigation
 */
interface BoardTest {
  // === Actions ===

  /** Send a key press to the board. Throws if no effect AND no bell (broken chain). */
  press(key: string): this

  // === Bell State ===

  /** Whether bell was triggered on last action (boundary hit) */
  readonly bell: boolean

  /** Send multiple key presses */
  pressSequence(...keys: string[]): this

  /** Type text input */
  type(text: string): this

  /** Navigate cursor to a specific position (via multiple key presses) */
  moveTo(pos: CursorPosition): this

  // === Cursor Assertions ===

  /** Assert cursor is at a specific column/card position */
  expectCursor(pos: CursorPosition): this

  /** Assert a specific text is selected (has cursor) */
  expectSelected(text: string): this

  // === Content Assertions ===

  /** Start a content assertion chain */
  expect(text: string): ContentAssertion

  /** Assert number of columns */
  expectColumnCount(n: number): this

  /** Assert text is visible in the output */
  expectVisible(text: string): this

  /** Assert text is NOT visible in the output */
  expectNotVisible(text: string): this

  // === Position Assertions ===

  /** Assert element A is positioned left of element B (by testID) */
  expectLeftOf(a: string, b: string): this

  /** Assert element A is positioned right of element B (by testID) */
  expectRightOf(a: string, b: string): this

  /** Assert element A is positioned above element B (by testID) */
  expectAbove(a: string, b: string): this

  /** Assert element A is positioned below element B (by testID) */
  expectBelow(a: string, b: string): this

  // === Debug ===

  /** Get the current frame as plain text (for debugging) */
  screenshot(): string

  /** Get the current frame with ANSI codes */
  screenshotAnsi(): string

  /** Get the inkx locator for advanced queries (auto-refreshing) */
  locator(): AutoLocator

  /** Get the underlying render result for advanced use */
  renderResult(): App

  // === Status Bar Locators ===

  /** Get the view mode text (e.g., "CARDS VIEW", "COLUMNS VIEW") */
  getViewMode(): string

  /** Get the storage mode text (e.g., "MEM", "DISK") */
  getStorageMode(): string

  /** Get the repo path text */
  getRepoPath(): string

  /** Get the node count from the bottom bar */
  getNodeCount(): string

  /** Get the watcher status text if visible */
  getWatcherStatus(): string | null

  /** Get the column position text if visible (e.g., "col 1/3") */
  getColumnPosition(): string | null
}

// =============================================================================
// Implementation
// =============================================================================

class BoardTestImpl implements BoardTest {
  private result: App

  constructor(result: App) {
    this.result = result
  }

  // --- Bell State ---

  /** Whether bell was triggered (boundary hit) - checks for data-bell attribute */
  get bell(): boolean {
    return this.result.locator("[data-bell]").count() > 0
  }

  // --- Status Message (in BottomBar) ---

  /** Get current status message if visible, or null if no status */
  getStatus(): { level: string; message: string } | null {
    const bottomBar = this.result.locator("#bottom-bar")
    if (bottomBar.count() === 0) {
      return null
    }
    const level = bottomBar.getAttribute("data-status")
    if (!level) {
      return null
    }
    // Status message is in #status-message element within bottom bar
    const statusEl = this.result.locator("#status-message")
    if (statusEl.count() === 0) {
      return null
    }
    const text = statusEl.textContent()
    // Text format: "icon message" - extract message after first space
    const spaceIndex = text.indexOf(" ")
    const message = spaceIndex >= 0 ? text.slice(spaceIndex + 1).trim() : text
    return level && message ? { level, message } : null
  }

  /** Check if status message is showing */
  get hasStatus(): boolean {
    const bottomBar = this.result.locator("#bottom-bar")
    return bottomBar.count() > 0 && !!bottomBar.getAttribute("data-status")
  }

  // --- Actions ---

  press(key: string): this {
    // Fire-and-forget - app.press() is async but we don't need to await
    // because React state updates happen synchronously in the test renderer
    void this.result.press(key)
    // AutoLocator auto-refreshes on each access - no manual refresh needed
    return this
  }

  pressSequence(...keys: string[]): this {
    for (const key of keys) {
      this.press(key)
    }
    return this
  }

  type(text: string): this {
    for (const char of text) {
      void this.result.press(char)
    }
    // AutoLocator auto-refreshes on each access - no manual refresh needed
    return this
  }

  moveTo(pos: CursorPosition): this {
    // Simple movement - press h/l for columns, j/k for cards
    // This is a convenience method; tests can also use press() directly
    // NOTE: This assumes starting from origin - for complex navigation, use press()
    if (pos.col !== undefined) {
      for (let i = 0; i < pos.col; i++) {
        this.press("l")
      }
    }
    if (pos.card !== undefined) {
      for (let i = 0; i < pos.card; i++) {
        this.press("j")
      }
    }
    return this
  }

  // --- Cursor Assertions ---

  expectCursor(pos: CursorPosition): this {
    // Find the cursor element by testID
    const cursor = this.result.getByTestId("cursor")
    const cursorBox = cursor.boundingBox()

    expect(cursorBox).not.toBeNull()

    if (pos.col !== undefined) {
      // Find the target column and compare X positions
      const column = this.result.getByTestId(`column-${pos.col}`)
      const colBox = column.boundingBox()
      expect(colBox).not.toBeNull()

      // Cursor should be within the column's X range
      if (cursorBox && colBox) {
        expect(cursorBox.x).toBeGreaterThanOrEqual(colBox.x)
        expect(cursorBox.x).toBeLessThan(colBox.x + colBox.width)
      }
    }

    if (pos.card !== undefined) {
      // Find the card at the expected index within the current column
      // This requires the card to have a testID like "card-{colIndex}-{cardIndex}"
      const card = this.result.getByTestId(`card-${pos.col ?? 0}-${pos.card}`)
      const cardBox = card.boundingBox()

      if (cardBox && cursorBox) {
        // Cursor Y should overlap with card Y
        expect(cursorBox.y).toBeGreaterThanOrEqual(cardBox.y)
        expect(cursorBox.y).toBeLessThan(cardBox.y + cardBox.height)
      }
    }

    return this
  }

  expectSelected(text: string): this {
    // Find text and check if it has selection styling
    const element = this.result.getByText(text)
    expect(element.count()).toBeGreaterThan(0)

    // Check if parent has selection attribute
    const selected = this.result.locator('[data-selected="true"]')
    const selectedTexts = selected.resolveAll().map((node) => {
      // Get text content recursively
      const getTextContent = (n: typeof node): string => {
        if (n.textContent !== undefined) return n.textContent
        return n.children.map(getTextContent).join("")
      }
      return getTextContent(node)
    })

    expect(selectedTexts.some((t) => t.includes(text))).toBe(true)
    return this
  }

  // --- Content Assertions ---

  expect(text: string): ContentAssertion {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- needed to reference BoardTest in returned object
    const self = this
    const element = this.result.getByText(text)

    return {
      toBeVisible(): BoardTest {
        expect(element.count()).toBeGreaterThan(0)
        expect(element.isVisible()).toBe(true)
        return self
      },

      inColumn(title: string): BoardTest {
        // Find the column by its title text
        const column = self.result.getByText(title)
        expect(column.count()).toBeGreaterThan(0)

        const colBox = column.boundingBox()
        const textBox = element.boundingBox()

        expect(colBox).not.toBeNull()
        expect(textBox).not.toBeNull()

        if (colBox && textBox) {
          // Text should be within the column's X range
          expect(textBox.x).toBeGreaterThanOrEqual(colBox.x)
        }

        return self
      },

      toBeLeftOf(testId: string): BoardTest {
        const other = self.result.getByTestId(testId)
        const textBox = element.boundingBox()
        const otherBox = other.boundingBox()

        expect(textBox).not.toBeNull()
        expect(otherBox).not.toBeNull()

        if (textBox && otherBox) {
          expect(textBox.x + textBox.width).toBeLessThanOrEqual(otherBox.x)
        }

        return self
      },

      toBeRightOf(testId: string): BoardTest {
        const other = self.result.getByTestId(testId)
        const textBox = element.boundingBox()
        const otherBox = other.boundingBox()

        expect(textBox).not.toBeNull()
        expect(otherBox).not.toBeNull()

        if (textBox && otherBox) {
          expect(textBox.x).toBeGreaterThanOrEqual(otherBox.x + otherBox.width)
        }

        return self
      },

      toBeAbove(testId: string): BoardTest {
        const other = self.result.getByTestId(testId)
        const textBox = element.boundingBox()
        const otherBox = other.boundingBox()

        expect(textBox).not.toBeNull()
        expect(otherBox).not.toBeNull()

        if (textBox && otherBox) {
          expect(textBox.y + textBox.height).toBeLessThanOrEqual(otherBox.y)
        }

        return self
      },

      toBeBelow(testId: string): BoardTest {
        const other = self.result.getByTestId(testId)
        const textBox = element.boundingBox()
        const otherBox = other.boundingBox()

        expect(textBox).not.toBeNull()
        expect(otherBox).not.toBeNull()

        if (textBox && otherBox) {
          expect(textBox.y).toBeGreaterThanOrEqual(otherBox.y + otherBox.height)
        }

        return self
      },
    }
  }

  expectColumnCount(n: number): this {
    // Count columns by testID pattern
    let count = 0
    for (let i = 0; i < 20; i++) {
      // reasonable max
      const col = this.result.getByTestId(`column-${i}`)
      if (col.count() > 0) {
        count++
      } else {
        break
      }
    }
    expect(count).toBe(n)
    return this
  }

  expectVisible(text: string): this {
    const frame = this.result.text
    expect(frame).toContain(text)
    return this
  }

  expectNotVisible(text: string): this {
    const frame = this.result.text
    expect(frame).not.toContain(text)
    return this
  }

  // --- Position Assertions ---

  expectLeftOf(a: string, b: string): this {
    const aEl = this.result.getByTestId(a)
    const bEl = this.result.getByTestId(b)

    const aBox = aEl.boundingBox()
    const bBox = bEl.boundingBox()

    expect(aBox).not.toBeNull()
    expect(bBox).not.toBeNull()

    if (aBox && bBox) {
      expect(aBox.x + aBox.width).toBeLessThanOrEqual(bBox.x)
    }

    return this
  }

  expectRightOf(a: string, b: string): this {
    const aEl = this.result.getByTestId(a)
    const bEl = this.result.getByTestId(b)

    const aBox = aEl.boundingBox()
    const bBox = bEl.boundingBox()

    expect(aBox).not.toBeNull()
    expect(bBox).not.toBeNull()

    if (aBox && bBox) {
      expect(aBox.x).toBeGreaterThanOrEqual(bBox.x + bBox.width)
    }

    return this
  }

  expectAbove(a: string, b: string): this {
    const aEl = this.result.getByTestId(a)
    const bEl = this.result.getByTestId(b)

    const aBox = aEl.boundingBox()
    const bBox = bEl.boundingBox()

    expect(aBox).not.toBeNull()
    expect(bBox).not.toBeNull()

    if (aBox && bBox) {
      expect(aBox.y + aBox.height).toBeLessThanOrEqual(bBox.y)
    }

    return this
  }

  expectBelow(a: string, b: string): this {
    const aEl = this.result.getByTestId(a)
    const bEl = this.result.getByTestId(b)

    const aBox = aEl.boundingBox()
    const bBox = bEl.boundingBox()

    expect(aBox).not.toBeNull()
    expect(bBox).not.toBeNull()

    if (aBox && bBox) {
      expect(aBox.y).toBeGreaterThanOrEqual(bBox.y + bBox.height)
    }

    return this
  }

  // --- Debug ---

  screenshot(): string {
    return this.result.text
  }

  /** Get ANSI-colored output for visual debugging, vs screenshot() which returns plain text via app.text */
  screenshotAnsi(): string {
    return this.result.ansi
  }

  locator(): AutoLocator {
    return this.result.locator("*")
  }

  renderResult(): App {
    return this.result
  }

  // --- Status Bar Locators ---

  private getTextContent(selector: string): string {
    const el = this.result.locator(selector)
    const nodes = el.resolveAll()
    if (nodes.length === 0) return ""
    const node = nodes[0]
    if (!node) return ""
    return node.textContent ?? ""
  }

  getViewMode(): string {
    return this.getTextContent("#view-mode")
  }

  getStorageMode(): string {
    return this.getTextContent("#storage-mode")
  }

  getRepoPath(): string {
    return this.getTextContent("#repo-path")
  }

  getNodeCount(): string {
    return this.getTextContent("#node-count")
  }

  getWatcherStatus(): string | null {
    const el = this.result.locator("#watcher-status")
    return el.count() > 0 ? this.getTextContent("#watcher-status") : null
  }

  getColumnPosition(): string | null {
    const el = this.result.locator("#column-position")
    return el.count() > 0 ? this.getTextContent("#column-position") : null
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Render a board with the given state and return a test helper
 */
export function renderBoard(state: TUIBoardState, options: BoardTestOptions = {}): BoardTest {
  const { columns = 80, rows = 24 } = options

  // Create a fake repo for static rendering tests
  const repo = createFakeRepo()

  const render = createRenderer({ cols: columns, rows })
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
    ui: createInitialUIState("cards", [], { columns, rows }),
    derivedSelectionLevel: "card",
    dimensions: { columns, rows },
    navigator: createGridNavigator(),
    setUI: () => {},
    dialogHandlers: {
      handleProjectSelect: () => {},
      handleProjectCancel: () => {},
      handleNewItemCreate: () => {},
      handleNewItemCancel: () => {},
      handleSearchSelect: () => {},
      handleSearchCancel: () => {},
    },
    collapsedNodes: new Set<string>(),
    moveMode: false,
  })
  // Wrap in StoreContext + TreeRenderProvider so TreeNode's hooks work
  const initialUI = createInitialUIState("cards", [], { columns, rows })
  const store = createStore(() => ({
    foldedNodes: new Set<string>(),
    ui: initialUI,
    navigator: null,
    setUI: () => {},
  }))
  const treeConfig = deriveTreeConfig(initialUI)
  const wrappedElement = React.createElement(
    TreeRenderProvider,
    { treeConfig, setUI: () => {}, rootBoardId: null },
    boardCoreElement,
  )
  const result = render(
    React.createElement(
      StoreContext.Provider,
      { value: store as StoreApi<unknown> },
      React.createElement(RepoProvider, { repo, children: wrappedElement }),
    ),
  )

  return new BoardTestImpl(result)
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

  const { cursorNodeId: initialCursorNodeId, colIndex: initialColIndex, selectedCard, selectedCol, selectionLevel: initialSelectionLevel } = computeInitialCursor(initialState)

  const initialLayout = {
    columns: initialState.columns,
    colIndex: initialColIndex,
    cardIndex: selectedCard ? 0 : -1,
    isAtCardLevel: selectedCard != null,
  }

  const initialSelectedNode = selectedCard?.node ?? selectedCol?.node ?? null

  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator: registry,
    cursorStore: createCursorStore({
      cursorNodeId: initialCursorNodeId,
      colIndex: initialColIndex,
      cardIndex: selectedCard ? 0 : -1,
      selectionLevel: initialSelectionLevel,
    }),
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

  const renderFn = options.render ?? createRenderer({ cols: columns, rows })
  const boardElement = React.createElement(Board, {
    initialState,
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
      return createCardState({ content: card, parent_idx: idx })
    }
    const children = (card.children ?? []).map((childContent, childIdx) => ({
      id: `child-${idx}-${childIdx}`,
      type: "li" as const,
      list_marker: "-" as const,
      parent_id: `card-${idx}`,
      parent_idx: childIdx,
      content: childContent,
      data: {},
      link_to: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }))
    return createCardState({ content: card.title, parent_idx: idx }, children)
  })

  return createColumnState({ content: title }, cardStates)
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
export function board(config: { columns: ReturnType<typeof column>[] }): TUIBoardState {
  // Note: colIndex/cardIndex are now in ColumnsLayout, not TUIBoardState
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

/**
 * Board with nested sections
 */
const NESTED_BOARD = board({
  columns: [
    column("Project", [
      { title: "Phase 1", children: ["Design", "Build"] },
      { title: "Phase 2", children: ["Test", "Deploy"] },
    ]),
  ],
})

/**
 * Board with many items for scroll testing
 */
const LONG_BOARD = board({
  columns: [
    column(
      "Tasks",
      Array.from({ length: 20 }, (_, i) => `Task ${i + 1}`),
    ),
  ],
})

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { BoardTest, BoardTestOptions }

// =============================================================================
// Layout Helpers
// =============================================================================

/** Test helper: compute card head midpoint Y */
export function getCardMidY(layout: { headY?: number; headHeight?: number; y: number; cardHeight?: number; height?: number }): number {
  if (layout.headY !== undefined && layout.headHeight !== undefined) {
    return layout.headY + layout.headHeight / 2
  }
  const h = layout.cardHeight ?? layout.height ?? 0
  return layout.y + h / 2
}

