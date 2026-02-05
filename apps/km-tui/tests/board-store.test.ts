/**
 * Tests for Board Store
 *
 * Verifies that the driver can access board state directly via the store
 * instead of relying on the onStateCaptureREPLACE_WITH_CREATEAPP_STORE callback.
 */

import { describe, test, expect, beforeEach } from "vitest"
import {
  createBoardStore,
  resetBoardStore,
  getBoardStore,
  type BoardStoreState,
} from "../src/board-store.ts"
import { createBoardState } from "@km/board"
import { createInitialUIState } from "../src/ui-reducer.ts"
import type { ColumnsLayout, ColumnState } from "../src/types.ts"
import type { KNode } from "@km/core"

// Helper to create a minimal node
function createNode(id: string, content: string): KNode {
  return {
    id,
    type: "task",
    content,
    data: {},
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
}

// Helper to create a minimal column state
function createColumnState(
  id: string,
  name: string,
  cards: KNode[],
): ColumnState {
  return {
    node: {
      id,
      type: "folder",
      content: undefined,
      data: { name },
      parent_id: null,
      parent_idx: 0,
      link_to: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
    cards: cards.map((node) => ({ node, children: [] })),
  }
}

describe("BoardStore", () => {
  beforeEach(() => {
    resetBoardStore()
  })

  test("createBoardStore returns a store with initial state", () => {
    const store = createBoardStore()
    const state = store.getState()

    expect(state.rootId).toBeNull()
    expect(state.cursorNodeId).toBeNull()
    expect(state.foldedNodes).toEqual(new Set())
    expect(state.viewMode).toBe("cards")
    expect(state.dialogs.search).toBe(false)
  })

  test("captureState updates store with board state", () => {
    const store = createBoardStore()

    const boardState = createBoardState("root-1", "/test/path", "cursor-1")
    const ui = createInitialUIState("cards", [], { columns: 80, rows: 24 })
    const selectedNode = createNode("cursor-1", "Selected Task")

    const columns: ColumnState[] = [
      createColumnState("col-1", "Column 1", [
        createNode("task-1", "Task 1"),
        createNode("cursor-1", "Selected Task"),
      ]),
    ]

    const layout: ColumnsLayout = {
      columns,
      colIndex: 0,
      cardIndex: 1,
      subPath: [],
      isAtCardLevel: true,
      isInOutlineMode: false,
    }

    store.getState().captureState({
      boardState,
      ui,
      layout,
      selectedNode,
      selectionLevel: "card",
    })

    const state = store.getState()

    expect(state.rootId).toBe("root-1")
    expect(state.cursorNodeId).toBe("cursor-1")
    expect(state.selectedNode?.id).toBe("cursor-1")
    expect(state.cursor.col).toBe(0)
    expect(state.cursor.card).toBe(1)
    expect(state.cursor.level).toBe("card")
    expect(state.columns).toHaveLength(1)
  })

  test("captureState updates dialog state", () => {
    const store = createBoardStore()

    const boardState = createBoardState("root-1", null, null)
    const ui = createInitialUIState("cards", [], { columns: 80, rows: 24 })
    // Manually set dialog states
    ui.showSearchDialog = true
    ui.showDetailPane = true

    const layout: ColumnsLayout = {
      columns: [],
      colIndex: 0,
      cardIndex: 0,
      subPath: [],
      isAtCardLevel: true,
      isInOutlineMode: false,
    }

    store.getState().captureState({
      boardState,
      ui,
      layout,
      selectedNode: null,
      selectionLevel: "card",
    })

    const state = store.getState()

    expect(state.dialogs.search).toBe(true)
    expect(state.dialogs.newItem).toBe(false)
    expect(state.detailPaneOpen).toBe(true)
  })

  test("getBoardStore returns singleton", () => {
    const store1 = getBoardStore()
    const store2 = getBoardStore()

    expect(store1).toBe(store2)
  })

  test("resetBoardStore clears singleton", () => {
    const store1 = getBoardStore()
    resetBoardStore()
    const store2 = getBoardStore()

    expect(store1).not.toBe(store2)
  })

  test("store subscription notifies on state changes", () => {
    const store = createBoardStore()
    const states: BoardStoreState[] = []

    store.subscribe((state) => {
      states.push(state)
    })

    const boardState = createBoardState("root-1", null, "task-1")
    const ui = createInitialUIState("cards", [], { columns: 80, rows: 24 })
    const layout: ColumnsLayout = {
      columns: [],
      colIndex: 0,
      cardIndex: 0,
      subPath: [],
      isAtCardLevel: true,
      isInOutlineMode: false,
    }

    store.getState().captureState({
      boardState,
      ui,
      layout,
      selectedNode: null,
      selectionLevel: "card",
    })

    expect(states).toHaveLength(1)
    expect(states[0]?.cursorNodeId).toBe("task-1")
  })

  test("captureState preserves move mode state", () => {
    const store = createBoardStore()

    const boardState = createBoardState("root-1", null, "task-1")
    boardState.moveMode = true
    boardState.moveSourceNodes = ["task-1", "task-2"]

    const ui = createInitialUIState("cards", [], { columns: 80, rows: 24 })
    const layout: ColumnsLayout = {
      columns: [],
      colIndex: 0,
      cardIndex: 0,
      subPath: [],
      isAtCardLevel: true,
      isInOutlineMode: false,
    }

    store.getState().captureState({
      boardState,
      ui,
      layout,
      selectedNode: null,
      selectionLevel: "card",
    })

    const state = store.getState()
    expect(state.moveMode).toBe(true)
  })

  test("captureState preserves view mode", () => {
    const store = createBoardStore()

    const boardState = createBoardState("root-1", null, null)
    const ui = createInitialUIState("list", [], { columns: 80, rows: 24 })
    const layout: ColumnsLayout = {
      columns: [],
      colIndex: 0,
      cardIndex: 0,
      subPath: [],
      isAtCardLevel: true,
      isInOutlineMode: false,
    }

    store.getState().captureState({
      boardState,
      ui,
      layout,
      selectedNode: null,
      selectionLevel: "card",
    })

    expect(store.getState().viewMode).toBe("list")
  })

  test("raw state references are accessible", () => {
    const store = createBoardStore()

    const boardState = createBoardState("root-1", null, "task-1")
    const ui = createInitialUIState("cards", [], { columns: 80, rows: 24 })
    const layout: ColumnsLayout = {
      columns: [],
      colIndex: 0,
      cardIndex: 0,
      subPath: [],
      isAtCardLevel: true,
      isInOutlineMode: false,
    }

    store.getState().captureState({
      boardState,
      ui,
      layout,
      selectedNode: null,
      selectionLevel: "card",
    })

    const state = store.getState()
    expect(state._boardState).toBe(boardState)
    expect(state._uiState).toBe(ui)
    expect(state._layout).toBe(layout)
  })
})
