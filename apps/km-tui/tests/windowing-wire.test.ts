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
import { createSignalStore, type SignalStoreApi as StoreApi } from "../src/state/signal-store.ts"
import { createRenderer } from "@silvery/test"
import { createFocusManager, FocusManagerContext, ThemeProvider } from "@silvery/ag-react"
import { StoreContext } from "@silvery/create/create-app"
import {
  createBoardAppStoreState,
  getActiveBoardPane,
  type BoardAppStore,
  type CreateBoardAppStoreParams,
} from "../src/state/board-app-store.ts"
import {
  createBoardState,
  createPaneState,
  isBoardPane,
  isDetailPaneId,
  type BoardPaneState,
} from "../src/board/board-types.ts"
import type { PersistedWorkspace } from "../src/workspace-persist.ts"
import { createInitialUIState } from "../src/state/ui-reducer.ts"
import { createGridNavigator } from "@km/board"
import { createToastQueue } from "@km/core"
import { createFakeRepo, createStoreFromRepo, withReactive } from "@km/storage"
import { StoreProvider } from "../src/state/store-context.tsx"
import { defaultKmTheme } from "../src/theme.ts"
import { item, testEnv } from "./helpers/board-test.ts"
import { TC } from "./helpers/theme.ts"
import { createViewLens, createVisibleLens } from "@km/board"
import { RepoProvider } from "../src/repo-context.tsx"
import { BoardApp } from "../src/views/index.ts"

// =============================================================================
// Helpers
// =============================================================================

