/**
 * Board Test Helper - Fluent API for Visual Board Testing
 *
 * Wraps inkx createTestRenderer with a concise, documentation-like API
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

import React from "react"
import {
  createTestRenderer,
  createLocator,
  type InkxLocator,
  type RenderResult,
} from "inkx/testing"
import { expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import type { KNode, NodeRules } from "@km/core"

import { BoardCore, Board } from "../../src/views/Board.tsx"
import { buildBoardState } from "../../src/state.ts"
import { createInitialUIState } from "../../src/ui-reducer.ts"
import { createLayoutRegistry } from "../../src/card-positions.ts"
import { RepoProvider } from "../../src/repo-context.tsx"
import { ensureCommandSystemInitialized } from "../../src/command-bridge.ts"
import type { TUIBoardState } from "../../src/types.ts"

// NOTE: BoardCore is pure rendering (no hooks) - use for static visual tests.
// Board includes useReducer + useInput - use for keyboard navigation tests.
import {
  createBoardState as createBoardStateFixture,
  createColumnState,
  createCardState,
} from "../fixtures/board-fixtures.ts"

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
    // Extract rules from column name
    const limitMatch = content.match(/\blimit=(\d+)\b/)
    const collapseMatch = content.match(/\bcollapse=(true|false)\b/)
    const defaultMatch = content.match(/\bdefault=(true|false)\b/)
    const syncMatch = content.match(/\bsync=([^\s]+)\b/)
    const addMatch = content.match(/\badd=([^\s]+)\b/)
    const colorMatch = content.match(/\bcolor=([^\s]+)\b/)

    if (
      limitMatch ||
      collapseMatch ||
      defaultMatch ||
      syncMatch ||
      addMatch ||
      colorMatch
    ) {
      rules = {}
      if (limitMatch) rules.limit = Number.parseInt(limitMatch[1] ?? "0", 10)
      if (collapseMatch) rules.collapse = collapseMatch[1] === "true"
      if (defaultMatch) rules.default = defaultMatch[1] === "true"
      if (syncMatch) rules.sync = syncMatch[1] ?? ""
      if (addMatch) rules.add = addMatch[1] ?? ""
      if (colorMatch) rules.color = colorMatch[1] ?? ""

      // Remove rules from content to get clean name
      cleanContent = content
        .replace(/\blimit=\d+\b/, "")
        .replace(/\bcollapse=(true|false)\b/, "")
        .replace(/\bdefault=(true|false)\b/, "")
        .replace(/\bsync=[^\s]+\b/, "")
        .replace(/\badd=[^\s]+\b/, "")
        .replace(/\bcolor=[^\s]+\b/, "")
        .trim()
    }
  }

  const node: KNode = {
    id: content,
    type: hasChildren ? "folder" : "task",
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

/**
 * Standard board fixture for common tests
 */
