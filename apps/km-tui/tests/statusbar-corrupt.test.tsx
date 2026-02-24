/**
 * Status bar corruption test - view name bleeds into sync count
 *
 * Bug: km-tui.statusbar-corrupt
 * The view mode name (e.g. "CARDS VIEW") overlaps with the sync/watcher
 * count text in the bottom bar, causing visual corruption.
 */

import { describe, it, expect } from "vitest"
import React from "react"
import { createRenderer } from "inkx/testing"
import { CommandBox } from "../src/views/CommandBox.tsx"
import { item, testEnv } from "./helpers/board-test.ts"
import type { UIState } from "../src/ui-reducer.ts"
import type { ColumnView } from "../src/types.ts"

const render = createRenderer({ cols: 80, rows: 1 })

const baseUI: UIState = {
  viewMode: "cards",
  showDetailPane: false,
  maxContentLines: 3,
  rootBoardId: null,
  showHelp: false,
  showProjectPicker: false,
  showNewItemDialog: false,
  showSearchDialog: false,
  multiSelected: new Set(),
  selectionAnchor: null,
  selectAllLevel: 0,
  collapsedColumns: new Set(),
  foldDepths: new Map(),
  mouseSelection: null,
  isMouseDragging: false,
  droppedFiles: [],
  showDropNotification: false,
  navHistory: [],
  navHistoryIndex: 0,
  recentProjectIds: [],
  dimensions: { columns: 80, rows: 24 },
  isLoading: false,
  loadingStartTime: null,
  watcherStatus: null,
  bellState: null,
  showConsole: false,
  status: null,
}

