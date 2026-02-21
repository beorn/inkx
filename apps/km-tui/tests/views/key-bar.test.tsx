/**
 * KeyBar Component Tests
 *
 * Tests the context-sensitive key hint bar that shows mode-specific shortcuts.
 */

import { describe, it, expect } from "vitest"
import React from "react"
import { createRenderer } from "inkx/testing"
import { KeyBar } from "../../src/views/key-bar.tsx"
import type { UIState } from "../../src/ui-reducer.ts"

const render = createRenderer()

// Minimal UIState for testing — only fields the KeyBar reads
function makeUI(overrides: Partial<UIState> = {}): UIState {
  return {
    viewMode: "columns",
    showDetailPane: false,
    detailScrollOffset: 0,
    maxOutlineDepth: 2,
    maxContentLines: 3,
    rootBoardId: null,
    showHelp: false,
    showProjectPicker: false,
    showNewItemDialog: false,
    showSearchDialog: false,
    searchDialogInitialInput: "",
    searchScope: "all",
    searchScopeNodeIds: [],
    showConsole: false,
    showSyncPane: false,
    multiSelected: new Set(),
    selectionAnchor: null,
    selectAllLevel: 0,
    visualMode: false,
    visualAnchor: null,
    collapsedColumns: new Set(),
    columnScrollAnchor: null,
    showIgnored: false,
    ignoreVersion: 0,
    mouseSelection: null,
    isMouseDragging: false,
    droppedFiles: [],
    showDropNotification: false,
    navHistory: [],
    navHistoryIndex: 0,
    recentProjectIds: [],
    isReady: true,
    dimensions: { columns: 80, rows: 24 },
    isLoading: false,
    loadingStartTime: null,
    backgroundParsing: false,
    watcherStatus: null,
    syncEvents: [],
    inlineEditBlock: null,
    datePrompt: null,
    deleteConfirm: null,
    bellState: null,
    status: null,
    filterDialogOpen: false,
    ...overrides,
  } as UIState
}

describe("KeyBar", () => {
  it("shows NODE mode by default", () => {
    const app = render(<KeyBar ui={makeUI()} termWidth={80} />)
    expect(app.text).toContain("NODE")
  })

  it("shows node-mode hints", () => {
    const app = render(<KeyBar ui={makeUI()} termWidth={80} />)
    const text = app.text
    expect(text).toContain("j/k")
    expect(text).toContain("h/l")
    expect(text).toContain("edit")
    expect(text).toContain("cut")
    expect(text).toContain("sel")
  })

  it("shows TEXT mode when inline editing", () => {
    const app = render(<KeyBar ui={makeUI({ inlineEditBlock: { nodeId: "n1", blockIndex: 0 } })} termWidth={80} />)
    const text = app.text
    expect(text).toContain("TEXT")
    expect(text).toContain("Esc")
    expect(text).toContain("exit")
  })

  it("shows VISUAL mode in visual selection", () => {
    const app = render(<KeyBar ui={makeUI({ visualMode: true, visualAnchor: "n1" })} termWidth={80} />)
    const text = app.text
    expect(text).toContain("VISUAL")
    expect(text).toContain("extend")
    expect(text).toContain("cancel")
  })

  it("shows PANE mode when detail pane is focused", () => {
    const app = render(<KeyBar ui={makeUI({ showDetailPane: true, focusedPane: "detail" })} termWidth={80} />)
    const text = app.text
    expect(text).toContain("PANE")
    expect(text).toContain("Enter")
  })

  it("shows multi-selection hints when items are selected", () => {
    const app = render(<KeyBar ui={makeUI({ multiSelected: new Set(["a", "b"]) })} termWidth={80} />)
    const text = app.text
    // Still NODE mode but with selection-specific hints
    expect(text).toContain("NODE")
    expect(text).toContain("copy")
    expect(text).toContain("archive")
    expect(text).toContain("toggle")
  })

  it("has key-bar id for locator queries", () => {
    const app = render(<KeyBar ui={makeUI()} termWidth={80} />)
    const bar = app.locator("#key-bar")
    expect(bar.count()).toBeGreaterThan(0)
  })

  it("TEXT mode takes priority over PANE", () => {
    const app = render(
      <KeyBar
        ui={makeUI({
          showDetailPane: true,
          inlineEditBlock: { nodeId: "n1", blockIndex: 0 },
        })}
        termWidth={80}
      />,
    )
    expect(app.text).toContain("TEXT")
    expect(app.text).not.toContain("PANE")
  })

  it("VISUAL mode takes priority over PANE", () => {
    const app = render(
      <KeyBar ui={makeUI({ showDetailPane: true, visualMode: true, visualAnchor: "n1" })} termWidth={80} />,
    )
    expect(app.text).toContain("VISUAL")
    expect(app.text).not.toContain("PANE")
  })
})