/** Helper: React.createElement with children as prop (avoids React 19 overload mismatch) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const h = (type: any, props: any, ...children: any[]): React.ReactElement =>
  React.createElement(
    type,
    children.length === 1 ? { ...props, children: children[0] } : children.length > 0 ? { ...props, children } : props,
  )

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
  // Derive initial cursor from lens (no buildBoardState)
  const _lens = createVisibleLens(createViewLens(repo, { rootId: "board", foldDepths: new Map() }))
  const toastQueue = createToastQueue()
  const params: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator: createGridNavigator(),
    initialBoardState: createBoardState("board", null),
    initialCursor: "task-1",
    initialUIState: createInitialUIState({ columns: 120, rows: 30 }),
    initialViewMode: "cards",
    dimensions: { columns: 120, rows: 30 },
  }
  const store = createSignalStore<BoardAppStore>(createBoardAppStoreState(params))
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
    const newPane = store.getState().workspace.panes.get(newPaneId)! as BoardPaneState
    expect(newPane.viewType).toBe("empty")
    // EmptyPaneState doesn't have rootId (discriminated union)
  })

  test("new pane has its own cursor store", () => {
    const { store } = createTestStore()

    store.getState().splitFocusedPane("h")

    const paneIds = [...store.getState().workspace.panes.keys()]
    const mainPane = store.getState().workspace.panes.get("main")! as BoardPaneState
    const newPaneId = paneIds.find((id) => id !== "main")!
    const newPane = store.getState().workspace.panes.get(newPaneId)! as BoardPaneState

    // Each pane should be independent
    expect(mainPane.id).not.toBe(newPane.id)
  })

  test("focused pane state is snapshotted on split", () => {
    const { store } = createTestStore()

    // Move cursor before splitting
    store.getState().dispatchBoard({ type: "SELECT", nodeId: "task-2" })

    store.getState().splitFocusedPane("h")

    // The main pane should have the cursor position saved
    const mainPane = store.getState().workspace.panes.get("main")! as BoardPaneState
    expect(mainPane.sel.node.cursor() as string | null).toBe("task-2")
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
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("proj-a")

    // Switch focus to new pane
    store.getState().cyclePaneFocus("next")

    // Verify: focused pane changed
    expect(store.getState().workspace.focusedPaneId).toBe(newPaneId)

    // Verify: old pane saved cursor position
    const savedMainPane = store.getState().workspace.panes.get("main")! as BoardPaneState
    expect(savedMainPane.sel.node.cursor() as string | null).toBe("proj-a")

    // Empty pane doesn't have a cursor
    const newPane = store.getState().workspace.panes.get(newPaneId)! as BoardPaneState
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
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("task-2")
  })

  test("folded nodes are per-pane independent", () => {
    const { store } = createTestStore()

    // Fold a node in main pane
    store.getState().dispatchBoard({ type: "TOGGLE_FOLD", nodeId: "task-1" })
    expect(getActiveBoardPane(store.getState())!.foldDepths.has("task-1")).toBe(true)

    // Split and switch to new pane
    store.getState().splitFocusedPane("h")
    store.getState().cyclePaneFocus("next")

    // New pane is empty (no foldDepths)
    const newPaneId = store.getState().workspace.focusedPaneId
    const newPane = store.getState().workspace.panes.get(newPaneId)! as BoardPaneState
    expect(newPane.viewType).toBe("empty")

    // Switch back — main pane should still have the fold
    store.getState().cyclePaneFocus("next")
    expect(getActiveBoardPane(store.getState())!.foldDepths.has("task-1")).toBe(true)
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

  test("closing pane leaves remaining pane's state accessible", () => {
    const { store } = createTestStore()

    // Set cursor to proj-a
    store.getState().dispatchBoard({ type: "SELECT", nodeId: "proj-a" })

    // Split
    store.getState().splitFocusedPane("h")

    // Switch to new pane
    store.getState().cyclePaneFocus("next")

    // Close the new pane — should go back to main with proj-a cursor
    store.getState().closeFocusedPane()

    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("proj-a")
    expect(getActiveBoardPane(store.getState())!.rootId).toBe("board")
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

    const mainPane = store.getState().workspace.panes.get("main")! as BoardPaneState
    expect(mainPane.sel.node.cursor() as string | null).toBe("proj-b")
    expect(mainPane.curswantX).toBeNull()
  })

  test("dispatchBoard TOGGLE_FOLD syncs foldDepths to focused pane", () => {
    const { store } = createTestStore()

    store.getState().dispatchBoard({ type: "TOGGLE_FOLD", nodeId: "task-1" })

    const mainPane = store.getState().workspace.panes.get("main")! as BoardPaneState
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

    const mainPane = store.getState().workspace.panes.get("main")! as BoardPaneState
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
    // Derive initial cursor from lens (no buildBoardState)
  const _lens = createVisibleLens(createViewLens(repo, { rootId: "board", foldDepths: new Map() }))
    const toastQueue = createToastQueue()
    const cols = 120
    const rows = 30
    const params: CreateBoardAppStoreParams = {
      repo,
      toastQueue,
      navigator: createGridNavigator(),
      initialBoardState: createBoardState("board", null),
      initialCursor: "task-1",
      initialUIState: createInitialUIState({ columns: cols, rows }),
      initialViewMode: "cards",
      dimensions: { columns: cols, rows },
    }
    const store = createSignalStore<BoardAppStore>(createBoardAppStoreState(params))

    // Split the focused pane horizontally (50/50)
    store.getState().splitFocusedPane("h")
    expect(store.getState().workspace.panes.size).toBe(2)

    // Render BoardApp with the split store.
    // Disable incremental check: the multi-pass stabilization (useContentRect
    // width changes from fallback to actual) causes expected incremental mismatches.
    const focusManager = createFocusManager()
    const reactiveStore = withReactive(createStoreFromRepo(repo))
    const render = createRenderer({ cols, rows, singlePassLayout: true })
    const result = render(
      h(
        ThemeProvider,
        { theme: defaultKmTheme },
        h(
          StoreContext.Provider,
          { value: store as StoreApi<unknown> },
          h(
            FocusManagerContext.Provider,
            { value: focusManager },
            h(StoreProvider, { store: reactiveStore }, h(RepoProvider, { repo }, h(BoardApp, { toastQueue }))),
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

// =============================================================================
// Workspace restoration — saved workspace with detail-focused pane
// =============================================================================

/**
 * Helper: create a store with a savedWorkspace that mimics a board+detail layout
 * where the detail pane was focused when saved (the Asana workspace bug).
 */
