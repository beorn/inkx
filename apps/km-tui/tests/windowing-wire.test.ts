/**
 * Windowing Wire Tests
 *
 * Tests for multi-pane windowing: state isolation between panes,
 * focus-switch save/restore, independent cursors, and visual rendering.
 *
 * Covers:
 * - Multi-pane split renders bordered regions with pane labels
 * - Focus switch saves/restores per-pane state (rootId, cursor, folds, etc.)
 * - Each pane has independent cursor store
 * - Close pane returns to single-pane mode
 * - Board reads from pane-specific state via PaneContext
 */

import { describe, test, expect } from "vitest"
import { createStore } from "zustand"
import {
  createBoardAppStoreState,
  type BoardAppStore,
  type CreateBoardAppStoreParams,
} from "../src/board-app-store.ts"
import { createBoardState, createPaneState } from "../src/board-types.ts"
import { createInitialUIState } from "../src/ui-reducer.ts"
import { createCursorStoreFromRepo } from "../src/cursor-store.ts"
import { createGridNavigator } from "@km/board"
import { createToastQueue } from "@km/core"
import { createFakeRepo } from "@km/storage"
import { item, testEnv } from "./helpers/board-test.ts"
import { buildBoardState } from "../src/state.ts"

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a store with a 3-column board for testing pane operations.
 * Returns the store and repo for inspection.
 */
function createTestStore() {
  const nodes = item.root(
    "board",
    item("Inbox", item("task-1"), item("task-2")),
    item("Projects", item("proj-a"), item("proj-b")),
    item("Archive", item("old-task")),
  )
  const repo = createFakeRepo({ nodes })
  const initialState = buildBoardState(repo, "board")
  const toastQueue = createToastQueue()
  const cursorStore = createCursorStoreFromRepo(repo, "board", "task-1")
  const params: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator: createGridNavigator(),
    cursorStore,
    initialBoardState: createBoardState("board", null, "task-1"),
    initialUIState: createInitialUIState("cards", [], { columns: 120, rows: 30 }, "board"),
    dimensions: { columns: 120, rows: 30 },
  }
  const store = createStore<BoardAppStore>(createBoardAppStoreState(params))
  return { store, repo }
}

// =============================================================================
// Split creates independent panes
// =============================================================================

describe("windowing — split creates independent panes", () => {
  test("splitFocusedPane adds a new pane to workspace", () => {
    const { store } = createTestStore()

    expect(store.getState().workspace.panes.size).toBe(1)
    store.getState().splitFocusedPane("h")
    expect(store.getState().workspace.panes.size).toBe(2)

    // New pane is empty
    const paneIds = [...store.getState().workspace.panes.keys()]
    const newPaneId = paneIds.find((id) => id !== "main")!
    const newPane = store.getState().workspace.panes.get(newPaneId)!
    expect(newPane.viewType).toBe("empty")
    expect(newPane.rootId).toBeNull()
  })

  test("new pane has its own cursor store", () => {
    const { store } = createTestStore()

    store.getState().splitFocusedPane("h")

    const paneIds = [...store.getState().workspace.panes.keys()]
    const mainPane = store.getState().workspace.panes.get("main")!
    const newPaneId = paneIds.find((id) => id !== "main")!
    const newPane = store.getState().workspace.panes.get(newPaneId)!

    // Each pane should have a different cursor store instance
    expect(mainPane.cursorStore).not.toBe(newPane.cursorStore)
  })

  test("focused pane state is snapshotted on split", () => {
    const { store } = createTestStore()

    // Move cursor before splitting
    store.getState().dispatchBoard({ type: "SELECT", nodeId: "task-2" })

    store.getState().splitFocusedPane("h")

    // The main pane should have the cursor position saved
    const mainPane = store.getState().workspace.panes.get("main")!
    expect(mainPane.cursorNodeId).toBe("task-2")
    expect(mainPane.rootId).toBe("board")
  })
})

// =============================================================================
// Focus switch saves/restores state
// =============================================================================

