/**
 * board.app() - Ergonomic TUI Testing API
 *
 * Super-fast setup for debugging and testing. One line to get started.
 * Invariants run automatically after every action.
 *
 * @example
 * ```typescript
 * import { board } from '@km/tui/test'
 *
 * // One line setup
 * const app = board.app(["Inbox > Task 1", "Projects > Alpha"])
 *
 * // Simple API - invariants checked automatically!
 * app.press("j")
 * app.search("query")
 *
 * // Assertions
 * expect(app.text).toContain("Task 1")
 * app.shouldHave({ cursorOn: "Task 1" })
 * ```
 */

import { runGenerator } from "@km/core"
import type { KNode } from "@km/core"
import type { Repo } from "@km/storage"
import { createFakeRepo, createRepo } from "@km/storage"
import { expect } from "vitest"
import { type BoardDriver, createBoardDriver, type TUIDriverState } from "../../src/driver.ts"
import { item } from "./board-test.ts"

// =============================================================================
// Types
// =============================================================================

export type BoardAppInput =
  | string // Vault path
  | string[] // String DSL: ["col > task1", "col > task2"]
  | KNode[] // item() tree

export interface BoardAppOptions {
  viewMode?: "cards" | "list" | "columns" | "tabs"
  columns?: number
  rows?: number
  /** Custom invariants to run after every action */
  invariants?: Invariant[]
  /** Disable automatic invariant checking */
  noCheck?: boolean
}

/** Invariant = function that throws if check fails */
export type Invariant = (app: BoardApp) => void

/** Bounding box for spatial checks */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/** Info about an element for spatial checks */
export interface ElementInfo {
  exists: boolean
  text: string
  box: BoundingBox | null
  hasCursor: boolean
}

/** Info about a column */
export interface ColumnInfo {
  index: number
  id: string
  title: string
  box: BoundingBox | null
  cardCount: number
  hasCursor: boolean
}

/** Info about a card */
export interface CardInfo {
  index: number
  id: string
  text: string
  column: number
  box: BoundingBox | null
  hasCursor: boolean
}

// =============================================================================
// Invariants - Just functions with expects
// =============================================================================

/** Screen has content and no error strings */
export const rendering: Invariant = (app) => {
  expect(app.text.length, "Screen is empty").toBeGreaterThan(0)
  expect(app.text, "Screen contains [object Object]").not.toContain("[object Object]")
  expect(app.text, "Screen contains TypeError").not.toContain("TypeError:")
  expect(app.text, "Screen contains ReferenceError").not.toContain("ReferenceError:")
}

/** Cursor exists and is valid (unless in dialog) */
export const cursor: Invariant = (app) => {
  const inDialog = app.dialogs.search || app.dialogs.help || app.dialogs.newItem || app.dialogs.itemPicker
  if (inDialog) return

  expect(app.cursor, "Cursor missing").toBeDefined()
  if (app.cursor.level !== "board") {
    expect(app.cursor.col, "Invalid cursor.col").toBeGreaterThanOrEqual(0)
  }
}

/** Selected node exists in repo */
export const selection: Invariant = (app) => {
  if (!app.nodeId) return
  const node = app.repo.getNode(app.nodeId)
  expect(node, `Selected node "${app.nodeId}" not in repo`).toBeDefined()
}

/** Cursor node is visible on screen */
export const cursorVisible: Invariant = (app) => {
  if (!app.nodeId) return
  // Skip when in dialog — dialogs may overlay the cursor
  const inDialog = app.dialogs.search || app.dialogs.help || app.dialogs.newItem || app.dialogs.itemPicker
  if (inDialog) return
  const node = app.repo.getNode(app.nodeId)
  if (!node) return
  const name = node.name ?? node.content ?? ""
  if (!name) return
  expect(app.text, `Cursor node "${name}" (${app.nodeId}) not visible on screen`).toContain(name)
}

/** All parent links are valid */
export const parentLinks: Invariant = (app) => {
  for (const node of app.repo.data.getAllNodes()) {
    if (node.parent_id) {
      expect(app.repo.getNode(node.parent_id), `Parent "${node.parent_id}" missing for "${node.id}"`).toBeDefined()
    }
  }
}

/** All symlink_to references are valid */
export const nodeLinks: Invariant = (app) => {
  for (const node of app.repo.data.getAllNodes()) {
    const embedSrc = node.symlink_to
    if (embedSrc) {
      expect(app.repo.getNode(embedSrc), `Embed source "${embedSrc}" missing for "${node.id}"`).toBeDefined()
    }
  }
}