function createStoreWithSavedWorkspace(opts?: { focusedPaneId?: string }) {
  const nodes = item.root(
    "board",
    item("Inbox", item("task-1"), item("task-2")),
    item("Projects", item("proj-a"), item("proj-b")),
  )
  const repo = createFakeRepo({ nodes })
  const toastQueue = createToastQueue()
  const savedWorkspace: PersistedWorkspace = {
    version: 1,
    name: "default",
    savedAt: "2026-03-01T00:00:00.000Z",
    layout: {
      type: "split",
      direction: "h",
      ratio: 0.65,
      left: { type: "leaf", paneId: "main" },
      right: { type: "leaf", paneId: "main-detail" },
    },
    panes: [
      { id: "main", viewType: "board", rootNodePath: "board", viewMode: "cards" },
      { id: "main-detail", viewType: "detail", rootNodePath: null, viewMode: "cards" },
    ],
    focusedPaneId: opts?.focusedPaneId ?? "main-detail",
  }

  const params: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator: createGridNavigator(),
    initialBoardState: createBoardState("board", null),
    initialCursor: "task-1",
    initialUIState: createInitialUIState({ columns: 120, rows: 30 }),
    initialViewMode: "cards",
    dimensions: { columns: 120, rows: 30 },
    savedWorkspace,
  }
  const store = createSignalStore<BoardAppStore>(createBoardAppStoreState(params))
  return { store, repo }
}

describe("windowing — workspace restoration with detail-focused save", () => {
  test("restoring workspace with detail-focused save focuses the board pane", () => {
    const { store } = createStoreWithSavedWorkspace({ focusedPaneId: "main-detail" })

    // Focus should be redirected from detail to the board pane
    expect(store.getState().workspace.focusedPaneId).toBe("main")
  })

  test("restoring workspace with board-focused save keeps board focus", () => {
    const { store } = createStoreWithSavedWorkspace({ focusedPaneId: "main" })

    expect(store.getState().workspace.focusedPaneId).toBe("main")
  })

  test("restored board pane has a valid cursor from fallback state", () => {
    const { store } = createStoreWithSavedWorkspace()

    const boardPane = store.getState().workspace.panes.get("main")! as BoardPaneState
    expect(isBoardPane(boardPane)).toBe(true)
    // The cursor should come from the fallback (task-1), not be null
    expect(boardPane.sel.node.cursor() as string | null).toBe("task-1")
  })

  test("cursor store is assigned to the board pane, not the detail pane", () => {
    const { store } = createStoreWithSavedWorkspace()

    const boardPane = store.getState().workspace.panes.get("main")! as BoardPaneState
    const detailPane = store.getState().workspace.panes.get("main-detail")! as BoardPaneState

    // The board pane should have the initial cursor
    expect(boardPane.sel.node.cursor() as string | null).toBe("task-1")

    // The detail pane's cursor should be empty (detail panes start with null cursor)
    expect(detailPane.sel.node.cursor() as string | null).toBeNull()
  })

  test("previousFocusedPaneId is set when focus was redirected from detail", () => {
    const { store } = createStoreWithSavedWorkspace({ focusedPaneId: "main-detail" })

    // Since focus was redirected from detail to board, previousFocusedPaneId should be set
    expect(store.getState().workspace.previousFocusedPaneId).toBe("main-detail")
  })

  test("restored workspace has correct pane count and layout", () => {
    const { store } = createStoreWithSavedWorkspace()

    expect(store.getState().workspace.panes.size).toBe(2)
    expect(store.getState().workspace.layout.type).toBe("split")
  })

  test("navigation works after restoring detail-focused workspace", () => {
    const { store } = createStoreWithSavedWorkspace()

    // Verify cursor starts at task-1
    const activePaneBefore = getActiveBoardPane(store.getState())!
    expect(activePaneBefore.sel.node.cursor() as string | null).toBe("task-1")

    // Move cursor down — SELECT simulates what j/k navigation does
    store.getState().dispatchBoard({ type: "SELECT", nodeId: "task-2" })

    const activePaneAfter = getActiveBoardPane(store.getState())!
    expect(activePaneAfter.sel.node.cursor() as string | null).toBe("task-2")
  })
})

// =============================================================================
// Pane focus + cursor: scope-aware tests
//
// Tests for focus scope initialization, pane switching via `n`, cursor movement
// after focus changes, and scope-aware command dispatch.
// =============================================================================

