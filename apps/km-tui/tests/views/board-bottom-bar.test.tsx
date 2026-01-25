/**
 * BottomBar Component Tests
 *
 * Tests the bottom status bar including render loop regression.
 */

import { describe, it, expect } from "bun:test"
import React from "react"
import { createTestRenderer } from "inkx/testing"
import { BottomBar } from "../../src/views/board-bottom-bar.tsx"
import type { UIState } from "../../src/ui-reducer.ts"
import type { TUIBoardState } from "../../src/types.ts"

const render = createTestRenderer()

describe("BottomBar", () => {
  const mockUIState: UIState = {
    isReady: true,
    isLoading: false,
    showHelp: false,
    showProjectPicker: false,
    showNewItemDialog: false,
    showDropNotification: false,
    droppedFiles: [],
    isMouseDragging: false,
    mouseSelection: null,
    multiSelected: new Set(),
    inOutlineMode: false,
    viewMode: "columns",
    watcherStatus: null,
    dimensions: { columns: 80, rows: 24 },
  }

  const mockBoardState: TUIBoardState = {
    rootPath: "/tmp/test-vault",
    rootId: "root-123",
    colIndex: 0,
    columns: [
      {
        sectionId: "section-1",
        sectionTitle: "Todo",
        cards: [],
        selectedCardIndex: null,
        focusedCardId: null,
      },
      {
        sectionId: "section-2",
        sectionTitle: "Done",
        cards: [],
        selectedCardIndex: null,
        focusedCardId: null,
      },
    ],
  }

  it("renders storage mode and path", () => {
    const { lastFrameText } = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
      />,
    )
    const output = lastFrameText() || ""
    expect(output).toContain("DISK")
    expect(output).toContain("/tmp/test-vault")
  })

  it("shows home directory as tilde", () => {
    const homeDir = process.env.HOME || "/Users/test"
    const boardStateWithHome: TUIBoardState = {
      ...mockBoardState,
      rootPath: `${homeDir}/Documents/vault`,
    }
    const { lastFrameText } = render(
      <BottomBar
        ui={mockUIState}
        state={boardStateWithHome}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
      />,
    )
    const output = lastFrameText() || ""
    expect(output).toContain("~/Documents/vault")
  })

  it("shows node count with clipboard icon", () => {
    const { lastFrameText } = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        termWidth={80}
        storageMode="disk"
        nodeCount={123}
      />,
    )
    const output = lastFrameText() || ""
    expect(output).toContain("📋123")
  })

  it("shows view mode", () => {
    const { lastFrameText } = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
      />,
    )
    const output = lastFrameText() || ""
    expect(output).toContain("COLUMNS VIEW")
  })

  it("shows column position in columns view", () => {
    const { lastFrameText } = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
      />,
    )
    const output = lastFrameText() || ""
    expect(output).toContain("col 1/2")
  })

  it("does not show column position in single column view", () => {
    const singleColState: TUIBoardState = {
      ...mockBoardState,
      columns: [mockBoardState.columns[0]!],
    }
    const { lastFrameText } = render(
      <BottomBar
        ui={mockUIState}
        state={singleColState}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
      />,
    )
    const output = lastFrameText() || ""
    expect(output).not.toContain("col")
  })

  it("does not show spinner when not loading", () => {
    const { lastFrameText } = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
      />,
    )
    const output = lastFrameText() || ""
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
    const { lastFrameText } = render(
      <BottomBar
        ui={uiWithWatcher}
        state={mockBoardState}
        termWidth={80}
        storageMode="disk"
        nodeCount={42}
      />,
    )
    const output = lastFrameText() || ""
    expect(output).toContain("📄5")
  })

  it("shows memory storage mode", () => {
    const { lastFrameText } = render(
      <BottomBar
        ui={mockUIState}
        state={mockBoardState}
        termWidth={80}
        storageMode="memory"
        nodeCount={42}
      />,
    )
    const output = lastFrameText() || ""
    expect(output).toContain("MEM")
  })
})
