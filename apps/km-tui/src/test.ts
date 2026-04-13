/**
 * @km/tui/test - TUI Testing API
 *
 * @example
 * ```typescript
 * import { createTestBoard, check } from '@km/tui/test'
 *
 * const board = createTestBoard(["Inbox > Task 1", "Projects > Alpha"])
 * board.press("j").press("j")
 * check.all(board)
 * ```
 */

import { expect } from "vitest"
import type { KNode } from "@km/core"
import { board, type BoardApp, type BoardAppOptions } from "../tests/helpers/board-app.ts"

// Re-export types
export type { BoardApp, BoardAppOptions }

/**
 * Create a test board from string DSL or item() tree.
 */
export function createTestBoard(input: string[] | KNode[], options?: BoardAppOptions): BoardApp {
  return board.app(input, options)
}

/**
 * Load a test board from a vault path (async).
 */
export function loadTestBoard(path: string, options?: BoardAppOptions): Promise<BoardApp> {
  return board.load(path, options)
}

/** Low-level item() helper for building node trees */
export const item = board.item

// =============================================================================
// Check functions - just call these directly
// =============================================================================

/** Screen has content and no error strings */
export function checkRendering(app: BoardApp) {
  expect(app.text.length, "Screen is empty").toBeGreaterThan(0)
  expect(app.text, "Screen contains [object Object]").not.toContain("[object Object]")
  expect(app.text, "Screen contains TypeError").not.toContain("TypeError:")
  expect(app.text, "Screen contains ReferenceError").not.toContain("ReferenceError:")
}

/** Cursor exists and is valid (unless in dialog) */
export function checkCursor(app: BoardApp) {
  const inDialog = app.dialogs.search || app.dialogs.help || app.dialogs.newItem || app.dialogs.itemPicker
  if (inDialog) return
  expect(app.cursor, "Cursor missing").toBeDefined()
  if (app.cursor.level !== "board") {
    expect(app.cursor.col, "Invalid cursor.col").toBeGreaterThanOrEqual(0)
  }
}

/** Selected node exists in repo */
export function checkSelection(app: BoardApp) {
  if (!app.nodeId) return
  const node = app.repo.getNode(app.nodeId)
  expect(node, `Selected node "${app.nodeId}" not in repo`).toBeDefined()
}

/** All parent links are valid */
export function checkParentLinks(app: BoardApp) {
  for (const node of app.repo.data.getAllNodes()) {
    if (node.parent_id) {
      expect(app.repo.getNode(node.parent_id), `Parent "${node.parent_id}" missing for "${node.id}"`).toBeDefined()
    }
  }
}

/** All embed_of references are valid */
export function checkNodeLinks(app: BoardApp) {
  for (const node of app.repo.data.getAllNodes()) {
    if (node.embed_of) {
      expect(app.repo.getNode(node.embed_of), `Embed "${node.embed_of}" missing for "${node.id}"`).toBeDefined()
    }
  }
}

/** Run all checks */
export function checkAll(app: BoardApp) {
  checkRendering(app)
  checkCursor(app)
  checkSelection(app)
  checkParentLinks(app)
  checkNodeLinks(app)
}

/** Namespace for check functions */
export const check = {
  rendering: checkRendering,
  cursor: checkCursor,
  selection: checkSelection,
  parentLinks: checkParentLinks,
  nodeLinks: checkNodeLinks,
  all: checkAll,
}