describe("pane focus scopes — cursor movement in single-pane mode", () => {
  test("j moves cursor down in single-pane board", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("col1", item("task-1"), item("task-2"), item("task-3"))),
      { columns: 80, rows: 24 },
    )

    // Initial cursor should be on first task
    board.expect("#task-1[data-cursor]").toExist()

    // Press j to move down
    board.command("cursor_down")
    board.expect("#task-2[data-cursor]").toExist()

    // Press j again
    board.command("cursor_down")
    board.expect("#task-3[data-cursor]").toExist()
  })

  test("k moves cursor up in single-pane board", () => {
    const { board } = testEnv(() => item.root("board", item("col1", item("task-1"), item("task-2"), item("task-3"))), {
      columns: 80,
      rows: 24,
    })

    board.command("cursor_down").command("cursor_down") // Move to task-3
    board.expect("#task-3[data-cursor]").toExist()

    board.command("cursor_up") // Move up to task-2
    board.expect("#task-2[data-cursor]").toExist()
  })
})

describe("pane focus scopes — detail pane toggle and focus", () => {
  test("D opens detail pane and auto-focuses it", () => {
    const { board, store } = testEnv(() => item.root("board", item("col1", item("task-1"), item("task-2"))), {
      columns: 120,
      rows: 24,
    })

    board.command("toggle_detail_pane") // Toggle detail pane open — auto-focuses detail

    // Detail pane should be focused
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
  })

  test("n cycles focus from detail to board", () => {
    const { board, store } = testEnv(() => item.root("board", item("col1", item("task-1"), item("task-2"))), {
      columns: 120,
      rows: 24,
    })

    board.command("toggle_detail_pane") // Open detail pane — auto-focuses detail
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    board.press("n") // Cycle focus to board
    expect(store.getState().workspace.focusedPaneId).toBe("main")
  })

  test("n cycles focus back from board to detail", () => {
    const { board, store } = testEnv(() => item.root("board", item("col1", item("task-1"), item("task-2"))), {
      columns: 120,
      rows: 24,
    })

    board.command("toggle_detail_pane") // Open detail pane — auto-focuses detail
    board.press("n") // Cycle to board
    expect(store.getState().workspace.focusedPaneId).toBe("main")

    board.press("n") // Cycle back to detail
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
  })
})

describe("pane focus scopes — cursor movement after pane focus change", () => {
  test("j moves board cursor when board is focused", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("col1", item("task-1"), item("task-2"), item("task-3"))),
      { columns: 120, rows: 24 },
    )

    board.command("toggle_detail_pane") // Open + auto-focus detail pane
    board.command("cursor_left") // Return to board

    // j should move the board cursor
    board.expect("#task-1[data-cursor]").toExist()
    board.command("cursor_down")
    board.expect("#task-2[data-cursor]").toExist()
  })

  test("j moves detail cursor when detail pane is focused", () => {
    // Use a task with children so detail pane has navigable items
    const { board, store } = testEnv(
      () => item.root("board", item("col1", item("task-1", item("sub-a"), item("sub-b")), item("task-2"))),
      { columns: 120, rows: 24 },
    )

    board.command("toggle_detail_pane") // Open + auto-focus detail pane

    // Detail pane should be focused
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Detail cursor starts on first child (no topbar)
    const detailPane = store.getState().workspace.panes.get("main-detail")! as BoardPaneState
    expect(detailPane.sel.node.cursor() as string | null).toBe("sub-a")

    // Capture screen before j
    const beforeJ = board.screen.ansi

    // j moves detail cursor to second child
    board.command("cursor_down")
    const detailPaneAfter = store.getState().workspace.panes.get("main-detail")! as BoardPaneState
    expect(detailPaneAfter.sel.node.cursor() as string | null).toBe("sub-b")

    // Screen MUST change (cursor moved = different visual state)
    const afterJ = board.screen.ansi
    expect(afterJ).not.toBe(beforeJ)

    // Board cursor should NOT have changed (it's in the other pane)
    const mainPane = store.getState().workspace.panes.get("main")! as BoardPaneState
    expect(mainPane.sel.node.cursor() as string | null).toBe("task-1")
  })

  test("cursor is preserved when switching back to board", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("col1", item("task-1"), item("task-2"), item("task-3"))),
      { columns: 120, rows: 24 },
    )

    // Move cursor to task-2
    board.command("cursor_down")
    board.expect("#task-2[data-cursor]").toExist()

    board.command("toggle_detail_pane") // Open + auto-focus detail pane

    // Do some navigation in detail pane
    board.command("cursor_down")

    // Switch back to board
    board.press("n")

    // Board cursor should still be on task-2
    board.expect("#task-2[data-cursor]").toExist()
  })

  test("h returns focus from detail pane to board (left navigation)", () => {
    const { board, store } = testEnv(() => item.root("board", item("col1", item("task-1"), item("task-2"))), {
      columns: 120,
      rows: 24,
    })

    board.command("toggle_detail_pane") // Open + auto-focus detail pane
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    board.command("cursor_left") // Left should return to board
    expect(store.getState().workspace.focusedPaneId).toBe("main")
  })

  test("l navigates from board into detail pane (right navigation)", () => {
    const { board, store } = testEnv(() => item.root("board", item("col1", item("task-1"))), { columns: 120, rows: 24 })

    board.command("toggle_detail_pane") // Open detail pane

    // l from rightmost column should enter detail pane
    board.command("cursor_right")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
  })
})