/** Layout indices are within bounds */
export const layout: Invariant = (app) => {
  const state = app.state
  if (!state.columnIds || state.columnIds.length === 0) return

  // Skip board-level checks
  if (state.cursor?.level === "board") return

  expect(state.colIndex, "Column index negative").toBeGreaterThanOrEqual(0)
  expect(state.colIndex, "Column index out of bounds").toBeLessThan(state.columnIds.length)
}

/** Default invariants - call manually with board.check() */
export const defaultInvariants: Invariant[] = [rendering, cursor, selection, cursorVisible]

/** All invariants - the mother of all checks */
export const allInvariants: Invariant[] = [rendering, cursor, selection, cursorVisible, parentLinks, nodeLinks, layout]

// =============================================================================
// The App Interface
// =============================================================================

export interface BoardApp {
  // State
  readonly text: string
  readonly cursor: TUIDriverState["cursor"]
  readonly nodeId: string | null
  readonly viewMode: string | null
  readonly dialogs: TUIDriverState["dialogs"]
  readonly state: TUIDriverState

  // Actions (invariants run automatically after each)
  press(key: string): BoardApp
  type(text: string): BoardApp
  search(query: string): BoardApp
  sequence(...keys: string[]): BoardApp

  // Spatial helpers - AI can "see" the board
  at(selector: string): ElementInfo
  columns(): ColumnInfo[]
  cards(): CardInfo[]

  // Manual invariant check
  check(...invariants: Invariant[]): BoardApp

  // Fluent assertions
  shouldHave(e: { cursor?: string; cursorOn?: string; viewMode?: string; text?: string | string[] }): BoardApp
  shouldNotHave(e: { text?: string | string[] }): BoardApp

  // Underlying
  readonly driver: BoardDriver
  readonly repo: Repo
}

// =============================================================================
// Implementation
// =============================================================================

function createBoardApp(driver: BoardDriver, repo: Repo, invariants: Invariant[]): BoardApp {
  const runInvariants = () => {
    for (const inv of invariants) {
      inv(app)
    }
  }

  const app: BoardApp = {
    get text() {
      return driver.getState().screen
    },
    get cursor() {
      return driver.getState().cursor
    },
    get nodeId() {
      return driver.getState().selectedNodeId
    },
    get viewMode() {
      return driver.getState().viewMode
    },
    get dialogs() {
      return driver.getState().dialogs
    },
    get state() {
      return driver.getState()
    },

    press(key) {
      driver.press(key)
      runInvariants()
      return app
    },
    type(text) {
      for (const c of text) driver.press(c)
      runInvariants()
      return app
    },
    search(query) {
      driver.press("cmd+f")
      for (const c of query) driver.press(c)
      driver.press("Enter")
      runInvariants()
      return app
    },
    sequence(...keys) {
      for (const k of keys) driver.press(k)
      runInvariants()
      return app
    },

    at(selector) {
      const loc = driver.app.locator(selector)
      const exists = loc.count() > 0
      const box = exists ? loc.boundingBox() : null
      const hasCursor = exists && loc.locator("[data-cursor]").count() > 0
      return {
        exists,
        text: exists ? loc.textContent() : "",
        box,
        hasCursor,
      }
    },

    columns() {
      const state = driver.getState()
      if (!state.columnIds || state.columnIds.length === 0) return []
      return state.columnIds.map((colId, index) => {
        const loc = driver.app.locator(`#${colId}`)
        const colNode = repo.getNode(colId)
        const title = colNode?.name ?? (colNode?.data?.name as string | undefined) ?? colId
        // Count cards in this column from nodeIndex
        let cardCount = 0
        for (const entry of state.nodeIndex.values()) {
          if (entry.colIndex === index && entry.cardIndex >= 0) cardCount++
        }
        return {
          index,
          id: colId,
          title,
          box: loc.count() > 0 ? loc.boundingBox() : null,
          cardCount,
          hasCursor: state.cursor?.col === index,
        }
      })
    },

    cards() {
      const state = driver.getState()
      if (!state.columnIds || state.columnIds.length === 0) return []
      const result: CardInfo[] = []
      state.columnIds.forEach((colId, colIndex) => {
        // Get card IDs from nodeIndex entries for this column
        const cardIds: string[] = []
        for (const [id, entry] of state.nodeIndex) {
          if (entry.colIndex === colIndex && entry.cardIndex >= 0) {
            cardIds.push(id)
          }
        }
        cardIds.sort((a, b) => (state.nodeIndex.get(a)?.cardIndex ?? 0) - (state.nodeIndex.get(b)?.cardIndex ?? 0))
        cardIds.forEach((cardId, cardIndex) => {
          const card = repo.getNode(cardId)
          const loc = driver.app.locator(`#${cardId}`)
          const text = card?.content ?? card?.name ?? (card?.data?.name as string | undefined) ?? cardId
          result.push({
            index: cardIndex,
            id: cardId,
            text,
            column: colIndex,
            box: loc.count() > 0 ? loc.boundingBox() : null,
            hasCursor: state.cursor?.col === colIndex && state.cursor?.card === cardIndex,
          })
        })
      })
      return result
    },

    check(...invs) {
      const toRun = invs.length > 0 ? invs : allInvariants
      for (const inv of toRun) inv(app)
      return app
    },

    shouldHave(e) {
      if (e.cursor) {
        expect(driver.app.locator(`${e.cursor}[data-cursor]`).count()).toBeGreaterThan(0)
      }
      if (e.cursorOn) expect(app.nodeId).toBe(e.cursorOn)
      if (e.viewMode) expect(app.viewMode).toBe(e.viewMode)
      if (e.text) {
        for (const t of Array.isArray(e.text) ? e.text : [e.text]) {
          expect(app.text).toContain(t)
        }
      }
      return app
    },

    shouldNotHave(e) {
      if (e.text) {
        for (const t of Array.isArray(e.text) ? e.text : [e.text]) {
          expect(app.text).not.toContain(t)
        }
      }
      return app
    },

    driver,
    repo,
  }

  return app
}

