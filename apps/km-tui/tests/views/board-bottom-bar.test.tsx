/**
 * BottomBar Component Tests
 *
 * Tests the bottom status bar including render loop regression.
 */

import { describe, it, expect } from "vitest"
import React from "react"
import { createRenderer } from "inkx/testing"
import { BottomBar } from "../../src/views/board-bottom-bar.tsx"
import type { UIState } from "../../src/ui-reducer.ts"
import type { TUIBoardState } from "../../src/types.ts"

const render = createRenderer()

describe("BottomBar", () => {
  const mockUIState: UIState = {
    // View configuration
    viewMode: "columns",
    showDetailPane: false,
    maxOutlineDepth: 2,
    maxContentLines: 3,

    // Board context
    rootBoardId: null,

    // Overlays/dialogs
    showHelp: false,
    showProjectPicker: false,
    showNewItemDialog: false,
    showSearchDialog: false,

    // Selection state
    subIndex: 0,
    inOutlineMode: false,
    multiSelected: new Set(),
    selectionAnchor: null,
    selectAllLevel: 0,

    // Column state
    collapsedColumns: new Set(),

    // Node fold state
    foldedNodes: new Set(),

    // Mouse state
    mouseSelection: null,
    isMouseDragging: false,

    // File drop state
    droppedFiles: [],
    showDropNotification: false,

    // Navigation history
    navHistory: [],
    navHistoryIndex: 0,

    // Recent projects
    recentProjectIds: [],

    // Terminal state
    isReady: true,
    dimensions: { columns: 80, rows: 24 },

    // Loading state
    isLoading: false,
    loadingStartTime: null,

    // Watcher status
    watcherStatus: null,

    // Bell state
    bellState: null,

    // Console
    showConsole: false,

    // Status message
    status: null,
  }

  // Note: colIndex/cardIndex are now in layout, not TUIBoardState
  const mockBoardState: TUIBoardState = {
    rootPath: "/tmp/test-repo",
    rootId: "root-123",
    columns: [
      {
        node: {
          id: "section-1",
          type: "section",
          parent_id: "root-123",
          parent_idx: 0,
          link_to: null,
          title: "Todo",
          content: "",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
        cards: [],
      },
      {
        node: {
          id: "section-2",
          type: "section",
          parent_id: "root-123",
          parent_idx: 1,
          link_to: null,
          title: "Done",
          content: "",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
        cards: [],
      },
    ],
    selectedCards: new Set(),
    visualMode: false,
    foldedCards: new Set(),
    collapsedColumns: new Set(),
    searchQuery: "",
    searchMode: false,
    helpMode: false,
  }

  const mockLayout = { colIndex: 0, cardIndex: 0 }

  it("renders storage mode and path", () => {
    const app = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        layout={mockLayout}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("DISK")
    expect(output).toContain("/tmp/test-repo")
  })

  it("shows home directory as tilde", () => {
    const homeDir = process.env.HOME || "/Users/test"
    const boardStateWithHome: TUIBoardState = {
      ...mockBoardState,
      rootPath: `${homeDir}/Documents/repo`,
    }
    const app = render(
      <BottomBar
        ui={mockUIState}
        state={boardStateWithHome}
        layout={mockLayout}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("~/Documents/repo")
  })

  it("shows node count with clipboard icon", () => {
    const app = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        layout={mockLayout}
        termWidth={80}
        storageMode="disk"
        nodeCount={123}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("📋123")
  })

  it("shows view mode", () => {
    const app = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        layout={mockLayout}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("COLUMNS VIEW")
  })

  it("shows column position in columns view", () => {
    const app = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        layout={mockLayout}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("col 1/2")
  })

  it("does not show column position in single column view", () => {
    const singleColState: TUIBoardState = {
      ...mockBoardState,
      columns: [mockBoardState.columns[0]!],
    }
    const app = render(
      <BottomBar
        ui={mockUIState}
        state={singleColState}
        layout={mockLayout}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).not.toContain("col")
  })

  it("does not show spinner when not loading", () => {
    const app = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        layout={mockLayout}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    // Spinner frames should not appear when not loading
    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    const hasSpinner = spinnerFrames.some((frame) => output.includes(frame))
    expect(hasSpinner).toBe(false)
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
    const app = render(
      <BottomBar
        ui={uiWithWatcher}
        state={mockBoardState}
        layout={mockLayout}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("📄5")
  })

  it("shows memory storage mode", () => {
    const app = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        layout={mockLayout}
        termWidth={80}
        storageMode="memory"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("MEM")
  })

  it("shows move mode indicator when in move mode", () => {
    const app = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        layout={mockLayout}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={true}
      />,
    )
    const output = app.text
    expect(output).toContain("[MOVE]")
  })

  it("does not show move mode indicator when not in move mode", () => {
    const app = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        layout={mockLayout}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).not.toContain("[MOVE]")
  })

  it("shows move mode indicator alongside status message", () => {
    const uiWithStatus: UIState = {
      ...mockUIState,
      status: { level: "info", message: "Test message" },
    }
    const app = render(
      <BottomBar
        ui={uiWithStatus}
        state={mockBoardState}
        layout={mockLayout}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={true}
      />,
    )
    const output = app.text
    // Mode indicator should always be visible when in move mode
    expect(output).toContain("[MOVE]")
    // Status message should also be visible
    expect(output).toContain("Test message")
  })

  // ===========================================================================
  // Flash-on-update tests
  // ===========================================================================

  describe("flash-on-update", () => {
    // In test environment (IS_REACT_ACT_ENVIRONMENT=true), the flash timer
    // is skipped so flash stays true once triggered, making it testable.

    it("node count starts dim (no flash on initial render)", () => {
      const app = render(
        <BottomBar
          ui={mockUIState}
          state={mockBoardState}
          layout={mockLayout}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      // Initially no flash — dimColor should be true (dim)
      const nodeCountEl = app.locator("#node-count")
      expect(nodeCountEl.count()).toBeGreaterThan(0)
      expect(nodeCountEl.getAttribute("dimColor")).toBe("true")
    })

    it("node count flashes bright when value changes", () => {
      const app = render(
        <BottomBar
          ui={mockUIState}
          state={mockBoardState}
          layout={mockLayout}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      // Re-render with changed node count
      app.rerender(
        <BottomBar
          ui={mockUIState}
          state={mockBoardState}
          layout={mockLayout}
          termWidth={80}
          storageMode="disk"
          nodeCount={43}
          moveMode={false}
        />,
      )
      // Flash triggered — dimColor should be false (bright)
      const nodeCountEl = app.locator("#node-count")
      expect(nodeCountEl.getAttribute("dimColor")).toBe("false")
    })

    it("console indicator flashes when log count changes", () => {
      const app = render(
        <BottomBar
          ui={mockUIState}
          state={mockBoardState}
          layout={mockLayout}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
          consoleStats={{ total: 5, errors: 0, warnings: 0 }}
        />,
      )
      // Re-render with increased log count
      app.rerender(
        <BottomBar
          ui={mockUIState}
          state={mockBoardState}
          layout={mockLayout}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
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
        <BottomBar
          ui={uiWithWatcher}
          state={mockBoardState}
          layout={mockLayout}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      // Re-render with more watched paths
      const uiWithMoreFiles: UIState = {
        ...mockUIState,
        watcherStatus: {
          state: "idle",
          pendingPaths: 0,
          watchedPaths: 8,
        },
      }
      app.rerender(
        <BottomBar
          ui={uiWithMoreFiles}
          state={mockBoardState}
          layout={mockLayout}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      const watcherEl = app.locator("#watcher-status")
      expect(watcherEl.count()).toBeGreaterThan(0)
      expect(watcherEl.getAttribute("dimColor")).toBe("false")
    })

    it("no flash when value stays the same", () => {
      const app = render(
        <BottomBar
          ui={mockUIState}
          state={mockBoardState}
          layout={mockLayout}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      // Re-render with same node count
      app.rerender(
        <BottomBar
          ui={mockUIState}
          state={mockBoardState}
          layout={mockLayout}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      // No change — should stay dim
      const nodeCountEl = app.locator("#node-count")
      expect(nodeCountEl.getAttribute("dimColor")).toBe("true")
    })

    it("console indicator shows warning icon when errors present", () => {
      const app = render(
        <BottomBar
          ui={mockUIState}
          state={mockBoardState}
          layout={mockLayout}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
          consoleStats={{ total: 3, errors: 1, warnings: 0 }}
        />,
      )
      const output = app.text
      expect(output).toContain("⚠")
      expect(output).toContain("3")
    })

    it("console indicator not shown when total is 0", () => {
      const app = render(
        <BottomBar
          ui={mockUIState}
          state={mockBoardState}
          layout={mockLayout}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
          consoleStats={{ total: 0, errors: 0, warnings: 0 }}
        />,
      )
      const consoleEl = app.locator("#console-indicator")
      expect(consoleEl.count()).toBe(0)
    })
  })
})