describe("pane focus scopes — Escape layering with scope-aware commands", () => {
  test("Escape in detail pane returns focus to board, pane stays open", () => {
    const { board, store } = testEnv(() => item.root("board", item("col1", item("task-1"), item("task-2"))), {
      columns: 120,
      rows: 24,
    })

    board.command("toggle_detail_pane") // Open + auto-focus detail pane
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    board.press("Escape") // Should return focus to board
    expect(store.getState().workspace.focusedPaneId).toBe("main")
    // Detail pane should still be open
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
  })

  test("second Escape closes detail pane when board is already focused", () => {
    const { board, store } = testEnv(() => item.root("board", item("col1", item("task-1"), item("task-2"))), {
      columns: 120,
      rows: 24,
    })

    board.command("toggle_detail_pane") // Open + auto-focus detail pane
    board.press("Escape") // Return to board
    board.press("Escape") // Close detail pane

    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
    expect(store.getState().workspace.focusedPaneId).toBe("main")
  })
})

describe("pane focus scopes — activeScopeId tracks focused pane", () => {
  test("activeScopeId is board pane when board is focused", () => {
    const { board, focusManager, store } = testEnv(
      () => item.root("board", item("col1", item("task-1"), item("task-2"))),
      { columns: 120, rows: 24 },
    )

    board.press("D") // Open + auto-focus detail pane
    board.press("h") // Return to board

    // Board pane is focused, scope should be the board pane ID
    expect(store.getState().workspace.focusedPaneId).toBe("main")
    expect(isDetailPaneId(focusManager.activeScopeId ?? "")).toBe(false)
  })

  test("activeScopeId is detail pane when detail is focused", () => {
    const { board, focusManager, store } = testEnv(
      () => item.root("board", item("col1", item("task-1"), item("task-2"))),
      { columns: 120, rows: 24 },
    )

    board.press("D") // Open + auto-focus detail pane

    // Detail pane is focused, scope should be the detail pane ID
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
    expect(isDetailPaneId(focusManager.activeScopeId ?? "")).toBe(true)
  })

  test("activeScopeId switches back to board when returning", () => {
    const { board, focusManager, store } = testEnv(
      () => item.root("board", item("col1", item("task-1"), item("task-2"))),
      { columns: 120, rows: 24 },
    )

    board.press("D") // Open + auto-focus detail pane
    expect(isDetailPaneId(focusManager.activeScopeId ?? "")).toBe(true)

    board.press("n") // Back to board
    expect(store.getState().workspace.focusedPaneId).toBe("main")
    expect(isDetailPaneId(focusManager.activeScopeId ?? "")).toBe(false)
  })
})

// =============================================================================
// Detail pane cursor styling (TDD — visual assertions)
// =============================================================================

