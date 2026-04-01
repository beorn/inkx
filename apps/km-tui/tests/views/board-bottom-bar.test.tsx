/**
 * CommandBox & StatusCounters Component Tests
 *
 * Tests the command box (floating overlay) and status counters (bottom-right).
 * CommandBox is hidden in NORMAL mode — only visible in non-NORMAL modes or with active input.
 * StatusCounters is always visible showing storage, counters, watcher info.
 */

import { describe, it, test, expect } from "vitest"
import React, { act } from "react"
import { createRenderer } from "@silvery/test"
import { testEnv, item } from "../helpers/board-test.ts"
import { createFocusManager, FocusManagerContext } from "@silvery/ag-react"
import { CommandBox, StatusCounters } from "../../src/views/CommandBox.tsx"
import type { UIState, PaneUI } from "../../src/ui-reducer.ts"

const baseRender = createRenderer()

/** Render wrapped with FocusManagerContext (including rerender) */
function render(element: React.ReactElement) {
  const fm = createFocusManager()
  const wrap = (el: React.ReactElement) => React.createElement(FocusManagerContext.Provider, { value: fm }, el)
  const app = baseRender(wrap(element))
  const originalRerender = app.rerender.bind(app)
  app.rerender = (el: React.ReactElement) => originalRerender(wrap(el))
  return app
}

describe("CommandBox", () => {
  const mockUIState: PaneUI = {
    // View configuration (per-pane)
    viewMode: "columns",
    maxContentLines: 3,

    // Overlays/dialogs (global)
    showHelp: false,
    helpScrollOffset: 0,
    activePicker: null,
    showNewItemDialog: false,
    showSearchDialog: false,
    searchDialogInitialInput: "",
    searchScope: "all",
    searchScopeNodeIds: [],
    showConsole: false,
    showSyncPane: false,

    // Selection state (per-pane)
    multiSelected: new Set(),
    selectionAnchor: null,
    selectAllLevel: 0,
    visualMode: false,
    visualAnchor: null,

    // Column state (per-pane)
    collapsedColumns: new Set(),
    columnScrollAnchor: null,

    // Inline edit (per-pane)
    inlineEditBlock: null,
    localSearch: null,
    searchReplace: null,

    // Filter state (per-pane)
    showFilterDialog: false,
    filterText: "",
    filterProperties: {
      taskStatus: new Set(),
      priority: new Set(),
      dueDate: new Set(),
      assignedTo: new Set(),
      nodeType: new Set(),
    },
    filterCursorRow: 0,
    filterCursorVal: 0,
    showHidden: false,
    hiddenVersion: 0,

    // Mouse state (per-pane)
    mouseSelection: null,
    isMouseDragging: false,

    // File drop state (global)
    droppedFiles: [],
    showDropNotification: false,

    // Navigation history (global)
    navHistory: [],
    navHistoryIndex: 0,

    // Recent projects (global)
    recentProjectIds: [],

    // Terminal state (global)
    terminalFocused: true,
    dimensions: { columns: 80, rows: 24 },

    // Loading state (global)
    isLoading: false,
    loadingStartTime: null,
    backgroundParsing: false,

    // Watcher status (global)
    watcherStatus: null,
    syncEvents: [],

    // Bell state (global)
    bellState: null,

    // Console (global)

    // Status message (global)
    status: null,

    // Other global fields
    datePrompt: null,
    deleteConfirm: null,
    clipboard: null,
    pendingChord: null,
    chordTimedOut: false,
    showOmnibox: false,
    showFavoritesDialog: false,
    favoritesSelectedKey: null,
    iconStyle: "nerdfont",
    borderMode: "normal",
  }

  const mockRootPath = "/tmp/test-repo"

  it("returns null in NORMAL mode (hidden)", () => {
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    // CommandBox returns null in NORMAL mode
    expect(app.text).toBe("")
  })

  it("shows MOVE mode pill when in move mode", () => {
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={true}
      />,
    )
    const output = app.text
    expect(output).toContain("MOVE")
  })

  it("does not show MOVE mode when not in move mode", () => {
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).not.toContain("MOVE")
  })

  it("stacks feedback above command when both are visible", () => {
    const uiWithStatus: PaneUI = {
      ...mockUIState,
      status: { level: "info", message: "Test message" },
    }
    const app = render(
      <CommandBox
        ui={uiWithStatus}
        rootPath={mockRootPath}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={true}
      />,
    )
    const output = app.text
    expect(output).toContain("MOVE")
    expect(output).toContain("Test message")
  })

  it("shows INSERT mode when inline editing", () => {
    const uiWithEdit: PaneUI = {
      ...mockUIState,
      inlineEditBlock: { nodeId: "n1", blockIndex: 0 },
    }
    const app = render(
      <CommandBox
        ui={uiWithEdit}
        rootPath={mockRootPath}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("INSERT")
  })

  it("shows VISUAL mode in visual selection", () => {
    const uiWithVisual: PaneUI = {
      ...mockUIState,
      visualMode: true,
      visualAnchor: "n1",
    }
    const app = render(
      <CommandBox
        ui={uiWithVisual}
        rootPath={mockRootPath}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("VISUAL")
  })

  it("view mode is not shown in command box (moved to top bar)", () => {
    const app = render(
      <CommandBox
        ui={{ ...mockUIState, visualMode: true, visualAnchor: "n1" }}
        rootPath={mockRootPath}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).not.toContain("VIEW")
  })

  it("does not show spinner when not loading", () => {
    // Use VISUAL mode so CommandBox is visible
    const app = render(
      <CommandBox
        ui={{ ...mockUIState, visualMode: true, visualAnchor: "n1" }}
        rootPath={mockRootPath}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    const spinnerFrames = [
      "\u280B",
      "\u2819",
      "\u2839",
      "\u2838",
      "\u283C",
      "\u2834",
      "\u2826",
      "\u2827",
      "\u2807",
      "\u280F",
    ]
    const hasSpinner = spinnerFrames.some((frame) => output.includes(frame))
    expect(hasSpinner).toBe(false)
  })

  it("has round border outline", () => {
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={true}
      />,
    )
    const box = app.locator("#bottom-bar")
    expect(box.count()).toBeGreaterThan(0)
  })
})