const testRootPath = "/tmp/test"
const testColumns: ColumnView[] = [
  {
    node: {
      id: "col-1",
      type: "h" as const,
      item: true,
      fstype: "mdsection" as const,
      parent_id: "root-1",
      parent_idx: 0,
      embed_source: null,
      title: "Col",
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

describe("Status bar corruption: view name bleeds into sync count", () => {
  // Unit tests for CommandBox component — view mode moved to TopBar
  describe("CommandBox unit", () => {
    it("view mode is no longer in CommandBox (moved to TopBar)", () => {
      const app = render(
        <CommandBox
          ui={baseUI}
          rootPath={testRootPath}
          columns={testColumns}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      const output = app.text
      expect(output).not.toContain("VIEW")
    })

    it("storage path and node count are present and non-overlapping", () => {
      const app = render(
        <CommandBox
          ui={baseUI}
          rootPath={testRootPath}
          columns={testColumns}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      const output = app.text
      const diskIdx = output.indexOf("DISK")
      const nodeCountIdx = output.indexOf("📋42")
      expect(diskIdx).toBeGreaterThan(-1)
      expect(nodeCountIdx).toBeGreaterThan(-1)
      expect(nodeCountIdx).toBeGreaterThan(diskIdx)
    })

    it("watcher status does not overlap with storage path", () => {
      const uiWithWatcher: UIState = {
        ...baseUI,
        watcherStatus: {
          state: "syncing",
          pendingPaths: 3,
          watchedPaths: 12,
        },
      }
      const app = render(
        <CommandBox
          ui={uiWithWatcher}
          rootPath={testRootPath}
          columns={testColumns}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      const output = app.text
      const diskIdx = output.indexOf("DISK")
      const watcherIdx = output.indexOf("sync:3")
      const nodeCountIdx = output.indexOf("📋42")
      expect(diskIdx).toBeGreaterThan(-1)
      expect(watcherIdx).toBeGreaterThan(-1)
      expect(nodeCountIdx).toBeGreaterThan(-1)

      expect(nodeCountIdx).toBeGreaterThan(diskIdx)
      expect(watcherIdx).toBeGreaterThan(nodeCountIdx)
    })
  })

  // Integration test using full Board — view mode now in top bar
  describe("full Board integration", () => {
    it("top bar shows clean view mode text after cycling views", () => {
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 80, rows: 24 },
      )

      // View mode is now in the top bar (row 0)
      let topRow = board.screen.row(0)
      expect(topRow).toContain("CARDS VIEW")

      // Press 'v' to cycle to columns view
      board.press("v").press("v")
      topRow = board.screen.row(0)
      expect(topRow).toContain("COLUMNS VIEW")
      expect(topRow).not.toContain("CARDS VIEW")

      // Press 'v' again to cycle to tabs view
      board.press("v").press("v")
      topRow = board.screen.row(0)
      expect(topRow).toContain("TABS VIEW")
      expect(topRow).not.toContain("COLUMNS VIEW")

      // Press 'v' to cycle back to cards
      board.press("v").press("v")
      topRow = board.screen.row(0)
      expect(topRow).toContain("CARDS VIEW")
      expect(topRow).not.toContain("TABS VIEW")
    })

    it("top bar has no character corruption after rapid view cycling", () => {
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 80, rows: 24 },
      )

      // Rapidly cycle through all views multiple times
      for (let i = 0; i < 6; i++) {
        board.press("v").press("v")
      }

      const topRow = board.screen.row(0)

      // The view mode text should be clean — one of the valid view modes
      const hasValidView =
        topRow.includes("CARDS VIEW") || topRow.includes("COLUMNS VIEW") || topRow.includes("TABS VIEW")
      expect(hasValidView).toBe(true)

      // "VIEW" should appear exactly once in the top bar
      const viewMatches = topRow.match(/VIEW/g)
      expect(viewMatches?.length).toBe(1)
    })

    it("node count text is clean and not corrupted in bottom bar", () => {
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 80, rows: 24 },
      )

      const lastRow = board.screen.rows.length - 1
      const bottomRow = board.screen.row(lastRow)

      // Node count text should be present in the bottom bar
      const nodeCountEl = board.q("#node-count")
      expect(nodeCountEl.count()).toBeGreaterThan(0)
      const nodeCountText = nodeCountEl.textContent()
      // Should contain clipboard icon followed by a number
      expect(nodeCountText).toMatch(/📋\d+/)

      // View mode should NOT be in the bottom bar
      expect(bottomRow).not.toContain("VIEW")
    })

    it("view mode text in top bar does not overlap with other elements", () => {
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 80, rows: 24 },
      )

      const topRow = board.screen.row(0)

      // "VIEW" should appear exactly once in the top bar
      const viewCount = (topRow.match(/VIEW/g) || []).length
      expect(viewCount).toBe(1)

      expect(topRow).toContain("CARDS VIEW")

      // Switch to columns view and check again
      board.press("v").press("v")
      const topRow2 = board.screen.row(0)
      expect((topRow2.match(/VIEW/g) || []).length).toBe(1)
      expect(topRow2).toContain("COLUMNS VIEW")
      expect(topRow2).not.toContain("CARDS VIEW")
    })

    it("switching from long view name to short clears leftover chars in top bar", () => {
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 80, rows: 24 },
      )

      // Start with CARDS, go to COLUMNS
      board.press("v").press("v") // -> COLUMNS
      let topRow = board.screen.row(0)
      expect(topRow).toContain("COLUMNS VIEW")

      // Switch to TABS (shorter)
      board.press("v").press("v") // -> TABS
      topRow = board.screen.row(0)
      expect(topRow).toContain("TABS VIEW")
      expect(topRow).not.toContain("COLUMN")
      expect(topRow).not.toContain("OLUMNS")
    })

    it("view mode in top bar is clean on narrow terminal (no digit bleed)", () => {
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 60, rows: 24 },
      )

      const topRow = board.screen.row(0)

      const viewModeEl = board.q("#view-mode")
      expect(viewModeEl.count()).toBeGreaterThan(0)
      const viewModeText = viewModeEl.textContent().trim()
      expect(viewModeText).toBe("CARDS VIEW")
    })
  })
})