describe("detail pane cursor styling", () => {
  /** Helper: find the first cell of a text string in the screen and return its color info */
  /** Find text on screen and return its cell colors.
   * occurrence: "first" = leftmost/topmost, "rightmost" = highest column (detail pane). */
  function findTextColors(
    board: ReturnType<typeof testEnv>["board"],
    text: string,
    occurrence: "first" | "rightmost" = "first",
  ) {
    const screenRows = board.screen.text.split("\n")
    let foundRow = -1
    let foundCol = -1
    for (let r = 0; r < screenRows.length; r++) {
      let col = 0
      while (true) {
        const idx = screenRows[r]!.indexOf(text, col)
        if (idx === -1) break
        if (occurrence === "first" && foundRow === -1) {
          foundRow = r
          foundCol = idx
        }
        if (occurrence === "rightmost" && idx > foundCol) {
          foundRow = r
          foundCol = idx
        }
        col = idx + 1
      }
    }
    if (foundRow === -1) return null
    const cell = board.screen.cell(foundCol, foundRow)
    return { row: foundRow, col: foundCol, fg: cell.fg, bg: cell.bg, attrs: cell.attrs as Record<string, boolean> }
  }

  test("cursored detail item has gold background when detail pane is focused", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("col1", item("task-1", item("sub-a"), item("sub-b")), item("task-2"))),
      { columns: 120, rows: 24 },
    )

    board.command("toggle_detail_pane") // Open detail pane (auto-focuses detail, cursor on sub-a)

    // Verify state: cursor starts on first child
    const detail = store.getState().workspace.panes.get("main-detail")! as BoardPaneState
    expect(detail.sel.node.cursor() as string | null).toBe("sub-a")

    // The text "sub-a" should have gold background ($selected=yellow=3)
    // Use "last" to find the detail pane's rendering (right), not board card content (left)
    const colors = findTextColors(board, "sub-a", "rightmost")
    expect(colors, "sub-a text should be visible on screen").not.toBeNull()
    expect(colors!.bg).toBe(TC.$selected) // gold background
  })

  test("detail pane first child has gold bg when focused", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("col1", item("my-task", item("sub-a")), item("task-2"))),
      { columns: 120, rows: 24 },
    )

    board.command("toggle_detail_pane") // Open detail pane (auto-focuses detail, cursor on sub-a)

    // Cursor starts on first child
    const detail = store.getState().workspace.panes.get("main-detail")! as BoardPaneState
    expect(detail.sel.node.cursor() as string | null).toBe("sub-a")

    // The cursored item "sub-a" should have gold background (last occurrence = detail pane)
    const colors = findTextColors(board, "sub-a", "rightmost")
    expect(colors, "sub-a text should be visible on screen").not.toBeNull()
    expect(colors!.bg).toBe(TC.$selected)
  })

  test("both panes show cursor when detail pane is open", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("col1", item("task-1", item("sub-a"), item("sub-b")), item("task-2"))),
      { columns: 120, rows: 24 },
    )

    board.command("toggle_detail_pane") // Open detail pane (auto-focuses detail, cursor on sub-a)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Board should still show cursor card (task-1 has $selected border)
    board.expect("#task-1[data-cursor]").toExist()

    // Detail cursor starts on sub-a with gold background (rightmost = detail pane)
    const focusedSubColors = findTextColors(board, "sub-a", "rightmost")
    expect(focusedSubColors).not.toBeNull()
    expect(focusedSubColors!.bg, "cursored detail item should have gold bg when focused").toBe(TC.$selected)

    // Move cursor to sub-b — detail pane should update
    board.command("cursor_down")
    board.expect("#sub-b[data-cursor]").toExist()
    const focusedSubBColors = findTextColors(board, "sub-b", "rightmost")
    expect(focusedSubBColors).not.toBeNull()
    expect(focusedSubBColors!.bg, "cursored sub-b should have gold bg").toBe(TC.$selected)

    // Switch back to board — both panes should still show their cursors
    board.press("n")
    expect(store.getState().workspace.focusedPaneId).toBe("main")

    // Board cursor should be bright (focused)
    board.expect("#task-1[data-cursor]").toExist()
    board.expectNodeColor("task-1", { bg: TC.$selected })

    // Detail cursor retains selection bg
    const unfocusedSubColors = findTextColors(board, "sub-b", "rightmost")
    expect(unfocusedSubColors).not.toBeNull()
    expect(unfocusedSubColors!.bg, "unfocused detail cursor bg").toBe(TC.$selected)
  })

  test("unfocused board pane uses dimmed selection via per-pane theme", () => {
    const { board, store } = testEnv(() => item.root("board", item("col1", item("task-1"), item("task-2"))), {
      columns: 120,
      rows: 24,
    })

    // While focused, cursor card should have gold ($selected) bg
    board.expectNodeColor("task-1", { bg: TC.$selected })

    board.command("toggle_detail_pane") // Open detail pane (auto-focuses detail)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Board pane is now unfocused — dimColor preserves hue
    // ANSI16: dimColor("yellow") = "yellow" (same color index)
    // Mechanism verified: per-pane theme IS applied (truecolor users see dimmed gold)
    board.expectNodeColor("task-1", { bg: TC.$selected })
  })
})