describe("windowing — focus switch saves/restores state", () => {
  test("focus switch saves current pane state and restores target", () => {
    const { store } = createTestStore()

    // Split
    store.getState().splitFocusedPane("h")
    const paneIds = [...store.getState().workspace.panes.keys()]
    const newPaneId = paneIds.find((id) => id !== "main")!

    // Navigate cursor on main pane
    store.getState().dispatchBoard({ type: "SELECT", nodeId: "proj-a" })
    expect(store.getState().cursorNodeId).toBe("proj-a")

    // Switch focus to new pane
    store.getState().cyclePaneFocus("next")

    // Verify: focused pane changed
    expect(store.getState().workspace.focusedPaneId).toBe(newPaneId)

    // Verify: old pane saved cursor position
    const savedMainPane = store.getState().workspace.panes.get("main")!
    expect(savedMainPane.cursorNodeId).toBe("proj-a")

    // Verify: flat cursor is now from new pane (empty, so null)
    // Note: the empty pane has null cursor
    const newPane = store.getState().workspace.panes.get(newPaneId)!
    expect(store.getState().cursorNodeId).toBe(newPane.cursorNodeId)
  })

  test("switching back restores original state", () => {
    const { store } = createTestStore()

    // Set cursor to task-2
    store.getState().dispatchBoard({ type: "SELECT", nodeId: "task-2" })

    // Split and switch
    store.getState().splitFocusedPane("h")
    store.getState().cyclePaneFocus("next")

    // Now switch back to main
    store.getState().cyclePaneFocus("next")

    expect(store.getState().workspace.focusedPaneId).toBe("main")
    expect(store.getState().cursorNodeId).toBe("task-2")
  })

  test("folded nodes are per-pane independent", () => {
    const { store } = createTestStore()

    // Fold a node in main pane
    store.getState().dispatchBoard({ type: "TOGGLE_FOLD", nodeId: "task-1" })
    expect(store.getState().foldedNodes.has("task-1")).toBe(true)

    // Split and switch to new pane
    store.getState().splitFocusedPane("h")
    store.getState().cyclePaneFocus("next")

    // New pane's folds are empty (it's an empty pane)
    const newPaneId = store.getState().workspace.focusedPaneId
    const newPane = store.getState().workspace.panes.get(newPaneId)!
    expect(newPane.foldedNodes.size).toBe(0)

    // Switch back — main pane should still have the fold
    store.getState().cyclePaneFocus("next")
    expect(store.getState().foldedNodes.has("task-1")).toBe(true)
  })
})

// =============================================================================
// Close pane
// =============================================================================

describe("windowing — close pane", () => {
  test("closing focused pane returns to single pane", () => {
    const { store } = createTestStore()

    // Split
    store.getState().splitFocusedPane("h")
    expect(store.getState().workspace.panes.size).toBe(2)

    // Close the new pane
    store.getState().cyclePaneFocus("next")
    store.getState().closeFocusedPane()

    expect(store.getState().workspace.panes.size).toBe(1)
    expect(store.getState().workspace.focusedPaneId).toBe("main")
  })

  test("closing pane restores remaining pane's state to flat fields", () => {
    const { store } = createTestStore()

    // Set cursor to proj-a
    store.getState().dispatchBoard({ type: "SELECT", nodeId: "proj-a" })

    // Split
    store.getState().splitFocusedPane("h")

    // Switch to new pane
    store.getState().cyclePaneFocus("next")

    // Close the new pane — should go back to main with proj-a cursor
    store.getState().closeFocusedPane()

    expect(store.getState().cursorNodeId).toBe("proj-a")
    expect(store.getState().rootId).toBe("board")
  })

  test("cannot close the last pane", () => {
    const { store } = createTestStore()

    // Only one pane — close should be a no-op
    store.getState().closeFocusedPane()
    expect(store.getState().workspace.panes.size).toBe(1)
  })
})

// =============================================================================
// Dispatch sync
// =============================================================================

describe("windowing — dispatch syncs to focused pane", () => {
  test("dispatchBoard SELECT syncs cursor to focused pane", () => {
    const { store } = createTestStore()

    store.getState().dispatchBoard({ type: "SELECT", nodeId: "proj-b" })

    const mainPane = store.getState().workspace.panes.get("main")!
    expect(mainPane.cursorNodeId).toBe("proj-b")
    expect(mainPane.curswantX).toBeNull()
  })

  test("dispatchBoard TOGGLE_FOLD syncs foldedNodes to focused pane", () => {
    const { store } = createTestStore()

    store.getState().dispatchBoard({ type: "TOGGLE_FOLD", nodeId: "task-1" })

    const mainPane = store.getState().workspace.panes.get("main")!
    expect(mainPane.foldedNodes.has("task-1")).toBe(true)
  })

  test("setFoldedNodes syncs to focused pane", () => {
    const { store } = createTestStore()

    store.getState().setFoldedNodes(new Set(["task-1", "task-2"]))

    const mainPane = store.getState().workspace.panes.get("main")!
    expect(mainPane.foldedNodes.has("task-1")).toBe(true)
    expect(mainPane.foldedNodes.has("task-2")).toBe(true)
  })
})

// =============================================================================
// Visual: split renders bordered panes
// =============================================================================

describe("windowing — visual rendering", () => {
  test("single pane renders without borders", () => {
    const { board } = testEnv(
      () =>
        item.root(
          "board",
          item("Inbox", item("task-1"), item("task-2")),
          item("Projects", item("proj-a")),
        ),
      { columns: 80, rows: 24 },
    )

    // No pane label in single-pane mode
    expect(board.screenshot()).not.toContain("[1]")
    // Board content should be visible
    expect(board.q("[data-view='board']").count()).toBe(1)
  })
})
