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
import React from "react"
import { createStore, type StoreApi } from "zustand"
import { createRenderer } from "inkx/testing"
import { createFocusManager, FocusManagerContext, ThemeProvider } from "inkx"
import { StoreContext } from "inkx/runtime"
import { createBoardAppStoreState, type BoardAppStore, type CreateBoardAppStoreParams } from "../src/board-app-store.ts"
import { createBoardState, createPaneState } from "../src/board-types.ts"
import { createInitialUIState } from "../src/ui-reducer.ts"
import { createCursorStoreFromRepo } from "../src/cursor-store.ts"
import { createGridNavigator } from "@km/board"
import { createToastQueue } from "@km/core"
import { createFakeRepo } from "@km/storage"
import { defaultKmTheme } from "../src/theme.ts"
import { item, testEnv } from "./helpers/board-test.ts"
import { buildBoardState } from "../src/state.ts"
import { RepoProvider } from "../src/repo-context.tsx"
import { BoardApp } from "../src/views/index.ts"

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
    // EmptyPaneState doesn't have rootId (discriminated union)
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

    // Empty pane doesn't have a cursor — flat cursorNodeId should be null
    const newPane = store.getState().workspace.panes.get(newPaneId)!
    expect(newPane.viewType).toBe("empty")
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
    expect(store.getState().foldDepths.has("task-1")).toBe(true)

    // Split and switch to new pane
    store.getState().splitFocusedPane("h")
    store.getState().cyclePaneFocus("next")

    // New pane is empty (no foldDepths)
    const newPaneId = store.getState().workspace.focusedPaneId
    const newPane = store.getState().workspace.panes.get(newPaneId)!
    expect(newPane.viewType).toBe("empty")

    // Switch back — main pane should still have the fold
    store.getState().cyclePaneFocus("next")
    expect(store.getState().foldDepths.has("task-1")).toBe(true)
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

  test("dispatchBoard TOGGLE_FOLD syncs foldDepths to focused pane", () => {
    const { store } = createTestStore()

    store.getState().dispatchBoard({ type: "TOGGLE_FOLD", nodeId: "task-1" })

    const mainPane = store.getState().workspace.panes.get("main")!
    expect(mainPane.foldDepths.has("task-1")).toBe(true)
  })

  test("setFoldDepths syncs to focused pane", () => {
    const { store } = createTestStore()

    store.getState().setFoldDepths(
      new Map([
        ["task-1", 0],
        ["task-2", 0],
      ]),
    )

    const mainPane = store.getState().workspace.panes.get("main")!
    expect(mainPane.foldDepths.has("task-1")).toBe(true)
    expect(mainPane.foldDepths.has("task-2")).toBe(true)
  })
})

// =============================================================================
// Visual: split renders bordered panes
// =============================================================================

describe("windowing — visual rendering", () => {
  test("single pane renders without borders", () => {
    const { board } = testEnv(
      () => item.root("board", item("Inbox", item("task-1"), item("task-2")), item("Projects", item("proj-a"))),
      { columns: 80, rows: 24 },
    )

    // No pane label in single-pane mode
    expect(board.screenshot()).not.toContain("[1]")
    // Board content should be visible
    expect(board.q("[data-view='board']").count()).toBe(1)
  })

  test("split pane renders both panes within terminal width (km-tui.pane-dimensions)", () => {
    // Set up store with a 3-column board
    const nodes = item.root("board", item("Inbox", item("task-1"), item("task-2")), item("Projects", item("proj-a")))
    const repo = createFakeRepo({ nodes })
    const initialState = buildBoardState(repo, "board")
    const toastQueue = createToastQueue()
    const cursorStore = createCursorStoreFromRepo(repo, "board", "task-1")
    const cols = 120
    const rows = 30
    const params: CreateBoardAppStoreParams = {
      repo,
      toastQueue,
      navigator: createGridNavigator(),
      cursorStore,
      initialBoardState: createBoardState("board", null, "task-1"),
      initialUIState: createInitialUIState("cards", [], { columns: cols, rows }, "board"),
      dimensions: { columns: cols, rows },
    }
    const store = createStore<BoardAppStore>(createBoardAppStoreState(params))

    // Split the focused pane horizontally (50/50)
    store.getState().splitFocusedPane("h")
    expect(store.getState().workspace.panes.size).toBe(2)

    // Render BoardApp with the split store.
    // Disable incremental check: the multi-pass stabilization (useContentRect
    // width changes from fallback to actual) causes expected incremental mismatches.
    const focusManager = createFocusManager()
    const render = createRenderer({ cols, rows, singlePassLayout: true })
    const result = render(
      React.createElement(
        ThemeProvider,
        { theme: defaultKmTheme },
        React.createElement(
          StoreContext.Provider,
          { value: store as StoreApi<unknown> },
          React.createElement(
            FocusManagerContext.Provider,
            { value: focusManager },
            React.createElement(RepoProvider, { repo }, React.createElement(BoardApp, { toastQueue })),
          ),
        ),
      ),
      { incremental: false },
    )

    const text = result.text

    // Both pane labels should be visible — proves both panes fit within terminal width
    // Note: [2] may be clipped to [2 by the right overflow indicator (1 char each side)
    expect(text).toContain("[1]")
    expect(text).toContain("[2")

    // Board content (column headers from pane 1) should be visible
    expect(text).toContain("Inbox")

    // Second pane shows "Empty pane" welcome text (it's a new empty pane)
    expect(text).toContain("Empty pane")

    // The board's data-view element should NOT span the full terminal width.
    // With the fix, Board uses useContentRect() to get actual pane width (~60 cols for 50% of 120).
    const boardView = result.locator("[data-view='board']")
    expect(boardView.count()).toBeGreaterThan(0)
    const boardBox = boardView.boundingBox()
    expect(boardBox).not.toBeNull()
    if (boardBox) {
      // Board should be narrower than full terminal (accounting for pane borders)
      expect(boardBox.width).toBeLessThan(cols)
    }
  })
})