describe("StatusCounters", () => {
  const mockUIState: UIState = {
    iconStyle: "nerdfont",
    borderMode: "normal",
    showHelp: false,
    helpScrollOffset: 0,
    activePicker: null,
    showNewItemDialog: false,
    showSearchDialog: false,
    searchDialogInitialInput: "",
    searchScope: "all",
    searchScopeNodeIds: [],
    showConsole: false,
    showSyncPane: false,
    droppedFiles: [],
    showDropNotification: false,
    navHistory: [],
    navHistoryIndex: 0,
    recentProjectIds: [],
    dimensions: { columns: 80, rows: 24 },
    isLoading: false,
    loadingStartTime: null,
    backgroundParsing: false,
    watcherStatus: null,
    syncEvents: [],
    datePrompt: null,
    deleteConfirm: null,
    clipboard: null,
    bellState: null,
    status: null,
    pendingChord: null,
    chordTimedOut: false,
    showOmnibox: false,
    showFavoritesDialog: false,
    favoritesSelectedKey: null,
    terminalFocused: true,
  }

  const mockRootPath = "/tmp/test-repo"

  it("shows node count with clipboard icon", () => {
    const app = render(<StatusCounters ui={mockUIState} rootPath={mockRootPath} storageMode="disk" nodeCount={123} />)
    const output = app.text
    expect(output).toContain("📋123")
  })

  it("shows storage path (DISK + shortened path)", () => {
    const app = render(<StatusCounters ui={mockUIState} rootPath={mockRootPath} storageMode="disk" nodeCount={42} />)
    const output = app.text
    expect(output).toContain("DISK")
    expect(output).toContain("/tmp/test-repo")
  })

  it("shows watcher status when present", () => {
    const uiWithWatcher: UIState = {
      ...mockUIState,
      watcherStatus: {
        state: "idle",
        pendingPaths: 0,
        watchedPaths: 5,
      },
    }
    const app = render(<StatusCounters ui={uiWithWatcher} rootPath={mockRootPath} storageMode="disk" nodeCount={42} />)
    const output = app.text
    expect(output).toContain("📄5")
  })

  it("shows memory storage mode indicator", () => {
    const app = render(<StatusCounters ui={mockUIState} rootPath={mockRootPath} storageMode="memory" nodeCount={42} />)
    const output = app.text
    expect(output).toContain("MEM")
  })

  // ===========================================================================
  // Flash-on-update tests
  // ===========================================================================

  describe("flash-on-update", () => {
    it("node count starts dim (no flash on initial render)", () => {
      const app = render(<StatusCounters ui={mockUIState} rootPath={mockRootPath} storageMode="disk" nodeCount={42} />)
      const nodeCountEl = app.locator("#node-count")
      expect(nodeCountEl.count()).toBeGreaterThan(0)
      expect(nodeCountEl.getAttribute("dimColor")).toBe("true")
    })

    it("node count flashes bright when value changes", () => {
      const app = render(<StatusCounters ui={mockUIState} rootPath={mockRootPath} storageMode="disk" nodeCount={42} />)
      app.rerender(<StatusCounters ui={mockUIState} rootPath={mockRootPath} storageMode="disk" nodeCount={43} />)
      const nodeCountEl = app.locator("#node-count")
      expect(nodeCountEl.getAttribute("dimColor")).toBe("false")
    })

    it("console indicator flashes when log count changes", () => {
      const app = render(
        <StatusCounters
          ui={mockUIState}
          rootPath={mockRootPath}
          storageMode="disk"
          nodeCount={42}
          consoleStats={{ total: 5, errors: 0, warnings: 0 }}
        />,
      )
      app.rerender(
        <StatusCounters
          ui={mockUIState}
          rootPath={mockRootPath}
          storageMode="disk"
          nodeCount={42}
          consoleStats={{ total: 10, errors: 0, warnings: 0 }}
        />,
      )
      const consoleEl = app.locator("#console-indicator")
      expect(consoleEl.count()).toBeGreaterThan(0)
      expect(consoleEl.getAttribute("dimColor")).toBe("false")
    })

    it("watcher file count flashes when watched paths change", () => {
      const uiWithWatcher: UIState = {
        ...mockUIState,
        watcherStatus: {
          state: "idle",
          pendingPaths: 0,
          watchedPaths: 5,
        },
      }
      const app = render(
        <StatusCounters ui={uiWithWatcher} rootPath={mockRootPath} storageMode="disk" nodeCount={42} />,
      )
      const uiWithMoreFiles: UIState = {
        ...mockUIState,
        watcherStatus: {
          state: "idle",
          pendingPaths: 0,
          watchedPaths: 8,
        },
      }
      app.rerender(<StatusCounters ui={uiWithMoreFiles} rootPath={mockRootPath} storageMode="disk" nodeCount={42} />)
      const watcherEl = app.locator("#watcher-status")
      expect(watcherEl.count()).toBeGreaterThan(0)
      expect(watcherEl.getAttribute("dimColor")).toBe("false")
    })

    it("no flash when value stays the same", () => {
      const app = render(<StatusCounters ui={mockUIState} rootPath={mockRootPath} storageMode="disk" nodeCount={42} />)
      app.rerender(<StatusCounters ui={mockUIState} rootPath={mockRootPath} storageMode="disk" nodeCount={42} />)
      const nodeCountEl = app.locator("#node-count")
      expect(nodeCountEl.getAttribute("dimColor")).toBe("true")
    })

    it("console indicator shows warning icon when errors present", () => {
      const app = render(
        <StatusCounters
          ui={mockUIState}
          rootPath={mockRootPath}
          storageMode="disk"
          nodeCount={42}
          consoleStats={{ total: 3, errors: 1, warnings: 0 }}
        />,
      )
      const output = app.text
      expect(output).toContain("\u26A0")
      expect(output).toContain("3")
    })

    it("console indicator not shown when total is 0", () => {
      const app = render(
        <StatusCounters
          ui={mockUIState}
          rootPath={mockRootPath}
          storageMode="disk"
          nodeCount={42}
          consoleStats={{ total: 0, errors: 0, warnings: 0 }}
        />,
      )
      const consoleEl = app.locator("#console-indicator")
      expect(consoleEl.count()).toBe(0)
    })
  })
})

