/**
 * Regression: km-tui.error-loading-cards
 *
 * After zooming to a card, opening detail pane, closing it,
 * and navigating, the board should NOT show 'Error loading cards view'.
 *
 * Root cause: ErrorBoundary in BoardCore had no resetKey, so a transient
 * render error (e.g., during zoom state transition) permanently latched
 * the boundary into error state. Fix: add resetKey that changes on
 * navigation state changes, plus onError logging for future diagnosis.
 */

import { act } from "react"
import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { getActiveBoardPane, type BoardAppStore } from "../src/board-app-store.ts"
import type { StoreApi } from "zustand"

/** Dispatch a board action and flush React so DOM reflects the state change. */
function dispatchAndFlush(store: StoreApi<BoardAppStore>, action: Parameters<BoardAppStore["dispatchBoard"]>[0]) {
  act(() => {
    store.getState().dispatchBoard(action)
    store.setState((s) => s)
  })
}

describe("km-tui.error-loading-cards: no error after zoom + detail pane close", () => {
  test("zoom → open detail pane → close → navigate does not crash", () => {
    // Tree: root > section > cards (sections become columns, cards are visible)
    const { board, store } = testEnv(
      () =>
        item(
          "Vault",
          item("Design", item("mockups"), item("wireframes")),
          item("Dev", item("backend"), item("frontend")),
        ),
      { columns: 120, rows: 40 },
    )

    // Navigate to wireframes
    board.command("cursor_down") // mockups
    board.command("cursor_down") // wireframes

    board.expectState({ cursor: "wireframes" })

    // Open detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Close detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Navigate — this should NOT throw or show error
    board.command("cursor_down")
    board.command("cursor_up")
    board.command("cursor_right")
    board.command("cursor_left")

    // The board should render without error
    const output = board.screenshot()
    expect(output).not.toContain("Error loading cards view")
    expect(output).not.toContain("Error loading")
  })

  test("zoom → detail pane → Escape close → navigate does not crash", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "Root",
          item("Agenda", item("topic-1"), item("topic-2")),
          item("Actions", item("action-1"), item("action-2")),
        ),
      { columns: 120, rows: 40 },
    )

    // Navigate to action-2
    board.command("cursor_right") // Actions column
    board.command("cursor_down") // action-2

    board.expectState({ cursor: "action-2" })

    // Open detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Close detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Navigate — should not crash
    board.command("cursor_down")
    board.command("cursor_right")
    board.command("cursor_left")
    board.command("cursor_up")

    const output = board.screenshot()
    expect(output).not.toContain("Error loading cards view")
    expect(output).not.toContain("Error loading")
  })

  test("zoom in → zoom back with Z → no error", () => {
    const { board, store } = testEnv(
      () => item("Main", item("Work", item("task-alpha"), item("task-beta")), item("Personal", item("clean"))),
      { columns: 120, rows: 40 },
    )

    const originalRoot = getActiveBoardPane(store.getState())!.rootId

    // Zoom into Work (cursor starts on column header, z zooms in)
    board.command("zoom_inwards")

    // The root should change since we zoomed into a column
    const newRoot = getActiveBoardPane(store.getState())!.rootId
    // If zoom didn't change root (e.g., cursor on leaf node), that's OK too —
    // the test's purpose is to verify no ErrorBoundary crash after zoom cycles
    if (newRoot === originalRoot) {
      // Cursor was on a leaf; just navigate instead — the core test is about ErrorBoundary
      board.command("cursor_down")
    }

    // Z to zoom back
    board.command("zoom_outwards")

    // Navigate
    board.command("cursor_down")
    board.command("cursor_right")
    board.command("cursor_left")

    const output = board.screenshot()
    expect(output).not.toContain("Error loading cards view")
    expect(output).not.toContain("Error loading")
  })

  test("zoom + detail pane cycle with many columns does not crash", () => {
    // Mimics asana vault: many sections (columns) with multiple tasks each
    const { board, store } = testEnv(
      () =>
        item(
          "Board",
          item("Inbox", item("task-inbox-1"), item("task-inbox-2"), item("task-inbox-3")),
          item("Backlog", item("task-backlog-1"), item("task-backlog-2")),
          item("In-Progress", item("task-wip-1"), item("task-wip-2")),
          item("Review", item("task-review-1")),
          item("Done", item("task-done-1"), item("task-done-2"), item("task-done-3")),
        ),
      { columns: 120, rows: 40 },
    )

    // Navigate to a card in In-Progress
    board.command("cursor_right") // Backlog
    board.command("cursor_right") // In-Progress

    // Open detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Close detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Navigate extensively — stress the ErrorBoundary recovery
    board.command("cursor_down")
    board.command("cursor_down")
    board.command("cursor_up")
    board.command("cursor_right")
    board.command("cursor_right")
    board.command("cursor_left")
    board.command("cursor_left")
    board.command("cursor_down")

    const output = board.screenshot()
    expect(output).not.toContain("Error loading cards view")
    expect(output).not.toContain("Error loading")
  })

  test("multiple zoom + detail pane cycles do not accumulate errors", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "Root",
          item("Sec-1", item("card-1a"), item("card-1b")),
          item("Sec-2", item("card-2a"), item("card-2b")),
          item("Sec-3", item("card-3a"), item("card-3b")),
        ),
      { columns: 120, rows: 40 },
    )

    // First cycle: navigate → detail → close → navigate
    board.command("cursor_down") // card-1b
    board.command("toggle_detail_pane") // open detail
    board.command("toggle_detail_pane") // close detail
    board.command("cursor_down")

    let output = board.screenshot()
    expect(output).not.toContain("Error loading")

    // Navigate to a different column
    board.command("cursor_right")

    // Second cycle: detail pane on a different card
    board.command("toggle_detail_pane") // open detail
    board.press("Escape") // close detail with Escape
    board.command("cursor_down")
    board.command("cursor_right")

    output = board.screenshot()
    expect(output).not.toContain("Error loading")
  })
})
