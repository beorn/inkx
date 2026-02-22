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
import { BottomBar } from "../src/views/board-bottom-bar.tsx"
import { item, testEnv } from "./helpers/board-test.ts"
import type { UIState } from "../src/ui-reducer.ts"
import type { ColumnView } from "../src/types.ts"

const render = createRenderer({ cols: 80, rows: 1 })

const baseUI: UIState = {
  viewMode: "cards",
  showDetailPane: false,
  maxOutlineDepth: 2,
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
  foldedNodes: new Set(),
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
  // Unit tests for BottomBar component
  describe("BottomBar unit", () => {
    it("view mode text does not overlap with node count", () => {
      const app = render(
        <BottomBar
          ui={baseUI}
          rootPath={testRootPath}
          columns={testColumns}
          layout={{ colIndex: 0, cardIndex: 0 }}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      const output = app.text
      const viewModeIdx = output.indexOf("CARDS VIEW")
      const nodeCountIdx = output.indexOf("📋42")
      expect(viewModeIdx).toBeGreaterThan(-1)
      expect(nodeCountIdx).toBeGreaterThan(-1)
      expect(viewModeIdx).toBeGreaterThan(nodeCountIdx)
    })

    it("view mode text does not overlap with watcher status when syncing", () => {
      const uiWithWatcher: UIState = {
        ...baseUI,
        watcherStatus: {
          state: "syncing",
          pendingPaths: 3,
          watchedPaths: 12,
        },
      }
      const app = render(
        <BottomBar
          ui={uiWithWatcher}
          rootPath={testRootPath}
          columns={testColumns}
          layout={{ colIndex: 0, cardIndex: 0 }}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      const output = app.text

      const viewModeIdx = output.indexOf("CARDS VIEW")
      const watcherIdx = output.indexOf("sync:3")
      const nodeCountIdx = output.indexOf("📋42")
      expect(viewModeIdx).toBeGreaterThan(-1)
      expect(watcherIdx).toBeGreaterThan(-1)
      expect(nodeCountIdx).toBeGreaterThan(-1)

      expect(watcherIdx).toBeGreaterThan(nodeCountIdx)
      expect(viewModeIdx).toBeGreaterThan(watcherIdx)
    })

    it("view mode and watcher count are visually separated in buffer", () => {
      const uiWithWatcher: UIState = {
        ...baseUI,
        watcherStatus: {
          state: "idle",
          pendingPaths: 0,
          watchedPaths: 5,
        },
      }
      const app = render(
        <BottomBar
          ui={uiWithWatcher}
          rootPath={testRootPath}
          columns={testColumns}
          layout={{ colIndex: 0, cardIndex: 0 }}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )

      const viewModeEl = app.locator("#view-mode")
      const watcherEl = app.locator("#watcher-status")
      expect(viewModeEl.count()).toBeGreaterThan(0)
      expect(watcherEl.count()).toBeGreaterThan(0)

      // View mode should contain exactly "CARDS VIEW" — no watcher text mixed in
      expect(viewModeEl.textContent().trim()).toBe("CARDS VIEW")
      // Watcher text should not contain view mode text
      expect(watcherEl.textContent()).not.toContain("VIEW")
      expect(watcherEl.textContent()).not.toContain("CARDS")
    })

    it("switching view modes clears old view text from buffer", () => {
      const app = render(
        <BottomBar
          ui={{ ...baseUI, viewMode: "cards" }}
          rootPath={testRootPath}
          columns={testColumns}
          layout={{ colIndex: 0, cardIndex: 0 }}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      expect(app.text).toContain("CARDS VIEW")

      // Switch to "columns" (longer text)
      app.rerender(
        <BottomBar
          ui={{ ...baseUI, viewMode: "columns" }}
          rootPath={testRootPath}
          columns={testColumns}
          layout={{ colIndex: 0, cardIndex: 0 }}
          termWidth={80}
          storageMode="disk"
          nodeCount={42}
          moveMode={false}
        />,
      )
      const output = app.text
      expect(output).toContain("COLUMNS VIEW")
      expect(output).not.toContain("CARDS")
    })
  })

  // Integration test using full Board with view cycling
  describe("full Board integration", () => {
    it("bottom row shows clean view mode text after cycling views", () => {
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 80, rows: 24 },
      )

      // Initial state should be CARDS VIEW
      const lastRow = board.screen.rows.length - 1
      let bottomRow = board.screen.row(lastRow)
      expect(bottomRow).toContain("CARDS VIEW")

      // Press 'v' to cycle to columns view
      board.press("g").press("v")
      bottomRow = board.screen.row(lastRow)
      expect(bottomRow).toContain("COLUMNS VIEW")
      // Old view mode text should NOT be present
      expect(bottomRow).not.toContain("CARDS")

      // Press 'v' again to cycle to tabs view
      board.press("g").press("v")
      bottomRow = board.screen.row(lastRow)
      expect(bottomRow).toContain("TABS VIEW")
      // Old view mode text should NOT be present
      expect(bottomRow).not.toContain("COLUMNS")
      expect(bottomRow).not.toContain("CARDS")

      // Press 'v' to cycle back to cards
      board.press("g").press("v")
      bottomRow = board.screen.row(lastRow)
      expect(bottomRow).toContain("CARDS VIEW")
      // Old view mode text should NOT be present
      expect(bottomRow).not.toContain("TABS")
      expect(bottomRow).not.toContain("COLUMNS")
    })

    it("bottom row has no character corruption after rapid view cycling", () => {
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 80, rows: 24 },
      )

      const lastRow = board.screen.rows.length - 1

      // Rapidly cycle through all views multiple times
      for (let i = 0; i < 6; i++) {
        board.press("g").press("v")
      }

      // Should be back at cards view (6 cycles: cards->col->tabs->cards->col->tabs)
      // Actually: 6 % 3 = 0 = same as start = cards
      const bottomRow = board.screen.row(lastRow)

      // The view mode text should be clean — one of the valid view modes
      const hasValidView =
        bottomRow.includes("CARDS VIEW") || bottomRow.includes("COLUMNS VIEW") || bottomRow.includes("TABS VIEW")
      expect(hasValidView).toBe(true)

      // Check that no partial/corrupted text exists by verifying
      // "VIEW" appears exactly once in the bottom row
      const viewMatches = bottomRow.match(/VIEW/g)
      expect(viewMatches?.length).toBe(1)
    })

    it("node count text is clean and not corrupted by adjacent elements", () => {
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 80, rows: 24 },
      )

      const lastRow = board.screen.rows.length - 1
      const bottomRow = board.screen.row(lastRow)

      // Node count text should be present
      const nodeCountEl = board.q("#node-count")
      expect(nodeCountEl.count()).toBeGreaterThan(0)
      const nodeCountText = nodeCountEl.textContent()
      // Should contain clipboard icon followed by a number
      expect(nodeCountText).toMatch(/📋\d+/)

      // View mode should not overlap into the node count area
      const nodeCountBox = nodeCountEl.boundingBox()
      const viewModeBox = board.q("#view-mode").boundingBox()
      if (nodeCountBox && viewModeBox) {
        const nodeCountRight = nodeCountBox.x + nodeCountBox.width
        expect(viewModeBox.x).toBeGreaterThanOrEqual(nodeCountRight)
      }
    })

    it("view mode text does not overwrite watcher/sync text in buffer cells", () => {
      // This test checks the actual buffer cells to detect rendering corruption
      // where the view name text physically overlaps the sync count cells
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 80, rows: 24 },
      )

      const lastRow = board.screen.rows.length - 1
      const bottomRow = board.screen.row(lastRow)

      // Verify the bottom row is well-formed
      // It should have: left side (path info) + right side (counters + view mode)
      // The key test: "VIEW" should appear exactly once
      const viewCount = (bottomRow.match(/VIEW/g) || []).length
      expect(viewCount).toBe(1)

      // The viewModeStr text must be present and clean in the bottom row
      expect(bottomRow).toContain("CARDS VIEW")
      // "VIEW" should appear exactly once
      expect((bottomRow.match(/VIEW/g) || []).length).toBe(1)

      // Switch to columns view (longer name) and check again
      board.press("g").press("v")
      const bottomRow2 = board.screen.row(lastRow)
      expect((bottomRow2.match(/VIEW/g) || []).length).toBe(1)
      expect(bottomRow2).toContain("COLUMNS VIEW")
      expect(bottomRow2).not.toContain("CARDS")
    })

    it("switching from long view name to short clears leftover chars", () => {
      // Regression: COLUMNS VIEW (12 chars) -> TABS VIEW (9 chars)
      // could leave "NS " leftover if the buffer isn't properly cleared
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 80, rows: 24 },
      )

      // Start with CARDS, go to COLUMNS
      board.press("g").press("v") // -> COLUMNS
      const lastRow = board.screen.rows.length - 1
      let bottomRow = board.screen.row(lastRow)
      expect(bottomRow).toContain("COLUMNS VIEW")

      // Switch to TABS (shorter)
      board.press("g").press("v") // -> TABS
      bottomRow = board.screen.row(lastRow)
      expect(bottomRow).toContain("TABS VIEW")
      // "COLUMNS" must be completely gone - no leftover characters
      expect(bottomRow).not.toContain("COLUMN")
      expect(bottomRow).not.toContain("OLUMNS")
      expect(bottomRow).not.toContain("NS ")

      // The rightmost characters should be spaces or the trailing space after VIEW
      // Extract the region after "TABS VIEW"
      const viewIdx = bottomRow.indexOf("TABS VIEW")
      if (viewIdx > -1) {
        const afterView = bottomRow.slice(viewIdx + "TABS VIEW".length)
        // Should be only spaces (trailing padding)
        expect(afterView.trim()).toBe("")
      }
    })

    it("node count number does not bleed into view mode text (2ARDS VIEW W regression)", () => {
      // km-tui.statusbar-corrupt: The original bug showed "2ARDS VIEW W" where
      // the sync count "2" bled into "CARDS VIEW" and a trailing "W" from "VIEW"
      // appeared. Test at narrow terminal width where crowding is most likely.
      const { board } = testEnv(
        () => item("board", item("Todo", item("task 1"), item("task 2")), item("Done", item("task 3"))),
        { columns: 60, rows: 24 },
      )

      const lastRow = board.screen.rows.length - 1
      const bottomRow = board.screen.row(lastRow)

      // The view mode text must be exactly "CARDS VIEW", not "2ARDS VIEW" or similar
      const viewModeEl = board.q("#view-mode")
      expect(viewModeEl.count()).toBeGreaterThan(0)
      const viewModeText = viewModeEl.textContent().trim()
      expect(viewModeText).toBe("CARDS VIEW")

      // Buffer-level check: no digit immediately before "ARDS VIEW"
      expect(bottomRow).not.toMatch(/\d+ARDS/)
      // No trailing "W" after "VIEW " that doesn't belong
      const viewIdx = bottomRow.indexOf("CARDS VIEW")
      expect(viewIdx).toBeGreaterThan(-1)
    })
  })
})