// =============================================================================
// Bottom bar VIEW indicator (absorbed from status-bar.test.ts)
// =============================================================================

describe("Bottom bar VIEW indicator", () => {
  test("shows CARDS VIEW on startup", () => {
    const env = testEnv(() => item.root("board", item("Inbox", item("Task 1"))), {
      rows: 24,
      columns: 80,
    })
    const text = env.board.screenshot()
    expect(text).toContain("CARDS VIEW")
  })

  test("shows other VIEW after pressing v", () => {
    const env = testEnv(() => item.root("board", item("Inbox", item("Task 1"))), {
      rows: 24,
      columns: 80,
    })
    env.board.command("cycle_view_mode") // Switch view mode (v m chord)
    const text = env.board.screenshot()
    // Could be LIST, COLUMNS, or TABS
    expect(text).toMatch(/(LIST|COLUMNS|TABS) VIEW/)
  })
})

// =============================================================================
// Bell message on unmapped key (absorbed from bell-msg.test.ts)
// =============================================================================

describe("bell message on unmapped key", () => {
  test("pressing unmapped printable key shows message in bottom bar", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))

    // 'Q' is not mapped to any command in cards view
    board.press("Q")

    const screenshot = board.screenshot()
    // Should show the unmapped key message
    expect(screenshot).toContain("Unmapped key: Shift+Q")
  })

  test("bell state is set on unmapped key", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))

    board.press("Q")

    // The bottom bar should have bell flash (red background)
    board.expect("#bottom-bar").toExist()
    // Bell state triggers data-bell attribute
    board.expect("[data-bell-flash]").toExist()
  })

  test("boundary movement shows directional message, not unmapped key", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))

    // First 'h' from leftmost card selects the column header (valid navigation).
    // Second 'h' from column header hits the left boundary.
    board.press("h")
    board.press("h")

    const screenshot = board.screenshot()
    // Should show boundary message, not "Unmapped key"
    expect(screenshot).not.toContain("Unmapped key")
    expect(screenshot).toContain("Can't move")
  })

  test("next keypress clears the bell message", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))

    // Press unmapped key
    board.press("Q")
    expect(board.screenshot()).toContain("Unmapped key: Shift+Q")

    // Press mapped key (j = cursor down)
    board.press("j")
    expect(board.screenshot()).not.toContain("Unmapped key")
  })
})

