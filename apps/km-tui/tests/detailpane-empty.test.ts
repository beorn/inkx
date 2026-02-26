/**
 * Regression: detail pane should never be blank/empty.
 *
 * Bug: km-tui.detailpane-empty
 *
 * When the detail pane is open and the cursor node becomes invalid
 * (e.g., during new item creation, after deletion, or at board level),
 * the detail pane should show a "No node selected" fallback instead of
 * rendering nothing.
 */
import { describe, test, expect } from "vitest"
import { act } from "react"
import { item, testEnv } from "./helpers/board-test.ts"

describe("detail pane empty state fallback", () => {
  test("shows 'No node selected' when cursor points to non-existent node", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open detail pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Detail pane should show the current card's details
    expect(board.screenshot()).toContain("task1")

    // Simulate cursor pointing to a non-existent node.
    // This happens when a new item is being created or a node was deleted.
    const cursorStore = store.getState().cursorStore
    act(() => {
      cursorStore.setState({
        cursorNodeId: "nonexistent-node",
        cursorCardNodeId: "nonexistent-node",
        cursorColumnNodeId: "col1",
        selectionLevel: "card",
      })
      store.setState((s) => ({ ...s, cursorNodeId: "nonexistent-node" }))
    })
    // Flush render
    board.press("Ctrl+l")

    // Detail pane must NOT be blank — should show the fallback message
    expect(board.screenshot()).toContain("No node selected")
  })

  test("shows 'No node selected' when both card and column are null", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open detail pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Simulate board-level selection (no card or column selected)
    const cursorStore = store.getState().cursorStore
    act(() => {
      cursorStore.setState({
        cursorNodeId: null,
        cursorCardNodeId: null,
        cursorColumnNodeId: null,
        selectionLevel: "board",
      })
      store.setState((s) => ({ ...s, cursorNodeId: null }))
    })
    board.press("Ctrl+l")

    // Detail pane must show the fallback, not be blank
    expect(board.screenshot()).toContain("No node selected")
  })

  test("detail pane shows header bar in fallback state", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open detail pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Make cursor invalid
    const cursorStore = store.getState().cursorStore
    act(() => {
      cursorStore.setState({
        cursorNodeId: null,
        cursorCardNodeId: null,
        cursorColumnNodeId: null,
        selectionLevel: "board",
      })
      store.setState((s) => ({ ...s, cursorNodeId: null }))
    })
    board.press("Ctrl+l")

    // Fallback should show a proper header bar and message
    const screenshot = board.screenshot()
    expect(screenshot).toContain("No node selected")
    expect(screenshot).toContain("Detail")
  })
})
