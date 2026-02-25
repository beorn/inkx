/**
 * Detail pane cursor tests
 *
 * Verifies that detail pane cursor (detailCursorNodeId) changes correctly,
 * and that cursor resets when the board cursor moves to a different node.
 *
 * Note: Scrolling within the detail pane is handled by VirtualList internally.
 * These tests verify the cursor state management via detailCursorNodeId.
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("detail pane cursor", () => {
  test("cursor starts as null", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open detail pane
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.detailCursorNodeId).toBe(null)
  })

  test("cursor resets when board cursor moves to different node", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open detail pane

    // Manually set a cursor to simulate navigation within detail pane
    store.setState((s: any) => ({
      ...s,
      ui: { ...s.ui, detailCursorNodeId: "some-child-id" },
    }))
    expect(store.getState().ui.detailCursorNodeId).toBe("some-child-id")

    board.press("j") // move to next card — should reset detail cursor
    expect(store.getState().cursorNodeId).toBe("card2")
    expect(store.getState().ui.detailCursorNodeId).toBe(null)
  })

  test("cursor resets when detail pane is toggled", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open detail pane

    // Manually set a cursor
    store.setState((s: any) => ({
      ...s,
      ui: { ...s.ui, detailCursorNodeId: "some-child-id" },
    }))
    expect(store.getState().ui.detailCursorNodeId).toBe("some-child-id")

    board.press("D") // close detail pane
    expect(store.getState().ui.detailCursorNodeId).toBe(null)

    board.press("D") // reopen detail pane
    expect(store.getState().ui.detailCursorNodeId).toBe(null)
  })

  test("cursor state is independent of nav_back/nav_forward keys", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    expect(store.getState().ui.showDetailPane).toBe(false)

    // {/} are nav_back/nav_forward in v2, not detail navigation
    board.press("}")
    expect(store.getState().ui.detailCursorNodeId).toBe(null)

    board.press("{")
    expect(store.getState().ui.detailCursorNodeId).toBe(null)
  })
})
