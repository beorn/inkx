/**
 * Regression: detail pane + h/l navigation hang
 *
 * Root cause: calcEdgeBasedScrollOffset oscillation in useVirtualization.
 * When viewport fits only 1 column (detail pane narrows the board), the
 * small-viewport special case (line 73 of scroll-utils.ts) would scroll
 * back to provide context, but this pushed the selected item out of view,
 * triggering a forward scroll → infinite oscillation → hang in act().
 *
 * Fix: Only apply the small-viewport scroll-back when visibleCount > padding,
 * ensuring the selected item remains visible after scrolling back.
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("detail pane + column navigation (regression: infinite render loop)", () => {
  test("l navigates right while detail pane is open", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1")), item("col2", item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press(" ") // open detail pane
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().cursorStore.getState().colIndex).toBe(0)

    board.press("l") // navigate right — previously hung
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().cursorStore.getState().colIndex).toBe(1)
  })

  test("h navigates left while detail pane is open", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1")), item("col2", item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("l") // go to col2 first
    board.press(" ") // open detail pane
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().cursorStore.getState().colIndex).toBe(1)

    board.press("h") // navigate left — previously hung
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().cursorStore.getState().colIndex).toBe(0)
  })

  test("j/k navigation still works with detail pane open", { timeout: 5000 }, () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("card1"), item("card2")), item("col2", item("card3"))),
      { checkIncremental: false, incremental: false },
    )

    board.press(" ") // open detail pane
    expect(store.getState().ui.showDetailPane).toBe(true)

    board.press("j") // move down
    expect(store.getState().cursorNodeId).toBe("card2")

    board.press("k") // move up
    expect(store.getState().cursorNodeId).toBe("card1")
  })

  test("multiple l/h with detail pane open", { timeout: 5000 }, () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("card1")), item("col2", item("card2")), item("col3", item("card3"))),
      { checkIncremental: false, incremental: false },
    )

    board.press(" ") // open detail pane

    board.press("l") // col1 → col2
    expect(store.getState().cursorStore.getState().colIndex).toBe(1)

    board.press("l") // col2 → col3
    expect(store.getState().cursorStore.getState().colIndex).toBe(2)

    board.press("h") // col3 → col2
    expect(store.getState().cursorStore.getState().colIndex).toBe(1)

    board.press("h") // col2 → col1
    expect(store.getState().cursorStore.getState().colIndex).toBe(0)
  })
})
