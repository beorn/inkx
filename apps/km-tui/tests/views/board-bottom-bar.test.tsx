/**
 * CommandBox & StatusCounters Component Tests
 *
 * Tests the command box (floating overlay) and status counters (bottom-right).
 * CommandBox is hidden in NORMAL mode — only visible in non-NORMAL modes or with active input.
 * StatusCounters is always visible showing storage, counters, watcher info.
 */

import { describe, it, test, expect } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"
import { createFocusManager, FocusManagerContext } from "@silvery/ag-react"
import { StoreContext } from "@silvery/create/create-app"
import { createSignalStore, type SignalStoreApi as StoreApi } from "../../src/state/signal-store.ts"
import { createSelection } from "@silvery/selection"
import { CommandBox, StatusCounters } from "../../src/views/CommandBox.tsx"
import type { UIState, PaneUI } from "../../src/state/ui-reducer.ts"

const baseRender = createRenderer()

/** Create a minimal Zustand store with `sel` for components that call useSel(). */
function createMinimalStore() {
  const sel = createSelection({
    tree: { walkOrder: () => [], parent: () => undefined, children: () => [] },
  })
  return createSignalStore(() => ({ sel }))
}

/** Render wrapped with FocusManagerContext + StoreContext (including rerender) */
function render(element: React.ReactElement) {
  const fm = createFocusManager()
  const store = createMinimalStore()
  const wrap = (el: React.ReactElement) =>
    React.createElement(
      StoreContext.Provider,
      { value: store as StoreApi<unknown> },
      React.createElement(FocusManagerContext.Provider, { value: fm }, el),
    )
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

    // Column state (per-pane)
    collapsedColumns: new Set(),
    columnScrollAnchor: null,
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
    toastVersion: 0,
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

  // TODO: INSERT mode test needs store context for useSel() — migrate to createDriverTest
  it.skip("shows INSERT mode when inline editing", () => {})

  // VISUAL mode removed — sel.node handles multi-selection directly
  it.skip("shows VISUAL mode in visual selection", () => {})

  // TODO: needs store context for useSel()
  it.skip("view mode is not shown in command box (moved to top bar)", () => {})

  it("does not show spinner when not loading", () => {
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
    toastVersion: 0,
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
    using app = createTestApp(item.root("board", item("Inbox", item("Task 1"))), {
      rows: 24,
      cols: 80,
    })
    expect(app.text).toContain("CARDS VIEW")
  })

  test("shows other VIEW after pressing v", () => {
    using app = createTestApp(item.root("board", item("Inbox", item("Task 1"))), {
      rows: 24,
      cols: 80,
    })
    app.command("cycle_view_mode") // Switch view mode (v m chord)
    // Could be LIST, COLUMNS, or TABS
    expect(app.text).toMatch(/(LIST|COLUMNS|TABS) VIEW/)
  })
})

// =============================================================================
// Bell message on unmapped key (absorbed from bell-msg.test.ts)
// =============================================================================

describe("bell message on unmapped key", () => {
  test("pressing unmapped printable key shows message in bottom bar", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    // 'Q' is not mapped to any command in cards view
    app.press("Q")

    // Should show the unmapped key message
    expect(app.text).toContain("Unmapped key: Shift+Q")
  })

  test("bell state is set on unmapped key", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.press("Q")

    // The bottom bar should have bell flash (red background)
    app.expect("#bottom-bar").toExist()
    // Bell state triggers data-bell attribute
    app.expect("[data-bell-flash]").toExist()
  })

  test("boundary movement shows directional message, not unmapped key", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    // First 'h' from leftmost card selects the column header (valid navigation).
    // Second 'h' from column header hits the left boundary.
    app.press("h")
    app.press("h")

    // Should show boundary message, not "Unmapped key"
    expect(app.text).not.toContain("Unmapped key")
    expect(app.text).toContain("Can't move")
  })

  test("next keypress clears the bell message", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))

    // Press unmapped key
    app.press("Q")
    expect(app.text).toContain("Unmapped key: Shift+Q")

    // Press mapped key (j = cursor down)
    app.press("j")
    expect(app.text).not.toContain("Unmapped key")
  })
})
