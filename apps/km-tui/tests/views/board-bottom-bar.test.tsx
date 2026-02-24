/**
 * CommandBox Component Tests
 *
 * Tests the command box (bottom bar) including mode pill, counters, and flash behavior.
 */

import { describe, it, expect } from "vitest"
import React from "react"
import { createRenderer } from "inkx/testing"
import { createFocusManager, FocusManagerContext } from "inkx"
import { CommandBox } from "../../src/views/CommandBox.tsx"
import type { UIState } from "../../src/ui-reducer.ts"
import type { ColumnView } from "../../src/types.ts"

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
  const mockUIState: UIState = {
    // View configuration
    viewMode: "columns",
    showDetailPane: false,
    maxContentLines: 3,

    // Board context
    rootBoardId: null,

    // Overlays/dialogs
    showHelp: false,
    showProjectPicker: false,
    showNewItemDialog: false,
    showSearchDialog: false,

    // Selection state
    multiSelected: new Set(),
    selectionAnchor: null,
    selectAllLevel: 0,

    // Column state
    collapsedColumns: new Set(),

    // Node fold state
    foldDepths: new Map(),

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

  const mockRootPath = "/tmp/test-repo"
  const mockColumns: ColumnView[] = [
    {
      node: {
        id: "section-1",
        type: "h",
        item: true,
        fstype: "mdsection",
        parent_id: "root-123",
        parent_idx: 0,
        embed_source: null,
        title: "Todo",
        content: "",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      cardNodes: [],
      virtualCardIds: new Set(),
    },
    {
      node: {
        id: "section-2",
        type: "h",
        item: true,
        fstype: "mdsection",
        parent_id: "root-123",
        parent_idx: 1,
        embed_source: null,
        title: "Done",
        content: "",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      cardNodes: [],
      virtualCardIds: new Set(),
    },
  ]

  it("shows NORMAL mode pill by default", () => {
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        columns={mockColumns}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("NORMAL")
  })

  it("shows node count with clipboard icon", () => {
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        columns={mockColumns}
        termWidth={80}
        storageMode="disk"
        nodeCount={123}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("📋123")
  })

  it("shows storage path (DISK + shortened path)", () => {
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        columns={mockColumns}
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

  it("view mode is not shown in bottom bar (moved to top bar)", () => {
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        columns={mockColumns}
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
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        columns={mockColumns}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    // Spinner frames should not appear when not loading
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
      <CommandBox
        ui={uiWithWatcher}
        rootPath={mockRootPath}
        columns={mockColumns}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("📄5")
  })

  it("shows memory storage mode indicator", () => {
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        columns={mockColumns}
        termWidth={80}
        storageMode="memory"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("MEM")
  })

  it("shows MOVE mode pill when in move mode", () => {
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        columns={mockColumns}
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
        columns={mockColumns}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).not.toContain("MOVE")
  })

  it("shows MOVE mode alongside status message", () => {
    const uiWithStatus: UIState = {
      ...mockUIState,
      status: { level: "info", message: "Test message" },
    }
    const app = render(
      <CommandBox
        ui={uiWithStatus}
        rootPath={mockRootPath}
        columns={mockColumns}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={true}
      />,
    )
    const output = app.text
    expect(output).toContain("MOVE")
    expect(output).toMatch(/Test mes/)
  })

  it("shows INSERT mode when inline editing", () => {
    const uiWithEdit: UIState = {
      ...mockUIState,
      inlineEditBlock: { nodeId: "n1", blockIndex: 0 },
    }
    const app = render(
      <CommandBox
        ui={uiWithEdit}
        rootPath={mockRootPath}
        columns={mockColumns}
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
    const uiWithVisual: UIState = {
      ...mockUIState,
      visualMode: true,
      visualAnchor: "n1",
    }
    const app = render(
      <CommandBox
        ui={uiWithVisual}
        rootPath={mockRootPath}
        columns={mockColumns}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const output = app.text
    expect(output).toContain("VISUAL")
  })

  it("has bottom-bar id for locator queries", () => {
    const app = render(
      <CommandBox
        ui={mockUIState}
        rootPath={mockRootPath}
        columns={mockColumns}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />,
    )
    const bar = app.locator("#bottom-bar")
    expect(bar.count()).toBeGreaterThan(0)
  })

  // ===========================================================================
  // Flash-on-update tests
  // ===========================================================================

  describe("flash-on-update", () => {
    it("node count starts dim (no flash on initial render)", () => {
      const app = render(
        <CommandBox
          ui={mockUIState}
          rootPath={mockRootPath}
          columns={mockColumns}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      const nodeCountEl = app.locator("#node-count")
      expect(nodeCountEl.count()).toBeGreaterThan(0)
      expect(nodeCountEl.getAttribute("dimColor")).toBe("true")
    })

    it("node count flashes bright when value changes", () => {
      const app = render(
        <CommandBox
          ui={mockUIState}
          rootPath={mockRootPath}
          columns={mockColumns}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      app.rerender(
        <CommandBox
          ui={mockUIState}
          rootPath={mockRootPath}
          columns={mockColumns}
          termWidth={80}
          storageMode="disk"
          nodeCount={43}
          moveMode={false}
        />,
      )
      const nodeCountEl = app.locator("#node-count")
      expect(nodeCountEl.getAttribute("dimColor")).toBe("false")
    })

    it("console indicator flashes when log count changes", () => {
      const app = render(
        <CommandBox
          ui={mockUIState}
          rootPath={mockRootPath}
          columns={mockColumns}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
          consoleStats={{ total: 5, errors: 0, warnings: 0 }}
        />,
      )
      app.rerender(
        <CommandBox
          ui={mockUIState}
          rootPath={mockRootPath}
          columns={mockColumns}
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
        <CommandBox
          ui={uiWithWatcher}
          rootPath={mockRootPath}
          columns={mockColumns}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      const uiWithMoreFiles: UIState = {
        ...mockUIState,
        watcherStatus: {
          state: "idle",
          pendingPaths: 0,
          watchedPaths: 8,
        },
      }
      app.rerender(
        <CommandBox
          ui={uiWithMoreFiles}
          rootPath={mockRootPath}
          columns={mockColumns}
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
        <CommandBox
          ui={mockUIState}
          rootPath={mockRootPath}
          columns={mockColumns}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      app.rerender(
        <CommandBox
          ui={mockUIState}
          rootPath={mockRootPath}
          columns={mockColumns}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      const nodeCountEl = app.locator("#node-count")
      expect(nodeCountEl.getAttribute("dimColor")).toBe("true")
    })

    it("console indicator shows warning icon when errors present", () => {
      const app = render(
        <CommandBox
          ui={mockUIState}
          rootPath={mockRootPath}
          columns={mockColumns}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
          consoleStats={{ total: 3, errors: 1, warnings: 0 }}
        />,
      )
      const output = app.text
      expect(output).toContain("\u26A0")
      expect(output).toContain("3")
    })

    it("console indicator not shown when total is 0", () => {
      const app = render(
        <CommandBox
          ui={mockUIState}
          rootPath={mockRootPath}
          columns={mockColumns}
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