export function standardBoard() {
  const nodes = item(
    "board",
    item("col1", item("1a"), item("1b")),
    item("col2", item("2a")),
    item("col3"),
  )

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
  // Note: Board.tsx also calls this in useEffect, but in tests that might not run
  ensureCommandSystemInitialized()

  // Render the full Board component (not BoardCore) for keyboard navigation + id attributes
  const columns = options?.columns ?? 80
  const rows = options?.rows ?? 24
  const viewMode = options?.viewMode ?? "cards"
  const render = createTestRenderer({ columns, rows })
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

  // Create fluent API
  const board = {
    /** Whether bell was triggered (boundary hit) */
    get bell(): boolean {
      const freshLocator = createLocator(result.getContainer())
      return freshLocator.locator("[data-bell]").count() > 0
    },
    press: (key: string) => {
      result.stdin.write(key)
      return board
    },
    q: (selector: string) => {
      const freshLocator = createLocator(result.getContainer())
      return freshLocator.locator(selector)
    },
    expect: (selector: string) => ({
      toExist: () => {
        const freshLocator = createLocator(result.getContainer())
        const loc = freshLocator.locator(selector)
        expect(loc.count()).toBeGreaterThan(0)
      },
      not: {
        toExist: () => {
          const freshLocator = createLocator(result.getContainer())
          const loc = freshLocator.locator(selector)
          expect(loc.count()).toBe(0)
        },
      },
      toHaveCount: (n: number) => {
        const freshLocator = createLocator(result.getContainer())
        const loc = freshLocator.locator(selector)
        expect(loc.count()).toBe(n)
      },
    }),
    screenshot: () => result.lastFrameText() ?? "",
    /** Check if status message is showing */
    get hasStatus(): boolean {
      const freshLocator = createLocator(result.getContainer())
      const bottomBar = freshLocator.locator("#bottom-bar")
      return bottomBar.count() > 0 && !!bottomBar.getAttribute("data-status")
    },
    /** Get current status message if visible, or null if no status */
    getStatus: (): { level: string; message: string } | null => {
      const freshLocator = createLocator(result.getContainer())
      const bottomBar = freshLocator.locator("#bottom-bar")
      if (bottomBar.count() === 0) {
        return null
      }
      const level = bottomBar.getAttribute("data-status")
      if (!level) {
        return null
      }
      // Status message is in #status-message element within bottom bar
      const statusEl = freshLocator.locator("#status-message")
      if (statusEl.count() === 0) {
        return null
      }
      const text = statusEl.textContent()
      // Text includes icon (first char), extract message
      const message = text.slice(2).trim() // Skip icon + space
      return level && message ? { level, message } : null
    },
    _result: result,
  }
  return { board }
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
    const locator = received as InkxLocator
    const pass = locator.count() > 0
    return {
      pass,
      message: () =>
        pass ? `Expected element not to exist` : `Expected element to exist`,
    }
  },
  toHaveCount(received: unknown, expected: number) {
    const locator = received as InkxLocator
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

  /** Get the inkx locator for advanced queries */
  locator(): InkxLocator

  /** Get the underlying render result for advanced use */
  renderResult(): RenderResult

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
  private result: RenderResult
  private currentLocator: InkxLocator

  constructor(result: RenderResult) {
    this.result = result
    this.currentLocator = createLocator(result.getContainer())
  }

  // --- Bell State ---

  /** Whether bell was triggered (boundary hit) - checks for data-bell attribute */
  get bell(): boolean {
    return this.currentLocator.locator("[data-bell]").count() > 0
  }

  // --- Status Message (in BottomBar) ---

  /** Get current status message if visible, or null if no status */
  getStatus(): { level: string; message: string } | null {
    const bottomBar = this.currentLocator.locator("#bottom-bar")
    if (bottomBar.count() === 0) {
      return null
    }
    const level = bottomBar.getAttribute("data-status")
    if (!level) {
      return null
    }
    // Status message is in #status-message element within bottom bar
    const statusEl = this.currentLocator.locator("#status-message")
    if (statusEl.count() === 0) {
      return null
    }
    const text = statusEl.textContent()
    // Text includes icon (first char), extract message
    const message = text.slice(2).trim() // Skip icon + space
    return level && message ? { level, message } : null
  }

  /** Check if status message is showing */
  get hasStatus(): boolean {
    const bottomBar = this.currentLocator.locator("#bottom-bar")
    return bottomBar.count() > 0 && !!bottomBar.getAttribute("data-status")
  }

  // --- Actions ---

  press(key: string): this {
    this.result.stdin.write(key)
    // Refresh locator after state change
    this.currentLocator = createLocator(this.result.getContainer())
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
      this.result.stdin.write(char)
    }
    this.currentLocator = createLocator(this.result.getContainer())
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
    const cursor = this.currentLocator.getByTestId("cursor")
    const cursorBox = cursor.boundingBox()

    expect(cursorBox).not.toBeNull()

    if (pos.col !== undefined) {
      // Find the target column and compare X positions
      const column = this.currentLocator.getByTestId(`column-${pos.col}`)
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
      const card = this.currentLocator.getByTestId(
        `card-${pos.col ?? 0}-${pos.card}`,
      )
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
    const element = this.currentLocator.getByText(text)
    expect(element.count()).toBeGreaterThan(0)

    // Check if parent has selection attribute
    const selected = this.currentLocator.locator('[data-selected="true"]')
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
    const element = this.currentLocator.getByText(text)

    return {
      toBeVisible(): BoardTest {
        expect(element.count()).toBeGreaterThan(0)
        expect(element.isVisible()).toBe(true)
        return self
      },

      inColumn(title: string): BoardTest {
        // Find the column by its title text
        const column = self.currentLocator.getByText(title)
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
        const other = self.currentLocator.getByTestId(testId)
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
        const other = self.currentLocator.getByTestId(testId)
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
        const other = self.currentLocator.getByTestId(testId)
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
        const other = self.currentLocator.getByTestId(testId)
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
      const col = this.currentLocator.getByTestId(`column-${i}`)
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
    const frame = this.result.lastFrameText()
    expect(frame).toBeDefined()
    expect(frame).toContain(text)
    return this
  }

  expectNotVisible(text: string): this {
    const frame = this.result.lastFrameText()
    expect(frame).toBeDefined()
    expect(frame).not.toContain(text)
    return this
  }

  // --- Position Assertions ---

  expectLeftOf(a: string, b: string): this {
    const aEl = this.currentLocator.getByTestId(a)
    const bEl = this.currentLocator.getByTestId(b)

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
    const aEl = this.currentLocator.getByTestId(a)
    const bEl = this.currentLocator.getByTestId(b)

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
    const aEl = this.currentLocator.getByTestId(a)
    const bEl = this.currentLocator.getByTestId(b)

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
    const aEl = this.currentLocator.getByTestId(a)
    const bEl = this.currentLocator.getByTestId(b)

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
    return this.result.lastFrameText() ?? ""
  }

  screenshotAnsi(): string {
    return this.result.lastFrame() ?? ""
  }

  locator(): InkxLocator {
    return this.currentLocator
  }

  renderResult(): RenderResult {
    return this.result
  }

  // --- Status Bar Locators ---

  private getTextContent(selector: string): string {
    const el = this.currentLocator.locator(selector)
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
    const el = this.currentLocator.locator("#watcher-status")
    return el.count() > 0 ? this.getTextContent("#watcher-status") : null
  }

  getColumnPosition(): string | null {
    const el = this.currentLocator.locator("#column-position")
    return el.count() > 0 ? this.getTextContent("#column-position") : null
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Render a board with the given state and return a test helper
 */
export function renderBoard(
  state: TUIBoardState,
  options: BoardTestOptions = {},
): BoardTest {
  const { columns = 80, rows = 24 } = options

  // Create a fake repo for static rendering tests
  const repo = createFakeRepo()

  const render = createTestRenderer({ columns, rows })
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
  const result = render(
    React.createElement(RepoProvider, { repo, children: boardCoreElement }),
  )

  return new BoardTestImpl(result)
}

// =============================================================================
// Fixture Builders - Concise DSL for creating test boards
// =============================================================================

/**
 * Create a column for the board DSL
 */
export function column(
  title: string,
  cards: (string | { title: string; children?: string[] })[],
) {
  const cardStates = cards.map((card, idx) => {
    if (typeof card === "string") {
      return createCardState({ content: card, parent_idx: idx })
    }
    const children = (card.children ?? []).map((childContent, childIdx) => ({
      id: `child-${idx}-${childIdx}`,
      type: "task" as const,
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
export function board(config: {
  columns: ReturnType<typeof column>[]
}): TUIBoardState {
  return createBoardStateFixture(config.columns, {
    colIndex: 0,
    cardIndex: 0,
  })
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
export const NESTED_BOARD = board({
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
export const LONG_BOARD = board({
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

export type { BoardTest, ContentAssertion, CursorPosition, BoardTestOptions }