// =============================================================================
// StatusCounters elapsed time display (absorbed from commandbox-elapsed.test.ts)
// =============================================================================

// Spinner frame 0 (tests skip the interval, so frame stays at index 0)
const SPINNER_FRAME_0 = "\u280B"

/** Set loading state and flush the render pipeline without triggering command handling */
function setLoadingState(
  board: ReturnType<typeof testEnv>["board"],
  store: ReturnType<typeof testEnv>["store"],
  opts: { isLoading: boolean; loadingStartTime: number | null },
) {
  act(() => {
    store.setState((s) => ({
      ...s,
      ui: { ...s.ui, isLoading: opts.isLoading, loadingStartTime: opts.loadingStartTime },
    }))
  })
  // Flush React render pipeline without routing through handleKey
  // (avoids "Unmapped key" toast that board.press("F20") would trigger)
  void board._result.press("")
}

describe("StatusCounters elapsed time display", () => {
  test("loading spinner shows when isLoading is true", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("Task Alpha"))))

    // Before loading: no spinner frame in the bottom bar
    const before = board.screenshot()
    expect(before).not.toContain(SPINNER_FRAME_0)

    // Set loading state
    setLoadingState(board, store, { isLoading: true, loadingStartTime: Date.now() })

    const after = board.screenshot()
    expect(after).toContain(SPINNER_FRAME_0)
  })

  test("elapsed time shows after 1 second", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("Task Alpha"))))

    // Set loading with a start time 2 seconds in the past
    setLoadingState(board, store, { isLoading: true, loadingStartTime: Date.now() - 2000 })

    const text = board.screenshot()
    // Should show "2s" (elapsed > 1 triggers the display)
    expect(text).toContain("2s")
    // Spinner should also be present
    expect(text).toContain(SPINNER_FRAME_0)
  })

  test("elapsed time does NOT show when elapsed <= 1 second", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("Task Alpha"))))

    // Set loading with a start time just now (0 seconds elapsed)
    setLoadingState(board, store, { isLoading: true, loadingStartTime: Date.now() })

    const text = board.screenshot()
    // Spinner should appear
    expect(text).toContain(SPINNER_FRAME_0)
    // But no "0s" or "1s" text — elapsed <= 1 shows just the spinner
    expect(text).not.toMatch(/\d+s/)
  })

  test("elapsed time clears when loading stops", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("Task Alpha"))))

    // Start loading 3 seconds ago
    setLoadingState(board, store, { isLoading: true, loadingStartTime: Date.now() - 3000 })
    expect(board.screenshot()).toContain("3s")

    // Stop loading
    setLoadingState(board, store, { isLoading: false, loadingStartTime: null })

    const text = board.screenshot()
    // Spinner and elapsed should both be gone
    expect(text).not.toContain(SPINNER_FRAME_0)
    expect(text).not.toMatch(/\d+s/)
  })

  test("elapsed time shows larger values for longer operations", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("Task Alpha"))))

    // Simulate 15 seconds of loading
    setLoadingState(board, store, { isLoading: true, loadingStartTime: Date.now() - 15000 })

    const text = board.screenshot()
    expect(text).toContain("15s")
  })
})