// =============================================================================
// String DSL Parser
// =============================================================================

function parseStringDSL(lines: string[]): KNode[] {
  const tree: Map<string, Set<string>> = new Map()
  tree.set("board", new Set())

  for (const line of lines) {
    const parts = line.split(">").map((p) => p.trim())
    let parent = "board"
    for (const part of parts) {
      if (!tree.has(parent)) tree.set(parent, new Set())
      tree.get(parent)!.add(part)
      parent = part
    }
  }

  function build(name: string, visited = new Set<string>()): KNode[] {
    if (visited.has(name)) return []
    visited.add(name)
    const children = tree.get(name)
    if (!children || children.size === 0) return item(name)
    return item(name, ...Array.from(children).map((c) => build(c, new Set(visited))))
  }

  return build("board")
}

// =============================================================================
// Factory
// =============================================================================

function createAppSync(input: string[] | KNode[], options: BoardAppOptions = {}): BoardApp {
  const nodes =
    Array.isArray(input) && typeof input[0] === "string" ? parseStringDSL(input as string[]) : (input as KNode[])

  const repo = createFakeRepo({ nodes })
  const rootId = nodes[0]?.id ?? "board"
  const driver = createBoardDriver(repo, rootId, {
    viewMode: options.viewMode ?? "cards",
    columns: options.columns ?? 80,
    rows: options.rows ?? 24,
  })

  const invariants = options.noCheck ? [] : (options.invariants ?? defaultInvariants)
  return createBoardApp(driver, repo, invariants)
}

async function createAppAsync(path: string, options: BoardAppOptions = {}): Promise<BoardApp> {
  const repo = await runGenerator(createRepo(path, { loadFiles: true }))
  const rootNode = repo.getRepoRootNode()
  if (!rootNode) throw new Error(`No root node found for repo at ${path}`)
  const rootId = rootNode.id
  const driver = createBoardDriver(repo, rootId, {
    viewMode: options.viewMode ?? "cards",
    columns: options.columns ?? 80,
    rows: options.rows ?? 24,
  })

  const invariants = options.noCheck ? [] : (options.invariants ?? defaultInvariants)
  return createBoardApp(driver, repo, invariants)
}

// =============================================================================
// Named Fixtures
// =============================================================================

const fixtures = {
  kanban: () => createAppSync(["Todo > Task 1", "Todo > Task 2", "In Progress > Task 3", "Done > Task 4"]),
  nested: () =>
    createAppSync(["Projects > Alpha > Phase 1 > A", "Projects > Alpha > Phase 2 > B", "Projects > Beta > C"]),
  empty: () => createAppSync(item.root("board")),
  single: () => createAppSync(["Tasks > Task 1", "Tasks > Task 2", "Tasks > Task 3"]),
  wide: () => createAppSync(["C1 > T", "C2 > T", "C3 > T", "C4 > T", "C5 > T", "C6 > T", "C7 > T", "C8 > T"]),
  tall: () => createAppSync(Array.from({ length: 20 }, (_, i) => `Col > Task ${i + 1}`)),
}

// =============================================================================
// Public API
// =============================================================================

export const board = {
  /** Create app from string DSL or item() tree (sync) */
  app: createAppSync,

  /** Create app from vault path (async) */
  load: createAppAsync,

  /** Named fixtures */
  fixture: (name: keyof typeof fixtures) => fixtures[name](),

  /** item() helper */
  item,

  /** Invariant functions */
  invariants: {
    rendering,
    cursor,
    selection,
    parentLinks,
    nodeLinks,
    layout,
    all: allInvariants,
    default: defaultInvariants,
  },
}
